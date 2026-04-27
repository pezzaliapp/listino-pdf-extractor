// PDF parsing utilities: text-content reconstruction into product rows.

import { FAMIGLIA_HEADINGS } from './classifier.js';

const PRODUCT_CODE_RE = /^\d{6,9}$/;
const PRICE_RE = /^\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?$|^\d+(?:,\d{2})?$/;

export function isProductCode(token) {
  if (typeof token !== 'string') return false;
  const cleaned = token.replace(/[.\s]/g, '');
  return PRODUCT_CODE_RE.test(cleaned);
}

export function normalizeCode(token) {
  return String(token || '').replace(/[.\s]/g, '');
}

export function parsePriceString(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!PRICE_RE.test(trimmed)) return null;
  // Italian format: "." or " " is thousands sep, "," decimal sep.
  const noThousands = trimmed.replace(/[.\s]/g, '');
  const normalized = noThousands.replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

// Group pdf.js text items into visual lines using their Y coordinate.
// items: array of { str, transform } where transform[5] is Y, transform[4] is X, transform[0] is font size.
export function groupItemsByLine(items, yTolerance = 2) {
  const lines = [];
  for (const item of items) {
    if (!item || !item.str) continue;
    const y = Math.round(item.transform[5]);
    const x = item.transform[4];
    const size = Math.abs(item.transform[0]);
    let line = lines.find(l => Math.abs(l.y - y) <= yTolerance);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push({ str: item.str, x, size });
  }
  // sort lines top-to-bottom (PDF y grows upward)
  lines.sort((a, b) => b.y - a.y);
  // sort items left-to-right inside each line
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
  }
  return lines;
}

function lineText(line) {
  return line.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
}

function lineMaxFontSize(line) {
  return line.items.reduce((m, i) => Math.max(m, i.size || 0), 0);
}

function tokenize(text) {
  return text.split(/\s+/).filter(Boolean);
}

function isFamigliaHeading(text) {
  const upper = text.toUpperCase().trim();
  if (FAMIGLIA_HEADINGS[upper]) return FAMIGLIA_HEADINGS[upper];
  // fallback: line entirely uppercase, no digits, short-ish
  if (/^[A-ZÀ-Ý0-9 .\-/&]+$/.test(text) && /[A-ZÀ-Ý]/.test(text) && !/\d/.test(text) && text.length <= 60) {
    return text.trim();
  }
  return null;
}

function looksLikeCategoryHeading(text) {
  if (!text) return false;
  if (/\d{4,}/.test(text)) return false;
  if (text.length > 80) return false;
  // Heuristic: starts with capital, not all uppercase, no euro sign
  const firstChar = text.charAt(0);
  if (firstChar !== firstChar.toUpperCase()) return false;
  if (text === text.toUpperCase()) return false;
  return true;
}

// Identify if a line has both a product code and a price (a candidate product row).
function findProductFields(tokens) {
  let codeIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (isProductCode(tokens[i])) { codeIdx = i; break; }
  }
  if (codeIdx === -1) return null;

  let priceIdx = -1;
  let priceVal = null;
  for (let i = tokens.length - 1; i > codeIdx; i--) {
    const v = parsePriceString(tokens[i]);
    if (v != null) { priceIdx = i; priceVal = v; break; }
  }
  if (priceIdx === -1) return null;
  if (priceVal <= 0) return null;

  const descTokens = tokens.slice(codeIdx + 1, priceIdx);
  return {
    code: normalizeCode(tokens[codeIdx]),
    description: descTokens.join(' ').replace(/\s+/g, ' ').trim(),
    price: priceVal
  };
}

export function buildRowsFromLines(lines, pageNum, ctx) {
  const rows = [];
  for (const line of lines) {
    const text = lineText(line);
    if (!text) continue;

    const tokens = tokenize(text);
    const product = findProductFields(tokens);

    if (product) {
      const desc = product.description;
      const reviewFlag = (!desc || desc.length < 5 || !/[A-Za-zÀ-ÿ]/.test(desc)) ? 'CHECK' : '';
      rows.push({
        Famiglia: ctx.famiglia || '',
        Categoria: ctx.categoria || '',
        Codice: product.code,
        Descrizione: desc,
        Prezzo_EUR: product.price,
        Pagine: pageNum,
        Review_Flag: reviewFlag
      });
      continue;
    }

    // Heading detection only if no product fields.
    const fontSize = lineMaxFontSize(line);
    const fam = isFamigliaHeading(text);
    if (fam && (fontSize >= 11 || FAMIGLIA_HEADINGS[text.toUpperCase()])) {
      ctx.famiglia = fam;
      ctx.categoria = '';
      continue;
    }
    if (looksLikeCategoryHeading(text) && fontSize >= 9) {
      ctx.categoria = text.trim();
      continue;
    }
  }
  return rows;
}

// Compute occurrence count per Codice.
export function annotateOccurrences(rows) {
  const counts = new Map();
  for (const r of rows) {
    counts.set(r.Codice, (counts.get(r.Codice) || 0) + 1);
  }
  for (const r of rows) {
    r.Occorrenze = counts.get(r.Codice) || 1;
  }
  return rows;
}

// Main extractor: takes a pdf.js PDFDocumentProxy and returns { rows, log }.
export async function extractFromPdf(pdf, fileName, onLog = () => {}) {
  const log = [];
  const pushLog = (msg) => { log.push(msg); onLog(msg); };

  const ctx = { famiglia: '', categoria: '' };
  const allRows = [];
  let pagesScanned = 0;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    let textContent;
    try {
      textContent = await page.getTextContent();
    } catch (err) {
      pushLog(`Pagina ${pageNum}: errore di lettura testo (${err.message || err}), saltata.`);
      continue;
    }
    pagesScanned++;
    const items = textContent.items || [];
    if (!items.length) {
      pushLog(`Pagina ${pageNum}: nessun testo estraibile (probabilmente immagine), saltata.`);
      continue;
    }
    const lines = groupItemsByLine(items, 2);
    const rows = buildRowsFromLines(lines, pageNum, ctx);
    for (const r of rows) {
      r.Fonte = fileName;
      allRows.push(r);
    }
  }

  annotateOccurrences(allRows);

  pushLog(`Pagine scansionate: ${pagesScanned}`);
  pushLog(`Righe trovate: ${allRows.length}`);
  const checks = allRows.filter(r => r.Review_Flag === 'CHECK').length;
  pushLog(`Righe da verificare (CHECK): ${checks}`);

  return { rows: allRows, log };
}

// PDF parsing utilities: text-content reconstruction into product rows.

const FAMIGLIA_HEADINGS = {
  'ASSETTI RUOTE': 'Assetti ruote',
  'EQUILIBRATRICI': 'Equilibratrici',
  'SMONTAGOMME': 'Smontagomme',
  'SOLLEVATORI': 'Sollevatori',
  'ATTREZZATURE VARIE': 'Attrezzature varie',
  'INDUSTRIA 4.0': 'Industria 4.0',
  'HANDY SCAN': 'Diagnosi',
  'DIAGNOSI': 'Diagnosi'
};

/**
 * Accetta SOLO formati di prezzo italiano "veri":
 *   "3.940,00", "880,00", "1.500,00", "250,00"
 * Rifiuta:
 *   "21.100.057" (3+ punti senza virgola = è un altro codice articolo)
 *   "21100076"   (8+ cifre senza separatori = codice)
 *   "abc", ""    (non numerico)
 */
export function parsePriceString(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim().replace(/[€\s]/g, '');
  if (!t) return null;
  if (!/^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$/.test(t)) return null;
  const dotGroups = t.split('.').length - 1;
  if (dotGroups >= 2 && !t.includes(',')) return null; // tipo 21.100.057 → no
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function isProductCode(s) {
  if (typeof s !== 'string') return false;
  return /^\d{6,9}$/.test(s.replace(/[\s.]/g, ''));
}

export function isProductRow(tokens) {
  const codes = tokens.filter(t => isProductCode(t));
  const prices = tokens.map(t => parsePriceString(t)).filter(p => p !== null);
  return codes.length >= 1 && prices.length >= 1;
}

export function normalizeCode(token) {
  return String(token || '').replace(/[.\s]/g, '');
}

// Group pdf.js text items into visual lines using their Y coordinate.
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
  lines.sort((a, b) => b.y - a.y);
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

function detectFamigliaHeading(text) {
  const upper = text.toUpperCase().trim();
  if (FAMIGLIA_HEADINGS[upper]) return FAMIGLIA_HEADINGS[upper];
  if (/^[A-ZÀ-Ý0-9 .\-/&]+$/.test(text) && /[A-ZÀ-Ý]/.test(text) && !/\d/.test(text) && text.length <= 60) {
    return text.trim();
  }
  return null;
}

function looksLikeCategoryHeading(text) {
  if (!text) return false;
  if (/\d{4,}/.test(text)) return false;
  if (text.length > 80) return false;
  const firstChar = text.charAt(0);
  if (firstChar !== firstChar.toUpperCase()) return false;
  if (text === text.toUpperCase()) return false;
  return true;
}

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

export function buildRowsFromLines(lines, pageNum, ctx, discarded = []) {
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
        famigliaRaw: ctx.famiglia || '',
        categoriaRaw: ctx.categoria || '',
        Codice: product.code,
        Descrizione: desc,
        Prezzo_EUR: product.price,
        Pagine: String(pageNum),
        Review_Flag: reviewFlag
      });
      continue;
    }

    // Heading detection only if no product fields.
    const fontSize = lineMaxFontSize(line);
    const fam = detectFamigliaHeading(text);
    if (fam && (fontSize >= 11 || FAMIGLIA_HEADINGS[text.toUpperCase()])) {
      ctx.famiglia = fam;
      ctx.categoria = '';
      continue;
    }
    if (looksLikeCategoryHeading(text) && fontSize >= 9) {
      ctx.categoria = text.trim();
      continue;
    }

    // Token-level potential row that didn't pass isProductRow → log discarded.
    if (tokens.length >= 2 && tokens.some(t => isProductCode(t)) && !isProductRow(tokens)) {
      discarded.push({ page: pageNum, reason: 'no-valid-price', tokens });
    }
  }
  return rows;
}

/** Aggregate rows by Codice: keep first occurrence with valid price, concat Pagine. */
export function aggregateRows(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.Codice;
    if (!map.has(key)) {
      map.set(key, { ...r, _pages: [r.Pagine], _count: 1 });
    } else {
      const existing = map.get(key);
      existing._pages.push(r.Pagine);
      existing._count += 1;
    }
  }
  const out = [];
  for (const r of map.values()) {
    const uniquePages = [...new Set(r._pages.filter(Boolean))];
    out.push({
      famigliaRaw: r.famigliaRaw,
      categoriaRaw: r.categoriaRaw,
      Codice: r.Codice,
      Descrizione: r.Descrizione,
      Prezzo_EUR: r.Prezzo_EUR,
      Pagine: uniquePages.join(', '),
      Occorrenze: r._count,
      Review_Flag: r.Review_Flag
    });
  }
  return out;
}

/**
 * Main extractor: takes a pdf.js PDFDocumentProxy and returns
 * { rows, parserLog: { pages_total, pages_with_text, pages_image_only, rows_extracted, discarded } }.
 */
export async function extractFromPdf(pdf, fileName, onLog = () => {}) {
  const pushLog = (msg) => { onLog(msg); };
  const ctx = { famiglia: '', categoria: '' };
  const rawRows = [];
  const discarded = [];

  const pages_total = pdf.numPages;
  let pages_with_text = 0;
  let pages_image_only = 0;

  for (let pageNum = 1; pageNum <= pages_total; pageNum++) {
    const page = await pdf.getPage(pageNum);
    let textContent;
    try {
      textContent = await page.getTextContent();
    } catch (err) {
      pushLog(`Pagina ${pageNum}: errore di lettura testo (${err.message || err}), saltata.`);
      continue;
    }
    const items = textContent.items || [];
    if (!items.length) {
      pages_image_only++;
      pushLog(`Pagina ${pageNum}: nessun testo estraibile (probabilmente immagine), saltata.`);
      continue;
    }
    pages_with_text++;
    const lines = groupItemsByLine(items, 2);
    const pageRows = buildRowsFromLines(lines, pageNum, ctx, discarded);
    for (const r of pageRows) {
      r.Fonte = fileName;
      rawRows.push(r);
    }
  }

  const rows = aggregateRows(rawRows);

  pushLog(`Pagine totali: ${pages_total} (con testo: ${pages_with_text}, solo immagine: ${pages_image_only}).`);
  pushLog(`Righe estratte: ${rows.length}.`);
  if (discarded.length) pushLog(`Righe scartate (senza prezzo valido): ${discarded.length}.`);

  return {
    rows,
    parserLog: {
      pages_total,
      pages_with_text,
      pages_image_only,
      rows_extracted: rows.length,
      discarded
    }
  };
}

// PDF parsing utilities for v4: code/description/price/page extraction with multi-line support.

/**
 * Accept Italian price formats: "3.940,00", "880,00", "1.500", "1.500,00".
 * Reject:
 *   - "21.100.057" (3+ dots without comma → product code, not a price)
 *   - "21100076"   (8+ digits without separators → product code)
 *   - "36", "880"  (bare integers without separator → could be quantity, year, model — treat as not-a-price)
 *   - "abc", ""
 */
export function parsePriceString(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim().replace(/[€\s]/g, '');
  if (!t) return null;
  if (!/^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$/.test(t)) return null;
  const dotGroups = t.split('.').length - 1;
  if (dotGroups >= 2 && !t.includes(',')) return null;
  if (dotGroups === 0 && !t.includes(',')) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function isProductCode(s) {
  if (typeof s !== 'string') return false;
  return /^\d{6,9}$/.test(s.replace(/[\s.]/g, ''));
}

/** Una riga è "riga prodotto" se ha almeno un codice. (Il prezzo può anche
    arrivare dalla riga successiva, vedi joinMultiLineRows.) */
export function hasProductCode(tokens) {
  if (!Array.isArray(tokens)) return false;
  return tokens.some(t => isProductCode(t));
}

/** Una riga è "valida e completa" se ha codice E prezzo. */
export function isCompleteProductRow(tokens) {
  if (!Array.isArray(tokens)) return false;
  const codes = tokens.filter(t => isProductCode(t));
  const prices = tokens.map(t => parsePriceString(t)).filter(p => p !== null);
  return codes.length >= 1 && prices.length >= 1;
}

function normalizeCode(token) {
  return String(token || '').replace(/[\s.]/g, '');
}

function lastValidPrice(tokens) {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const v = parsePriceString(tokens[i]);
    if (v !== null) return { idx: i, value: v };
  }
  return null;
}

function joinTokens(tokens) {
  return tokens.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Unisce le righe di una pagina in righe-prodotto, gestendo descrizioni multi-riga
 * (fino a 3 righe consecutive) come da SPEC v4 §3.3.
 *
 * Input:  linee[]  — array di { tokens: string[] }, già ordinate top→bottom.
 *         pagina   — numero pagina (1-based).
 * Output: array di { codice, descrizione, prezzo, pagina, review_flag }.
 */
export function joinMultiLineRows(linee, pagina) {
  const rows = [];
  let i = 0;
  while (i < linee.length) {
    const L = linee[i];
    const tk = (L && L.tokens) || [];

    if (!hasProductCode(tk)) { i += 1; continue; }

    const codeIdx = tk.findIndex(t => isProductCode(t));
    const codice = normalizeCode(tk[codeIdx]);
    const pageStr = String(pagina);

    if (isCompleteProductRow(tk)) {
      const priceInfo = lastValidPrice(tk);
      const desc = joinTokens(tk.slice(codeIdx + 1, priceInfo.idx));
      rows.push({ codice, descrizione: desc, prezzo: priceInfo.value, pagina: pageStr, review_flag: '' });
      i += 1;
      continue;
    }

    const L1 = (i + 1 < linee.length) ? linee[i + 1] : null;
    const L2 = (i + 2 < linee.length) ? linee[i + 2] : null;
    const t1 = L1 ? ((L1.tokens) || []) : null;
    const t2 = L2 ? ((L2.tokens) || []) : null;
    const t1Price = t1 ? lastValidPrice(t1) : null;
    const t2Price = t2 ? lastValidPrice(t2) : null;
    const t1HasCode = t1 ? hasProductCode(t1) : false;
    const t2HasCode = t2 ? hasProductCode(t2) : false;

    // Caso B1: 2-line merge (riga successiva senza codice ma con prezzo)
    if (t1 && !t1HasCode && t1Price) {
      const descA = joinTokens(tk.slice(codeIdx + 1));
      const descB = joinTokens(t1.slice(0, t1Price.idx));
      const desc = `${descA} ${descB}`.replace(/\s+/g, ' ').trim();
      rows.push({ codice, descrizione: desc, prezzo: t1Price.value, pagina: pageStr, review_flag: '' });
      i += 2;
      continue;
    }

    // Caso B2: 3-line merge (L1 continuazione pura, L2 con prezzo, nessuna delle 2 ha codice)
    if (t1 && !t1HasCode && !t1Price && t2 && !t2HasCode && t2Price) {
      const descA = joinTokens(tk.slice(codeIdx + 1));
      const descB = joinTokens(t1);
      const descC = joinTokens(t2.slice(0, t2Price.idx));
      const desc = `${descA} ${descB} ${descC}`.replace(/\s+/g, ' ').trim();
      rows.push({ codice, descrizione: desc, prezzo: t2Price.value, pagina: pageStr, review_flag: '' });
      i += 3;
      continue;
    }

    // Caso C: codice senza prezzo determinabile → CHECK
    const desc = joinTokens(tk.slice(codeIdx + 1));
    rows.push({ codice, descrizione: desc, prezzo: null, pagina: pageStr, review_flag: 'CHECK' });
    i += 1;
  }
  return rows;
}

/** Aggregazione multi-pagina: per ogni codice, concatena pagine, mantiene primo
 *  prezzo valido e flagga prezzi difformi tra occorrenze diverse. */
export function aggregateAcrossPages(rowsByPage) {
  const map = new Map();
  for (const r of rowsByPage) {
    const k = r.codice;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  const out = [];
  for (const [, occurrences] of map.entries()) {
    const valid = occurrences.filter(o => o.prezzo !== null);
    const base = valid.length ? { ...valid[0] } : { ...occurrences[0] };
    const allPages = [];
    for (const o of occurrences) {
      const ps = String(o.pagina || '').split(',').map(s => s.trim()).filter(Boolean);
      for (const p of ps) if (!allPages.includes(p)) allPages.push(p);
    }
    base.pagina = allPages.join(', ');
    const distinctPrices = [...new Set(valid.map(o => o.prezzo))];
    if (distinctPrices.length > 1) base.review_flag = 'CHECK_PREZZO_DIFFORME';
    out.push(base);
  }
  return out;
}

// === pdf.js layer ===

/**
 * M2 — Detection automatica delle fasce X di una pagina-tabella.
 * Input: array di item { str, x0, x1 } (forma normalizzata, derivata altrove
 *        dai text item di pdfjs).
 * Output: { code, descrizione, prezzo, compatibilita, noteLaterali } dove
 *         ogni fascia è una coppia [xMin, xMax]. `null` se mancano
 *         abbastanza ancore (codici 8 cifre + prezzi).
 *
 * Le fasce sono ricavate da:
 *   - xCodeLeft  = moda(x0) dei codici 8 cifre
 *   - xPriceLeft = moda(x0) dei prezzi italiani (1.234,56[ €])
 *   - xPriceRight= moda(x1) dei prezzi
 */
export function computeColumnBands(items, pageWidth = Infinity) {
  if (!Array.isArray(items) || !items.length) return null;
  const priceRe = /^\d{1,3}(?:\.\d{3})*,\d{2}(?:\s*€)?$/;
  const codeRe = /^\d{8}$/;
  const prices = [];
  const codes = [];
  for (const it of items) {
    if (!it) continue;
    const t = String(it.str || '').trim();
    if (!t) continue;
    if (priceRe.test(t)) prices.push(it);
    else if (codeRe.test(t)) codes.push(it);
  }
  if (!prices.length || !codes.length) return null;
  const xPriceLeft  = _modeOfRounded(prices.map(it => it.x0));
  const xPriceRight = _modeOfRounded(prices.map(it => it.x1));
  const xCodeLeft   = _modeOfRounded(codes.map(it => it.x0));
  return {
    code:          [xCodeLeft - 5, xCodeLeft + 60],
    descrizione:   [xCodeLeft + 60, xPriceLeft - 10],
    prezzo:        [xPriceLeft - 10, xPriceRight + 10],
    compatibilita: [xPriceRight + 10, pageWidth],
    noteLaterali:  [0, xCodeLeft - 5],
    _anchors: { xCodeLeft, xPriceLeft, xPriceRight }
  };
}

function _modeOfRounded(values) {
  const ints = values
    .filter(v => typeof v === 'number' && Number.isFinite(v))
    .map(v => Math.round(v));
  if (!ints.length) return 0;
  const counts = new Map();
  for (const v of ints) counts.set(v, (counts.get(v) || 0) + 1);
  let modal = ints[0];
  let best = 0;
  for (const [v, n] of counts.entries()) {
    if (n > best) { best = n; modal = v; }
  }
  return modal;
}

/**
 * M8 — bucket Y proporzionale al font dominante.
 * Filtra i font del corpo (6-12pt, esclude header e icone), prende la moda
 * arrotondata e ritorna moda*0.4. Cade su `fallback` (2pt) se non trova
 * font del corpo.
 */
export function computeYBucket(fontSizes, fallback = 2) {
  if (!Array.isArray(fontSizes) || !fontSizes.length) return fallback;
  const bodyFonts = fontSizes
    .filter(s => typeof s === 'number' && s >= 6 && s <= 12)
    .map(s => Math.round(s));
  if (!bodyFonts.length) return fallback;
  const counts = new Map();
  for (const s of bodyFonts) counts.set(s, (counts.get(s) || 0) + 1);
  let modal = bodyFonts[0];
  let best = 0;
  for (const [s, n] of counts.entries()) {
    if (n > best) { best = n; modal = s; }
  }
  return modal * 0.4;
}

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
  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines;
}

function lineToTokens(line) {
  const text = line.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
  return text.split(/\s+/).filter(Boolean);
}

/** Estrae righe-prodotto da un PDFDocumentProxy di pdfjs-dist. */
export async function extractFromPdfDocument(pdf, onLog = () => {}) {
  const pages_total = pdf.numPages;
  let pages_with_text = 0;
  let pages_image_only = 0;
  const allRows = [];

  for (let pageNum = 1; pageNum <= pages_total; pageNum++) {
    const page = await pdf.getPage(pageNum);
    let textContent;
    try {
      textContent = await page.getTextContent();
    } catch (err) {
      onLog(`Pagina ${pageNum}: errore di lettura testo (${err.message || err}), saltata.`);
      continue;
    }
    const items = textContent.items || [];
    if (!items.length) {
      pages_image_only += 1;
      onLog(`Pagina ${pageNum}: nessun testo estraibile (probabilmente immagine), saltata.`);
      continue;
    }
    pages_with_text += 1;
    const fontSizes = items.map(it => Math.abs(it.transform[0]));
    const yBucket = computeYBucket(fontSizes);
    const visualLines = groupItemsByLine(items, yBucket);
    const linee = visualLines.map(vl => ({ tokens: lineToTokens(vl) }));
    const pageRows = joinMultiLineRows(linee, pageNum);
    for (const r of pageRows) allRows.push(r);
  }

  const rows = aggregateAcrossPages(allRows);
  const rows_in_check = rows.filter(r => r.review_flag).length;

  onLog(`Pagine totali: ${pages_total} (con testo: ${pages_with_text}, solo immagine: ${pages_image_only}).`);
  onLog(`Righe estratte: ${rows.length}.`);
  if (rows_in_check) onLog(`Righe in CHECK: ${rows_in_check}.`);

  return {
    rows,
    meta: {
      pages_total,
      pages_with_text,
      pages_image_only,
      rows_extracted: rows.length,
      rows_in_check
    }
  };
}

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
 * M9 — Pattern noti delle "note laterali" (marker quantità/dimensioni a sinistra
 * della colonna codice). Esportati per riuso/test.
 */
export const SIDE_NOTE_PATTERNS = [
  /^x\d+$/,            // x4, x12, x24
  /^\(\d+\s*pcs?\)$/,  // (2pcs), (3pc), (15pcs)
  /^Ø\s*mm\s*\d+$/     // Ømm58, Ømm145
];

/**
 * M9 — Filtro note laterali.
 * Rimuove i text item che cadono nella `FASCIA_NOTE_LATERALI` (calcolata da
 * computeColumnBands), sono brevi (length ≤ 6) e matchano uno dei pattern
 * noti di SIDE_NOTE_PATTERNS. Tutti gli altri item vengono mantenuti.
 *
 * Nota: la SPEC §M9 fissa il limite a length ≤ 6. Stringhe più lunghe come
 * "(2 pcs)" con spazio (7 char) o "Ø mm 58" (7 char) non vengono filtrate
 * con questa soglia: è una scelta volutamente conservativa.
 */
export function filterSideNotes(items, noteLateraliBand) {
  if (!Array.isArray(items)) return [];
  if (!Array.isArray(noteLateraliBand) || noteLateraliBand.length !== 2) return items;
  const [xMin, xMax] = noteLateraliBand;
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) return items;
  return items.filter(it => {
    if (!it) return false;
    const t = String(it.str || '').trim();
    if (!t) return true;
    const x0 = Number(it.x0);
    if (!Number.isFinite(x0)) return true;
    const inBand = x0 >= xMin && x0 < xMax;
    if (!inBand) return true;
    if (t.length > 6) return true;
    const isNote = SIDE_NOTE_PATTERNS.some(re => re.test(t));
    return !isNote;
  });
}

/**
 * M3 — Filtro header verticale (rotated header).
 * Identifica i text item che sono caratteri 1-2 di intestazioni di colonna
 * ruotate 90° (es. "TOUCH MEC 2000S" sparpagliato come singole lettere
 * sopra la prima riga di dati). Criteri (pseudocodifica SPEC §M3):
 *   - top < firstAnchorTop - 5     (sopra il primo codice della pagina,
 *                                   in coord display-top: piccolo = alto)
 *   - str.length <= 2
 *   - (x1 - x0) < 12pt
 * Ritorna la lista degli item NON marcati come header verticale.
 * Se firstAnchorTop non è fornito, ritorna gli item invariati.
 */
export function filterVerticalHeaders(items, firstAnchorTop) {
  if (!Array.isArray(items)) return [];
  if (typeof firstAnchorTop !== 'number' || !Number.isFinite(firstAnchorTop)) return items;
  return items.filter(it => {
    if (!it) return false;
    const t = String(it.str || '');
    const w = (Number(it.x1) || 0) - (Number(it.x0) || 0);
    const top = Number(it.top);
    if (!Number.isFinite(top)) return true;
    const isHeader = top < firstAnchorTop - 5 && t.length <= 2 && w < 12;
    return !isHeader;
  });
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

// === M1 — anchor-first row-band extraction ===

/**
 * M1 — Normalizza un text item raw di pdfjs-dist nello shape comune
 * { str, x0, x1, top, bottom, fontSize }, con `top` in coord display-top
 * (pageHeight - yBaseline - height) compatibile con M3 (smaller = higher).
 */
export function normalizePdfjsItem(rawItem, pageHeight) {
  if (!rawItem || typeof rawItem.str !== 'string') return null;
  const transform = rawItem.transform;
  if (!Array.isArray(transform) || transform.length < 6) return null;
  const x0 = Number(transform[4]);
  const yBaseline = Number(transform[5]);
  if (!Number.isFinite(x0) || !Number.isFinite(yBaseline)) return null;
  const fontSize = Math.abs(Number(transform[0])) || 0;
  const width = Number(rawItem.width) || 0;
  const height = Number(rawItem.height) || fontSize;
  const ph = Number.isFinite(pageHeight) ? pageHeight : 0;
  return {
    str: rawItem.str,
    x0,
    x1: x0 + width,
    top: ph - (yBaseline + height),
    bottom: ph - yBaseline,
    fontSize
  };
}

/**
 * M1 — Estrae gli anchor (codici 8 cifre) dagli item normalizzati,
 * ordinati per `top` crescente (visual top → bottom).
 */
export function extractAnchors(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const it of items) {
    if (!it || typeof it.str !== 'string') continue;
    const t = it.str.trim();
    if (!/^\d{8}$/.test(t)) continue;
    const top = Number(it.top);
    if (!Number.isFinite(top)) continue;
    out.push({ codice: t, top, item: it });
  }
  out.sort((a, b) => a.top - b.top);
  return out;
}

/**
 * M1 — Calcola le bande verticali per anchor:
 *   yTop[i]    = (anchors[i-1].top + anchors[i].top) / 2  (o pageTop)
 *   yBottom[i] = (anchors[i].top + anchors[i+1].top) / 2  (o pageBottom)
 */
export function buildBandsFromAnchors(anchors, pageTop = 0, pageBottom = Infinity) {
  if (!Array.isArray(anchors) || !anchors.length) return [];
  const bands = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const yTop = i === 0 ? pageTop : (anchors[i - 1].top + a.top) / 2;
    const yBottom = i === anchors.length - 1 ? pageBottom : (a.top + anchors[i + 1].top) / 2;
    bands.push({ codice: a.codice, anchor: a, yTop, yBottom });
  }
  return bands;
}

/** M1 — Filtra gli item la cui `top` cade in [yTop, yBottom). */
export function collectBandItems(items, band) {
  if (!Array.isArray(items) || !band) return [];
  const { yTop, yBottom } = band;
  if (!Number.isFinite(yTop) || !Number.isFinite(yBottom)) return [];
  return items.filter(it => {
    if (!it) return false;
    const t = Number(it.top);
    if (!Number.isFinite(t)) return false;
    return t >= yTop && t < yBottom;
  });
}

/** M1 — Classifica un item per fascia X usando le bande di M2. */
export function classifyXBand(item, columnBands) {
  if (!item || !columnBands) return null;
  const x0 = Number(item.x0);
  if (!Number.isFinite(x0)) return null;
  const inBand = (b) => Array.isArray(b) && b.length === 2 && x0 >= b[0] && x0 < b[1];
  if (inBand(columnBands.code)) return 'code';
  if (inBand(columnBands.descrizione)) return 'descrizione';
  if (inBand(columnBands.prezzo)) return 'prezzo';
  if (inBand(columnBands.compatibilita)) return 'compatibilita';
  if (inBand(columnBands.noteLaterali)) return 'noteLaterali';
  return null;
}

/**
 * M1 — Costruisce una riga prodotto dalla banda di un anchor.
 *  - descrizione: concatenazione (top↑, x0↑) degli item in fascia 'descrizione'
 *  - prezzo: primo prezzo valido in fascia 'prezzo' (parsePriceString)
 *  - review_flag: 'MULTI_PRICE' se >1 prezzi distinti, altrimenti
 *                 'PREZZO_MANCANTE' se nessun prezzo valido, altrimenti vuoto.
 *
 * Se columnBands è null (pagina senza struttura tabellare riconoscibile),
 * fallback: prova prima parsePriceString, poi tratta come descrizione.
 */
export function emitRowFromBand(anchor, bandItems, columnBands, pageNum) {
  if (!anchor) return null;
  const items = Array.isArray(bandItems) ? bandItems : [];
  const sorted = [...items].sort((a, b) => (a.top - b.top) || (a.x0 - b.x0));
  const descParts = [];
  let prezzo = null;
  let multiPrice = false;

  for (const it of sorted) {
    if (it === anchor.item) continue;
    const t = String(it.str || '').trim();
    if (!t) continue;
    if (/^\d{8}$/.test(t)) continue; // un altro anchor finito qui per sbaglio

    if (columnBands) {
      const cls = classifyXBand(it, columnBands);
      if (cls === 'prezzo') {
        const v = parsePriceString(t);
        if (v !== null) {
          if (prezzo === null) prezzo = v;
          else if (v !== prezzo) multiPrice = true;
        }
      } else if (cls === 'descrizione') {
        descParts.push(t);
      }
      // 'code' | 'compatibilita' | 'noteLaterali' | null → skip
    } else {
      // Fallback senza bande: parsiamo come prezzo o descrizione in base al contenuto
      const v = parsePriceString(t);
      if (v !== null) {
        if (prezzo === null) prezzo = v;
        else if (v !== prezzo) multiPrice = true;
      } else {
        descParts.push(t);
      }
    }
  }

  const descrizione = descParts.join(' ').replace(/\s+/g, ' ').trim();
  let review_flag = '';
  if (multiPrice) review_flag = 'MULTI_PRICE';
  else if (prezzo === null) review_flag = 'PREZZO_MANCANTE';

  return {
    codice: anchor.codice,
    descrizione,
    prezzo,
    pagina: String(pageNum),
    review_flag
  };
}

/** Estrae righe-prodotto da un PDFDocumentProxy di pdfjs-dist (anchor-first, v5). */
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
    const rawItems = textContent.items || [];
    if (!rawItems.length) {
      pages_image_only += 1;
      onLog(`Pagina ${pageNum}: nessun testo estraibile (probabilmente immagine), saltata.`);
      continue;
    }
    pages_with_text += 1;

    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;
    const pageWidth = viewport.width;

    let items = rawItems
      .map(it => normalizePdfjsItem(it, pageHeight))
      .filter(Boolean);

    // Anchor extraction: M3 (length≤2, width<12pt) and M9 (SIDE_NOTE_PATTERNS)
    // by construction non possono rimuovere codici 8 cifre, quindi una sola
    // estrazione anchor copre l'intera pipeline.
    const anchors = extractAnchors(items);
    if (!anchors.length) continue;
    const firstAnchorTop = anchors[0].top;

    // M3 — drop vertical-header characters
    items = filterVerticalHeaders(items, firstAnchorTop);

    // M2 — compute column X bands
    const cols = computeColumnBands(items, pageWidth);

    // M9 — drop side-note markers (only if cols available)
    if (cols) {
      items = filterSideNotes(items, cols.noteLaterali);
    }

    const bands = buildBandsFromAnchors(anchors, 0, pageHeight);
    for (const band of bands) {
      const bandItems = collectBandItems(items, band);
      const row = emitRowFromBand(band.anchor, bandItems, cols, pageNum);
      if (row) allRows.push(row);
    }
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

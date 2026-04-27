// Excel workbook builder v5: 3 sheets (00_Info + Listino + Accessori_Standard).

import * as XLSX from 'xlsx';

const LISTINO_HEADERS = ['Codice', 'Descrizione', 'Prezzo_EUR', 'Pagina', 'Review_Flag', 'Sezione'];
const LISTINO_COL_WIDTHS = [
  { wch: 12 }, { wch: 60 }, { wch: 12 }, { wch: 10 }, { wch: 24 }, { wch: 32 }
];

const ACCESSORI_SECTION_KEYWORDS = ['ACCESSORI STANDARD', 'OPTIONAL', 'OPTIONAL CONSIGLIATI'];

/**
 * M7 — Partiziona le righe v5 in due insiemi:
 *  - listino:    righe normali (vanno nel foglio "Listino")
 *  - accessori:  righe senza prezzo proprio in sezione accessori-standard
 *                (vanno nel foglio "Accessori_Standard")
 *
 * Criterio (esatto, AND):
 *   1. prezzo === null OR prezzo === '' OR prezzo === undefined
 *   2. sezione (uppercase) include una di:
 *        "ACCESSORI STANDARD" / "OPTIONAL" / "OPTIONAL CONSIGLIATI"
 *
 * Una row con prezzo mancante MA sezione non-accessori (es. "EQUILIBRATRICI >
 * Touch MEC 2000S") RESTA in Listino con il suo Review_Flag (tipicamente
 * 'PREZZO_MANCANTE'): è un caso da rivedere a mano, non un accessorio incluso.
 */
export function partitionRowsByAccessoriStandard(rows) {
  const listino = [];
  const accessori = [];
  if (!Array.isArray(rows)) return { listino, accessori };
  for (const r of rows) {
    if (!r) continue;
    const noPrezzo = r.prezzo === null || r.prezzo === '' || r.prezzo === undefined;
    if (!noPrezzo) { listino.push(r); continue; }
    const sezione = String(r.sezione || '').toUpperCase();
    const isAccessorio = ACCESSORI_SECTION_KEYWORDS.some(kw => sezione.includes(kw));
    if (isAccessorio) accessori.push(r);
    else listino.push(r);
  }
  return { listino, accessori };
}

/**
 * Costruisce un worksheet con la struttura standard del Listino (6 colonne).
 * Riusato da Listino e Accessori_Standard per garantire layout identico.
 * Foglio creato anche se `rows` è vuoto: contiene solo l'header.
 */
function buildListinoSheet(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const data = [LISTINO_HEADERS, ...safeRows.map(r => [
    r.codice,
    r.descrizione || '',
    r.prezzo ?? '',
    r.pagina,
    r.review_flag || '',
    r.sezione || ''
  ])];
  const ws = XLSX.utils.aoa_to_sheet(data);

  for (let i = 1; i < data.length; i++) {
    const codeCell = XLSX.utils.encode_cell({ r: i, c: 0 });
    if (ws[codeCell]) {
      ws[codeCell].t = 's';
      ws[codeCell].v = String(data[i][0] ?? '');
    }
    const pageCell = XLSX.utils.encode_cell({ r: i, c: 3 });
    if (ws[pageCell]) {
      ws[pageCell].t = 's';
      ws[pageCell].v = String(data[i][3] ?? '');
    }
    const priceCell = XLSX.utils.encode_cell({ r: i, c: 2 });
    if (ws[priceCell] && typeof ws[priceCell].v === 'number') {
      ws[priceCell].z = '#,##0';
    }
  }

  ws['!cols'] = LISTINO_COL_WIDTHS;
  return ws;
}

export function buildWorkbook({ rows, meta, sourcePdfName }) {
  const wb = XLSX.utils.book_new();

  // 1. Foglio 00_Info (con Versione_Parser = 5.0.0)
  const infoData = [
    ['File di origine',  sourcePdfName || ''],
    ['Pagine totali',    meta.pages_total ?? 0],
    ['Righe estratte',   meta.rows_extracted ?? (Array.isArray(rows) ? rows.length : 0)],
    ['Righe in CHECK',   meta.rows_in_check ?? 0],
    ['Generato il',      new Date().toISOString()],
    ['Versione app',     '5.0.0'],
    ['Versione_Parser',  '5.0.0'],
    ['Avvertenza',       'Strumento AS-IS. Verificare sempre i dati estratti rispetto al PDF originale.']
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
  wsInfo['!cols'] = [{ wch: 22 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, '00_Info');

  // 2-3. Split rows: Listino (default) + Accessori_Standard (sezione accessori senza prezzo)
  // SCELTA: il foglio "Accessori_Standard" è SEMPRE creato (anche se vuoto, con solo header)
  // per garantire una struttura prevedibile dell'Excel di output.
  const { listino, accessori } = partitionRowsByAccessoriStandard(rows);
  XLSX.utils.book_append_sheet(wb, buildListinoSheet(listino),  'Listino');
  XLSX.utils.book_append_sheet(wb, buildListinoSheet(accessori), 'Accessori_Standard');

  return wb;
}

export function buildOutputFilename(pdfFileName) {
  const base = (pdfFileName || 'listino').replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9_\-]+/g, '_');
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${base}_estratto_${stamp}.xlsx`;
}

export function downloadWorkbook(wb, filename) {
  XLSX.writeFile(wb, filename);
}

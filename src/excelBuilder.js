// Excel workbook builder v5.3: 3 fogli (00_Info + Listino + Dotazioni standard).
//
// Il foglio "Dotazioni standard" raccoglie i codici-didascalia riconosciuti dal
// parser (Pattern A): codici stampati sotto le foto nei box ACCESSORI STANDARD,
// mai prezzati nel PDF. Non sono righe di listino, ma l'informazione su quali
// macchine li montano di serie è utile e va conservata. La separazione avviene
// a monte, in src/pdfParser.js (classifyDidascalie): qui ci limitiamo a
// impaginare i due insiemi già distinti.

import * as XLSX from 'xlsx';

const LISTINO_HEADERS = ['Codice', 'Descrizione', 'Prezzo_EUR', 'Pagina', 'Review_Flag', 'Sezione'];
const LISTINO_COL_WIDTHS = [
  { wch: 12 }, { wch: 60 }, { wch: 12 }, { wch: 10 }, { wch: 24 }, { wch: 32 }
];

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

export function buildWorkbook({ rows, dotazioni, meta, sourcePdfName }) {
  const wb = XLSX.utils.book_new();
  const m = meta || {};
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeDotazioni = Array.isArray(dotazioni) ? dotazioni : [];

  // 1. Foglio 00_Info
  const infoData = [
    ['File di origine',        sourcePdfName || ''],
    ['Pagine totali',          m.pages_total ?? 0],
    ['Righe estratte',         m.rows_extracted ?? safeRows.length],
    ['Codici-didascalia',      m.dotazioni_count ?? safeDotazioni.length],
    ['Righe in CHECK',         m.rows_in_check ?? 0],
    ['Generato il',            new Date().toISOString()],
    ['Versione app',           '5.3.0'],
    ['Versione_Parser',        '5.3.0'],
    ['Avvertenza',             'Strumento AS-IS. Verificare sempre i dati estratti rispetto al PDF originale.']
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
  wsInfo['!cols'] = [{ wch: 22 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, '00_Info');

  // 2. Listino (righe vere, didascalie già separate dal parser).
  // 3. Dotazioni standard (codici-didascalia, flag CODICE_DIDASCALIA).
  // SCELTA: entrambi i fogli sono SEMPRE creati (anche vuoti, con solo header)
  // per garantire una struttura prevedibile dell'Excel di output.
  XLSX.utils.book_append_sheet(wb, buildListinoSheet(safeRows),      'Listino');
  XLSX.utils.book_append_sheet(wb, buildListinoSheet(safeDotazioni), 'Dotazioni standard');

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

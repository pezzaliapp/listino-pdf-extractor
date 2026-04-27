// Excel workbook builder v4: 2 sheets, no formulas, no classification.

import * as XLSX from 'xlsx';

export function buildWorkbook({ rows, meta, sourcePdfName }) {
  const wb = XLSX.utils.book_new();

  // 1. Foglio 00_Info
  const infoData = [
    ['File di origine', sourcePdfName || ''],
    ['Pagine totali',   meta.pages_total ?? 0],
    ['Righe estratte',  meta.rows_extracted ?? rows.length],
    ['Righe in CHECK',  meta.rows_in_check ?? 0],
    ['Generato il',     new Date().toISOString()],
    ['Versione app',    '4.0.0'],
    ['Avvertenza',      'Strumento AS-IS. Verificare sempre i dati estratti rispetto al PDF originale.']
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
  wsInfo['!cols'] = [{ wch: 22 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, '00_Info');

  // 2. Foglio Listino
  const headers = ['Codice', 'Descrizione', 'Prezzo_EUR', 'Pagina', 'Review_Flag', 'Sezione'];
  const data = [headers, ...rows.map(r => [
    r.codice,
    r.descrizione || '',
    r.prezzo ?? '',
    r.pagina,
    r.review_flag || '',
    r.sezione || ''                              // M6 — sempre stringa, mai undefined
  ])];
  const wsListino = XLSX.utils.aoa_to_sheet(data);

  for (let i = 1; i < data.length; i++) {
    const codeCell = XLSX.utils.encode_cell({ r: i, c: 0 });
    if (wsListino[codeCell]) {
      wsListino[codeCell].t = 's';
      wsListino[codeCell].v = String(data[i][0] ?? '');
    }
    const pageCell = XLSX.utils.encode_cell({ r: i, c: 3 });
    if (wsListino[pageCell]) {
      wsListino[pageCell].t = 's';
      wsListino[pageCell].v = String(data[i][3] ?? '');
    }
    const priceCell = XLSX.utils.encode_cell({ r: i, c: 2 });
    if (wsListino[priceCell] && typeof wsListino[priceCell].v === 'number') {
      wsListino[priceCell].z = '#,##0';
    }
  }

  wsListino['!cols'] = [
    { wch: 12 }, { wch: 60 }, { wch: 12 }, { wch: 10 }, { wch: 24 }, { wch: 32 }
  ];
  XLSX.utils.book_append_sheet(wb, wsListino, 'Listino');

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

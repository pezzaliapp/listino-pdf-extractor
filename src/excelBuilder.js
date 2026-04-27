// Excel workbook builder using SheetJS. Produces a 4-sheet xlsx in the order required by the spec.

import * as XLSX from 'xlsx';
import { classifyCommercial, commercialName } from './classifier.js';

const TOOL_VERSION = 'listino-pdf-extractor v1.0.0';

const COL_WIDTHS = {
  Famiglia: 22,
  Categoria: 28,
  Codice: 12,
  Descrizione: 60,
  Descrizione_tecnica: 60,
  Nome_breve: 40,
  Nome_commerciale: 50,
  Prezzo_EUR: 14,
  Prezzo_listino_EUR: 16,
  Trasporto_EUR: 14,
  Installazione_EUR: 16,
  'Sconto_%': 10,
  Netto_macchina_EUR: 18,
  Totale_preventivo_EUR: 20,
  Pagine: 8,
  Occorrenze: 12,
  Review_Flag: 12,
  Fonte: 30,
  Tier: 10,
  Plus_vendita: 22,
  Upsell_suggerito: 32,
  Pitch_breve: 50,
  Note: 30
};

function colsFromHeaders(headers, overrides = {}) {
  return headers.map(h => ({ wch: overrides[h] || COL_WIDTHS[h] || 14 }));
}

function setCellNumberFormat(ws, cellAddress, fmt) {
  const cell = ws[cellAddress];
  if (!cell) return;
  cell.z = fmt;
}

// Sheet 01: cleaned listino
function buildSheetListinoPulito(rows) {
  const headers = ['Famiglia', 'Categoria', 'Codice', 'Descrizione', 'Prezzo_EUR', 'Pagine', 'Occorrenze', 'Review_Flag', 'Fonte'];
  const aoa = [headers];
  for (const r of rows) {
    aoa.push([
      r.Famiglia || '',
      r.Categoria || '',
      r.Codice || '',
      r.Descrizione || '',
      Number(r.Prezzo_EUR) || 0,
      Number(r.Pagine) || 0,
      Number(r.Occorrenze) || 0,
      r.Review_Flag || '',
      r.Fonte || ''
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Force Codice column (C) to be string-typed.
  for (let i = 0; i < rows.length; i++) {
    const addr = XLSX.utils.encode_cell({ c: 2, r: i + 1 });
    ws[addr] = { t: 's', v: String(rows[i].Codice || '') };
  }

  // Number formats.
  for (let i = 0; i < rows.length; i++) {
    setCellNumberFormat(ws, XLSX.utils.encode_cell({ c: 4, r: i + 1 }), '#,##0');
    setCellNumberFormat(ws, XLSX.utils.encode_cell({ c: 5, r: i + 1 }), '0');
    setCellNumberFormat(ws, XLSX.utils.encode_cell({ c: 6, r: i + 1 }), '0');
  }

  ws['!cols'] = colsFromHeaders(headers);
  return ws;
}

// Sheet 02: CSVXpressSmart with formulas
function buildSheetCsvXpressSmart(rows) {
  const headers = [
    'Famiglia', 'Categoria', 'Codice', 'Nome_breve', 'Descrizione_tecnica',
    'Prezzo_listino_EUR', 'Trasporto_EUR', 'Installazione_EUR', 'Sconto_%',
    'Netto_macchina_EUR', 'Totale_preventivo_EUR', 'Note', 'Fonte', 'Review_Flag'
  ];
  const aoa = [headers];
  for (const r of rows) {
    const desc = r.Descrizione || '';
    aoa.push([
      r.Famiglia || '',
      r.Categoria || '',
      r.Codice || '',
      desc.slice(0, 60),
      desc,
      Number(r.Prezzo_EUR) || 0,
      '', // Trasporto
      '', // Installazione
      '', // Sconto
      '', // Netto - replaced with formula below
      '', // Totale - replaced with formula below
      '', // Note
      r.Fonte || '',
      r.Review_Flag || ''
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Force Codice column (C, idx 2) string.
  for (let i = 0; i < rows.length; i++) {
    const addr = XLSX.utils.encode_cell({ c: 2, r: i + 1 });
    ws[addr] = { t: 's', v: String(rows[i].Codice || '') };
  }

  for (let i = 0; i < rows.length; i++) {
    const R = i + 2; // Excel 1-indexed row
    const rowIdx = i + 1; // 0-indexed sheet row

    // Prezzo_listino_EUR (F)
    setCellNumberFormat(ws, XLSX.utils.encode_cell({ c: 5, r: rowIdx }), '#,##0');

    // Trasporto_EUR (G), Installazione_EUR (H) - empty cells with format if user fills
    setCellNumberFormat(ws, XLSX.utils.encode_cell({ c: 6, r: rowIdx }), '#,##0');
    setCellNumberFormat(ws, XLSX.utils.encode_cell({ c: 7, r: rowIdx }), '#,##0');

    // Sconto_% (I)
    setCellNumberFormat(ws, XLSX.utils.encode_cell({ c: 8, r: rowIdx }), '0.00%');

    // Netto_macchina_EUR (J): formula =F{R}*(1-IFERROR(I{R},0))
    const nettoAddr = XLSX.utils.encode_cell({ c: 9, r: rowIdx });
    ws[nettoAddr] = { t: 'n', f: `F${R}*(1-IFERROR(I${R},0))` };
    setCellNumberFormat(ws, nettoAddr, '#,##0');

    // Totale_preventivo_EUR (K): =J{R}+IFERROR(G{R},0)+IFERROR(H{R},0)
    const totAddr = XLSX.utils.encode_cell({ c: 10, r: rowIdx });
    ws[totAddr] = { t: 'n', f: `J${R}+IFERROR(G${R},0)+IFERROR(H${R},0)` };
    setCellNumberFormat(ws, totAddr, '#,##0');
  }

  ws['!cols'] = colsFromHeaders(headers);
  return ws;
}

// Sheet 03: Commerciale view
function buildSheetCommerciale(rows) {
  const headers = [
    'Famiglia', 'Categoria', 'Codice', 'Nome_commerciale',
    'Prezzo_listino_EUR', 'Tier', 'Plus_vendita', 'Upsell_suggerito',
    'Pitch_breve', 'Review_Flag'
  ];
  const aoa = [headers];
  for (const r of rows) {
    const cls = classifyCommercial({ famiglia: r.Famiglia, prezzo: Number(r.Prezzo_EUR) || 0 });
    aoa.push([
      r.Famiglia || '',
      r.Categoria || '',
      r.Codice || '',
      commercialName({ famiglia: r.Famiglia, descrizione: r.Descrizione }),
      Number(r.Prezzo_EUR) || 0,
      cls.tier,
      cls.plus,
      cls.upsell,
      cls.pitch,
      r.Review_Flag || ''
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  for (let i = 0; i < rows.length; i++) {
    const rowIdx = i + 1;
    ws[XLSX.utils.encode_cell({ c: 2, r: rowIdx })] = { t: 's', v: String(rows[i].Codice || '') };
    setCellNumberFormat(ws, XLSX.utils.encode_cell({ c: 4, r: rowIdx }), '#,##0');
  }

  ws['!cols'] = colsFromHeaders(headers);
  return ws;
}

// Sheet 00: Note (key/value)
function buildSheetNote(fileName) {
  const aoa = [
    ['File di origine', fileName || ''],
    ['Criterio', 'Estratto dal PDF e ripulito in tre viste: listino pulito, struttura CSVXpressSmart, vista commerciale.'],
    ['Review_Flag', 'CHECK = riga da verificare manualmente nel PDF, perchè la descrizione nel listino era frammentata o poco leggibile.'],
    ['Uso foglio 02', 'Compila Trasporto, Installazione e Sconto %. Netto macchina e Totale preventivo si aggiornano da formula.'],
    ['Generato il', new Date().toISOString()],
    ['Tool', TOOL_VERSION],
    ['Avvertenza', 'Strumento AS-IS. Verificare sempre i dati estratti rispetto al PDF originale.']
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 22 }, { wch: 90 }];
  return ws;
}

export function buildWorkbook(rows, fileName) {
  const wb = XLSX.utils.book_new();
  // Order required by spec §8: 00 Note, 01 Listino_pulito, 02 CSVXpressSmart, 03 Commerciale.
  XLSX.utils.book_append_sheet(wb, buildSheetNote(fileName), '00_Note');
  XLSX.utils.book_append_sheet(wb, buildSheetListinoPulito(rows), '01_Listino_pulito');
  XLSX.utils.book_append_sheet(wb, buildSheetCsvXpressSmart(rows), '02_CSVXpressSmart');
  XLSX.utils.book_append_sheet(wb, buildSheetCommerciale(rows), '03_Commerciale');
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

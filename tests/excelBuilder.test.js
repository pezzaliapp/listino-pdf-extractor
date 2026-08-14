import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { buildWorkbook } from '../src/excelBuilder.js';

// === v5.3 — struttura workbook: 00_Info + Listino + Dotazioni standard ===
// La separazione delle didascalie (Pattern A) avviene ora nel parser
// (classifyDidascalie); qui si verifica solo l'impaginazione.

test('buildWorkbook: produce 3 fogli — 00_Info + Listino + Dotazioni standard', () => {
  const rows = [
    { codice: 'A', descrizione: 'Cono', prezzo: 65, pagina: '16', review_flag: '', sezione: 'EQUILIBRATRICI' }
  ];
  const meta = { pages_total: 1, rows_extracted: 1, rows_in_check: 0 };
  const wb = buildWorkbook({ rows, dotazioni: [], meta, sourcePdfName: 'test.pdf' });
  assert.deepEqual(wb.SheetNames, ['00_Info', 'Listino', 'Dotazioni standard']);
});

test('buildWorkbook: foglio Dotazioni standard ha l\'header anche se vuoto (scelta di sempre-creare)', () => {
  const rows = [
    { codice: 'A', descrizione: 'Cono', prezzo: 65, pagina: '16', review_flag: '', sezione: 'EQUILIBRATRICI' }
  ];
  const meta = { pages_total: 1, rows_extracted: 1, rows_in_check: 0 };
  const wb = buildWorkbook({ rows, dotazioni: [], meta, sourcePdfName: 'test.pdf' });
  const dot = wb.Sheets['Dotazioni standard'];
  assert.equal(dot.A1.v, 'Codice');
  assert.equal(dot.B1.v, 'Descrizione');
  assert.equal(dot.C1.v, 'Prezzo_EUR');
  assert.equal(dot.D1.v, 'Pagina');
  assert.equal(dot.E1.v, 'Review_Flag');
  assert.equal(dot.F1.v, 'Sezione');
  assert.equal(dot.A2, undefined); // nessuna data row
});

test('buildWorkbook: i codici-didascalia vanno nel foglio Dotazioni standard, non nel Listino', () => {
  const rows = [
    { codice: 'A1', descrizione: 'Cono normale', prezzo: 65, pagina: '16', review_flag: '', sezione: 'EQUILIBRATRICI' }
  ];
  const dotazioni = [
    { codice: '21100076', descrizione: '', prezzo: null, pagina: '8, 9, 10', review_flag: 'CODICE_DIDASCALIA', sezione: 'MODELLO-X > ACCESSORI STANDARD' }
  ];
  const meta = { pages_total: 16, rows_extracted: 1, dotazioni_count: 1, rows_in_check: 0 };
  const wb = buildWorkbook({ rows, dotazioni, meta, sourcePdfName: 'test.pdf' });
  // Listino: solo A1
  assert.equal(wb.Sheets['Listino'].A2.v, 'A1');
  assert.equal(wb.Sheets['Listino'].A3, undefined);
  // Dotazioni standard: solo la didascalia, con pagine e sezione preservate
  const dot = wb.Sheets['Dotazioni standard'];
  assert.equal(dot.A2.v, '21100076');
  assert.equal(dot.D2.v, '8, 9, 10');
  assert.equal(dot.E2.v, 'CODICE_DIDASCALIA');
  assert.equal(dot.F2.v, 'MODELLO-X > ACCESSORI STANDARD');
  assert.equal(dot.A3, undefined);
});

test('buildWorkbook: dotazioni omesso/non-array → foglio Dotazioni vuoto (difensivo)', () => {
  const rows = [{ codice: 'A', prezzo: 10, pagina: '1', sezione: 'X' }];
  const meta = { pages_total: 1, rows_extracted: 1, rows_in_check: 0 };
  const wb = buildWorkbook({ rows, meta, sourcePdfName: 'test.pdf' });
  assert.deepEqual(wb.SheetNames, ['00_Info', 'Listino', 'Dotazioni standard']);
  assert.equal(wb.Sheets['Dotazioni standard'].A2, undefined);
});

test('buildWorkbook: 00_Info include Versione_Parser, Versione app e il conteggio codici-didascalia', () => {
  const rows = [];
  const dotazioni = [{ codice: 'X', review_flag: 'CODICE_DIDASCALIA' }];
  const meta = { pages_total: 0, rows_extracted: 0, dotazioni_count: 1, rows_in_check: 0 };
  const wb = buildWorkbook({ rows, dotazioni, meta, sourcePdfName: 'test.pdf' });
  const info = wb.Sheets['00_Info'];
  let foundParser = false, foundApp = false, foundDidascalie = false;
  for (let i = 0; i < 20; i++) {
    const keyCell = info[XLSX.utils.encode_cell({ r: i, c: 0 })];
    const valCell = info[XLSX.utils.encode_cell({ r: i, c: 1 })];
    if (!keyCell) continue;
    if (keyCell.v === 'Versione_Parser') { assert.equal(valCell.v, '5.4.0'); foundParser = true; }
    if (keyCell.v === 'Versione app')    { assert.equal(valCell.v, '5.4.0'); foundApp = true; }
    if (keyCell.v === 'Codici-didascalia') { assert.equal(valCell.v, 1); foundDidascalie = true; }
  }
  assert.equal(foundParser, true, 'Versione_Parser deve essere presente in 00_Info');
  assert.equal(foundApp, true,    'Versione app deve essere presente in 00_Info');
  assert.equal(foundDidascalie, true, 'Il conteggio codici-didascalia deve essere in 00_Info');
});

test('buildWorkbook: Listino e Dotazioni standard hanno wch identici', () => {
  const rows = [{ codice: 'A1', prezzo: 65, sezione: 'X' }];
  const dotazioni = [{ codice: 'A2', prezzo: null, review_flag: 'CODICE_DIDASCALIA', sezione: 'X > ACCESSORI STANDARD' }];
  const meta = { pages_total: 1, rows_extracted: 1, dotazioni_count: 1, rows_in_check: 0 };
  const wb = buildWorkbook({ rows, dotazioni, meta, sourcePdfName: 'test.pdf' });
  assert.deepEqual(wb.Sheets['Listino']['!cols'], wb.Sheets['Dotazioni standard']['!cols']);
});

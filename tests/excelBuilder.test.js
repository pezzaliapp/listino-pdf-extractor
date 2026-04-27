import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { partitionRowsByAccessoriStandard, buildWorkbook } from '../src/excelBuilder.js';

// === M7 — Partitioning logic ===

test('partitionRowsByAccessoriStandard: prezzo null + sezione "ACCESSORI STANDARD" → Accessori_Standard', () => {
  const rows = [
    { codice: '20100204', descrizione: 'Accessorio in dotazione', prezzo: null, pagina: '24', review_flag: 'PREZZO_MANCANTE', sezione: 'EQUILIBRATRICI > ACCESSORI STANDARD' }
  ];
  const { listino, accessori } = partitionRowsByAccessoriStandard(rows);
  assert.equal(listino.length, 0);
  assert.equal(accessori.length, 1);
  assert.equal(accessori[0].codice, '20100204');
});

test('partitionRowsByAccessoriStandard: prezzo null + sezione "Touch MEC 2000S" → Listino (caso da rivedere)', () => {
  const rows = [
    { codice: '99999999', descrizione: 'Articolo isolato', prezzo: null, pagina: '50', review_flag: 'PREZZO_MANCANTE', sezione: 'EQUILIBRATRICI > Touch MEC 2000S' }
  ];
  const { listino, accessori } = partitionRowsByAccessoriStandard(rows);
  assert.equal(listino.length, 1);
  assert.equal(accessori.length, 0);
  assert.equal(listino[0].review_flag, 'PREZZO_MANCANTE');
});

test('partitionRowsByAccessoriStandard: prezzo valido + qualunque sezione → sempre Listino', () => {
  const rows = [
    { codice: 'A', descrizione: 'Cono', prezzo: 65, pagina: '16', review_flag: '', sezione: 'EQUILIBRATRICI > ACCESSORI STANDARD' },
    { codice: 'B', descrizione: 'Cono', prezzo: 65, pagina: '16', review_flag: '', sezione: 'EQUILIBRATRICI > Touch MEC 2000S' }
  ];
  const { listino, accessori } = partitionRowsByAccessoriStandard(rows);
  assert.equal(listino.length, 2);
  assert.equal(accessori.length, 0);
});

test('partitionRowsByAccessoriStandard: matcha anche OPTIONAL e OPTIONAL CONSIGLIATI', () => {
  const rows = [
    { codice: 'A', prezzo: null, sezione: 'EQUILIBRATRICI > OPTIONAL CONSIGLIATI' },
    { codice: 'B', prezzo: null, sezione: 'SMONTAGOMME > OPTIONAL' }
  ];
  const { listino, accessori } = partitionRowsByAccessoriStandard(rows);
  assert.equal(accessori.length, 2);
  assert.equal(listino.length, 0);
});

test('partitionRowsByAccessoriStandard: prezzo "" e undefined contano come null', () => {
  const rows = [
    { codice: 'A', prezzo: '',        sezione: 'X > ACCESSORI STANDARD' },
    { codice: 'B', prezzo: undefined, sezione: 'X > ACCESSORI STANDARD' }
  ];
  const { accessori } = partitionRowsByAccessoriStandard(rows);
  assert.equal(accessori.length, 2);
});

test('partitionRowsByAccessoriStandard: sezione vuota o senza marker → Listino', () => {
  const rows = [
    { codice: 'A', prezzo: null, sezione: '' },
    { codice: 'B', prezzo: null, sezione: undefined },
    { codice: 'C', prezzo: null, sezione: 'EQUILIBRATRICI' }
  ];
  const { listino, accessori } = partitionRowsByAccessoriStandard(rows);
  assert.equal(listino.length, 3);
  assert.equal(accessori.length, 0);
});

test('partitionRowsByAccessoriStandard: input vuoto/non-array → entrambi vuoti', () => {
  assert.deepEqual(partitionRowsByAccessoriStandard([]),    { listino: [], accessori: [] });
  assert.deepEqual(partitionRowsByAccessoriStandard(null),  { listino: [], accessori: [] });
  assert.deepEqual(partitionRowsByAccessoriStandard(undefined), { listino: [], accessori: [] });
});

// === M7 — Workbook structure ===

test('buildWorkbook: produce 3 fogli — 00_Info + Listino + Accessori_Standard', () => {
  const rows = [
    { codice: 'A', descrizione: 'Cono', prezzo: 65, pagina: '16', review_flag: '', sezione: 'EQUILIBRATRICI' }
  ];
  const meta = { pages_total: 1, rows_extracted: 1, rows_in_check: 0 };
  const wb = buildWorkbook({ rows, meta, sourcePdfName: 'test.pdf' });
  assert.deepEqual(wb.SheetNames, ['00_Info', 'Listino', 'Accessori_Standard']);
});

test('buildWorkbook: foglio Accessori_Standard ha l\'header anche se vuoto (scelta di sempre-creare)', () => {
  const rows = [
    { codice: 'A', descrizione: 'Cono', prezzo: 65, pagina: '16', review_flag: '', sezione: 'EQUILIBRATRICI' }
  ];
  const meta = { pages_total: 1, rows_extracted: 1, rows_in_check: 0 };
  const wb = buildWorkbook({ rows, meta, sourcePdfName: 'test.pdf' });
  const accessori = wb.Sheets['Accessori_Standard'];
  // Header in riga 1
  assert.equal(accessori.A1.v, 'Codice');
  assert.equal(accessori.B1.v, 'Descrizione');
  assert.equal(accessori.C1.v, 'Prezzo_EUR');
  assert.equal(accessori.D1.v, 'Pagina');
  assert.equal(accessori.E1.v, 'Review_Flag');
  assert.equal(accessori.F1.v, 'Sezione');
  // Nessuna data row
  assert.equal(accessori.A2, undefined);
});

test('buildWorkbook: split end-to-end — accessori vanno in Accessori_Standard, listino normale resta', () => {
  const rows = [
    { codice: 'A1', descrizione: 'Cono normale', prezzo: 65,   pagina: '16', review_flag: '',                sezione: 'EQUILIBRATRICI' },
    { codice: 'A2', descrizione: 'Accessorio incluso', prezzo: null, pagina: '24', review_flag: 'PREZZO_MANCANTE', sezione: 'EQUILIBRATRICI > ACCESSORI STANDARD' },
    { codice: 'A3', descrizione: 'Articolo da rivedere',  prezzo: null, pagina: '50', review_flag: 'PREZZO_MANCANTE', sezione: 'EQUILIBRATRICI > Touch MEC 2000S' }
  ];
  const meta = { pages_total: 50, rows_extracted: 3, rows_in_check: 2 };
  const wb = buildWorkbook({ rows, meta, sourcePdfName: 'test.pdf' });
  // Listino: A1 (prezzo valido) + A3 (prezzo mancante ma sezione non-accessori)
  assert.equal(wb.Sheets['Listino'].A2.v, 'A1');
  assert.equal(wb.Sheets['Listino'].A3.v, 'A3');
  assert.equal(wb.Sheets['Listino'].A4, undefined);
  // Accessori_Standard: solo A2
  assert.equal(wb.Sheets['Accessori_Standard'].A2.v, 'A2');
  assert.equal(wb.Sheets['Accessori_Standard'].A3, undefined);
});

test('buildWorkbook: 00_Info include Versione_Parser = 5.0.0', () => {
  const rows = [];
  const meta = { pages_total: 0, rows_extracted: 0, rows_in_check: 0 };
  const wb = buildWorkbook({ rows, meta, sourcePdfName: 'test.pdf' });
  const info = wb.Sheets['00_Info'];
  let foundParser = false;
  let foundApp = false;
  for (let i = 0; i < 20; i++) {
    const keyCell = info[XLSX.utils.encode_cell({ r: i, c: 0 })];
    const valCell = info[XLSX.utils.encode_cell({ r: i, c: 1 })];
    if (!keyCell) continue;
    if (keyCell.v === 'Versione_Parser') {
      assert.equal(valCell.v, '5.0.0');
      foundParser = true;
    }
    if (keyCell.v === 'Versione app') {
      assert.equal(valCell.v, '5.0.0');
      foundApp = true;
    }
  }
  assert.equal(foundParser, true, 'Versione_Parser deve essere presente in 00_Info');
  assert.equal(foundApp, true,    'Versione app deve essere presente in 00_Info');
});

test('buildWorkbook: foglio Listino e Accessori_Standard hanno wch identici', () => {
  const rows = [
    { codice: 'A1', prezzo: 65,   sezione: 'X' },
    { codice: 'A2', prezzo: null, sezione: 'X > ACCESSORI STANDARD' }
  ];
  const meta = { pages_total: 1, rows_extracted: 2, rows_in_check: 1 };
  const wb = buildWorkbook({ rows, meta, sourcePdfName: 'test.pdf' });
  assert.deepEqual(wb.Sheets['Listino']['!cols'], wb.Sheets['Accessori_Standard']['!cols']);
});

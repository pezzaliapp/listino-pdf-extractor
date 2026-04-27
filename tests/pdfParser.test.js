import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePriceString,
  isProductCode,
  groupItemsByLine,
  buildRowsFromLines,
  annotateOccurrences
} from '../src/pdfParser.js';

test('parsePriceString gestisce formato italiano', () => {
  assert.equal(parsePriceString('14.500'), 14500);
  assert.equal(parsePriceString('1.234,56'), 1234.56);
  assert.equal(parsePriceString('250'), 250);
  assert.equal(parsePriceString('non un prezzo'), null);
});

test('isProductCode riconosce codici 6-9 cifre', () => {
  assert.equal(isProductCode('3100103'), true);
  assert.equal(isProductCode('23100335'), true);
  assert.equal(isProductCode('123'), false);
  assert.equal(isProductCode('abc1234567'), false);
});

test('groupItemsByLine raggruppa per Y simile e ordina per X', () => {
  const items = [
    { str: 'B', transform: [10, 0, 0, 10, 50, 100] },
    { str: 'A', transform: [10, 0, 0, 10, 10, 101] },
    { str: 'C', transform: [10, 0, 0, 10, 30, 80] }
  ];
  const lines = groupItemsByLine(items, 2);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].items.map(i => i.str), ['A', 'B']);
  assert.deepEqual(lines[1].items.map(i => i.str), ['C']);
});

test('buildRowsFromLines riconosce un prodotto e usa heading di Famiglia', () => {
  const lines = [
    {
      y: 200,
      items: [
        { str: 'EQUILIBRATRICI', x: 10, size: 14 }
      ]
    },
    {
      y: 180,
      items: [
        { str: '3100103', x: 10, size: 9 },
        { str: 'Equilibratrice', x: 60, size: 9 },
        { str: 'auto', x: 110, size: 9 },
        { str: 'top', x: 140, size: 9 },
        { str: '1.499', x: 400, size: 9 }
      ]
    }
  ];
  const ctx = { famiglia: '', categoria: '' };
  const rows = buildRowsFromLines(lines, 5, ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Codice, '3100103');
  assert.equal(rows[0].Famiglia, 'Equilibratrici');
  assert.equal(rows[0].Prezzo_EUR, 1499);
  assert.equal(rows[0].Pagine, 5);
  assert.equal(rows[0].Review_Flag, '');
});

test('annotateOccurrences conta i duplicati per codice', () => {
  const rows = [
    { Codice: '111', Descrizione: 'a', Prezzo_EUR: 100 },
    { Codice: '222', Descrizione: 'b', Prezzo_EUR: 200 },
    { Codice: '111', Descrizione: 'a', Prezzo_EUR: 100 }
  ];
  annotateOccurrences(rows);
  assert.equal(rows[0].Occorrenze, 2);
  assert.equal(rows[1].Occorrenze, 1);
  assert.equal(rows[2].Occorrenze, 2);
});

test('Review_Flag CHECK quando descrizione è troppo corta', () => {
  const lines = [
    {
      y: 100,
      items: [
        { str: '1234567', x: 10, size: 9 },
        { str: 'X', x: 60, size: 9 },
        { str: '500', x: 200, size: 9 }
      ]
    }
  ];
  const ctx = { famiglia: 'Test', categoria: '' };
  const rows = buildRowsFromLines(lines, 1, ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Review_Flag, 'CHECK');
});

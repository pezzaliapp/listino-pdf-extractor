import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePriceString, isProductCode, hasProductCode, isCompleteProductRow } from '../src/pdfParser.js';

test('parsePriceString', () => {
  assert.equal(parsePriceString('3.940,00'), 3940);
  assert.equal(parsePriceString('880,00'), 880);
  assert.equal(parsePriceString('1.500'), 1500);
  assert.equal(parsePriceString('21.100.057'), null);  // codice travestito
  assert.equal(parsePriceString('21100076'), null);    // codice
  assert.equal(parsePriceString(''), null);
  assert.equal(parsePriceString(null), null);
});

test('isProductCode', () => {
  assert.equal(isProductCode('21100076'), true);
  assert.equal(isProductCode('00100208'), true);
  assert.equal(isProductCode('123'), false);
  assert.equal(isProductCode('3.940,00'), false);
});

test('hasProductCode vs isCompleteProductRow', () => {
  // Riga "lunga": codice + descr senza prezzo (dovrà essere unita con la successiva)
  const incomplete = ['21100375', 'KIT', 'SMART', 'APP:', 'Include', 'traffico', 'dati', 'per', '36', 'mesi'];
  assert.equal(hasProductCode(incomplete), true);
  assert.equal(isCompleteProductRow(incomplete), false);

  // Riga di continuazione: solo testo e prezzo, no codice
  const tail = ['macchine', '880,00'];
  assert.equal(hasProductCode(tail), false);
  assert.equal(isCompleteProductRow(tail), false);

  // Riga completa
  const full = ['00100208', 'PUMA', 'CE', '1ph', '230V', '50-60Hz', '3.940,00'];
  assert.equal(hasProductCode(full), true);
  assert.equal(isCompleteProductRow(full), true);
});

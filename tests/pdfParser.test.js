import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePriceString, isProductCode, isProductRow } from '../src/pdfParser.js';

test('parsePriceString accetta formato italiano', () => {
  assert.equal(parsePriceString('3.940,00'), 3940);
  assert.equal(parsePriceString('880,00'), 880);
  assert.equal(parsePriceString('1.500,00'), 1500);
});

test('parsePriceString rifiuta codici travestiti', () => {
  assert.equal(parsePriceString('21.100.057'), null);
  assert.equal(parsePriceString('21.100.399'), null);
  assert.equal(parsePriceString('21100076'), null);
});

test('isProductCode', () => {
  assert.equal(isProductCode('21100076'), true);
  assert.equal(isProductCode('123'), false);
  assert.equal(isProductCode('3.940,00'), false);
});

test('isProductRow richiede codice + prezzo valido', () => {
  assert.equal(isProductRow(['21100076','Kit CONI','3.940,00']), true);
  assert.equal(isProductRow(['21100076','21100240','21100057']), false);
  assert.equal(isProductRow(['Kit CONI']), false);
});

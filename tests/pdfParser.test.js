import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePriceString, isProductCode, hasProductCode, isCompleteProductRow, computeYBucket, computeColumnBands, filterVerticalHeaders } from '../src/pdfParser.js';

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

test('computeYBucket: ritorna 0.4 * moda dei font del corpo', () => {
  // moda = 9 (4 occorrenze) → 9 * 0.4 = 3.6
  assert.equal(computeYBucket([9, 9, 9, 8, 8, 14, 5, 9]), 3.6);
});

test('computeYBucket: ignora header (>12pt) e icone (<6pt)', () => {
  // i 16pt e 4pt vengono scartati, resta moda=9 → 3.6
  assert.equal(computeYBucket([16, 16, 9, 9, 9, 4]), 3.6);
});

test('computeYBucket: fallback a 2 quando nessun font del corpo', () => {
  assert.equal(computeYBucket([]), 2);
  assert.equal(computeYBucket([14, 18, 22]), 2);
  assert.equal(computeYBucket(null), 2);
});

test('computeColumnBands: deriva le 5 fasce dalla moda di codici e prezzi', () => {
  const items = [
    { str: '21100375', x0: 100, x1: 130 },
    { str: '00100208', x0: 100, x1: 130 },
    { str: '21100357', x0: 100, x1: 130 },
    { str: 'KIT SMART APP', x0: 165, x1: 240 },
    { str: '880,00', x0: 480, x1: 510 },
    { str: '3.940,00', x0: 480, x1: 510 },
    { str: '65,00', x0: 480, x1: 510 }
  ];
  const bands = computeColumnBands(items, 600);
  assert.deepEqual(bands.code,          [95, 160]);   // 100-5, 100+60
  assert.deepEqual(bands.descrizione,   [160, 470]);  // 100+60, 480-10
  assert.deepEqual(bands.prezzo,        [470, 520]);  // 480-10, 510+10
  assert.deepEqual(bands.compatibilita, [520, 600]);  // 510+10, pageWidth
  assert.deepEqual(bands.noteLaterali,  [0, 95]);     // 0, 100-5
  assert.equal(bands._anchors.xCodeLeft, 100);
  assert.equal(bands._anchors.xPriceLeft, 480);
  assert.equal(bands._anchors.xPriceRight, 510);
});

test('computeColumnBands: null quando mancano prezzi', () => {
  const items = [{ str: '21100375', x0: 100, x1: 130 }];
  assert.equal(computeColumnBands(items), null);
});

test('computeColumnBands: null quando mancano codici 8 cifre', () => {
  const items = [{ str: '880,00', x0: 480, x1: 510 }];
  assert.equal(computeColumnBands(items), null);
});

test('computeColumnBands: null su input vuoto o invalido', () => {
  assert.equal(computeColumnBands([]), null);
  assert.equal(computeColumnBands(null), null);
  assert.equal(computeColumnBands(undefined), null);
});

test('computeColumnBands: prezzi con simbolo € e arrotondamento posizioni', () => {
  // x0 dei prezzi: 479.6, 480.4 → arrotondati 480 due volte → modale 480
  const items = [
    { str: '12345678', x0: 100, x1: 130 },
    { str: '12345679', x0: 100, x1: 130 },
    { str: '880,00 €', x0: 479.6, x1: 510.3 },
    { str: '65,00 €',  x0: 480.4, x1: 510.1 }
  ];
  const bands = computeColumnBands(items, 600);
  assert.equal(bands._anchors.xPriceLeft, 480);
  assert.equal(bands._anchors.xPriceRight, 510);
});

test('filterVerticalHeaders: rimuove caratteri singoli sopra il primo anchor', () => {
  // firstAnchorTop=200 (display-top: piccolo = alto). I 3 char a top=100,110,120
  // sono SOPRA il primo anchor e brevi → header verticale, da rimuovere.
  const items = [
    { str: 'T', x0: 380, x1: 388, top: 100 },
    { str: 'O', x0: 380, x1: 388, top: 110 },
    { str: 'U', x0: 380, x1: 388, top: 120 },
    { str: '21100070', x0: 100, x1: 140, top: 215 },
    { str: 'Cono per cappellotto', x0: 165, x1: 280, top: 215 }
  ];
  const out = filterVerticalHeaders(items, 200);
  assert.equal(out.length, 2);
  assert.equal(out[0].str, '21100070');
  assert.equal(out[1].str, 'Cono per cappellotto');
});

test('filterVerticalHeaders: tiene caratteri brevi se sotto il primo anchor', () => {
  // 'S' a top=220 è sotto al primo anchor (200) → non è header verticale
  const items = [
    { str: 'S', x0: 380, x1: 386, top: 220 },
    { str: '21100070', x0: 100, x1: 140, top: 215 }
  ];
  const out = filterVerticalHeaders(items, 200);
  assert.equal(out.length, 2);
});

test('filterVerticalHeaders: tiene token con length >= 3', () => {
  const items = [
    { str: 'TOUCH', x0: 380, x1: 415, top: 100 },
    { str: '21100070', x0: 100, x1: 140, top: 215 }
  ];
  const out = filterVerticalHeaders(items, 200);
  assert.equal(out.length, 2);
});

test('filterVerticalHeaders: tiene se larghezza >= 12pt (lettera larga / parola)', () => {
  const items = [
    { str: 'T', x0: 380, x1: 395, top: 100 }, // width=15 → non singola stretta
    { str: '21100070', x0: 100, x1: 140, top: 215 }
  ];
  const out = filterVerticalHeaders(items, 200);
  assert.equal(out.length, 2);
});

test('filterVerticalHeaders: senza primo anchor, ritorna items invariati', () => {
  const items = [
    { str: 'T', x0: 380, x1: 388, top: 100 },
    { str: 'O', x0: 380, x1: 388, top: 110 }
  ];
  assert.equal(filterVerticalHeaders(items, undefined).length, 2);
  assert.equal(filterVerticalHeaders(items, NaN).length, 2);
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

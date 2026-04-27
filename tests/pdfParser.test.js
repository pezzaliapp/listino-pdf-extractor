import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePriceString, isProductCode, hasProductCode, isCompleteProductRow,
  computeYBucket, computeColumnBands,
  filterVerticalHeaders, filterSideNotes, SIDE_NOTE_PATTERNS,
  normalizePdfjsItem, extractAnchors, buildBandsFromAnchors,
  collectBandItems, classifyXBand, emitRowFromBand
} from '../src/pdfParser.js';

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

test('SIDE_NOTE_PATTERNS riconoscono i marker quantità/dimensione documentati', () => {
  const matches = (s) => SIDE_NOTE_PATTERNS.some(re => re.test(s));
  assert.equal(matches('x4'),   true);
  assert.equal(matches('x12'),  true);
  assert.equal(matches('x24'),  true);
  assert.equal(matches('(2pcs)'),  true);
  assert.equal(matches('(15pcs)'), true);
  assert.equal(matches('Ømm58'),   true);
  // non-match
  assert.equal(matches('xyz'),  false);
  assert.equal(matches('Cono'), false);
  assert.equal(matches('880,00'), false);
});

test('filterSideNotes: rimuove "x12" dentro la fascia note laterali', () => {
  // FASCIA_NOTE_LATERALI = [0, 95]
  const items = [
    { str: 'x12', x0: 40,  x1: 60 },           // dentro band, breve, pattern → REMOVE
    { str: 'x4',  x0: 50,  x1: 65 },           // dentro band, breve, pattern → REMOVE
    { str: '21100070', x0: 100, x1: 140 },     // fuori band → keep
    { str: 'Cono Ø42', x0: 165, x1: 240 }      // fuori band → keep
  ];
  const out = filterSideNotes(items, [0, 95]);
  assert.equal(out.length, 2);
  assert.equal(out[0].str, '21100070');
  assert.equal(out[1].str, 'Cono Ø42');
});

test('filterSideNotes: tiene marker fuori dalla fascia', () => {
  // x12 a x0=200 è ben dentro la descrizione (NON nelle note laterali)
  const items = [
    { str: 'x12', x0: 200, x1: 220 },
    { str: '21100070', x0: 100, x1: 140 }
  ];
  const out = filterSideNotes(items, [0, 95]);
  assert.equal(out.length, 2);
});

test('filterSideNotes: tiene token in band ma non matcha pattern', () => {
  // "ABC" è in band e breve ma non è un pattern noto → keep
  const items = [
    { str: 'ABC', x0: 50, x1: 70 },
    { str: '21100070', x0: 100, x1: 140 }
  ];
  const out = filterSideNotes(items, [0, 95]);
  assert.equal(out.length, 2);
});

test('filterSideNotes: tiene token in band se length > 6 (soglia conservativa)', () => {
  // "(2 pcs)" = 7 char → non filtrato anche se matcha il regex \(\d+\s*pcs?\)
  const items = [
    { str: '(2 pcs)', x0: 50, x1: 80 }
  ];
  const out = filterSideNotes(items, [0, 95]);
  assert.equal(out.length, 1);
});

test('filterSideNotes: senza fascia valida ritorna items invariati', () => {
  const items = [{ str: 'x12', x0: 40, x1: 60 }];
  assert.equal(filterSideNotes(items, null).length, 1);
  assert.equal(filterSideNotes(items, [NaN, 95]).length, 1);
  assert.equal(filterSideNotes(items, [0]).length, 1);
});

// === M1 — anchor-first helpers ===

test('normalizePdfjsItem: estrae x0/x1/top/bottom/fontSize correttamente', () => {
  const raw = {
    str: 'foo',
    transform: [9, 0, 0, 9, 100, 700],   // fontSize=9, x0=100, yBaseline=700
    width: 30,
    height: 9
  };
  const norm = normalizePdfjsItem(raw, 800);
  assert.equal(norm.str, 'foo');
  assert.equal(norm.x0, 100);
  assert.equal(norm.x1, 130);
  assert.equal(norm.fontSize, 9);
  // pageHeight=800, top = 800-(700+9) = 91, bottom = 800-700 = 100
  assert.equal(norm.top, 91);
  assert.equal(norm.bottom, 100);
});

test('normalizePdfjsItem: ritorna null su input invalido', () => {
  assert.equal(normalizePdfjsItem(null, 800), null);
  assert.equal(normalizePdfjsItem({ str: 'foo' }, 800), null);
  assert.equal(normalizePdfjsItem({ str: 'foo', transform: [1, 2, 3] }, 800), null);
});

test('extractAnchors: filtra solo codici a 8 cifre, ordina per top crescente', () => {
  const items = [
    { str: '21100070', top: 215 },
    { str: '00100208', top: 100 },
    { str: 'Cono',     top: 110 },
    { str: '12345',    top: 220 }, // troppo corto
    { str: '21100375', top: 180 },
    { str: '123456789',top: 300 }  // 9 cifre, no
  ];
  const out = extractAnchors(items);
  assert.equal(out.length, 3);
  assert.equal(out[0].codice, '00100208');
  assert.equal(out[1].codice, '21100375');
  assert.equal(out[2].codice, '21100070');
});

test('extractAnchors: ignora item senza top o non-string', () => {
  const items = [
    { str: '21100070' },                 // no top
    { str: '21100071', top: NaN },
    { str: 12345678, top: 100 },         // not string
    { str: '00100208', top: 100 }
  ];
  const out = extractAnchors(items);
  assert.equal(out.length, 1);
  assert.equal(out[0].codice, '00100208');
});

test('buildBandsFromAnchors: 1 anchor → banda piena pagina', () => {
  const a = [{ codice: 'X', top: 200, item: {} }];
  const bands = buildBandsFromAnchors(a, 0, 1000);
  assert.equal(bands.length, 1);
  assert.equal(bands[0].yTop, 0);
  assert.equal(bands[0].yBottom, 1000);
});

test('buildBandsFromAnchors: 3 anchor → bordi a midpoint', () => {
  const a = [
    { codice: 'A', top: 100, item: {} },
    { codice: 'B', top: 200, item: {} },
    { codice: 'C', top: 350, item: {} }
  ];
  const bands = buildBandsFromAnchors(a, 0, 1000);
  assert.equal(bands.length, 3);
  assert.equal(bands[0].yTop, 0);
  assert.equal(bands[0].yBottom, 150);
  assert.equal(bands[1].yTop, 150);
  assert.equal(bands[1].yBottom, 275);
  assert.equal(bands[2].yTop, 275);
  assert.equal(bands[2].yBottom, 1000);
});

test('buildBandsFromAnchors: input vuoto → []', () => {
  assert.deepEqual(buildBandsFromAnchors([]), []);
  assert.deepEqual(buildBandsFromAnchors(null), []);
});

test('collectBandItems: include solo top in [yTop, yBottom)', () => {
  const items = [{ top: 100 }, { top: 150 }, { top: 200 }, { top: 250 }];
  const band = { yTop: 150, yBottom: 250 };
  const out = collectBandItems(items, band);
  assert.equal(out.length, 2);
  assert.equal(out[0].top, 150);
  assert.equal(out[1].top, 200);
});

test('classifyXBand: ritorna la fascia giusta o null', () => {
  const cols = {
    code: [95, 160], descrizione: [160, 470], prezzo: [470, 520],
    compatibilita: [520, 600], noteLaterali: [0, 95]
  };
  assert.equal(classifyXBand({ x0: 100 }, cols), 'code');
  assert.equal(classifyXBand({ x0: 200 }, cols), 'descrizione');
  assert.equal(classifyXBand({ x0: 480 }, cols), 'prezzo');
  assert.equal(classifyXBand({ x0: 550 }, cols), 'compatibilita');
  assert.equal(classifyXBand({ x0: 50 },  cols), 'noteLaterali');
  assert.equal(classifyXBand({ x0: 700 }, cols), null);
  assert.equal(classifyXBand({ x0: 100 }, null), null);
});

test('emitRowFromBand: caso base → riga con descrizione e prezzo', () => {
  const cols = {
    code: [95, 160], descrizione: [160, 470], prezzo: [470, 520],
    compatibilita: [520, 600], noteLaterali: [0, 95]
  };
  const codeItem = { str: '21100070', x0: 100, top: 215 };
  const items = [
    codeItem,
    { str: 'Cono per cappellotto', x0: 165, top: 215 },
    { str: '65,00',                x0: 480, top: 215 }
  ];
  const anchor = { codice: '21100070', top: 215, item: codeItem };
  const row = emitRowFromBand(anchor, items, cols, 8);
  assert.equal(row.codice, '21100070');
  assert.equal(row.descrizione, 'Cono per cappellotto');
  assert.equal(row.prezzo, 65);
  assert.equal(row.pagina, '8');
  assert.equal(row.review_flag, '');
});

test('emitRowFromBand: descrizione su 2 linee y diverse → concatenata in ordine top', () => {
  // Caso §P3: descrizione che inizia sopra il codice e continua sotto
  const cols = {
    code: [95, 160], descrizione: [160, 470], prezzo: [470, 520],
    compatibilita: [520, 600], noteLaterali: [0, 95]
  };
  const codeItem = { str: '21100357', x0: 100, top: 420 };
  const items = [
    { str: 'Kit di 3 protezioni in plastica', x0: 165, top: 414 },
    codeItem,
    { str: '65,00',           x0: 480, top: 420 },
    { str: 'per cappellotto', x0: 165, top: 426 }
  ];
  const anchor = { codice: '21100357', top: 420, item: codeItem };
  const row = emitRowFromBand(anchor, items, cols, 16);
  assert.match(row.descrizione, /^Kit di 3 protezioni in plastica per cappellotto$/);
  assert.equal(row.prezzo, 65);
  assert.equal(row.review_flag, '');
});

test('emitRowFromBand: nessun prezzo → PREZZO_MANCANTE', () => {
  const cols = {
    code: [95, 160], descrizione: [160, 470], prezzo: [470, 520],
    compatibilita: [520, 600], noteLaterali: [0, 95]
  };
  const codeItem = { str: '20100204', x0: 100, top: 300 };
  const items = [codeItem, { str: 'Accessorio standard', x0: 165, top: 300 }];
  const anchor = { codice: '20100204', top: 300, item: codeItem };
  const row = emitRowFromBand(anchor, items, cols, 24);
  assert.equal(row.prezzo, null);
  assert.equal(row.review_flag, 'PREZZO_MANCANTE');
  assert.equal(row.descrizione, 'Accessorio standard');
});

test('emitRowFromBand: due prezzi distinti nella banda → MULTI_PRICE', () => {
  const cols = {
    code: [95, 160], descrizione: [160, 470], prezzo: [470, 520],
    compatibilita: [520, 600], noteLaterali: [0, 95]
  };
  const codeItem = { str: '21100070', x0: 100, top: 215 };
  const items = [
    codeItem,
    { str: 'Cono',  x0: 165, top: 215 },
    { str: '65,00', x0: 480, top: 215 },
    { str: '70,00', x0: 480, top: 220 }
  ];
  const anchor = { codice: '21100070', top: 215, item: codeItem };
  const row = emitRowFromBand(anchor, items, cols, 8);
  assert.equal(row.review_flag, 'MULTI_PRICE');
});

test('emitRowFromBand: senza columnBands → fallback (parsing diretto)', () => {
  const codeItem = { str: '21100070', x0: 100, top: 215 };
  const items = [
    codeItem,
    { str: 'Cono',  x0: 165, top: 215 },
    { str: '65,00', x0: 480, top: 215 }
  ];
  const anchor = { codice: '21100070', top: 215, item: codeItem };
  const row = emitRowFromBand(anchor, items, null, 8);
  assert.equal(row.descrizione, 'Cono');
  assert.equal(row.prezzo, 65);
});

test('emitRowFromBand: scarta item nelle fasce compatibilita/noteLaterali', () => {
  const cols = {
    code: [95, 160], descrizione: [160, 470], prezzo: [470, 520],
    compatibilita: [520, 600], noteLaterali: [0, 95]
  };
  const codeItem = { str: '21100070', x0: 100, top: 215 };
  const items = [
    codeItem,
    { str: 'Cono',  x0: 165, top: 215 },
    { str: 'S',     x0: 540, top: 215 }, // compatibilita → scarta
    { str: 'x12',   x0: 50,  top: 215 }, // noteLaterali → scarta
    { str: '65,00', x0: 480, top: 215 }
  ];
  const anchor = { codice: '21100070', top: 215, item: codeItem };
  const row = emitRowFromBand(anchor, items, cols, 8);
  assert.equal(row.descrizione, 'Cono');
  assert.equal(row.prezzo, 65);
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

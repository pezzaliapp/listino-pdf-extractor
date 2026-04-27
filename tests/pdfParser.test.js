import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePriceString, isProductCode, hasProductCode, isCompleteProductRow,
  computeYBucket, computeColumnBands,
  filterVerticalHeaders, filterSideNotes, SIDE_NOTE_PATTERNS,
  normalizePdfjsItem, extractAnchors, buildBandsFromAnchors,
  collectBandItems, classifyXBand, emitRowFromBand,
  stripIconText, ICON_STRINGS,
  mergeMultiCodeRows,
  detectPageTitle, findSectionMarkers, assignSectionToRow
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

// === M4 — icon text filter ===

test('ICON_STRINGS contiene le icone documentate dalla SPEC', () => {
  // verifica solo alcuni rappresentativi (la set completa è nel sorgente)
  for (const s of ['AUTO', 'LASER', 'MOBILE SERVICE', 'NLS', 'B', 'P', 'L', 'A', 'C', 'MI']) {
    assert.equal(ICON_STRINGS.has(s), true, `manca icona "${s}"`);
  }
});

test('stripIconText: nominale — rimuove "AUTO" se arriva come 4 char singoli', () => {
  // Caso §P4: AUTO renderizzato come 4 char singoli sotto la descrizione.
  const items = [
    { str: 'MEC',   x0: 165, x1: 195, top: 215 },
    { str: 'A',     x0: 200, x1: 207, top: 215 },
    { str: 'U',     x0: 207, x1: 214, top: 215 },
    { str: 'T',     x0: 214, x1: 220, top: 215 },
    { str: 'O',     x0: 220, x1: 227, top: 215 },
    { str: 'TRUCK', x0: 235, x1: 270, top: 215 }
  ];
  const out = stripIconText(items);
  // Run di 4 char singoli che spelleranno "AUTO" → tutti rimossi (fase 2)
  assert.equal(out.length, 2);
  assert.equal(out[0].str, 'MEC');
  assert.equal(out[1].str, 'TRUCK');
});

test('stripIconText: ambiguo — rimuove "B" isolato (length=1, width<20, in ICON_STRINGS)', () => {
  const items = [
    { str: 'B',    x0: 200, x1: 210, top: 215 },  // width=10 < 20 → fase 1: REMOVE
    { str: 'Cono', x0: 165, x1: 195, top: 215 }
  ];
  const out = stripIconText(items);
  assert.equal(out.length, 1);
  assert.equal(out[0].str, 'Cono');
});

test('stripIconText: ambiguo — tiene "B" dentro "BMW" (str non in ICON_STRINGS)', () => {
  const items = [
    { str: 'BMW',  x0: 200, x1: 220, top: 215 },  // length=3 ma 'BMW' ∉ ICON_STRINGS
    { str: 'Cono', x0: 165, x1: 195, top: 215 }
  ];
  const out = stripIconText(items);
  assert.equal(out.length, 2);
});

test('stripIconText: tiene "B" largo (width >= 20pt) — non lo considera icona', () => {
  // Lettera "L" larga, e.g. usata in un header tipografico → width=22 ≥ 20 → KEEP
  const items = [
    { str: 'L',    x0: 200, x1: 222, top: 215 },
    { str: 'Cono', x0: 165, x1: 195, top: 215 }
  ];
  const out = stripIconText(items);
  assert.equal(out.length, 2);
});

test('stripIconText: spezzato su 2 y vicine (single-char run) — rimuove "MOBILE SERVICE"', () => {
  // 13 char singoli che, in ordine top↑/x0↑, spellano "MOBILESERVICE".
  // La fase 2 trova il match contro l'icona "MOBILE SERVICE" (spazio rimosso).
  // NB: NON è il vero caso mirror-via-PDF-transform di §P4 (vedi LIMITE NOTO
  // su stripIconText) — qui i char arrivano in ordine corretto su due y vicine.
  const items = [
    { str: 'Sistema', x0: 165, x1: 200, top: 699 },
    { str: 'M', x0: 330, x1: 332, top: 699 },
    { str: 'O', x0: 333, x1: 335, top: 699 },
    { str: 'B', x0: 336, x1: 338, top: 699 },
    { str: 'I', x0: 339, x1: 341, top: 699 },
    { str: 'L', x0: 342, x1: 344, top: 699 },
    { str: 'E', x0: 345, x1: 347, top: 699 },
    { str: 'S', x0: 330, x1: 332, top: 702 },
    { str: 'E', x0: 333, x1: 335, top: 702 },
    { str: 'R', x0: 336, x1: 338, top: 702 },
    { str: 'V', x0: 339, x1: 341, top: 702 },
    { str: 'I', x0: 342, x1: 344, top: 702 },
    { str: 'C', x0: 345, x1: 347, top: 702 },
    { str: 'E', x0: 348, x1: 350, top: 702 }
  ];
  const out = stripIconText(items);
  assert.equal(out.length, 1);
  assert.equal(out[0].str, 'Sistema');
});

test('stripIconText: run di 2 char singoli non triggera fase 2 (soglia minima = 3)', () => {
  // 2 char singoli "G","T" che spellerebbero icona "GT" (length=2)
  // Ma la fase 2 considera solo icone length ≥ 3 e run di ≥ 3 char → niente match
  const items = [
    { str: 'Cono', x0: 165, x1: 195, top: 215 },
    { str: 'G', x0: 200, x1: 207, top: 215 },
    { str: 'T', x0: 207, x1: 214, top: 215 }
  ];
  const out = stripIconText(items);
  // Fase 1: 'G' non è in ICON_STRINGS → keep. 'T' non è in ICON_STRINGS → keep.
  assert.equal(out.length, 3);
});

test('stripIconText: input vuoto/non-array → []', () => {
  assert.deepEqual(stripIconText([]), []);
  assert.deepEqual(stripIconText(null), []);
  assert.deepEqual(stripIconText(undefined), []);
});

test('emitRowFromBand: cabla M4 — descrizione finale non contiene "AUTO" residuo', () => {
  const cols = {
    code: [95, 160], descrizione: [160, 470], prezzo: [470, 520],
    compatibilita: [520, 600], noteLaterali: [0, 95]
  };
  const codeItem = { str: '01200115', x0: 100, x1: 140, top: 627 };
  const items = [
    codeItem,
    { str: 'MEC',   x0: 165, x1: 195, top: 630 },
    { str: '200A',  x0: 200, x1: 230, top: 630 },
    { str: 'TRUCK', x0: 235, x1: 270, top: 630 },
    // icona AUTO renderizzata come 4 char singoli su y leggermente diversa
    { str: 'A',     x0: 200, x1: 207, top: 633 },
    { str: 'U',     x0: 207, x1: 214, top: 633 },
    { str: 'T',     x0: 214, x1: 220, top: 633 },
    { str: 'O',     x0: 220, x1: 227, top: 633 },
    { str: '10.500,00', x0: 480, x1: 510, top: 627 }
  ];
  const anchor = { codice: '01200115', top: 627, item: codeItem };
  const row = emitRowFromBand(anchor, items, cols, 22);
  assert.equal(row.codice, '01200115');
  assert.match(row.descrizione, /^MEC 200A TRUCK$/);
  assert.equal(row.prezzo, 10500);
  assert.equal(row.review_flag, '');
});

// === M5 — multi-code merge ===

test('mergeMultiCodeRows: caso classico §P5 — prev desc+prezzo, next vuoto, dy<35 → merge', () => {
  // Pag 36 PDF Cormach: 20100202 (y=222) e 20100326 (y=250 dopo aggregazione
  // di banda) condividono "Protezioni torretta" e prezzo 150.
  const rows = [
    { codice: '20100202', descrizione: 'Protezioni torretta. Set di 15 pezzi', prezzo: 150,  pagina: '36', review_flag: '',                  yAnchor: 222 },
    { codice: '20100326', descrizione: '',                                       prezzo: null, pagina: '36', review_flag: 'PREZZO_MANCANTE',   yAnchor: 250 }
  ];
  const out = mergeMultiCodeRows(rows);
  assert.equal(out.length, 2);
  assert.equal(out[0].review_flag, '');                              // primo invariato
  assert.equal(out[1].descrizione, 'Protezioni torretta. Set di 15 pezzi');
  assert.equal(out[1].prezzo, 150);
  assert.equal(out[1].review_flag, 'MERGED_FROM_PREV');
});

test('mergeMultiCodeRows: NON merge se r_{i+1} ha descrizione propria (caso pag 54)', () => {
  // 20100112 e 20100362: stessa descrizione "Kit radiocomando" ma prezzi diversi
  // (3.100 / 5.800). Entrambi hanno descrizione + prezzo. dy<35 ma il check
  // next.descrizione non-vuota blocca il merge → due righe distinte invariate.
  const rows = [
    { codice: '20100112', descrizione: 'Kit radiocomando', prezzo: 3100, pagina: '54', review_flag: '', yAnchor: 953 },
    { codice: '20100362', descrizione: 'Kit radiocomando', prezzo: 5800, pagina: '54', review_flag: '', yAnchor: 980 }
  ];
  const out = mergeMultiCodeRows(rows);
  assert.equal(out.length, 2);
  assert.equal(out[0].descrizione, 'Kit radiocomando');
  assert.equal(out[0].prezzo, 3100);
  assert.equal(out[1].descrizione, 'Kit radiocomando');
  assert.equal(out[1].prezzo, 5800);
  assert.equal(out[1].review_flag, '');                              // NON 'MERGED_FROM_PREV'
});

test('mergeMultiCodeRows: NON merge se r_{i+1} ha prezzo proprio', () => {
  const rows = [
    { codice: 'A', descrizione: 'Desc A', prezzo: 100, pagina: '1', review_flag: '', yAnchor: 200 },
    { codice: 'B', descrizione: '',       prezzo: 200, pagina: '1', review_flag: '', yAnchor: 220 }
  ];
  const out = mergeMultiCodeRows(rows);
  assert.equal(out[1].descrizione, '');
  assert.equal(out[1].prezzo, 200);
  assert.equal(out[1].review_flag, '');
});

test('mergeMultiCodeRows: NON merge se r_i non ha prezzo', () => {
  const rows = [
    { codice: 'A', descrizione: 'Desc A', prezzo: null, pagina: '1', review_flag: 'PREZZO_MANCANTE', yAnchor: 200 },
    { codice: 'B', descrizione: '',       prezzo: null, pagina: '1', review_flag: 'PREZZO_MANCANTE', yAnchor: 220 }
  ];
  const out = mergeMultiCodeRows(rows);
  assert.equal(out[1].descrizione, '');
  assert.equal(out[1].review_flag, 'PREZZO_MANCANTE');
});

test('mergeMultiCodeRows: NON merge se r_i non ha descrizione', () => {
  const rows = [
    { codice: 'A', descrizione: '', prezzo: 100,  pagina: '1', review_flag: '', yAnchor: 200 },
    { codice: 'B', descrizione: '', prezzo: null, pagina: '1', review_flag: 'PREZZO_MANCANTE', yAnchor: 220 }
  ];
  const out = mergeMultiCodeRows(rows);
  assert.equal(out[1].descrizione, '');
  assert.equal(out[1].review_flag, 'PREZZO_MANCANTE');
});

test('mergeMultiCodeRows: NON merge se |dy| >= 35 (righe troppo distanti)', () => {
  const rows = [
    { codice: 'A', descrizione: 'Desc A', prezzo: 100,  pagina: '1', review_flag: '',                  yAnchor: 200 },
    { codice: 'B', descrizione: '',       prezzo: null, pagina: '1', review_flag: 'PREZZO_MANCANTE',   yAnchor: 240 }  // dy=40
  ];
  const out = mergeMultiCodeRows(rows);
  assert.equal(out[1].descrizione, '');
  assert.equal(out[1].review_flag, 'PREZZO_MANCANTE');
});

test('mergeMultiCodeRows: input vuoto/non-array → []', () => {
  assert.deepEqual(mergeMultiCodeRows([]), []);
  assert.deepEqual(mergeMultiCodeRows(null), []);
  assert.deepEqual(mergeMultiCodeRows(undefined), []);
});

test('mergeMultiCodeRows: non muta l\'input originale', () => {
  const rows = [
    { codice: 'A', descrizione: 'Desc A', prezzo: 100,  pagina: '1', review_flag: '',                  yAnchor: 200 },
    { codice: 'B', descrizione: '',       prezzo: null, pagina: '1', review_flag: 'PREZZO_MANCANTE',   yAnchor: 220 }
  ];
  const snapshot = JSON.stringify(rows);
  const out = mergeMultiCodeRows(rows);
  assert.equal(JSON.stringify(rows), snapshot);                       // input invariato
  assert.equal(out[1].review_flag, 'MERGED_FROM_PREV');               // copia modificata
});

// === M6 — section detection ===

test('detectPageTitle: trova item con fontSize > 16 e top < 80', () => {
  const items = [
    { str: 'EQUILIBRATRICI', x0: 100, x1: 250, top: 40, fontSize: 22 },
    { str: 'Cono', x0: 100, x1: 130, top: 200, fontSize: 9 }
  ];
  assert.equal(detectPageTitle(items), 'EQUILIBRATRICI');
});

test('detectPageTitle: ignora font grande FUORI dalla fascia top<80', () => {
  const items = [
    { str: 'GRANDE MA BASSO', x0: 100, x1: 250, top: 200, fontSize: 22 },
    { str: 'Cono',            x0: 100, x1: 130, top: 250, fontSize: 9 }
  ];
  assert.equal(detectPageTitle(items), '');
});

test('detectPageTitle: pagina senza titolo riconoscibile → "" (default sicuro)', () => {
  const items = [{ str: 'Cono', x0: 100, x1: 130, top: 200, fontSize: 9 }];
  assert.equal(detectPageTitle(items), '');
  assert.equal(detectPageTitle([]), '');
  assert.equal(detectPageTitle(null), '');
});

test('findSectionMarkers: rileva ACCESSORI STANDARD / OPTIONAL / OPTIONAL CONSIGLIATI', () => {
  const items = [
    { str: 'ACCESSORI STANDARD',   x0: 100, x1: 250, top: 200 },
    { str: 'OPTIONAL',             x0: 100, x1: 200, top: 400 },
    { str: 'OPTIONAL CONSIGLIATI', x0: 100, x1: 280, top: 600 }
  ];
  const out = findSectionMarkers(items);
  assert.equal(out.length, 3);
  assert.equal(out[0].text, 'ACCESSORI STANDARD');
  assert.equal(out[0].top, 200);
  assert.equal(out[1].text, 'OPTIONAL');
  assert.equal(out[2].text, 'OPTIONAL CONSIGLIATI');
});

test('findSectionMarkers: rileva marker spezzato in 2 token sulla stessa y', () => {
  const items = [
    { str: 'ACCESSORI', x0: 100, x1: 165, top: 200 },
    { str: 'STANDARD',  x0: 170, x1: 230, top: 200 }
  ];
  const out = findSectionMarkers(items);
  assert.equal(out.length, 1);
  assert.equal(out[0].text, 'ACCESSORI STANDARD');
  assert.equal(out[0].top, 200);
});

test('findSectionMarkers: ignora item che non sono marker noti', () => {
  const items = [
    { str: 'Note libere',     x0: 100, x1: 200, top: 200 },
    { str: 'EQUILIBRATRICI',  x0: 100, x1: 250, top: 40, fontSize: 22 }
  ];
  assert.deepEqual(findSectionMarkers(items), []);
});

test('assignSectionToRow: row dopo marker → "TITOLO > MARKER"', () => {
  const markers = [{ text: 'ACCESSORI STANDARD', top: 200 }];
  assert.equal(
    assignSectionToRow(300, 'EQUILIBRATRICI', markers),
    'EQUILIBRATRICI > ACCESSORI STANDARD'
  );
});

test('assignSectionToRow: row PRIMA del primo marker → solo "TITOLO"', () => {
  const markers = [{ text: 'ACCESSORI STANDARD', top: 200 }];
  assert.equal(assignSectionToRow(100, 'EQUILIBRATRICI', markers), 'EQUILIBRATRICI');
});

test('assignSectionToRow: row tra due marker → "TITOLO > MARKER più recente"', () => {
  const markers = [
    { text: 'ACCESSORI STANDARD', top: 200 },
    { text: 'OPTIONAL',           top: 400 }
  ];
  assert.equal(assignSectionToRow(300, 'EQUILIBRATRICI', markers), 'EQUILIBRATRICI > ACCESSORI STANDARD');
  assert.equal(assignSectionToRow(500, 'EQUILIBRATRICI', markers), 'EQUILIBRATRICI > OPTIONAL');
});

test('assignSectionToRow: pagina senza titolo riconoscibile → "" (default sicuro)', () => {
  assert.equal(assignSectionToRow(300, '', []),    '');
  assert.equal(assignSectionToRow(300, null, null), '');
  assert.equal(assignSectionToRow(300, undefined, undefined), '');
});

test('assignSectionToRow: titolo vuoto + marker presente → solo MARKER (defensive)', () => {
  const markers = [{ text: 'ACCESSORI STANDARD', top: 200 }];
  assert.equal(assignSectionToRow(300, '', markers), 'ACCESSORI STANDARD');
});

test('assignSectionToRow: yAnchor invalido (NaN) → titolo (defensive, mai null)', () => {
  const markers = [{ text: 'ACCESSORI STANDARD', top: 200 }];
  const out = assignSectionToRow(NaN, 'EQUILIBRATRICI', markers);
  assert.equal(out, 'EQUILIBRATRICI');
  assert.equal(typeof out, 'string');
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

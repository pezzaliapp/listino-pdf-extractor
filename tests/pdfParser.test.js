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
  detectPageTitle, findSectionMarkers, assignSectionToRow,
  isDegenerateDesc, classifyDidascalie,
  isSubstantialDesc, isFragmentDesc, mergeMatrixGroups, flagPartialDescriptions,
  stripOptionalBanner, stripLayoutNoise, isExcludedSection, isShortUpperContinuation,
  reclassifyContaminatedDidascalie, propagateFloatingDescriptions,
  detectSectionColumns, isInAccStandardColumn
} from '../src/pdfParser.js';

test('parsePriceString', () => {
  assert.equal(parsePriceString('2.750,00'), 2750);
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
  assert.equal(isProductCode('2.750,00'), false);
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
    { str: '2.750,00', x0: 480, x1: 510 },
    { str: '65,00', x0: 480, x1: 510 }
  ];
  const bands = computeColumnBands(items, 600);
  // v5.2: il bordo destro della banda code è la x1 modale dei codici + 4
  // (130+4=134), non più x0+60: così il nome modello subito dopo il codice
  // finisce in descrizione invece di essere scartato.
  assert.deepEqual(bands.code,          [95, 134]);   // 100-5, 130+4
  assert.deepEqual(bands.descrizione,   [134, 470]);  // 130+4, 480-10
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
    { str: 'TITOLO', x0: 380, x1: 415, top: 100 },
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

test('extractAnchors: codici numerici 6-13 cifre, ordina per top crescente', () => {
  const items = [
    { str: '21100070', top: 215 },
    { str: '00100208', top: 100 },
    { str: 'Cono',     top: 110 },
    { str: '12345',    top: 220 }, // 5 cifre = low confidence: senza x0 allineata non diventa anchor
    { str: '21100375', top: 180 },
    { str: '123456789',top: 300 }  // 9 cifre: ora valido (v5.1 — prima era escluso a torto)
  ];
  const out = extractAnchors(items);
  assert.equal(out.length, 4);
  assert.equal(out[0].codice, '00100208');
  assert.equal(out[1].codice, '21100375');
  assert.equal(out[2].codice, '21100070');
  assert.equal(out[3].codice, '123456789');
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
    { str: 'MODELLO-X', x0: 165, x1: 195, top: 215 },
    { str: 'A',     x0: 200, x1: 207, top: 215 },
    { str: 'U',     x0: 207, x1: 214, top: 215 },
    { str: 'T',     x0: 214, x1: 220, top: 215 },
    { str: 'O',     x0: 220, x1: 227, top: 215 },
    { str: 'GAMMA', x0: 235, x1: 270, top: 215 }
  ];
  const out = stripIconText(items);
  // Run di 4 char singoli che spelleranno "AUTO" → tutti rimossi (fase 2)
  assert.equal(out.length, 2);
  assert.equal(out[0].str, 'MODELLO-X');
  assert.equal(out[1].str, 'GAMMA');
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
    { str: 'MODELLO-X', x0: 165, x1: 195, top: 630 },
    { str: '200A',  x0: 200, x1: 230, top: 630 },
    { str: 'GAMMA', x0: 235, x1: 270, top: 630 },
    // icona AUTO renderizzata come 4 char singoli su y leggermente diversa
    { str: 'A',     x0: 200, x1: 207, top: 633 },
    { str: 'U',     x0: 207, x1: 214, top: 633 },
    { str: 'T',     x0: 214, x1: 220, top: 633 },
    { str: 'O',     x0: 220, x1: 227, top: 633 },
    { str: '8.500,00', x0: 480, x1: 510, top: 627 }
  ];
  const anchor = { codice: '01200115', top: 627, item: codeItem };
  const row = emitRowFromBand(anchor, items, cols, 22);
  assert.equal(row.codice, '01200115');
  assert.match(row.descrizione, /^MODELLO-X 200A GAMMA$/);
  assert.equal(row.prezzo, 8500);
  assert.equal(row.review_flag, '');
});

// === M5 — multi-code merge ===

test('mergeMultiCodeRows: caso classico §P5 — prev desc+prezzo, next vuoto, dy<35 → merge', () => {
  // Pag 36 PDF di riferimento: 20100202 (y=222) e 20100326 (y=250 dopo aggregazione
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

test('mergeMultiCodeRows: backward — cella condivisa con prezzo galleggiante (pag 81, 25100044/45)', () => {
  // Il rowspan mette descrizione e prezzo (350) centrati tra i due codici:
  // tutto cade nella banda del secondo per mezzo punto. Il prezzo però sta
  // SOPRA la riga dell'anchor di 25100045 (hint _prezzoGalleggiante) → la
  // riga vuota sopra riceve prezzo e descrizione, flag MERGED_FROM_NEXT.
  const rows = [
    { codice: '25100044', descrizione: '', prezzo: null, pagina: '81', review_flag: 'PREZZO_MANCANTE', sezione: 'ACCESSORI', yAnchor: 536 },
    { codice: '25100045', descrizione: 'Kit di cablaggio, 1mt.', prezzo: 350, pagina: '81', review_flag: '', sezione: 'ACCESSORI', yAnchor: 562, _prezzoGalleggiante: true }
  ];
  const out = mergeMultiCodeRows(rows);
  assert.equal(out[0].prezzo, 350);
  assert.equal(out[0].descrizione, 'Kit di cablaggio, 1mt.');
  assert.equal(out[0].review_flag, 'MERGED_FROM_NEXT');
  assert.equal(out[1].prezzo, 350); // la sorgente resta invariata
});

test('mergeMultiCodeRows: backward NON scatta verso una riga-prodotto completa (box OPTIONAL pag 57)', () => {
  // 23100209 è il codice-etichetta del box OPTIONAL: sta sopra la riga
  // completa di 03100074 (prezzo 12.500 sulla propria riga, nessun hint).
  // Rubare quel prezzo sarebbe indovinare → resta PREZZO_MANCANTE.
  const rows = [
    { codice: '23100209', descrizione: '', prezzo: null, pagina: '57', review_flag: 'PREZZO_MANCANTE', sezione: 'MODELLO-Y 328A > OPTIONAL', yAnchor: 600 },
    { codice: '03100074', descrizione: 'MODELLO-Y 328A 1ph 230V-50/60Hz', prezzo: 12500, pagina: '57', review_flag: '', sezione: 'MODELLO-Y 328A > OPTIONAL', yAnchor: 669 }
  ];
  const out = mergeMultiCodeRows(rows);
  assert.equal(out[0].prezzo, null);
  assert.equal(out[0].review_flag, 'PREZZO_MANCANTE');
});

test('mergeMultiCodeRows: backward — cella condivisa con entrambe le descrizioni vuote (pag 36)', () => {
  const rows = [
    { codice: '20100202', descrizione: '', prezzo: null, pagina: '36', review_flag: 'PREZZO_MANCANTE', sezione: 'S', yAnchor: 222 },
    { codice: '20100326', descrizione: '', prezzo: 150, pagina: '36', review_flag: '', sezione: 'S', yAnchor: 250 }
  ];
  const out = mergeMultiCodeRows(rows);
  assert.equal(out[0].prezzo, 150);
  assert.equal(out[0].review_flag, 'MERGED_FROM_NEXT');
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
  const full = ['00100208', 'ACME', 'CE', '1ph', '230V', '50-60Hz', '2.750,00'];
  assert.equal(hasProductCode(full), true);
  assert.equal(isCompleteProductRow(full), true);
});

// === v5.1 — prezzi spezzati / punto migliaia perso ===

import {
  canJoinPriceFragments, recomposeSplitPriceTokens, coalesceSplitPriceItems,
  codeConfidence, joinMultiLineRows as _jml
} from '../src/pdfParser.js';

test('parsePriceString v5.1: punto migliaia perso e decimali obbligatori', () => {
  assert.equal(parsePriceString('1000,00'), 1000);   // formato senza separatore migliaia
  assert.equal(parsePriceString('1100,00'), 1100);   // formato senza separatore migliaia
  assert.equal(parsePriceString('33200,00'), 33200);
  assert.equal(parsePriceString('7,5'), null);       // peso da tabella tecnica, non prezzo
  assert.equal(parsePriceString('188,5'), null);
  assert.equal(parsePriceString('1500'), null);      // intero nudo: invariato
  assert.equal(parsePriceString('21.100.057'), null);
});

test('canJoinPriceFragments: unisce solo tagli su separatore', () => {
  assert.equal(canJoinPriceFragments('1.', '100,00'), true);
  assert.equal(canJoinPriceFragments('1', '.100,00'), true);
  assert.equal(canJoinPriceFragments('1.100', ',00'), true);
  assert.equal(canJoinPriceFragments('22', '.950,00'), true);
  assert.equal(canJoinPriceFragments('36', '880,00'), false);  // quantità + prezzo
  assert.equal(canJoinPriceFragments('1.500', '65,00'), false); // due prezzi distinti
  assert.equal(canJoinPriceFragments('', '100,00'), false);
});

test('recomposeSplitPriceTokens: ricompone e non tocca il resto', () => {
  assert.deepEqual(
    recomposeSplitPriceTokens(['Distanziale', 'per', 'furgoni', '1.', '100,00']),
    ['Distanziale', 'per', 'furgoni', '1.100,00']);
  assert.deepEqual(recomposeSplitPriceTokens(['1', '.100,00']), ['1.100,00']);
  assert.deepEqual(recomposeSplitPriceTokens(['1', '.', '100,00']), ['1.100,00']); // 3 pezzi
  assert.deepEqual(recomposeSplitPriceTokens(['36', 'mesi', '880,00']), ['36', 'mesi', '880,00']);
});

test('joinMultiLineRows: il prezzo spezzato non perde le migliaia (1.100 ≠ 100)', () => {
  const out = _jml([{ tokens: ['21100304', 'Distanziale', 'e', 'cono', '1.', '100,00'] }], 17);
  assert.equal(out.length, 1);
  assert.equal(out[0].prezzo, 1100);
  assert.equal(out[0].review_flag, '');
});

test('joinMultiLineRows: variante "1" + ".100,00" non finisce più in CHECK', () => {
  const out = _jml([{ tokens: ['21100304', 'Distanziale', '1', '.100,00'] }], 17);
  assert.equal(out[0].prezzo, 1100);
  assert.equal(out[0].review_flag, '');
});

test('joinMultiLineRows: frammento orfano non ricomponibile → CHECK_PREZZO', () => {
  // "1." + "10,00" → "1.10,00" non è un prezzo valido: resta orfano, si segnala
  const out = _jml([{ tokens: ['21100304', 'Distanziale', '1.', '10,00'] }], 17);
  assert.equal(out[0].prezzo, 10);
  assert.match(out[0].review_flag, /CHECK_PREZZO/);
});

test('coalesceSplitPriceItems: unisce frammenti adiacenti sulla stessa riga', () => {
  const items = [
    { str: '21100304', x0: 100, x1: 144, top: 300 },
    { str: 'Distanziale', x0: 165, x1: 230, top: 300 },
    { str: '1.', x0: 470, x1: 478, top: 300 },
    { str: '100,00', x0: 479, x1: 510, top: 300 }
  ];
  const out = coalesceSplitPriceItems(items);
  assert.equal(out.length, 3);
  const merged = out.find(it => it.str === '1.100,00');
  assert.ok(merged);
  assert.equal(merged.x0, 470);
  assert.equal(merged.x1, 510);
});

test('coalesceSplitPriceItems: NON unisce frammenti su righe o colonne diverse', () => {
  const farApart = coalesceSplitPriceItems([
    { str: '1.', x0: 200, x1: 208, top: 300 },
    { str: '100,00', x0: 479, x1: 510, top: 300 } // gap 271pt: colonne diverse
  ]);
  assert.equal(farApart.length, 2);
  const otherLine = coalesceSplitPriceItems([
    { str: '1.', x0: 470, x1: 478, top: 300 },
    { str: '100,00', x0: 479, x1: 510, top: 320 } // riga diversa
  ]);
  assert.equal(otherLine.length, 2);
});

// === v5.1 — pattern codici allargato ===

test('codeConfidence: tier di confidenza', () => {
  assert.equal(codeConfidence('21100076'), 'high');
  assert.equal(codeConfidence('1234567890123'), 'high'); // 13 cifre (EAN-13)
  assert.equal(codeConfidence('123456789'), 'high');     // 10+ cifre non più scartati... 9 qui
  assert.equal(codeConfidence('25100310*'), 'high');     // asterisco-nota (pag. 69)
  assert.equal(codeConfidence('12345'), 'low');          // 5 cifre
  assert.equal(codeConfidence('FG192/PS2'), 'low');      // alfanumerico fornitore
  assert.equal(codeConfidence('ABC-1234'), 'low');
  assert.equal(codeConfidence('1234'), null);            // ≤4 cifre: troppo ambiguo (anni, modelli)
  assert.equal(codeConfidence('2.750,00'), null);        // prezzo
  assert.equal(codeConfidence('30000N'), null);          // numero+unità
  assert.equal(codeConfidence('9999N'), null);           // sigla modello
  assert.equal(codeConfidence('F535S'), null);           // sigla modello
  assert.equal(codeConfidence('230V-50/60HZ'), null);    // dato elettrico
  assert.equal(codeConfidence('16X12X8'), null);         // dimensioni
});

test('isProductCode v5.1: accetta alfanumerici e 10+ cifre', () => {
  assert.equal(isProductCode('FG192/PS2'), true);
  assert.equal(isProductCode('ABC-1234'), true);
  assert.equal(isProductCode('1234567890'), true);
  assert.equal(isProductCode('25100310*'), true);
});

test('joinMultiLineRows: codice alfanumerico a inizio riga → riga emessa con CHECK_CODICE', () => {
  const out = _jml([{ tokens: ['FG192/PS2', 'Filtro', 'gasolio', '65,00'] }], 3);
  assert.equal(out.length, 1);
  assert.equal(out[0].codice, 'FG192/PS2');
  assert.equal(out[0].prezzo, 65);
  assert.match(out[0].review_flag, /CHECK_CODICE/);
});

test('joinMultiLineRows: sigla alfanumerica in mezzo alla descrizione NON crea righe', () => {
  // riga di continuazione che contiene "MOD-810X" non deve diventare un prodotto
  const out = _jml([
    { tokens: ['21100420', 'Disponibile', 'per', 'modelli', 'MOD-810X', 'fino', 'ad'] },
    { tokens: ['esaurimento', '880,00'] }
  ], 6);
  assert.equal(out.length, 1);
  assert.equal(out[0].codice, '21100420');
  assert.equal(out[0].prezzo, 880);
});

test('extractAnchors: candidato low allineato alla colonna codici diventa anchor flaggato', () => {
  const items = [
    { str: '21100070', top: 100, x0: 100 },
    { str: '21100015', top: 200, x0: 100 },
    { str: 'FG192/PS2', top: 300, x0: 101 },  // stessa colonna → anchor low
    { str: 'AB-99X1', top: 150, x0: 260 }     // in mezzo alla descrizione → scartato
  ];
  const out = extractAnchors(items);
  assert.equal(out.length, 3);
  const low = out.find(a => a.codice === 'FG192/PS2');
  assert.ok(low);
  assert.equal(low.confidence, 'low');
  assert.equal(out.some(a => a.codice === 'AB-99X1'), false);
});

test('emitRowFromBand: prezzo spezzato in banda ricomposto, frammento orfano flaggato', () => {
  const cols = {
    code: [95, 160], descrizione: [160, 470], prezzo: [470, 520],
    compatibilita: [520, 600], noteLaterali: [0, 95]
  };
  const codeItem = { str: '21100304', x0: 100, x1: 144, top: 215 };
  const anchor = { codice: '21100304', top: 215, item: codeItem };
  const okRow = emitRowFromBand(anchor, [
    codeItem,
    { str: 'Distanziale', x0: 165, x1: 230, top: 215 },
    { str: '1.', x0: 471, x1: 479, top: 215 },
    { str: '100,00', x0: 480, x1: 510, top: 215 }
  ], cols, 17);
  assert.equal(okRow.prezzo, 1100);
  assert.equal(okRow.review_flag, '');

  // "1." + "10,00" → "1.10,00" non è un prezzo valido: il frammento resta
  // orfano nella colonna prezzo e la riga va segnalata, non indovinata.
  const fragRow = emitRowFromBand(anchor, [
    codeItem,
    { str: 'Distanziale', x0: 165, x1: 230, top: 215 },
    { str: '1.', x0: 471, x1: 479, top: 215 },
    { str: '10,00', x0: 480, x1: 505, top: 215 }
  ], cols, 17);
  assert.equal(fragRow.prezzo, 10);
  assert.match(fragRow.review_flag, /CHECK_PREZZO/);
});

// === Pattern A — codici-didascalia (box ACCESSORI STANDARD) ===
// Fixture sintetiche: codici e testi inventati che riproducono il pattern,
// nessun estratto reale del listino.

test('isDegenerateDesc: vuota o solo punteggiatura/parentesi → true', () => {
  assert.equal(isDegenerateDesc(''), true);
  assert.equal(isDegenerateDesc('   '), true);
  assert.equal(isDegenerateDesc('( )'), true);
  assert.equal(isDegenerateDesc('()'), true);
  assert.equal(isDegenerateDesc('- -'), true);
  assert.equal(isDegenerateDesc(null), true);
  assert.equal(isDegenerateDesc('(TAG1)'), false);   // ha caratteri alfanumerici
  assert.equal(isDegenerateDesc('Pinza'), false);
});

test('classifyDidascalie: codice mai prezzato, tutte occorrenze in ACCESSORI STANDARD → Dotazioni', () => {
  const rows = [
    { codice: '90000001', descrizione: '', prezzo: null, pagina: '8', review_flag: 'PREZZO_MANCANTE', sezione: 'macchina A > ACCESSORI STANDARD' },
    { codice: '90000001', descrizione: '(TAG)', prezzo: null, pagina: '9', review_flag: 'PREZZO_MANCANTE', sezione: 'macchina B > ACCESSORI STANDARD' }
  ];
  const { mainRows, dotazioni } = classifyDidascalie(rows);
  assert.equal(mainRows.length, 0);
  assert.equal(dotazioni.length, 1);
  assert.equal(dotazioni[0].codice, '90000001');
  assert.equal(dotazioni[0].review_flag, 'CODICE_DIDASCALIA');
  assert.equal(dotazioni[0].pagina, '8, 9');
  assert.match(dotazioni[0].sezione, /macchina A > ACCESSORI STANDARD/);
  assert.match(dotazioni[0].sezione, /macchina B > ACCESSORI STANDARD/);
  assert.equal(dotazioni[0].descrizione, '(TAG)'); // prima desc non-degenerata conservata come info
});

test('classifyDidascalie: didascalia + vera riga prezzata → tiene solo la riga prezzata', () => {
  // Didascalia su pagine ACCESSORI STANDARD, prezzata una volta a p.18.
  const rows = [
    { codice: '90000002', descrizione: '', prezzo: null, pagina: '8',  review_flag: 'PREZZO_MANCANTE', sezione: 'macchina A > ACCESSORI STANDARD' },
    { codice: '90000002', descrizione: '', prezzo: null, pagina: '15', review_flag: 'PREZZO_MANCANTE', sezione: 'macchina B > ACCESSORI STANDARD' },
    { codice: '90000002', descrizione: 'Articolo di prova', prezzo: 55, pagina: '18', review_flag: '', sezione: 'ACCESSORI AUTO' }
  ];
  const { mainRows, dotazioni } = classifyDidascalie(rows);
  assert.equal(dotazioni.length, 0);                 // niente Dotazioni: ha una riga vera
  assert.equal(mainRows.length, 1);                  // le 2 didascalie scartate
  assert.equal(mainRows[0].pagina, '18');
  assert.equal(mainRows[0].prezzo, 55);
});

test('classifyDidascalie: badge ricorrente fuori sezione (marchio CE "( )" su >=3 pagine) → Dotazioni', () => {
  const rows = [
    { codice: '90000003', descrizione: '( )', prezzo: null, pagina: '26', review_flag: 'PREZZO_MANCANTE', sezione: 'titolo grezzo' },
    { codice: '90000003', descrizione: '( )', prezzo: null, pagina: '27', review_flag: 'PREZZO_MANCANTE', sezione: 'titolo grezzo' },
    { codice: '90000003', descrizione: '( )', prezzo: null, pagina: '28', review_flag: 'PREZZO_MANCANTE', sezione: 'titolo grezzo' }
  ];
  const { mainRows, dotazioni } = classifyDidascalie(rows);
  assert.equal(mainRows.length, 0);
  assert.equal(dotazioni.length, 1);
  assert.equal(dotazioni[0].codice, '90000003');
});

test('classifyDidascalie: NON tocca una vera riga senza prezzo fuori ACCESSORI STANDARD (resta nel Listino)', () => {
  // Accessorio reale con prezzo mancante in una tabella accessori: NON è una
  // didascalia (una sola pagina, sezione non ACCESSORI STANDARD) → resta.
  const rows = [
    { codice: '90000004', descrizione: 'Accessorio senza prezzo', prezzo: null, pagina: '43', review_flag: 'PREZZO_MANCANTE', sezione: 'ACCESSORI SMONTAGOMME' }
  ];
  const { mainRows, dotazioni } = classifyDidascalie(rows);
  assert.equal(dotazioni.length, 0);
  assert.equal(mainRows.length, 1);
  assert.equal(mainRows[0].codice, '90000004');
});

test('classifyDidascalie: un\'occorrenza-didascalia in ACCESSORI STANDARD scartata, l\'occorrenza matrice sopravvive', () => {
  // p.27 nel box ACCESSORI STANDARD (didascalia), p.34 nella matrice accessori
  // (vera riga, prezzo aggiunto poi da Pattern B).
  const rows = [
    { codice: '90000005', descrizione: '', prezzo: null, pagina: '27', review_flag: 'PREZZO_MANCANTE', sezione: 'macchina Z > ACCESSORI STANDARD' },
    { codice: '90000005', descrizione: 'BETA SYSTEM Dispositivo combinato per', prezzo: null, pagina: '34', review_flag: 'PREZZO_MANCANTE', sezione: 'ACCESSORI SMONTAGOMME AUTO' }
  ];
  const { mainRows, dotazioni } = classifyDidascalie(rows);
  assert.equal(dotazioni.length, 0);                 // ha un'occorrenza matrice → resta nel Listino
  assert.equal(mainRows.length, 1);
  assert.equal(mainRows[0].pagina, '34');
});

test('classifyDidascalie: input vuoto/non-array → strutture vuote', () => {
  assert.deepEqual(classifyDidascalie([]), { mainRows: [], dotazioni: [] });
  assert.deepEqual(classifyDidascalie(null), { mainRows: [], dotazioni: [] });
});

// === Pattern B — celle condivise verticali (matrice) ===
// Fixture sintetiche: codici e testi inventati che riproducono i rowspan.

test('isFragmentDesc / isSubstantialDesc: distinguono capofila da continuazione', () => {
  assert.equal(isFragmentDesc('il montaggio dei pneumatici'), true);
  assert.equal(isFragmentDesc('ruote tubeless'), true);
  assert.equal(isFragmentDesc('ribassati e RunFlat'), true);
  assert.equal(isFragmentDesc('ALFA SYSTEM Dispositivo'), false);
  assert.equal(isFragmentDesc('Gruppo esterno'), false);
  assert.equal(isFragmentDesc(''), false);
  assert.equal(isSubstantialDesc('BETA SYSTEM Dispositivo'), true);
  assert.equal(isSubstantialDesc('Pinza'), true);
  assert.equal(isSubstantialDesc('ribassati e RunFlat'), false);
  assert.equal(isSubstantialDesc('( ) gonfiaggio tubeless'), false); // frammento sporco
  assert.equal(isSubstantialDesc('( )'), false);
});

test('mergeMatrixGroups: 3 codici, descrizione spezzata + prezzo unico al centro → tutti completi', () => {
  // Gruppo a 3 codici: capofila col nome, prezzo sulla riga centrale.
  const rows = [
    { codice: 'C1', descrizione: 'ALFA SYSTEM Dispositivo combinato per', prezzo: null, pagina: '34', review_flag: 'PREZZO_MANCANTE', sezione: 'MATR', yAnchor: 200 },
    { codice: 'C2', descrizione: 'il montaggio dei pneumatici',            prezzo: 3400, pagina: '34', review_flag: '',                sezione: 'MATR', yAnchor: 236 },
    { codice: 'C3', descrizione: 'ribassati e resistenti',                 prezzo: null, pagina: '34', review_flag: 'PREZZO_MANCANTE', sezione: 'MATR', yAnchor: 272 }
  ];
  const out = mergeMatrixGroups(rows);
  const full = 'ALFA SYSTEM Dispositivo combinato per il montaggio dei pneumatici ribassati e resistenti';
  assert.equal(out[0].descrizione, full);
  assert.equal(out[1].descrizione, full);
  assert.equal(out[2].descrizione, full);
  assert.equal(out[0].prezzo, 3400);            // propagato
  assert.equal(out[2].prezzo, 3400);            // propagato
  assert.match(out[2].review_flag, /DESCRIZIONE_GRUPPO/);
  assert.match(out[2].review_flag, /PREZZO_GRUPPO/);
  assert.doesNotMatch(out[0].review_flag || '', /PREZZO_MANCANTE/);
});

test('mergeMatrixGroups: due prezzi distinti nel gruppo → propaga solo la descrizione', () => {
  // Stessa descrizione condivisa, un prezzo distinto per ciascun codice.
  const rows = [
    { codice: 'D1', descrizione: 'Gruppo esterno per gonfiaggio', prezzo: 410, pagina: '36', review_flag: '', sezione: 'MATR', yAnchor: 300 },
    { codice: 'D2', descrizione: 'ruote tubeless',                prezzo: 560, pagina: '36', review_flag: '', sezione: 'MATR', yAnchor: 340 }
  ];
  const out = mergeMatrixGroups(rows);
  assert.equal(out[0].descrizione, 'Gruppo esterno per gonfiaggio ruote tubeless');
  assert.equal(out[1].descrizione, 'Gruppo esterno per gonfiaggio ruote tubeless');
  assert.equal(out[0].prezzo, 410);             // prezzi propri conservati
  assert.equal(out[1].prezzo, 560);
  assert.doesNotMatch(out[1].review_flag || '', /PREZZO_GRUPPO/);
  assert.match(out[1].review_flag, /DESCRIZIONE_GRUPPO/);
});

test('mergeMatrixGroups: riga vuota che condivide lo stesso prezzo → riceve la descrizione', () => {
  // Riga vuota con prezzo proprio uguale a quello del gruppo.
  const rows = [
    { codice: 'E1', descrizione: 'Set di 3 protezioni paletta stallonatore', prezzo: 120, pagina: '37', review_flag: '', sezione: 'MATR', yAnchor: 380 },
    { codice: 'E2', descrizione: '',                                          prezzo: 120, pagina: '37', review_flag: '', sezione: 'MATR', yAnchor: 417 }
  ];
  const out = mergeMatrixGroups(rows);
  assert.equal(out[1].descrizione, 'Set di 3 protezioni paletta stallonatore');
  assert.equal(out[1].prezzo, 120);
  assert.match(out[1].review_flag, /DESCRIZIONE_GRUPPO/);
});

test('mergeMatrixGroups: NON fonde prodotti distinti con prezzi diversi e descrizioni proprie', () => {
  const rows = [
    { codice: 'F1', descrizione: '',                prezzo: 800,  pagina: '54', review_flag: '', sezione: 'ACC', yAnchor: 208 },
    { codice: 'F2', descrizione: '',                prezzo: 1300, pagina: '54', review_flag: '', sezione: 'ACC', yAnchor: 231 },
    { codice: 'F3', descrizione: 'Kit radiocomando', prezzo: 3000, pagina: '54', review_flag: '', sezione: 'ACC', yAnchor: 607 },
    { codice: 'F4', descrizione: '',                prezzo: 6000, pagina: '54', review_flag: '', sezione: 'ACC', yAnchor: 635 }
  ];
  const out = mergeMatrixGroups(rows);
  assert.equal(out[0].prezzo, 800);
  assert.equal(out[1].prezzo, 1300);
  assert.equal(out[1].descrizione, '');         // niente propagazione (prezzi distinti, non frammento)
  assert.equal(out[3].prezzo, 6000);
  assert.doesNotMatch(out[1].review_flag || '', /GRUPPO/);
});

test('mergeMatrixGroups: sezioni diverse o troppo distanti → nessun gruppo', () => {
  const rowsSez = [
    { codice: 'G1', descrizione: 'Capofila prodotto', prezzo: 100, pagina: '1', review_flag: '', sezione: 'A', yAnchor: 200 },
    { codice: 'G2', descrizione: 'continuazione minuscola', prezzo: null, pagina: '1', review_flag: 'PREZZO_MANCANTE', sezione: 'B', yAnchor: 220 }
  ];
  assert.equal(mergeMatrixGroups(rowsSez)[1].prezzo, null);
  const rowsFar = [
    { codice: 'H1', descrizione: 'Capofila prodotto', prezzo: 100, pagina: '1', review_flag: '', sezione: 'A', yAnchor: 200 },
    { codice: 'H2', descrizione: 'continuazione minuscola', prezzo: null, pagina: '1', review_flag: 'PREZZO_MANCANTE', sezione: 'A', yAnchor: 300 }
  ];
  assert.equal(mergeMatrixGroups(rowsFar)[1].prezzo, null);
});

test('mergeMatrixGroups: input vuoto/non-array → []', () => {
  assert.deepEqual(mergeMatrixGroups([]), []);
  assert.deepEqual(mergeMatrixGroups(null), []);
});

test('flagPartialDescriptions: minuscola iniziale o sola parentesi → DESC_PARZIALE', () => {
  const rows = [
    { codice: 'A', descrizione: 'tubeless + pedale', prezzo: null, review_flag: 'PREZZO_MANCANTE' },
    { codice: 'B', descrizione: '(4 pcs)', prezzo: null, review_flag: 'PREZZO_MANCANTE' },
    { codice: 'C', descrizione: 'Pinza per contrappesi', prezzo: 40, review_flag: '' },
    { codice: 'D', descrizione: '', prezzo: null, review_flag: 'PREZZO_MANCANTE' }
  ];
  flagPartialDescriptions(rows);
  assert.match(rows[0].review_flag, /DESC_PARZIALE/);
  assert.match(rows[1].review_flag, /DESC_PARZIALE/);
  assert.doesNotMatch(rows[2].review_flag || '', /DESC_PARZIALE/); // capofila valida
  assert.doesNotMatch(rows[3].review_flag || '', /DESC_PARZIALE/); // vuota, non "parziale"
});

// === Pattern C — banner ricorrente "ACCESSORI OPTIONAL a pag. N" ===

test('stripOptionalBanner: rimuove il banner e ricuce gli spazi', () => {
  assert.equal(stripOptionalBanner('ACCESSORI OPTIONAL a pag. 16'), '');
  assert.equal(stripOptionalBanner('(15 pcs) e manometro. ACCESSORI OPTIONAL a pag. 36'),
    '(15 pcs) e manometro.');
  assert.equal(stripOptionalBanner('ACCESSORI OPTIONAL a pag 53'), ''); // senza punto
  assert.equal(stripOptionalBanner('Pinza ACCESSORI OPTIONAL a pag. 8 forata'), 'Pinza forata');
});

test('stripOptionalBanner: NON tocca il falso positivo 20100334', () => {
  const d = 'Nuovo dispositivo per avere più luce sul tuo lavoro (su richiesta, se specificato all’ordine)';
  assert.equal(stripOptionalBanner(d), d);
});

test('emitRowFromBand: il banner OPTIONAL non diventa descrizione', () => {
  const cols = {
    code: [95, 134], descrizione: [134, 470], prezzo: [470, 520],
    compatibilita: [520, 600], noteLaterali: [0, 95],
    _anchors: { xCodeLeft: 100, xPriceLeft: 480, xPriceRight: 510 }
  };
  const codeItem = { str: '21100057', x0: 100, x1: 130, top: 200, fontSize: 9 };
  const anchor = { codice: '21100057', top: 200, item: codeItem, confidence: 'high' };
  const items = [
    codeItem,
    { str: 'ACCESSORI', x0: 165, x1: 220, top: 200, fontSize: 9 },
    { str: 'OPTIONAL',  x0: 222, x1: 270, top: 200, fontSize: 9 },
    { str: 'a',         x0: 272, x1: 278, top: 200, fontSize: 9 },
    { str: 'pag.',      x0: 280, x1: 300, top: 200, fontSize: 9 },
    { str: '16',        x0: 302, x1: 315, top: 200, fontSize: 9 }
  ];
  const row = emitRowFromBand(anchor, items, cols, 8);
  assert.equal(row.descrizione, '');
});

// === Intervento 1 — box ACCESSORI STANDARD uniforme (rumore di layout) ===

test('stripLayoutNoise: rimuove marker sezione, note quantità e dimensione', () => {
  assert.equal(stripLayoutNoise('OPTIONAL'), '');
  assert.equal(stripLayoutNoise('Ø mm 145'), '');
  assert.equal(stripLayoutNoise('Ø mm 58 Ø mm 74 Ø mm 120'), '');
  assert.equal(stripLayoutNoise('(3 pcs)'), '');
  assert.equal(stripLayoutNoise('OPTIONAL (3 pcs)'), '');
  // una vera descrizione sopravvive
  assert.equal(stripLayoutNoise('Gruppo esterno per gonfiaggio'), 'Gruppo esterno per gonfiaggio');
  assert.equal(stripLayoutNoise('Pinza OPTIONAL'), 'Pinza');
});

test('classifyDidascalie: frammento di layout maiuscolo NON salva il codice dal box → Dotazioni', () => {
  // Come pag.24-25: il codice sta nel box ACCESSORI STANDARD (desc vuota) e su
  // una scheda ripetuta ha raccolto un frammento maiuscolo di layout
  // ("OPTIONAL", "Ø mm 145"): non è un nome-prodotto, l'intero box va in Dotazioni.
  const rows = [
    { codice: '90000010', descrizione: '',          prezzo: null, pagina: '24', review_flag: 'PREZZO_MANCANTE', sezione: 'S1 > ACCESSORI STANDARD' },
    { codice: '90000010', descrizione: 'OPTIONAL',   prezzo: null, pagina: '25', review_flag: 'PREZZO_MANCANTE', sezione: 'S2' },
    { codice: '90000011', descrizione: '',           prezzo: null, pagina: '24', review_flag: 'PREZZO_MANCANTE', sezione: 'S1 > ACCESSORI STANDARD' },
    { codice: '90000011', descrizione: 'Ø mm 145',   prezzo: null, pagina: '25', review_flag: 'PREZZO_MANCANTE', sezione: 'S2' }
  ];
  const { mainRows, dotazioni } = classifyDidascalie(rows);
  assert.equal(mainRows.length, 0);                 // niente più frammenti nel Listino
  assert.deepEqual(dotazioni.map(d => d.codice).sort(), ['90000010', '90000011']);
});

test('classifyDidascalie: una vera descrizione-prodotto continua a salvare il codice (nessuna regressione)', () => {
  // Un nome-prodotto reale su una pagina matrice NON deve finire in Dotazioni:
  // resta nel Listino (poi completato da Pattern B).
  const rows = [
    { codice: '90000012', descrizione: '',                          prezzo: null, pagina: '27', review_flag: 'PREZZO_MANCANTE', sezione: 'S1 > ACCESSORI STANDARD' },
    { codice: '90000012', descrizione: 'Gruppo esterno di gonfiaggio', prezzo: null, pagina: '29', review_flag: 'PREZZO_MANCANTE', sezione: 'S3' }
  ];
  const { mainRows, dotazioni } = classifyDidascalie(rows);
  assert.equal(dotazioni.length, 0);
  assert.equal(mainRows.length, 1);
  assert.equal(mainRows[0].pagina, '29');
});

// === Intervento 2 — filtro sezione-appendice (DIMENSIONI IMBALLI) ===

test('isExcludedSection: riconosce la sezione tabella imballi, non le sezioni normali', () => {
  assert.equal(isExcludedSection('DIMENSIONI IMBALLI'), true);
  assert.equal(isExcludedSection('S1 > DIMENSIONI IMBALLI'), true);
  assert.equal(isExcludedSection('dimensioni  imballi'), true);   // case/spazi
  assert.equal(isExcludedSection('S1 > ACCESSORI STANDARD'), false);
  assert.equal(isExcludedSection('ACCESSORI SMONTAGOMME'), false);
  assert.equal(isExcludedSection(''), false);
  assert.equal(isExcludedSection(null), false);
});

test('isExcludedSection: una riga con l\'intera tabella imballi in descrizione è filtrabile', () => {
  // Fixture sintetica (dati fittizi): l'unica "riga" della pagina appendice
  // raccoglie tutta la tabella pesi/misure; la sezione basta a filtrarla.
  const row = {
    codice: '90000020',
    descrizione: 'LxPxH (cm) Cassa in legno 50 65 110x60x50 A vista su pallet 80 90 96x69x160',
    prezzo: null,
    pagina: '90',
    review_flag: 'PREZZO_MANCANTE',
    sezione: 'DIMENSIONI IMBALLI'
  };
  assert.equal(isExcludedSection(row.sezione), true);
});

// === Intervento 3 — coppie celle-condivise mancate (continuazioni/vuote/note) ===

test('isShortUpperContinuation: solo una parola MAIUSCOLA breve', () => {
  assert.equal(isShortUpperContinuation('STANDARD'), true);
  assert.equal(isShortUpperContinuation('CE'), true);
  assert.equal(isShortUpperContinuation('Kit'), false);          // non tutta maiuscola
  assert.equal(isShortUpperContinuation('KIT SMART APP'), false); // multi-parola
  assert.equal(isShortUpperContinuation('ruote'), false);
  assert.equal(isShortUpperContinuation(''), false);
});

test('mergeMatrixGroups: sigla-suffisso MAIUSCOLA ("STANDARD") continua la cella del codice sopra', () => {
  // Come p.37: 20100319 "Pistoletta di gonfiaggio" @80, sotto un codice con la
  // sola sigla "STANDARD" a prezzo nullo → stessa cella, stesso prezzo.
  const rows = [
    { codice: 'K1', descrizione: 'Pistoletta di gonfiaggio', prezzo: 80,   pagina: '37', review_flag: '',                sezione: 'MATR', yAnchor: 540 },
    { codice: 'K2', descrizione: 'STANDARD',                  prezzo: null, pagina: '37', review_flag: 'PREZZO_MANCANTE', sezione: 'MATR', yAnchor: 571 }
  ];
  const out = mergeMatrixGroups(rows);
  assert.equal(out[1].descrizione, 'Pistoletta di gonfiaggio STANDARD');
  assert.equal(out[1].prezzo, 80);
  assert.match(out[1].review_flag, /PREZZO_GRUPPO/);
  assert.doesNotMatch(out[1].review_flag, /PREZZO_MANCANTE/);
  assert.equal(out[0].descrizione, 'Pistoletta di gonfiaggio STANDARD'); // capofila completata
});

test('mergeMatrixGroups: riga vuota a prezzo NULLO sotto una capofila con prezzo unico → cella condivisa', () => {
  // Come p.43: 20100216 "Set di 3 protezioni..." @90, sotto un codice vuoto e
  // senza prezzo (20100184) che appartiene alla stessa cella.
  const rows = [
    { codice: 'L1', descrizione: 'Set di 3 protezioni paletta stallonatore', prezzo: 90,   pagina: '43', review_flag: '',                sezione: 'MATR', yAnchor: 170 },
    { codice: 'L2', descrizione: '',                                          prezzo: null, pagina: '43', review_flag: 'PREZZO_MANCANTE', sezione: 'MATR', yAnchor: 210 }
  ];
  const out = mergeMatrixGroups(rows);
  assert.equal(out[1].descrizione, 'Set di 3 protezioni paletta stallonatore');
  assert.equal(out[1].prezzo, 90);
  assert.match(out[1].review_flag, /DESCRIZIONE_GRUPPO/);
  assert.match(out[1].review_flag, /PREZZO_GRUPPO/);
});

test('mergeMatrixGroups: guardia p.54 invariata — prezzo proprio distinto NON si fonde', () => {
  // Anche con le nuove condizioni, una riga vuota/breve con un prezzo PROPRIO
  // diverso da quello del gruppo resta un prodotto a sé (nessun merge).
  const rows = [
    { codice: 'M1', descrizione: '', prezzo: 800,  pagina: '54', review_flag: '', sezione: 'ACC', yAnchor: 208 },
    { codice: 'M2', descrizione: '', prezzo: 1300, pagina: '54', review_flag: '', sezione: 'ACC', yAnchor: 231 }
  ];
  const out = mergeMatrixGroups(rows);
  assert.equal(out[0].prezzo, 800);
  assert.equal(out[1].prezzo, 1300);
  assert.equal(out[1].descrizione, '');
  assert.doesNotMatch(out[1].review_flag || '', /GRUPPO/);
});

test('mergeMatrixGroups: la descrizione di gruppo è ripulita dalle note quantità', () => {
  // Come p.31 (20200590): un frammento porta "(15 pcs)" dentro la cella;
  // la descrizione ricomposta non deve contenerlo.
  const rows = [
    { codice: 'N1', descrizione: 'Gruppo esterno di gonfiaggio',       prezzo: null, pagina: '31', review_flag: 'PREZZO_MANCANTE', sezione: 'S', yAnchor: 547 },
    { codice: 'N2', descrizione: '(15 pcs) e manometro pressione.',    prezzo: null, pagina: '31', review_flag: 'PREZZO_MANCANTE', sezione: 'S', yAnchor: 551 },
    { codice: 'N3', descrizione: 'tubeless + pedale gonfiaggio',       prezzo: null, pagina: '31', review_flag: 'PREZZO_MANCANTE', sezione: 'S', yAnchor: 555 }
  ];
  const out = mergeMatrixGroups(rows);
  assert.doesNotMatch(out[0].descrizione, /\(15 pcs\)/);
  assert.match(out[0].descrizione, /Gruppo esterno di gonfiaggio/);
  assert.match(out[0].descrizione, /manometro pressione/);
});

// === Intervento 3-bis — didascalia con descrizione contaminata → Dotazioni ===

test('reclassifyContaminatedDidascalie: desc di una riga senza prezzo = prefisso di un\'altra riga → Dotazioni', () => {
  // Come 20100135: etichetta senza prezzo la cui descrizione è la stessa (più
  // corta) di quella della riga proprietaria 20200590.
  const rows = [
    { codice: '90000030', descrizione: 'Gruppo esterno di gonfiaggio tubeless + pedale gonfiaggio', prezzo: null, pagina: '29', review_flag: 'PREZZO_MANCANTE', sezione: 'S1' },
    { codice: '90000031', descrizione: 'Gruppo esterno di gonfiaggio tubeless + pedale gonfiaggio e manometro', prezzo: null, pagina: '31', review_flag: 'PREZZO_MANCANTE;DESCRIZIONE_GRUPPO', sezione: 'S1' }
  ];
  const { rows: kept, dotazioni } = reclassifyContaminatedDidascalie(rows, []);
  // il proprietario (più lungo) resta nel Listino
  assert.deepEqual(kept.map(r => r.codice), ['90000031']);
  // la didascalia va in Dotazioni con descrizione VUOTA
  const d = dotazioni.find(x => x.codice === '90000030');
  assert.ok(d, 'la didascalia contaminata deve essere in Dotazioni');
  assert.equal(d.descrizione, '');
  assert.equal(d.review_flag, 'CODICE_DIDASCALIA');
  assert.equal(d.pagina, '29');
});

test('reclassifyContaminatedDidascalie: NON tocca una riga prezzata (anche se desc coincide)', () => {
  const rows = [
    { codice: '90000032', descrizione: 'Dispositivo combinato', prezzo: 100, pagina: '34', review_flag: '', sezione: 'S1' },
    { codice: '90000033', descrizione: 'Dispositivo combinato completo', prezzo: 200, pagina: '34', review_flag: '', sezione: 'S1' }
  ];
  const { rows: kept, dotazioni } = reclassifyContaminatedDidascalie(rows, []);
  assert.equal(kept.length, 2);       // entrambe prezzate → nessuno spostamento
  assert.equal(dotazioni.length, 0);
});

test('reclassifyContaminatedDidascalie: NON tocca frammenti non-sostanziali né descrizioni isolate', () => {
  const rows = [
    { codice: '90000034', descrizione: '(4 pcs)', prezzo: null, pagina: '46', review_flag: 'PREZZO_MANCANTE;DESC_PARZIALE', sezione: 'S2' },
    { codice: '90000035', descrizione: 'Articolo unico senza gemelli', prezzo: null, pagina: '50', review_flag: 'PREZZO_MANCANTE', sezione: 'S3' },
    { codice: '90000036', descrizione: 'Prodotto prezzato distinto', prezzo: 90, pagina: '50', review_flag: '', sezione: 'S3' }
  ];
  const { rows: kept, dotazioni } = reclassifyContaminatedDidascalie(rows, []);
  assert.equal(kept.length, 3);       // niente prefisso/suffisso condiviso → invariato
  assert.equal(dotazioni.length, 0);
});

test('reclassifyContaminatedDidascalie: match anche come SUFFISSO', () => {
  // Candidato sostanziale (iniziale maiuscola) che è il SUFFISSO della riga
  // proprietaria più lunga.
  const rows = [
    { codice: '90000037', descrizione: 'Combinato per il montaggio dei pneumatici', prezzo: null, pagina: '34', review_flag: 'PREZZO_MANCANTE', sezione: 'S1' },
    { codice: '90000038', descrizione: 'Dispositivo Combinato per il montaggio dei pneumatici', prezzo: 500, pagina: '34', review_flag: '', sezione: 'S1' }
  ];
  const { rows: kept, dotazioni } = reclassifyContaminatedDidascalie(rows, []);
  assert.deepEqual(kept.map(r => r.codice), ['90000038']);
  assert.equal(dotazioni.find(x => x.codice === '90000037').descrizione, '');
});

test('reclassifyContaminatedDidascalie: input difensivo', () => {
  assert.deepEqual(reclassifyContaminatedDidascalie([], []), { rows: [], dotazioni: [] });
  assert.deepEqual(reclassifyContaminatedDidascalie(null, null), { rows: [], dotazioni: [] });
});

// === Disaccoppiamento — descrizione condivisa "a cavallo", prezzo per riga ===

test('propagateFloatingDescriptions: gruppo a 2 con prezzi distinti → desc propagata, prezzi intatti', () => {
  // Come p.54 20100112/20100362: cella-descrizione unica, un prezzo per riga.
  const rows = [
    { codice: 'A1', descrizione: 'Kit radiocomando', prezzo: 3100, pagina: '54', review_flag: '', sezione: 'S1', yAnchor: 607, _descGalleggiante: true },
    { codice: 'A2', descrizione: '',                 prezzo: 5800, pagina: '54', review_flag: '', sezione: 'S1', yAnchor: 635 }
  ];
  const out = propagateFloatingDescriptions(rows);
  assert.equal(out[1].descrizione, 'Kit radiocomando');
  assert.match(out[1].review_flag, /DESCRIZIONE_GRUPPO/);
  assert.equal(out[0].prezzo, 3100);   // prezzi PROPRI intatti (guardia-prezzo)
  assert.equal(out[1].prezzo, 5800);
});

test('propagateFloatingDescriptions: gruppo a 5 con prezzo per riga → tutti descritti, nessun prezzo toccato', () => {
  const rows = [
    { codice: 'B1', descrizione: '',               prezzo: 100, pagina: '54', review_flag: '', sezione: 'S1', yAnchor: 208 },
    { codice: 'B2', descrizione: '',               prezzo: 200, pagina: '54', review_flag: '', sezione: 'S1', yAnchor: 231 },
    { codice: 'B3', descrizione: 'Rullo Tubeless', prezzo: 300, pagina: '54', review_flag: '', sezione: 'S1', yAnchor: 253, _descGalleggiante: true },
    { codice: 'B4', descrizione: '',               prezzo: 400, pagina: '54', review_flag: '', sezione: 'S1', yAnchor: 276 },
    { codice: 'B5', descrizione: '',               prezzo: 500, pagina: '54', review_flag: '', sezione: 'S1', yAnchor: 299 }
  ];
  const out = propagateFloatingDescriptions(rows);
  assert.ok(out.every(r => r.descrizione === 'Rullo Tubeless'));
  assert.deepEqual(out.map(r => r.prezzo), [100, 200, 300, 400, 500]); // ogni prezzo al suo posto
  assert.match(out[0].review_flag, /DESCRIZIONE_GRUPPO/);
  assert.doesNotMatch(out[2].review_flag || '', /DESCRIZIONE_GRUPPO/); // capofila
});

test('propagateFloatingDescriptions: galleria (righe SENZA prezzo) → nessuna propagazione', () => {
  // Codici-didascalia di una pagina-galleria: nessun prezzo proprio → la logica
  // non scatta e non si fabbricano descrizioni da testo di layout.
  const rows = [
    { codice: 'C1', descrizione: 'OPTIONAL', prezzo: null, pagina: '63', review_flag: 'PREZZO_MANCANTE', sezione: 'S2', yAnchor: 496, _descGalleggiante: true },
    { codice: 'C2', descrizione: '',         prezzo: null, pagina: '63', review_flag: 'PREZZO_MANCANTE', sezione: 'S2', yAnchor: 508 }
  ];
  const out = propagateFloatingDescriptions(rows);
  assert.equal(out[1].descrizione, '');            // niente propagazione
  assert.doesNotMatch(out[1].review_flag || '', /DESCRIZIONE_GRUPPO/);
});

test('propagateFloatingDescriptions: descrizione NON galleggiante non cola sui vicini', () => {
  // Una riga con descrizione propria allineata (non _descGalleggiante) non è una
  // cella condivisa: la riga vuota accanto resta vuota.
  const rows = [
    { codice: 'D1', descrizione: 'Prodotto proprio', prezzo: 100, pagina: '1', review_flag: '', sezione: 'S1', yAnchor: 200 },
    { codice: 'D2', descrizione: '',                 prezzo: 200, pagina: '1', review_flag: '', sezione: 'S1', yAnchor: 220 }
  ];
  const out = propagateFloatingDescriptions(rows);
  assert.equal(out[1].descrizione, '');
});

test('propagateFloatingDescriptions: singleton (nessuna riga vuota accanto) → nessuna propagazione', () => {
  const rows = [
    { codice: 'E0', descrizione: 'Sopra', prezzo: 50, pagina: '1', review_flag: '', sezione: 'S1', yAnchor: 180 },
    { codice: 'E1', descrizione: 'Etichetta a cavallo', prezzo: 100, pagina: '1', review_flag: '', sezione: 'S1', yAnchor: 200, _descGalleggiante: true },
    { codice: 'E2', descrizione: 'Sotto', prezzo: 200, pagina: '1', review_flag: '', sezione: 'S1', yAnchor: 220 }
  ];
  const out = propagateFloatingDescriptions(rows);
  assert.equal(out[1].descrizione, 'Etichetta a cavallo'); // invariata
  assert.doesNotMatch(out[0].review_flag || '', /DESCRIZIONE_GRUPPO/);
  assert.doesNotMatch(out[2].review_flag || '', /DESCRIZIONE_GRUPPO/);
});

test('propagateFloatingDescriptions: input difensivo', () => {
  assert.deepEqual(propagateFloatingDescriptions([]), []);
  assert.deepEqual(propagateFloatingDescriptions(null), []);
});

// === Gallerie ACCESSORI STANDARD a colonne → Dotazioni (pagg. 52/63/64) ===

test('stripLayoutNoise: scarta le pseudo-etichette PC / 4x / Diametro Cerchio', () => {
  assert.equal(stripLayoutNoise('PC'), '');
  assert.equal(stripLayoutNoise('4x'), '');
  assert.equal(stripLayoutNoise('Diametro Cerchio 11” - 25”'), '');
  assert.equal(stripLayoutNoise('Diametro Ruota 400'), '');
  // una vera descrizione non viene toccata
  assert.equal(stripLayoutNoise('Pistoletta di gonfiaggio'), 'Pistoletta di gonfiaggio');
});

test('detectSectionColumns: banner a due colonne → due marker con fascia x', () => {
  const items = [
    { str: 'ACCESSORI', x0: 24, x1: 110, top: 394 },
    { str: 'STANDARD',  x0: 112, x1: 141, top: 394 },
    { str: 'OPTIONAL',  x0: 426, x1: 477, top: 394 }
  ];
  const cols = detectSectionColumns(items);
  assert.equal(cols.length, 2);
  const std = cols.find(c => c.text === 'ACCESSORI STANDARD');
  const opt = cols.find(c => c.text === 'OPTIONAL');
  assert.ok(std && opt);
  assert.ok(std.xMin < opt.xMin);        // STANDARD a sinistra
});

test('detectSectionColumns: riconosce la variante "ACCESSORI STANDARD PER COD. NNN"', () => {
  const items = [
    { str: 'ACCESSORI STANDARD PER COD. 03100103', x0: 27, x1: 224, top: 409 },
    { str: 'OPTIONAL', x0: 475, x1: 526, top: 458 }
  ];
  const cols = detectSectionColumns(items);
  assert.ok(cols.some(c => c.text === 'ACCESSORI STANDARD' && Math.round(c.xMin) === 27));
  assert.ok(cols.some(c => c.text === 'OPTIONAL'));
});

test('isInAccStandardColumn: colonna sinistra → true, colonna OPTIONAL destra → false', () => {
  const cols = [
    { text: 'ACCESSORI STANDARD', top: 394, xMin: 24, xMax: 141 },
    { text: 'OPTIONAL', top: 394, xMin: 426, xMax: 477 }
  ];
  assert.equal(isInAccStandardColumn(cols, 477, 255), true);   // codice a sinistra
  assert.equal(isInAccStandardColumn(cols, 477, 480), false);  // codice sotto OPTIONAL
  assert.equal(isInAccStandardColumn(cols, 300, 255), false);  // banner non ancora sopra
  assert.equal(isInAccStandardColumn([], 477, 255), false);
});

test('classifyDidascalie: codice-galleria (hint _boxAccStandard) senza prezzo → Dotazioni, desc vuota', () => {
  const rows = [
    { codice: '90000040', descrizione: '',   prezzo: null, pagina: '52', review_flag: 'PREZZO_MANCANTE', sezione: 'S1', _boxAccStandard: true },
    { codice: '90000041', descrizione: 'PC', prezzo: null, pagina: '63', review_flag: 'PREZZO_MANCANTE', sezione: 'S2', _boxAccStandard: true }
  ];
  const { mainRows, dotazioni } = classifyDidascalie(rows);
  assert.equal(mainRows.length, 0);
  assert.deepEqual(dotazioni.map(d => d.codice).sort(), ['90000040', '90000041']);
  assert.ok(dotazioni.every(d => d.descrizione === '' && d.review_flag === 'CODICE_DIDASCALIA'));
});

test('classifyDidascalie: il box-hint scarta la didascalia-galleria ma la riga prezzata sopravvive', () => {
  // Un codice che compare come didascalia in galleria (p.52) E come riga prezzata
  // altrove (p.54): l'occorrenza-galleria è scartata, quella prezzata resta.
  const rows = [
    { codice: '90000042', descrizione: '',      prezzo: null, pagina: '52', review_flag: 'PREZZO_MANCANTE', sezione: 'S1', _boxAccStandard: true },
    { codice: '90000042', descrizione: 'Rullo', prezzo: 300,  pagina: '54', review_flag: '',                sezione: 'ACC' }
  ];
  const { mainRows, dotazioni } = classifyDidascalie(rows);
  assert.equal(dotazioni.length, 0);       // ha una riga prezzata → resta nel Listino
  assert.equal(mainRows.length, 1);
  assert.equal(mainRows[0].pagina, '54');
});

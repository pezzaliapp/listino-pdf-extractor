// PDF parsing utilities for v4: code/description/price/page extraction with multi-line support.

/**
 * Accept Italian price formats: "2.750,00", "880,00", "1.500", "1.500,00",
 * e — nuovo — "1100,00" (il punto delle migliaia perso dall'estrazione pdf.js,
 * caso reale pagg. 16-17 del PDF di riferimento: "1.000,00" → item "1000,00").
 * Reject:
 *   - "21.100.057" (2+ dots without comma → product code, not a price)
 *   - "21100076"   (digits without separators → product code)
 *   - "36", "880"  (bare integers without separator → could be quantity, year, model)
 *   - "7,5"        (1 sola cifra decimale → peso/misura da tabella tecnica, non prezzo)
 *   - "abc", ""
 */
export function parsePriceString(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim().replace(/[€\s]/g, '');
  if (!t) return null;
  const canonical = /^\d{1,3}(?:\.\d{3})+(?:,\d{2})?$/.test(t); // con punto migliaia
  const small     = /^\d{1,3},\d{2}$/.test(t);                  // sotto 1.000
  const noDots    = /^\d{4,9},\d{2}$/.test(t);                  // punto migliaia perso dal PDF
  if (!canonical && !small && !noDots) return null;
  const dotGroups = t.split('.').length - 1;
  if (dotGroups >= 2 && !t.includes(',')) return null;          // "21.100.057" = codice
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Frammenti di prezzo spezzati da pdf.js ("1." + "100,00", "1" + ".100,00",
 * "1.100" + ",00"): possono essere ricomposti solo se il taglio cade su un
 * separatore (A termina con '.' oppure B inizia con '.' o ',') e la
 * concatenazione è un prezzo valido. Così "36" + "880,00" (quantità+prezzo)
 * non viene mai unito ("36880,00" non parserebbe comunque).
 */
export function canJoinPriceFragments(a, b) {
  const A = String(a ?? '').trim();
  const B = String(b ?? '').trim();
  if (!A || !B) return false;
  if (!/^[\d.]+$/.test(A) || !/^[.,\d]+$/.test(B)) return false;
  if (!(/\.$/.test(A) || /^[.,]/.test(B))) return false;
  return parsePriceString(A + B) !== null;
}

/** Ricompone i prezzi spezzati in un array di token (fase pre-parsing).
    Gestisce anche il taglio in 3 pezzi "1" + "." + "100,00", dove nessuna
    coppia da sola forma un prezzo valido. */
export function recomposeSplitPriceTokens(tokens) {
  if (!Array.isArray(tokens)) return [];
  const out = tokens.slice();
  let i = 0;
  const frag = t => /^[.,\d]+$/.test(String(t ?? '').trim());
  while (i < out.length - 1) {
    const A = String(out[i]).trim();
    const B = String(out[i + 1]).trim();
    if (canJoinPriceFragments(A, B)) {
      out.splice(i, 2, A + B);
      continue; // riprova sulla stessa posizione (cascate "1." "100" ",00")
    }
    if (i + 2 < out.length) {
      const C = String(out[i + 2]).trim();
      if (/^[\d.]+$/.test(A) && frag(B) && frag(C) &&
          (/\.$/.test(A) || /^[.,]/.test(B)) &&
          parsePriceString(A + B + C) !== null) {
        out.splice(i, 3, A + B + C);
        continue;
      }
    }
    i += 1;
  }
  return out;
}

/**
 * Ricompone i prezzi spezzati a livello di text item pdf.js: unisce coppie di
 * item numerici sulla stessa riga visiva (|Δtop| ≤ 2) e orizzontalmente
 * adiacenti (gap x ∈ [-1, 4]pt) quando canJoinPriceFragments approva.
 * Idempotente; iterativo, ricompone anche cascate risolvibili a coppie
 * ("1."+"100"+",00"). Il taglio "1"+"."+"100,00" è coperto solo a livello
 * token da recomposeSplitPriceTokens.
 */
export function coalesceSplitPriceItems(items) {
  if (!Array.isArray(items)) return [];
  let arr = items.filter(Boolean);
  let guard = 0;
  let changed = true;
  while (changed && guard++ < 6) {
    changed = false;
    const sorted = [...arr].sort((a, b) =>
      (Number(a.top) - Number(b.top)) || (Number(a.x0) - Number(b.x0)));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      const ta = Number(a.top), tb = Number(b.top);
      if (!Number.isFinite(ta) || !Number.isFinite(tb) || Math.abs(ta - tb) > 2) continue;
      const gap = Number(b.x0) - Number(a.x1);
      if (!Number.isFinite(gap) || gap < -1 || gap > 4) continue;
      if (!canJoinPriceFragments(a.str, b.str)) continue;
      const merged = { ...a, str: String(a.str).trim() + String(b.str).trim(), x1: b.x1 };
      arr = arr.filter(it => it !== a && it !== b);
      arr.push(merged);
      changed = true;
      break;
    }
  }
  return arr;
}

/**
 * Classifica un token come codice articolo con livello di confidenza.
 *   'high' → numerico 6-13 cifre (anche con punti/spazi interni o '*' finale:
 *            "21.100.057", "25100310*", EAN-13).
 *   'low'  → numerico a 5 cifre, oppure alfanumerico maiuscolo con cifre e
 *            separatori -/., es. "FG192/PS2", "ABC-1234". Le righe con codice
 *            'low' vengono emesse ma flaggate CHECK_CODICE (segnalare, non
 *            indovinare).
 *   null   → non è un codice. Esclusi esplicitamente: prezzi, numero+unità
 *            ("30000N", "80AH"), sigle-modello ("F535S", "AL40", "2450N"),
 *            dimensioni ("16X12X8"), anni a 4 cifre.
 */
export function codeConfidence(s) {
  if (typeof s !== 'string') return null;
  let t = s.trim().replace(/\*+$/, ''); // '*' finale = rimando a nota, non parte del codice
  if (!t) return null;
  const digitsOnly = t.replace(/[\s.]/g, '');
  if (/^\d+$/.test(digitsOnly)) {
    if (digitsOnly.length >= 6 && digitsOnly.length <= 13) return 'high';
    if (digitsOnly.length === 5) return 'low';
    return null;
  }
  if (!/^[A-Z0-9][A-Z0-9./-]{2,14}[A-Z0-9]$/.test(t)) return null;
  if (!/\d/.test(t) || !/[A-Z]/.test(t)) return null;
  if (parsePriceString(t) !== null) return null;
  if (/^\d+(?:[.,]\d+)?[A-Z]{1,3}$/.test(t)) return null;   // "30000N", "2450N", "80AH"
  if (/\d[VAW][-/]/.test(t) || /\d(?:HZ|KW|RPM|BAR|PH)$/.test(t)) return null; // "230V-50/60HZ", "12V/24V"
  if (/^[A-Z]{1,2}\d+[A-Z]{0,3}$/.test(t)) return null;     // sigle modello "F535S", "AL40"
  if (/\dX\d/.test(t)) return null;                          // dimensioni "16X12X8"
  return 'low';
}

export function isProductCode(s) {
  return codeConfidence(s) !== null;
}

/** Una riga è "riga prodotto" se ha almeno un codice 'high', oppure se il
    PRIMO token è un codice 'low' (nei listini il codice apre la riga: così
    "FG192/PS2 ..." conta, ma un "2000S" in mezzo alla descrizione no).
    (Il prezzo può anche arrivare dalla riga successiva, vedi joinMultiLineRows.) */
export function hasProductCode(tokens) {
  if (!Array.isArray(tokens)) return false;
  if (tokens.some(t => codeConfidence(t) === 'high')) return true;
  return tokens.length > 0 && codeConfidence(tokens[0]) === 'low';
}

/** Una riga è "valida e completa" se ha codice E prezzo. */
export function isCompleteProductRow(tokens) {
  if (!Array.isArray(tokens)) return false;
  const codes = tokens.filter(t => isProductCode(t));
  const prices = tokens.map(t => parsePriceString(t)).filter(p => p !== null);
  return codes.length >= 1 && prices.length >= 1;
}

function normalizeCode(token) {
  const t = String(token || '').trim().replace(/\*+$/, '');
  // codici numerici: rimuovi punti/spazi interni ("21.100.057" → "21100057");
  // codici alfanumerici: mantieni i separatori, sono parte del codice.
  return /^[\d\s.]+$/.test(t) ? t.replace(/[\s.]/g, '') : t;
}

function lastValidPrice(tokens) {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const v = parsePriceString(tokens[i]);
    if (v !== null) return { idx: i, value: v };
  }
  return null;
}

function joinTokens(tokens) {
  return tokens.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Unisce le righe di una pagina in righe-prodotto, gestendo descrizioni multi-riga
 * (fino a 3 righe consecutive) come da SPEC v4 §3.3.
 *
 * Input:  linee[]  — array di { tokens: string[] }, già ordinate top→bottom.
 *         pagina   — numero pagina (1-based).
 * Output: array di { codice, descrizione, prezzo, pagina, review_flag }.
 */
export function joinMultiLineRows(linee, pagina) {
  const rows = [];
  // Ricomposizione preventiva dei prezzi spezzati ("1." "100,00" → "1.100,00"):
  // deve avvenire PRIMA di ogni decisione, altrimenti lastValidPrice si ferma
  // sul frammento di destra e perde le migliaia.
  const srcLines = (Array.isArray(linee) ? linee : []).map(L => ({
    tokens: recomposeSplitPriceTokens((L && L.tokens) || [])
  }));
  let i = 0;
  while (i < srcLines.length) {
    const tk = srcLines[i].tokens;

    if (!hasProductCode(tk)) { i += 1; continue; }

    let codeIdx = tk.findIndex(t => codeConfidence(t) === 'high');
    let lowCode = false;
    if (codeIdx === -1) { codeIdx = 0; lowCode = true; } // hasProductCode garantisce tokens[0] 'low'
    const codice = normalizeCode(tk[codeIdx]);
    const pageStr = String(pagina);
    const baseFlags = lowCode ? ['CHECK_CODICE'] : [];

    if (isCompleteProductRow(tk)) {
      const priceInfo = lastValidPrice(tk);
      const desc = joinTokens(tk.slice(codeIdx + 1, priceInfo.idx));
      const flags = [...baseFlags];
      // Frammento orfano con punto finale subito prima del prezzo scelto
      // ("1." "10,00" non ricomponibile): prezzo probabilmente monco → segnala.
      const prev = priceInfo.idx > 0 ? String(tk[priceInfo.idx - 1]) : '';
      if (/^\d{1,3}(?:\.\d{3})*\.$/.test(prev)) flags.push('CHECK_PREZZO');
      rows.push({ codice, descrizione: desc, prezzo: priceInfo.value, pagina: pageStr, review_flag: flags.join(';') });
      i += 1;
      continue;
    }

    const t1 = (i + 1 < srcLines.length) ? srcLines[i + 1].tokens : null;
    const t2 = (i + 2 < srcLines.length) ? srcLines[i + 2].tokens : null;
    const t1Price = t1 ? lastValidPrice(t1) : null;
    const t2Price = t2 ? lastValidPrice(t2) : null;
    const t1HasCode = t1 ? hasProductCode(t1) : false;
    const t2HasCode = t2 ? hasProductCode(t2) : false;

    // Caso B1: 2-line merge (riga successiva senza codice ma con prezzo)
    if (t1 && !t1HasCode && t1Price) {
      const descA = joinTokens(tk.slice(codeIdx + 1));
      const descB = joinTokens(t1.slice(0, t1Price.idx));
      const desc = `${descA} ${descB}`.replace(/\s+/g, ' ').trim();
      rows.push({ codice, descrizione: desc, prezzo: t1Price.value, pagina: pageStr, review_flag: baseFlags.join(';') });
      i += 2;
      continue;
    }

    // Caso B2: 3-line merge (L1 continuazione pura, L2 con prezzo, nessuna delle 2 ha codice)
    if (t1 && !t1HasCode && !t1Price && t2 && !t2HasCode && t2Price) {
      const descA = joinTokens(tk.slice(codeIdx + 1));
      const descB = joinTokens(t1);
      const descC = joinTokens(t2.slice(0, t2Price.idx));
      const desc = `${descA} ${descB} ${descC}`.replace(/\s+/g, ' ').trim();
      rows.push({ codice, descrizione: desc, prezzo: t2Price.value, pagina: pageStr, review_flag: baseFlags.join(';') });
      i += 3;
      continue;
    }

    // Caso C: codice senza prezzo determinabile → CHECK
    const desc = joinTokens(tk.slice(codeIdx + 1));
    rows.push({ codice, descrizione: desc, prezzo: null, pagina: pageStr, review_flag: ['CHECK', ...baseFlags].join(';') });
    i += 1;
  }
  return rows;
}

/** Aggregazione multi-pagina: per ogni codice, concatena pagine, mantiene primo
 *  prezzo valido e flagga prezzi difformi tra occorrenze diverse. */
export function aggregateAcrossPages(rowsByPage) {
  const map = new Map();
  for (const r of rowsByPage) {
    const k = r.codice;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  const out = [];
  for (const [, occurrences] of map.entries()) {
    const valid = occurrences.filter(o => o.prezzo !== null);
    const base = valid.length ? { ...valid[0] } : { ...occurrences[0] };
    const allPages = [];
    for (const o of occurrences) {
      const ps = String(o.pagina || '').split(',').map(s => s.trim()).filter(Boolean);
      for (const p of ps) if (!allPages.includes(p)) allPages.push(p);
    }
    base.pagina = allPages.join(', ');
    const distinctPrices = [...new Set(valid.map(o => o.prezzo))];
    if (distinctPrices.length > 1) base.review_flag = 'CHECK_PREZZO_DIFFORME';
    out.push(base);
  }
  return out;
}

// === Pattern A — codici-didascalia (box "ACCESSORI STANDARD") ===

const ACCESSORI_STD_RE = /ACCESSORI STANDARD/i;

function _isNoPrice(row) {
  return !row || row.prezzo === null || row.prezzo === undefined || row.prezzo === '';
}

/** True se la descrizione è "degenerata": vuota o composta soltanto da
 *  punteggiatura/parentesi/spazi (es. "", "( )", "()", "- -"). Sono le
 *  didascalie-badge dei box ACCESSORI STANDARD (codice sotto la foto,
 *  marchio CE "( )"), mai vere righe di listino. */
export function isDegenerateDesc(desc) {
  const t = String(desc == null ? '' : desc).trim();
  if (!t) return true;
  return t.replace(/[^0-9A-Za-zÀ-ÿ]/g, '') === '';
}

function _distinctPages(occs) {
  const pages = [];
  for (const o of occs) {
    for (const p of String(o.pagina || '').split(',').map(s => s.trim()).filter(Boolean)) {
      if (!pages.includes(p)) pages.push(p);
    }
  }
  return pages;
}

/** True se la descrizione ha l'aria di un vero nome-prodotto: la prima lettera
 *  (ignorando punteggiatura/parentesi/cifre iniziali) è MAIUSCOLA. Le vere righe
 *  di listino aprono con una maiuscola ("BETA SYSTEM", "Pinza"); i frammenti che
 *  colano sulle didascalie iniziano in minuscola ("gonfiaggio tubeless",
 *  "capacità coni"). Serve a distinguere una didascalia-badge da un membro di
 *  matrice (Pattern B) che aspetta ancora prezzo/descrizione. */
export function isSubstantialDesc(desc) {
  const t = String(desc == null ? '' : desc).trim();
  const m = t.match(/[A-Za-zÀ-ÿ]/);
  if (!m) return false;
  const ch = m[0];
  return ch === ch.toUpperCase() && ch !== ch.toLowerCase();
}

/** Rimuove da una descrizione il "rumore di layout" che cola sulle didascalie
 *  dei box ACCESSORI STANDARD: la parola-marker di sezione ("OPTIONAL",
 *  "ACCESSORI STANDARD"…), le note-quantità "(3 pcs)" e le note-dimensione
 *  "Ø mm 145". Serve a valutare se resta una VERA descrizione: un frammento
 *  come "OPTIONAL" o "Ø mm 58 Ø mm 74" inizia con una maiuscola ma non è un
 *  nome-prodotto, quindi non deve salvare il codice dalla sezione Dotazioni. */
export function stripLayoutNoise(desc) {
  return String(desc == null ? '' : desc)
    .replace(/Ø\s*mm\s*\d+/gi, ' ')                            // note dimensione (Ø non-ASCII: niente \b)
    .replace(/\(\s*\d+\s*pcs?\s*\)/gi, ' ')                    // note quantità "(3 pcs)"
    .replace(/\b(?:ACCESSORI\s+STANDARD|ACCESSORI\s+OPTIONAL|OPTIONAL\s+CONSIGLIATI|OPTIONAL)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pattern A — separa le occorrenze-didascalia (righe pre-aggregazione, ognuna
 * su una sola pagina) dalle vere righe di listino.
 *
 * Un'occorrenza è didascalia quando NON ha prezzo sulla propria banda e:
 *   - sta nel riquadro ACCESSORI STANDARD (sezione contiene "ACCESSORI
 *     STANDARD"): sono le foto con il codice stampato sotto, dotazione di
 *     serie e non articolo prezzato; OPPURE
 *   - il codice è un "badge" ricorrente: mai prezzato in tutto il PDF, con
 *     descrizione sempre degenerata (es. marchio CE "( )") e presente su ≥ 3
 *     pagine. Copre i badge fuori da una sezione ACCESSORI STANDARD nominata
 *     (es. 41100028 con sezione = titolo pagina grezzo).
 *
 * Esiti per codice:
 *   - se resta almeno un'occorrenza NON didascalia (vera riga, magari senza
 *     prezzo perché completata più avanti da Pattern B), le didascalie vengono
 *     semplicemente scartate e il codice prosegue verso il Listino;
 *   - se TUTTE le occorrenze sono didascalia, il codice non è mai una riga di
 *     listino: finisce in `dotazioni` con flag CODICE_DIDASCALIA e l'elenco di
 *     pagine e sezioni (macchine) in cui compare.
 *
 * Ritorna { mainRows, dotazioni }. `mainRows` va aggregato e mandato al
 * Listino; `dotazioni` popola il foglio "Dotazioni standard". Le didascalie
 * NON entrano nel denominatore dei prezzi mancanti (sono escluse da mainRows).
 */
export function classifyDidascalie(allRows) {
  const rows = Array.isArray(allRows) ? allRows : [];
  const byCode = new Map();
  for (const r of rows) {
    if (!r) continue;
    if (!byCode.has(r.codice)) byCode.set(r.codice, []);
    byCode.get(r.codice).push(r);
  }

  // Codici-didascalia "interi": mai prezzati in tutto il PDF e senza NESSUNA
  // descrizione sostanziale (nome-prodotto con l'iniziale maiuscola). Due firme:
  //   - compaiono nel box ACCESSORI STANDARD (dotazione di serie mostrata come
  //     foto+codice) — es. 21100076, 41100028 (marchio CE "( )" che cola su più
  //     schede); OPPURE
  //   - sono badge ricorrenti sempre degenerati su ≥ 3 pagine, anche fuori da
  //     una sezione ACCESSORI STANDARD nominata.
  // La condizione "nessuna descrizione sostanziale" evita di catturare i membri
  // di matrice (Pattern B), la cui riga vera apre con una maiuscola
  // ("BETA SYSTEM …") e attende solo che il prezzo del gruppo venga propagato.
  const captionCodes = new Set();
  for (const [code, occs] of byCode.entries()) {
    const neverPriced = occs.every(_isNoPrice);
    if (!neverPriced) continue;
    // Una descrizione "salva" il codice dalla sezione Dotazioni solo se è un
    // vero nome-prodotto: i frammenti di layout (marker di sezione, note
    // quantità/dimensione) che colano sulle didascalie del box vengono tolti
    // prima del controllo, così l'INTERO box ACCESSORI STANDARD va in Dotazioni
    // anche quando su una scheda ripetuta un codice ha raccolto "OPTIONAL" o
    // "Ø mm 145".
    const hasSubstantial = occs.some(o => isSubstantialDesc(stripLayoutNoise(o.descrizione)));
    if (hasSubstantial) continue;
    const inAccStandard = occs.some(o => ACCESSORI_STD_RE.test(String(o.sezione || '')));
    const allDegenerate = occs.every(o => isDegenerateDesc(o.descrizione));
    const badgeByRepetition = allDegenerate && _distinctPages(occs).length >= 3;
    if (inAccStandard || badgeByRepetition) captionCodes.add(code);
  }

  const mainRows = [];
  const captionByCode = new Map();
  for (const r of rows) {
    const isCaption = captionCodes.has(r.codice) ||
      (_isNoPrice(r) && ACCESSORI_STD_RE.test(String(r.sezione || '')));
    if (isCaption) {
      if (!captionByCode.has(r.codice)) captionByCode.set(r.codice, []);
      captionByCode.get(r.codice).push(r);
    } else {
      mainRows.push(r);
    }
  }

  const mainCodes = new Set(mainRows.map(r => r.codice));
  const dotazioni = [];
  for (const [code, occs] of captionByCode.entries()) {
    if (mainCodes.has(code)) continue; // il codice ha comunque una vera riga → didascalie scartate
    const firstInfo = occs.map(o => String(o.descrizione || '').trim())
      .find(d => d && !isDegenerateDesc(d)) || '';
    const sezioni = [];
    for (const o of occs) {
      const s = String(o.sezione || '').trim();
      if (s && !sezioni.includes(s)) sezioni.push(s);
    }
    dotazioni.push({
      codice: code,
      descrizione: firstInfo,
      prezzo: null,
      pagina: _distinctPages(occs).join(', '),
      review_flag: 'CODICE_DIDASCALIA',
      sezione: sezioni.join('; ')
    });
  }
  dotazioni.sort((a, b) => a.codice.localeCompare(b.codice));
  return { mainRows, dotazioni };
}

// === pdf.js layer ===

/**
 * M2 — Detection automatica delle fasce X di una pagina-tabella.
 * Input: array di item { str, x0, x1 } (forma normalizzata, derivata altrove
 *        dai text item di pdfjs).
 * Output: { code, descrizione, prezzo, compatibilita, noteLaterali } dove
 *         ogni fascia è una coppia [xMin, xMax]. `null` se mancano
 *         abbastanza ancore (codici 8 cifre + prezzi).
 *
 * Le fasce sono ricavate da:
 *   - xCodeLeft  = moda(x0) dei codici 8 cifre
 *   - xPriceLeft = moda(x0) dei prezzi italiani (1.234,56[ €])
 *   - xPriceRight= moda(x1) dei prezzi
 */
export function computeColumnBands(items, pageWidth = Infinity) {
  if (!Array.isArray(items) || !items.length) return null;
  const priceRe = /^\d{1,3}(?:\.\d{3})*,\d{2}(?:\s*€)?$/;
  const codeRe = /^\d{6,13}\*?$/;
  const prices = [];
  const codes = [];
  for (const it of items) {
    if (!it) continue;
    const t = String(it.str || '').trim();
    if (!t) continue;
    if (priceRe.test(t)) prices.push(it);
    else if (codeRe.test(t)) codes.push(it);
  }
  if (!prices.length || !codes.length) return null;
  const xPriceLeft  = _modeOfRounded(prices.map(it => it.x0));
  const xPriceRight = _modeOfRounded(prices.map(it => it.x1));
  const xCodeLeft   = _modeOfRounded(codes.map(it => it.x0));
  // Bordo destro della colonna codici: x1 modale dei soli codici allineati
  // alla colonna (x0 ≈ modale). Con il vecchio x0+60 fisso, il testo che
  // inizia subito dopo il codice — tipicamente il NOME DEL MODELLO — cadeva
  // dentro la banda code e veniva scartato dalla descrizione.
  const aligned = codes.filter(it => Math.abs(Math.round(it.x0) - xCodeLeft) <= 2);
  const xCodeRightRaw = _modeOfRounded((aligned.length ? aligned : codes).map(it => it.x1));
  const xCodeRight = Math.min(Math.max(xCodeRightRaw + 4, xCodeLeft + 20), xCodeLeft + 60);
  return {
    code:          [xCodeLeft - 5, xCodeRight],
    descrizione:   [xCodeRight, xPriceLeft - 10],
    prezzo:        [xPriceLeft - 10, xPriceRight + 10],
    compatibilita: [xPriceRight + 10, pageWidth],
    noteLaterali:  [0, xCodeLeft - 5],
    _anchors: { xCodeLeft, xPriceLeft, xPriceRight }
  };
}

function _modeOfRounded(values) {
  const ints = values
    .filter(v => typeof v === 'number' && Number.isFinite(v))
    .map(v => Math.round(v));
  if (!ints.length) return 0;
  const counts = new Map();
  for (const v of ints) counts.set(v, (counts.get(v) || 0) + 1);
  let modal = ints[0];
  let best = 0;
  for (const [v, n] of counts.entries()) {
    // A parità di frequenza vince il valore più piccolo: nelle pagine con
    // codici sparsi (es. box OPTIONAL a destra) la colonna codici vera è
    // quella più a sinistra; il primo-visto renderebbe le fasce instabili.
    if (n > best || (n === best && v < modal)) { best = n; modal = v; }
  }
  return modal;
}

/**
 * M9 — Pattern noti delle "note laterali" (marker quantità/dimensioni a sinistra
 * della colonna codice). Esportati per riuso/test.
 */
export const SIDE_NOTE_PATTERNS = [
  /^x\d+$/,            // x4, x12, x24
  /^\(\d+\s*pcs?\)$/,  // (2pcs), (3pc), (15pcs)
  /^Ø\s*mm\s*\d+$/     // Ømm58, Ømm145
];

/**
 * M9 — Filtro note laterali.
 * Rimuove i text item che cadono nella `FASCIA_NOTE_LATERALI` (calcolata da
 * computeColumnBands), sono brevi (length ≤ 6) e matchano uno dei pattern
 * noti di SIDE_NOTE_PATTERNS. Tutti gli altri item vengono mantenuti.
 *
 * Nota: la SPEC §M9 fissa il limite a length ≤ 6. Stringhe più lunghe come
 * "(2 pcs)" con spazio (7 char) o "Ø mm 58" (7 char) non vengono filtrate
 * con questa soglia: è una scelta volutamente conservativa.
 */
export function filterSideNotes(items, noteLateraliBand) {
  if (!Array.isArray(items)) return [];
  if (!Array.isArray(noteLateraliBand) || noteLateraliBand.length !== 2) return items;
  const [xMin, xMax] = noteLateraliBand;
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) return items;
  return items.filter(it => {
    if (!it) return false;
    const t = String(it.str || '').trim();
    if (!t) return true;
    const x0 = Number(it.x0);
    if (!Number.isFinite(x0)) return true;
    const inBand = x0 >= xMin && x0 < xMax;
    if (!inBand) return true;
    if (t.length > 6) return true;
    const isNote = SIDE_NOTE_PATTERNS.some(re => re.test(t));
    return !isNote;
  });
}

/**
 * M3 — Filtro header verticale (rotated header).
 * Identifica i text item che sono caratteri 1-2 di intestazioni di colonna
 * ruotate 90° (es. "MODELLO-X 2000S" sparpagliato come singole lettere
 * sopra la prima riga di dati). Criteri (pseudocodifica SPEC §M3):
 *   - top < firstAnchorTop - 5     (sopra il primo codice della pagina,
 *                                   in coord display-top: piccolo = alto)
 *   - str.length <= 2
 *   - (x1 - x0) < 12pt
 * Ritorna la lista degli item NON marcati come header verticale.
 * Se firstAnchorTop non è fornito, ritorna gli item invariati.
 */
export function filterVerticalHeaders(items, firstAnchorTop) {
  if (!Array.isArray(items)) return [];
  if (typeof firstAnchorTop !== 'number' || !Number.isFinite(firstAnchorTop)) return items;
  return items.filter(it => {
    if (!it) return false;
    const t = String(it.str || '');
    const w = (Number(it.x1) || 0) - (Number(it.x0) || 0);
    const top = Number(it.top);
    if (!Number.isFinite(top)) return true;
    const isHeader = top < firstAnchorTop - 5 && t.length <= 2 && w < 12;
    return !isHeader;
  });
}

/**
 * M8 — bucket Y proporzionale al font dominante.
 * Filtra i font del corpo (6-12pt, esclude header e icone), prende la moda
 * arrotondata e ritorna moda*0.4. Cade su `fallback` (2pt) se non trova
 * font del corpo.
 */
export function computeYBucket(fontSizes, fallback = 2) {
  if (!Array.isArray(fontSizes) || !fontSizes.length) return fallback;
  const bodyFonts = fontSizes
    .filter(s => typeof s === 'number' && s >= 6 && s <= 12)
    .map(s => Math.round(s));
  if (!bodyFonts.length) return fallback;
  const counts = new Map();
  for (const s of bodyFonts) counts.set(s, (counts.get(s) || 0) + 1);
  let modal = bodyFonts[0];
  let best = 0;
  for (const [s, n] of counts.entries()) {
    if (n > best) { best = n; modal = s; }
  }
  return modal * 0.4;
}

export function groupItemsByLine(items, yTolerance = 2) {
  const lines = [];
  for (const item of items) {
    if (!item || !item.str) continue;
    const y = Math.round(item.transform[5]);
    const x = item.transform[4];
    const size = Math.abs(item.transform[0]);
    let line = lines.find(l => Math.abs(l.y - y) <= yTolerance);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push({ str: item.str, x, size });
  }
  lines.sort((a, b) => b.y - a.y);
  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines;
}

function lineToTokens(line) {
  const text = line.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
  return text.split(/\s+/).filter(Boolean);
}

/**
 * M4 — Whitelist di stringhe icona presenti nei badge grafici del PDF di riferimento.
 * Usata da stripIconText con due criteri distinti (per-item e sequenza).
 */
export const ICON_STRINGS = new Set([
  'AUTO', 'LASER', 'STOP', 'NLS', 'ESD', 'RLC', 'SONAR',
  'NEW', 'MOBILE SERVICE', 'GT', 'BAS',
  'VD', 'VDL', 'VDLL', 'VDBL',
  'B', 'P', 'L', 'A', 'C', 'MI'
]);

// Per la fase 2 (rilevamento di run di char singoli) consideriamo solo le
// icone di length ≥ 3 una volta rimossi gli spazi. Le icone di 1-2 char
// causerebbero troppi falsi positivi se cercate dentro una sequenza arbitraria.
const _ICON_STRINGS_NOSPACE_GE3 = [...ICON_STRINGS]
  .map(s => s.replace(/\s+/g, ''))
  .filter(s => s.length >= 3);

/**
 * M4 — Filtro icone testuali. Due fasi indipendenti, accumulate in un solo
 * removeSet poi applicate sull'array originale.
 *
 *  Fase 1 (per-item):  un item con `length ≤ 3 AND width < 20pt AND str ∈ ICON_STRINGS`
 *                      è un'icona isolata → rimossa.
 *  Fase 2 (sequenza):  un run di ≥ 3 item consecutivi con `length === 1` la cui
 *                      concatenazione (forward o reverse) contiene un'icona di
 *                      length ≥ 3 viene rimosso integralmente.
 *
 * Le due fasi NON dipendono dall'ordine: la fase 1 non può "consumare" lettere
 * che servono alla fase 2 perché entrambe leggono dalla stessa lista originale.
 *
 * LIMITE NOTO: non gestisce stringhe multi-char già reversed dal PDF transform
 * (es. 'ECIVRE' per 'SERVICE', pattern P4 SPEC v5 pag. 25). Coperti: char
 * singoli sparsi su una o due y vicine.
 */
export function stripIconText(items) {
  if (!Array.isArray(items)) return [];
  const removeSet = new Set();

  // Fase 1: icone isolate corte. "Isolata" = nessun altro item di testo
  // sulla stessa riga visiva (|Δtop| ≤ 4) adiacente in orizzontale
  // (gap < 12pt): le parole vere ("con NLS, Sollevatore") hanno sempre
  // vicini di riga, le icone-badge vivono da sole.
  const textItems = items.filter(x => x && String(x.str || '').trim());
  for (const it of textItems) {
    const t = String(it.str || '').trim();
    if (t.length > 3) continue;
    if (!ICON_STRINGS.has(t)) continue;
    const w = Number(it.x1) - Number(it.x0);
    if (!(Number.isFinite(w) && w < 20)) continue;
    // I char singoli (B, P, L…) sono badge anche se adiacenti al testo:
    // per loro vale la regola storica. L'eccezione-vicinato si applica ai
    // token di 2+ lettere (NLS, RLC…), che possono essere parole vere.
    if (t.length === 1) { removeSet.add(it); continue; }
    const hasNeighbor = textItems.some(o => {
      if (o === it) return false;
      if (Math.abs(Number(o.top) - Number(it.top)) > 4) return false;
      const gap = Math.max(Number(it.x0) - Number(o.x1), Number(o.x0) - Number(it.x1));
      return gap < 12;
    });
    if (!hasNeighbor) removeSet.add(it);
  }

  // Fase 2: run di char singoli che spellano un'icona
  const sorted = [...items]
    .filter(it => it && typeof it.str === 'string')
    .sort((a, b) => (Number(a.top) - Number(b.top)) || (Number(a.x0) - Number(b.x0)));
  let i = 0;
  while (i < sorted.length) {
    if (String(sorted[i].str).trim().length !== 1) { i++; continue; }
    let j = i;
    while (j < sorted.length && String(sorted[j].str).trim().length === 1) j++;
    if (j - i >= 3) {
      const run = sorted.slice(i, j);
      const fwd = run.map(r => r.str).join('');
      const rev = [...fwd].reverse().join('');
      const hit = _ICON_STRINGS_NOSPACE_GE3.some(icon => fwd.includes(icon) || rev.includes(icon));
      if (hit) for (const r of run) removeSet.add(r);
    }
    i = j;
  }

  return items.filter(it => !removeSet.has(it));
}

// === M1 — anchor-first row-band extraction ===

/**
 * M1 — Normalizza un text item raw di pdfjs-dist nello shape comune
 * { str, x0, x1, top, bottom, fontSize }, con `top` in coord display-top
 * (pageHeight - yBaseline - height) compatibile con M3 (smaller = higher).
 */
export function normalizePdfjsItem(rawItem, pageHeight) {
  if (!rawItem || typeof rawItem.str !== 'string') return null;
  const transform = rawItem.transform;
  if (!Array.isArray(transform) || transform.length < 6) return null;
  const x0 = Number(transform[4]);
  const yBaseline = Number(transform[5]);
  if (!Number.isFinite(x0) || !Number.isFinite(yBaseline)) return null;
  const fontSize = Math.abs(Number(transform[0])) || 0;
  const width = Number(rawItem.width) || 0;
  const height = Number(rawItem.height) || fontSize;
  const ph = Number.isFinite(pageHeight) ? pageHeight : 0;
  return {
    str: rawItem.str,
    x0,
    x1: x0 + width,
    top: ph - (yBaseline + height),
    bottom: ph - yBaseline,
    fontSize
  };
}

/**
 * M1 — Estrae gli anchor (codici 8 cifre) dagli item normalizzati,
 * ordinati per `top` crescente (visual top → bottom).
 */
export function extractAnchors(items) {
  if (!Array.isArray(items)) return [];
  const cand = [];
  for (const it of items) {
    if (!it || typeof it.str !== 'string') continue;
    const t = it.str.trim();
    const confidence = codeConfidence(t);
    if (!confidence) continue;
    const top = Number(it.top);
    if (!Number.isFinite(top)) continue;
    cand.push({ codice: normalizeCode(t), top, item: it, confidence });
  }
  const high = cand.filter(c => c.confidence === 'high');
  const low = cand.filter(c => c.confidence === 'low');
  const out = [...high];
  // Gating posizionale: i candidati 'low' ("FG192/PS2", 5 cifre) diventano
  // anchor solo se allineati alla colonna codici — cioè alla x0 modale degli
  // anchor 'high', o in assenza di questi alla x0 modale condivisa da almeno
  // 2 candidati 'low'. Evita che sigle in mezzo alle descrizioni spezzino le
  // bande. Le righe con anchor 'low' escono comunque flaggate CHECK_CODICE.
  if (low.length) {
    const xs = arr => arr.map(c => Number(c.item && c.item.x0)).filter(Number.isFinite);
    let xRef = null;
    const hx = xs(high);
    if (hx.length) {
      xRef = _modeOfRounded(hx);
    } else {
      const lx = xs(low).map(v => Math.round(v));
      const counts = new Map();
      for (const v of lx) counts.set(v, (counts.get(v) || 0) + 1);
      for (const [v, n] of counts.entries()) {
        if (n >= 2 && (xRef === null || n > counts.get(xRef))) xRef = v;
      }
    }
    if (xRef !== null) {
      for (const c of low) {
        const x0 = Number(c.item && c.item.x0);
        if (Number.isFinite(x0) && Math.abs(x0 - xRef) <= 6) out.push(c);
      }
    }
  }
  out.sort((a, b) => a.top - b.top);
  return out;
}

/**
 * M1 — Calcola le bande verticali per anchor:
 *   yTop[i]    = (anchors[i-1].top + anchors[i].top) / 2  (o pageTop)
 *   yBottom[i] = (anchors[i].top + anchors[i+1].top) / 2  (o pageBottom)
 */
export function buildBandsFromAnchors(anchors, pageTop = 0, pageBottom = Infinity) {
  if (!Array.isArray(anchors) || !anchors.length) return [];
  const bands = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const yTop = i === 0 ? pageTop : (anchors[i - 1].top + a.top) / 2;
    const yBottom = i === anchors.length - 1 ? pageBottom : (a.top + anchors[i + 1].top) / 2;
    bands.push({ codice: a.codice, anchor: a, yTop, yBottom });
  }
  return bands;
}

/** M1 — Filtra gli item la cui `top` cade in [yTop, yBottom). */
export function collectBandItems(items, band) {
  if (!Array.isArray(items) || !band) return [];
  const { yTop, yBottom } = band;
  if (!Number.isFinite(yTop) || !Number.isFinite(yBottom)) return [];
  return items.filter(it => {
    if (!it) return false;
    const t = Number(it.top);
    if (!Number.isFinite(t)) return false;
    return t >= yTop && t < yBottom;
  });
}

/** M1 — Classifica un item per fascia X usando le bande di M2. */
export function classifyXBand(item, columnBands) {
  if (!item || !columnBands) return null;
  const x0 = Number(item.x0);
  if (!Number.isFinite(x0)) return null;
  const inBand = (b) => Array.isArray(b) && b.length === 2 && x0 >= b[0] && x0 < b[1];
  if (inBand(columnBands.code)) return 'code';
  if (inBand(columnBands.descrizione)) return 'descrizione';
  if (inBand(columnBands.prezzo)) return 'prezzo';
  if (inBand(columnBands.compatibilita)) return 'compatibilita';
  if (inBand(columnBands.noteLaterali)) return 'noteLaterali';
  return null;
}

/**
 * Pattern C — banner grafico ricorrente "ACCESSORI OPTIONAL a pag. N", presente
 * su quasi ogni scheda prodotto: non è una descrizione e va rimosso. Il match è
 * mirato (parola-banner + "a pag." + numero) per non toccare le vere righe di
 * listino con parole simili — es. 20100334 "Nuovo dispositivo per avere più luce
 * sul tuo lavoro (su richiesta, se specificato all'ordine)", che NON contiene il
 * banner e resta intatta.
 */
export const BANNER_OPTIONAL_RE = /ACCESSORI OPTIONAL a pag\.?\s*\d+/ig;

/** Rimuove il banner Pattern C da una descrizione già composta. */
export function stripOptionalBanner(desc) {
  return String(desc == null ? '' : desc)
    .replace(BANNER_OPTIONAL_RE, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

/**
 * Sezioni-appendice che NON sono listino: tabelle riassuntive (pesi e misure
 * degli imballi) senza codice/prezzo per riga. L'unica "riga" che il parser vi
 * aggancia raccoglie l'intera tabella come descrizione (es. la sezione
 * "DIMENSIONI IMBALLI"): va filtrata come un banner, non emessa nel Listino.
 */
export const EXCLUDED_SECTION_RE = /DIMENSIONI\s+IMBALL/i;

/** True se la sezione della riga appartiene a un'appendice tabellare da NON
 *  emettere come riga di listino. */
export function isExcludedSection(sezione) {
  return EXCLUDED_SECTION_RE.test(String(sezione == null ? '' : sezione));
}

/**
 * M1 — Costruisce una riga prodotto dalla banda di un anchor.
 *  - descrizione: concatenazione (top↑, x0↑) degli item in fascia 'descrizione'
 *  - prezzo: primo prezzo valido in fascia 'prezzo' (parsePriceString)
 *  - review_flag: 'MULTI_PRICE' se >1 prezzi distinti, altrimenti
 *                 'PREZZO_MANCANTE' se nessun prezzo valido, altrimenti vuoto.
 *
 * Se columnBands è null (pagina senza struttura tabellare riconoscibile),
 * fallback: prova prima parsePriceString, poi tratta come descrizione.
 */
export function emitRowFromBand(anchor, bandItems, columnBands, pageNum) {
  if (!anchor) return null;
  // Ricomposizione dei prezzi spezzati DENTRO la banda: senza, "1." "100,00"
  // farebbe scegliere 100 perdendo le migliaia. Il coalescing non tocca mai
  // l'item-anchor (un codice non è mai un frammento di prezzo).
  const items = coalesceSplitPriceItems(Array.isArray(bandItems) ? bandItems : []);
  // Ordina per RIGA VISIVA e poi per x: pdf.js assegna alla stessa riga top
  // che differiscono di ~1pt e l'ordinamento puro (top, x0) rimescola le
  // parole ("1ph 230V" prima di "con NLS"). Le righe si individuano
  // clusterizzando i top: un salto > 4pt apre una nuova riga.
  const tops = [...new Set(items.map(it => Number(it.top)).filter(Number.isFinite))].sort((a, b) => a - b);
  const lineOf = new Map();
  let line = 0;
  for (let i = 0; i < tops.length; i++) {
    if (i > 0 && tops[i] - tops[i - 1] > 4) line++;
    lineOf.set(tops[i], line);
  }
  const sorted = [...items].sort((a, b) =>
    ((lineOf.get(Number(a.top)) ?? 0) - (lineOf.get(Number(b.top)) ?? 0)) ||
    (a.x0 - b.x0) || (a.top - b.top));
  const descItems = [];
  let prezzo = null;
  let prezzoTop = null;
  let multiPrice = false;
  let priceFragmentLeftover = false;

  for (const it of sorted) {
    if (it === anchor.item) continue;
    const t = String(it.str || '').trim();
    if (!t) continue;
    if (/^\d{6,13}\*?$/.test(t)) continue; // un altro anchor finito qui per sbaglio

    if (columnBands) {
      let cls = classifyXBand(it, columnBands);
      // I prezzi sono allineati a destra: i più lunghi ("1.000,00") iniziano
      // a sinistra della banda calcolata sulla moda delle x0 e finirebbero in
      // 'descrizione' o 'code'. Se l'item parsa come prezzo e la sua x1 è sul
      // bordo destro della colonna prezzi, è un prezzo.
      const xPR = Number(columnBands._anchors && columnBands._anchors.xPriceRight);
      if (cls !== 'prezzo' && Number.isFinite(xPR) &&
          Math.abs(Number(it.x1) - xPR) <= 12 && parsePriceString(t) !== null) {
        cls = 'prezzo';
      }
      if (cls === 'prezzo') {
        const v = parsePriceString(t);
        if (v !== null) {
          if (prezzo === null) { prezzo = v; prezzoTop = Number(it.top); }
          else if (v !== prezzo) multiPrice = true;
        } else if (/^[\d.,]+$/.test(t) && /[.,]/.test(t)) {
          // frammento numerico non ricomponibile nella colonna prezzo
          // (contiene un separatore: "1.", ",00"): il prezzo scelto
          // potrebbe essere monco → segnalare. Gli interi nudi ("1550")
          // sono misure di tabelle tecniche, non frammenti.
          priceFragmentLeftover = true;
        }
      } else if (cls === 'descrizione') {
        // Testo a corpo molto più piccolo di quello della riga (tabelle
        // dati tecnici, note a piè di tabella) non è descrizione prodotto.
        const afs = Number(anchor.item && anchor.item.fontSize);
        const ifs = Number(it.fontSize);
        if (Number.isFinite(afs) && Number.isFinite(ifs) && ifs < afs - 1.2) continue;
        descItems.push(it);
      }
      // 'code' | 'compatibilita' | 'noteLaterali' | null → skip
    } else {
      // Fallback senza bande: parsiamo come prezzo o descrizione in base al contenuto
      const v = parsePriceString(t);
      if (v !== null) {
        if (prezzo === null) prezzo = v;
        else if (v !== prezzo) multiPrice = true;
      } else if (/^\d{1,3}(?:\.\d{3})*\.$/.test(t)) {
        priceFragmentLeftover = true; // orfano tipo "1." → non inquinare la descrizione
      } else {
        descItems.push(it);
      }
    }
  }

  // M4 — strip icon text dai descItems prima di comporre la descrizione
  const cleanDescItems = stripIconText(descItems);
  const descrizione = stripOptionalBanner(cleanDescItems
    .map(it => String(it.str || '').trim())
    .filter(Boolean)
    .join(' '));  // Pattern C — via il banner "ACCESSORI OPTIONAL a pag. N"

  const flags = [];
  if (multiPrice) flags.push('MULTI_PRICE');
  else if (prezzo === null) flags.push('PREZZO_MANCANTE');
  else if (priceFragmentLeftover) flags.push('CHECK_PREZZO');
  if (anchor.confidence === 'low') flags.push('CHECK_CODICE');
  const review_flag = flags.join(';');

  const row = {
    codice: anchor.codice,
    descrizione,
    prezzo,
    pagina: String(pageNum),
    review_flag
  };
  // Hint interno per mergeMultiCodeRows: prezzo che "galleggia" sopra la
  // riga dell'anchor = contenuto di una cella verticale condivisa con la
  // riga precedente (rowspan). Non finisce nell'Excel.
  // Proprietà normale (le clonazioni {...row} a valle devono conservarla);
  // viene strippata insieme a yAnchor prima dell'output finale.
  if (prezzo !== null && Number.isFinite(prezzoTop) &&
      Number.isFinite(Number(anchor.top)) && prezzoTop < Number(anchor.top) - 4) {
    row._prezzoGalleggiante = true;
  }
  return row;
}

// === M6 — Section detection ===

const SECTION_MARKERS = new Set([
  'ACCESSORI STANDARD',
  'OPTIONAL',
  'OPTIONAL CONSIGLIATI',
  'ACCESSORI OPTIONAL'
]);

/**
 * M6 — Estrae il titolo pagina (font > 16pt nella fascia top < 80pt).
 * Ritorna stringa trimmata o '' se non riconosciuto. Mai null/undefined.
 */
export function detectPageTitle(items) {
  if (!Array.isArray(items)) return '';
  const candidates = [];
  for (const it of items) {
    if (!it || typeof it.str !== 'string') continue;
    const t = it.str.trim();
    if (!t) continue;
    const fs = Number(it.fontSize);
    const top = Number(it.top);
    if (!Number.isFinite(fs) || fs <= 16) continue;
    if (!Number.isFinite(top) || top >= 80) continue;
    candidates.push({ str: t, fontSize: fs, top });
  }
  if (!candidates.length) return '';
  candidates.sort((a, b) => (b.fontSize - a.fontSize) || (a.top - b.top));
  return candidates[0].str;
}

/**
 * M6 — Trova i marker di sotto-sezione sulla pagina ("ACCESSORI STANDARD" /
 * "OPTIONAL" / "OPTIONAL CONSIGLIATI" / "ACCESSORI OPTIONAL").
 *
 * Strategia: raggruppa gli item per riga visiva (top simile entro 2pt),
 * concatena il testo della riga, fa match esatto (uppercase, spazi normalizzati)
 * contro la whitelist. Gestisce sia marker single-token sia spezzati in 2-3
 * token sulla stessa y.
 *
 * Ritorna lista `{ text, top }` ordinata per top crescente. Mai null.
 *
 * LIMITE NOTO: il match è esatto (line-text uppercased+space-normalized ===
 * marker). Marker spezzati su 3+ token con tolleranze di y > 2pt, oppure in
 * formato esotico (case mista, accenti, suffissi tipo "ACCESSORI STANDARD A"),
 * non vengono catturati. Da rivisitare in v5.1 se compaiono.
 */
export function findSectionMarkers(items) {
  if (!Array.isArray(items)) return [];
  const sorted = items
    .filter(it => it && typeof it.str === 'string')
    .sort((a, b) => (Number(a.top) - Number(b.top)) || (Number(a.x0) - Number(b.x0)));
  const lines = [];
  for (const it of sorted) {
    const top = Number(it.top);
    if (!Number.isFinite(top)) continue;
    const last = lines[lines.length - 1];
    const piece = String(it.str || '').trim();
    if (!piece) continue;
    if (last && Math.abs(last.top - top) <= 2) {
      last.text += ' ' + piece;
    } else {
      lines.push({ top, text: piece });
    }
  }
  const out = [];
  for (const line of lines) {
    const norm = line.text.toUpperCase().replace(/\s+/g, ' ').trim();
    if (SECTION_MARKERS.has(norm)) {
      out.push({ text: norm, top: line.top });
    }
  }
  out.sort((a, b) => a.top - b.top);
  return out;
}

/**
 * M6 — Determina la sezione di una row dato il suo yAnchor, il titolo pagina
 * e la lista di marker (ordinata per top crescente).
 *  - Trova il marker più recente con top < yAnchor (marker attivo a quella altezza).
 *  - Se trovato e titolo presente: ritorna `"TITOLO > MARKER"`.
 *  - Solo titolo: ritorna `TITOLO`.
 *  - Solo marker (senza titolo): ritorna `MARKER`.
 *  - Niente di niente: ritorna `''`.
 *
 * Garantisce stringa, mai null/undefined.
 */
export function assignSectionToRow(yAnchor, pageTitle, markers) {
  const title = String(pageTitle || '').trim();
  const yA = Number(yAnchor);
  if (!Array.isArray(markers) || !Number.isFinite(yA)) return title;
  let active = null;
  for (const m of markers) {
    if (Number(m.top) < yA) active = m;
    else break;
  }
  if (active) return title ? `${title} > ${active.text}` : active.text;
  return title;
}

/**
 * M5 — Merge multi-codice (intra-page).
 *
 * Quando due codici diversi condividono una cella tabella verticalmente unita
 * (P5 SPEC v5), la riga del secondo codice esce vuota perché descrizione e
 * prezzo cadono entrambi nella banda del primo. Questo helper detecta la
 * coppia consecutiva e copia descrizione+prezzo da r_i a r_{i+1}, marcando
 * con `'MERGED_FROM_PREV'`.
 *
 * Condizioni AND per il merge:
 *   - r_i.descrizione non-vuota AND r_i.prezzo non-null
 *   - r_{i+1}.descrizione vuota AND r_{i+1}.prezzo null
 *   - |r_{i+1}.yAnchor - r_i.yAnchor| < 35
 *
 * Falso positivo da NON mergare (caso pag 54 PDF di riferimento): 20100112 e
 * 20100362 hanno entrambi descrizione "Kit radiocomando" e prezzi diversi
 * (3.100 / 5.800) → next.descrizione non-vuota → no merge.
 *
 * Le righe in input devono essere già ordinate per yAnchor crescente sulla
 * stessa pagina (è il caso naturale di output di buildBandsFromAnchors).
 *
 * NOTA: il merge è iterativo, quindi cascade A→B→C si propaga (B prende
 * da A, poi C prende da B). Sul PDF di riferimento reale non sono attesi
 * cascade (i pattern P5 sono sempre coppie), ma il comportamento non è
 * esplicitamente verificato. Se in futuro un listino producesse cascade
 * indesiderati, l'opzione è limitare l'iterazione a un singolo passaggio.
 */
export function mergeMultiCodeRows(rows) {
  if (!Array.isArray(rows)) return [];
  const out = rows.map(r => ({ ...r }));
  for (let i = 0; i < out.length - 1; i++) {
    const prev = out[i];
    const next = out[i + 1];
    if (!prev || !next) continue;
    const dy = Math.abs(Number(next.yAnchor) - Number(prev.yAnchor));
    if (!Number.isFinite(dy) || dy >= 35) continue;
    if (!prev.descrizione || String(prev.descrizione).length === 0) continue;
    if (prev.prezzo === null || prev.prezzo === undefined) continue;
    if (next.descrizione && String(next.descrizione).length > 0) continue;
    if (next.prezzo !== null && next.prezzo !== undefined) continue;
    next.descrizione = prev.descrizione;
    next.prezzo = prev.prezzo;
    next.review_flag = 'MERGED_FROM_PREV';
  }
  // Passata simmetrica: cella verticale unita in cui prezzo (ed eventuale
  // descrizione) cadono nella banda del codice INFERIORE, lasciando vuota la
  // riga sopra (es. 20100202 / 20100326* a pag. 36 del listino di riferimento).
  // Guardie: la riga sopra deve essere completamente vuota, le due righe
  // devono appartenere alla stessa sezione (evita che un codice-etichetta di
  // "ACCESSORI STANDARD" rubi il prezzo alla tabella prodotti sottostante) e
  // la distanza verticale deve essere quella di una cella condivisa (< 70pt).
  for (let i = out.length - 2; i >= 0; i--) {
    const prev = out[i];
    const next = out[i + 1];
    if (!prev || !next) continue;
    const dy = Math.abs(Number(next.yAnchor) - Number(prev.yAnchor));
    if (!Number.isFinite(dy) || dy >= 70) continue;
    if (prev.prezzo !== null && prev.prezzo !== undefined) continue;
    if (next.prezzo === null || next.prezzo === undefined) continue;
    // Solo vere celle condivise. Due firme accettate:
    //  a) prev e next entrambe senza descrizione (il contenuto del rowspan
    //     è finito tutto altrove);
    //  b) prezzo di next "galleggiante" sopra la propria riga (rowspan
    //     centrato tra i due codici): il prezzo è geometricamente conteso,
    //     quindi appartiene a entrambe — anche se prev ha già la sua
    //     descrizione (es. p.36: descrizione sopra il midpoint, prezzo sotto).
    // Se next è una riga-prodotto completa col prezzo sulla propria riga,
    // prev è più probabilmente un codice-etichetta (es. box OPTIONAL) che
    // le sta sopra per caso: rubare il prezzo sarebbe indovinare.
    const prevHasDesc = prev.descrizione && String(prev.descrizione).length > 0;
    const nextHasDesc = next.descrizione && String(next.descrizione).length > 0;
    if (!next._prezzoGalleggiante && (prevHasDesc || nextHasDesc)) continue;
    if ((prev.sezione ?? '') !== (next.sezione ?? '')) continue;
    prev.prezzo = next.prezzo;
    if (!prevHasDesc && nextHasDesc) prev.descrizione = next.descrizione;
    prev.review_flag = 'MERGED_FROM_NEXT';
  }
  return out;
}

// === Pattern B — celle condivise verticali (tabelle-matrice) ===

const GROUP_DY = 50; // passo verticale tipico delle righe nelle matrici accessori

function _isEmptyDesc(d) {
  return !String(d == null ? '' : d).trim();
}

/** Una descrizione è "frammento di continuazione" quando la prima lettera è
 *  minuscola: nelle matrici la cella unica cola su più codici e le righe non
 *  capofila iniziano a metà frase ("il montaggio/…", "ribassati e…",
 *  "ruote tubeless"). Il complemento (iniziale maiuscola) è una capofila. */
export function isFragmentDesc(d) {
  const t = String(d == null ? '' : d).trim();
  const m = t.match(/[A-Za-zÀ-ÿ]/);
  if (!m) return false;
  const ch = m[0];
  return ch === ch.toLowerCase() && ch !== ch.toUpperCase();
}

/** Una singola parola tutta MAIUSCOLA e breve ("STANDARD", "CE", "BAT") è una
 *  sigla-suffisso di variante che continua la cella del codice sopra, non un
 *  nome-prodotto a sé: isFragmentDesc non la cattura (inizia in maiuscola), ma
 *  in una cella condivisa va agganciata al gruppo. Il limite a una parola breve
 *  evita di risucchiare una vera capofila multi-parola. */
export function isShortUpperContinuation(d) {
  return /^[A-ZÀ-Ý]{2,12}$/.test(String(d == null ? '' : d).trim());
}

function _flagList(row) {
  return new Set(String(row.review_flag || '').split(';').map(s => s.trim()).filter(Boolean));
}

function _distinctNonNull(vals) {
  return [...new Set(vals.filter(v => v !== null && v !== undefined && v !== ''))];
}

/**
 * Pattern B — celle descrizione/prezzo condivise verticalmente da un gruppo di
 * 2-3 codici (righe-matrice: pagg. 34-39, 42-45, 54-55, 81-82 del PDF di riferimento).
 *
 * pdf.js aggancia la cella al codice più vicino: la descrizione unica esce
 * spezzata (la capofila tiene il nome, le righe sotto solo i frammenti
 * "il montaggio/…", "ribassati e…") e i codici senza prezzo restano nudi.
 *
 * Qui i codici consecutivi che condividono una cella vengono raccolti in un
 * gruppo e:
 *   - la descrizione INTERA (ricomposta concatenando i frammenti in ordine di
 *     riga) è propagata a tutti i membri;
 *   - il prezzo è propagato SOLO se la matrice non lo distingue per codice
 *     (un unico prezzo nel gruppo → celle unite; più prezzi distinti → ogni
 *     codice ha il suo, es. p.36 20100402/20100405 con prezzi distinti per codice).
 *
 * Righe non-capofila: flag DESCRIZIONE_GRUPPO (descrizione presa dal gruppo) e
 * PREZZO_GRUPPO (prezzo preso dal gruppo). Complementa mergeMultiCodeRows, che
 * gira prima e riempie i rowspan a codice nudo (MERGED_FROM_PREV/NEXT).
 *
 * Un membro entra nel gruppo del precedente se, stessa sezione e vicino
 * (|dy| < GROUP_DY):
 *   - la sua descrizione è un frammento di continuazione (minuscola); oppure
 *   - è vuota e condivide lo STESSO prezzo del gruppo (cella unita a più codici
 *     con lo stesso importo, es. p.37 20100404).
 * Una riga con descrizione propria (iniziale maiuscola) apre un nuovo gruppo:
 * così due prodotti distinti con prezzi diversi (p.54) non si fondono mai.
 */
export function mergeMatrixGroups(rows) {
  if (!Array.isArray(rows)) return [];
  const out = rows.map(r => ({ ...r }));
  let i = 0;
  while (i < out.length) {
    const group = [out[i]];
    let j = i + 1;
    while (j < out.length) {
      const prev = out[j - 1];
      const cur = out[j];
      if ((prev.sezione ?? '') !== (cur.sezione ?? '')) break;
      const dy = Math.abs(Number(cur.yAnchor) - Number(prev.yAnchor));
      if (!Number.isFinite(dy) || dy >= GROUP_DY) break;
      const groupPrices = _distinctNonNull(group.map(g => g.prezzo));
      let joins = false;
      if (isFragmentDesc(cur.descrizione)) {
        joins = true;
      } else if (_isEmptyDesc(cur.descrizione) || isShortUpperContinuation(cur.descrizione)) {
        // Codice quasi-nudo — riga vuota, oppure una sigla-suffisso maiuscola
        // ("STANDARD") che continua la cella del codice sopra. Entra se il gruppo
        // ha UN SOLO prezzo e cur non porta un prezzo PROPRIO diverso: una riga
        // con un prezzo proprio e distinto è un prodotto a sé e NON si fonde
        // (guardia p.54, invariata). Un prezzo nullo o uguale a quello del
        // gruppo indica invece la stessa cella condivisa (p.37 20100404, p.43
        // 20100184).
        joins = groupPrices.length === 1 &&
                (cur.prezzo == null || cur.prezzo === groupPrices[0]);
      }
      if (!joins) break;
      group.push(cur);
      j++;
    }
    if (group.length >= 2) _applyMatrixGroup(group);
    i = j > i ? j : i + 1;
  }
  return out;
}

function _applyMatrixGroup(group) {
  // La descrizione ricomposta viene ripulita dalle note di layout (quantità
  // "(15 pcs)", dimensioni "Ø mm N") che colano dentro la cella condivisa e
  // contaminerebbero il gruppo (es. p.31 20200590).
  const fullDesc = stripLayoutNoise(group
    .map(g => String(g.descrizione || '').trim())
    .filter(Boolean)
    .join(' '))
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
  const prices = _distinctNonNull(group.map(g => g.prezzo));
  const singlePrice = prices.length === 1 ? prices[0] : null;
  // capofila descrizione: la prima riga del gruppo (porta il nome-prodotto).
  for (let k = 0; k < group.length; k++) {
    const m = group[k];
    const flags = _flagList(m);
    const hadOwnDesc = !_isEmptyDesc(m.descrizione) && !isFragmentDesc(m.descrizione);
    if (fullDesc) m.descrizione = fullDesc;
    if (k > 0 || !hadOwnDesc) flags.add('DESCRIZIONE_GRUPPO');
    if (singlePrice !== null && (m.prezzo === null || m.prezzo === undefined || m.prezzo === '')) {
      m.prezzo = singlePrice;
      flags.add('PREZZO_GRUPPO');
      flags.delete('PREZZO_MANCANTE');
    }
    m.review_flag = [...flags].join(';');
  }
}

/**
 * Guardia DESC_PARZIALE — una descrizione finale che inizia in minuscola (o con
 * articolo/preposizione) o è composta solo da una parentesi ("(4 pcs)",
 * "(MEC1)") non è mai una descrizione buona: viene segnalata, mai emessa in
 * silenzio. Non tocca le descrizioni vuote (già coperte da PREZZO_MANCANTE /
 * riga vuota) né quelle che aprono con una maiuscola.
 */
export function flagPartialDescriptions(rows) {
  if (!Array.isArray(rows)) return rows;
  for (const r of rows) {
    if (!r) continue;
    const t = String(r.descrizione || '').trim();
    if (!t) continue;
    const soloParentesi = /^\([^)]*\)$/.test(t);
    if (!(isFragmentDesc(t) || soloParentesi)) continue;
    const flags = _flagList(r);
    flags.add('DESC_PARZIALE');
    r.review_flag = [...flags].join(';');
  }
  return rows;
}

/** Estrae righe-prodotto da un PDFDocumentProxy di pdfjs-dist (anchor-first, v5). */
export async function extractFromPdfDocument(pdf, onLog = () => {}) {
  const pages_total = pdf.numPages;
  let pages_with_text = 0;
  let pages_image_only = 0;
  const allRows = [];

  for (let pageNum = 1; pageNum <= pages_total; pageNum++) {
    const page = await pdf.getPage(pageNum);
    let textContent;
    try {
      textContent = await page.getTextContent();
    } catch (err) {
      onLog(`Pagina ${pageNum}: errore di lettura testo (${err.message || err}), saltata.`);
      continue;
    }
    const rawItems = textContent.items || [];
    if (!rawItems.length) {
      pages_image_only += 1;
      onLog(`Pagina ${pageNum}: nessun testo estraibile (probabilmente immagine), saltata.`);
      continue;
    }
    pages_with_text += 1;

    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;
    const pageWidth = viewport.width;

    let items = rawItems
      .map(it => normalizePdfjsItem(it, pageHeight))
      .filter(Boolean);

    // Ricomposizione prezzi spezzati da pdf.js ("1." + "100,00" → "1.100,00").
    // Va fatta prima di anchor e bande: i frammenti non sono mai codici,
    // quindi extractAnchors non ne è influenzato.
    items = coalesceSplitPriceItems(items);

    // Anchor extraction: M3 (length≤2, width<12pt) and M9 (SIDE_NOTE_PATTERNS)
    // by construction non possono rimuovere codici 8 cifre, quindi una sola
    // estrazione anchor copre l'intera pipeline.
    const anchors = extractAnchors(items);
    if (!anchors.length) continue;
    const firstAnchorTop = anchors[0].top;

    // M3 — drop vertical-header characters
    items = filterVerticalHeaders(items, firstAnchorTop);

    // M2 — compute column X bands
    const cols = computeColumnBands(items, pageWidth);

    // M9 — drop side-note markers (only if cols available)
    if (cols) {
      items = filterSideNotes(items, cols.noteLaterali);
    }

    // M6 — section detection (titolo pagina + marker sotto-sezione)
    const pageTitle = detectPageTitle(items);
    const sectionMarkers = findSectionMarkers(items);

    const bands = buildBandsFromAnchors(anchors, 0, pageHeight);
    for (const b of bands) {
      b.yTop = Math.max(b.yTop, b.anchor.top - 35);
      b.yBottom = Math.min(b.yBottom, b.anchor.top + 120);
    }
    const pageRows = [];
    for (const band of bands) {
      const bandItems = collectBandItems(items, band);
      const row = emitRowFromBand(band.anchor, bandItems, cols, pageNum);
      if (row) {
        row.sezione = assignSectionToRow(band.anchor.top, pageTitle, sectionMarkers);
        pageRows.push({ ...row, yAnchor: band.anchor.top });
      }
    }

    // M5 — merge multi-codice intra-page (rowspan a codice nudo). yAnchor resta
    // sulle righe: serve al raggruppamento matrice (Pattern B), fatto più sotto
    // sui superstiti. _prezzoGalleggiante è già stato consumato qui e si scarta.
    const mergedPageRows = mergeMultiCodeRows(pageRows);
    for (const r of mergedPageRows) {
      const { _prezzoGalleggiante: _pg, ...clean } = r;
      allRows.push(clean);
    }
  }

  // Filtro sezioni-appendice (es. "DIMENSIONI IMBALLI"): non sono listino, la
  // riga agganciata è solo l'intera tabella pesi/misure incollata in descrizione.
  const listinoRows = allRows.filter(r => !isExcludedSection(r.sezione));

  // Pattern A — separa le occorrenze-didascalia (box ACCESSORI STANDARD) dalle
  // vere righe di listino PRIMA di Pattern B e dell'aggregazione: così un codice
  // come 21100240 (didascalia su molte pagine, prezzato solo a pag.18) aggrega
  // la sola occorrenza reale, e i badge (es. 41100028 "( )") non finiscono per
  // sbaglio dentro un gruppo-matrice che ne "gonfierebbe" la descrizione.
  const { mainRows, dotazioni } = classifyDidascalie(listinoRows);

  // Pattern B — celle descrizione/prezzo condivise da un gruppo di codici,
  // applicato per pagina sui superstiti (le righe di ogni pagina sono già in
  // ordine visivo top→bottom nell'ordine di allRows).
  const byPage = new Map();
  for (const r of mainRows) {
    const k = String(r.pagina || '');
    if (!byPage.has(k)) byPage.set(k, []);
    byPage.get(k).push(r);
  }
  const groupedRows = [];
  for (const pageRows of byPage.values()) {
    for (const r of mergeMatrixGroups(pageRows)) {
      const { yAnchor: _y, ...clean } = r;
      groupedRows.push(clean);
    }
  }

  const rows = aggregateAcrossPages(groupedRows);
  // Guardia Pattern B: nessuna descrizione parziale (minuscola/solo parentesi)
  // esce silenziosamente come buona.
  flagPartialDescriptions(rows);
  const rows_in_check = rows.filter(r => r.review_flag).length;

  onLog(`Pagine totali: ${pages_total} (con testo: ${pages_with_text}, solo immagine: ${pages_image_only}).`);
  onLog(`Righe estratte: ${rows.length}.`);
  if (dotazioni.length) onLog(`Codici-didascalia (Dotazioni standard): ${dotazioni.length}.`);
  if (rows_in_check) onLog(`Righe in CHECK: ${rows_in_check}.`);

  return {
    rows,
    dotazioni,
    meta: {
      pages_total,
      pages_with_text,
      pages_image_only,
      rows_extracted: rows.length,
      dotazioni_count: dotazioni.length,
      rows_in_check
    }
  };
}

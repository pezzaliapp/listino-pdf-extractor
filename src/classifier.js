// classifier.js — orchestratore: classifica famiglia + tier + plus_vendita + nome commerciale.

import { loadRules, classifyDescription, fallbackClassification } from './keywordClassifier.js';
import { get as idbGet } from 'idb-keyval';

const USER_PLUS_RULES_KEY = 'user_plus_rules_v1';

export const DEFAULT_PLUS_RULES = [
  { regex: 'motoinverter',                                 tag: 'motoinverter' },
  { regex: 'sonar',                                        tag: 'lettura automatica larghezza' },
  { regex: '\\bnls\\b',                                    tag: 'bloccaggio rapido' },
  { regex: '\\brlc\\s*plus\\b',                            tag: 'laser' },
  { regex: '\\brlc\\b(?!\\s*plus)',                        tag: 'analisi runout' },
  { regex: '\\blaser\\b',                                  tag: 'laser' },
  { regex: '\\b(lift|sollevatore)\\b',                     tag: 'sollevatore integrato' },
  { regex: 'smart\\s*app',                                 tag: 'connettivita app' },
  { regex: 'runflat',                                      tag: 'runflat' },
  { regex: 'leverless',                                    tag: 'leverless' },
  { regex: 'industria\\s*4\\.0',                           tag: 'industria 4.0' },
  { regex: 'bluetooth|wireless|wi-?fi',                    tag: 'connettivita wireless' },
  { regex: 'touch\\s*screen|touchscreen|monitor\\s*touch', tag: 'interfaccia touch' }
];

export const PITCH_BY_TIER = {
  Entry:   "Soluzione essenziale per l'uso quotidiano.",
  Mid:     "Buon equilibrio tra dotazione e investimento.",
  Premium: "Versione alta di gamma per uso professionale intenso."
};

export function tierFromPrice(prezzoEur) {
  if (prezzoEur < 1000) return 'Entry';
  if (prezzoEur < 3000) return 'Mid';
  return 'Premium';
}

async function safeIdbGet(key) {
  try {
    return await idbGet(key);
  } catch {
    return null;
  }
}

export async function loadPlusRules() {
  const stored = await safeIdbGet(USER_PLUS_RULES_KEY);
  return (stored && Array.isArray(stored) && stored.length) ? stored : DEFAULT_PLUS_RULES;
}

const PREFIX_BY_FAMIGLIA = {
  'Equilibratrici':                'Equilibratrice ',
  'Smontagomme':                   'Smontagomme ',
  'Assetti ruote':                 'Assetto / Accessorio ',
  'Sollevatori':                   'Sollevatore ',
  'Cric / Sollevatori manuali':    'Cric ',
  'Diagnosi':                      '',
  'Industria 4.0':                 'Industria 4.0 — ',
  'Attrezzature varie':            '',
  'Accessori':                     ''
};

const UPSELL_BY_FAMIGLIA = {
  'Equilibratrici':                'coni/flange, NLS, sollevatore, Smart App',
  'Smontagomme':                   'helper arms, runflat kit, gruppo gonfiaggio',
  'Assetti ruote':                 'griffe/adattatori, banca dati, monitor',
  'Sollevatori':                   'tamponi, traverse, cablaggio, estensioni',
  'Cric / Sollevatori manuali':    'accessori dedicati',
  'Diagnosi':                      'cavi e connettori, software aggiornamenti',
  'Industria 4.0':                 'kit aggiuntivi, abbonamento dati',
  'Attrezzature varie':            'accessori dedicati',
  'Accessori':                     ''
};

/**
 * Input:  { descrizione, prezzo, famigliaRaw, categoriaRaw }
 * Output: { famiglia, categoria, matchSource, tier, plus_vendita, upsell, pitch, nome_commerciale }
 */
export async function classifyRow({ descrizione, prezzo, famigliaRaw, categoriaRaw }) {
  const rules = await loadRules();
  const plusRules = await loadPlusRules();

  // 1. Classificazione Famiglia/Categoria
  const kw = classifyDescription(descrizione || '', rules);
  let famiglia, categoria, matchSource;
  if (kw) {
    famiglia = kw.famiglia;
    categoria = kw.categoria;
    matchSource = 'keyword';
  } else if (famigliaRaw) {
    famiglia = famigliaRaw;
    categoria = categoriaRaw || famigliaRaw;
    matchSource = 'pdf-heading';
  } else {
    const fb = fallbackClassification();
    famiglia = fb.famiglia;
    categoria = fb.categoria;
    matchSource = 'fallback';
  }

  // 2. Plus_vendita: tutti i tag che matchano (concatenati)
  const tags = new Set();
  for (const rule of plusRules) {
    try {
      if (new RegExp(rule.regex, 'i').test(descrizione || '')) tags.add(rule.tag);
    } catch (e) { /* skip invalid */ }
  }
  const plus_vendita = tags.size ? [...tags].join(', ') : 'soluzione standard';

  // 3. Tier
  const tier = tierFromPrice(prezzo);

  // 4. Nome commerciale
  const prefix = PREFIX_BY_FAMIGLIA[famiglia] ?? '';
  const nome_commerciale = (prefix + (descrizione || '')).trim();

  return {
    famiglia,
    categoria,
    matchSource,
    tier,
    plus_vendita,
    upsell: UPSELL_BY_FAMIGLIA[famiglia] ?? 'accessori dedicati',
    pitch: PITCH_BY_TIER[tier],
    nome_commerciale
  };
}

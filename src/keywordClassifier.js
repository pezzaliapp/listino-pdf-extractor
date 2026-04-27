// keywordClassifier.js — classificazione Famiglia/Categoria via parole-chiave.
// Regole di default modificabili dall'utente via pannello Admin (IndexedDB).

import { get as idbGet } from 'idb-keyval';

const USER_RULES_KEY = 'user_classification_rules_v1';

/**
 * Ogni regola ha:
 *   - patterns: array di stringhe-regex (case-insensitive, word-boundary applicato dal matcher)
 *   - all: se true, TUTTI i patterns devono matchare (AND); se false (default), basta il primo (OR)
 *   - famiglia: stringa
 *   - categoria: stringa
 *   - priority: numero più alto = vince. Default 0.
 *
 * Ordine di valutazione: `priority` desc, poi ordine nell'array.
 */
export const DEFAULT_CLASSIFICATION_RULES = [
  // === EQUILIBRATRICI (priorità: truck/moto prima di auto) ===
  { patterns: ['equilibratric', '(truck|camion|autocarro|veicoli industriali)'], all: true,
    famiglia: 'Equilibratrici', categoria: 'Equilibratrici truck', priority: 30 },
  { patterns: ['equilibratric', '\\bmoto\\b'], all: true,
    famiglia: 'Equilibratrici', categoria: 'Equilibratrici moto', priority: 30 },
  { patterns: ['equilibratric|bilanciatric'],
    famiglia: 'Equilibratrici', categoria: 'Equilibratrici auto', priority: 20 },

  // === SMONTAGOMME ===
  { patterns: ['smontagomm', '(truck|camion|autocarro|veicoli industriali)'], all: true,
    famiglia: 'Smontagomme', categoria: 'Smontagomme truck', priority: 30 },
  { patterns: ['smontagomm', '\\bmoto\\b'], all: true,
    famiglia: 'Smontagomme', categoria: 'Smontagomme moto', priority: 30 },
  { patterns: ['smontagomm'],
    famiglia: 'Smontagomme', categoria: 'Smontagomme auto', priority: 20 },

  // === ASSETTI / GEOMETRIA ===
  { patterns: ['assetto|allinea|convergenza|geometria ruote|wheel align'],
    famiglia: 'Assetti ruote', categoria: 'Assetti ruote', priority: 25 },

  // === SOLLEVAMENTO (ordine: specifici prima di generici) ===
  { patterns: ['colonn', 'mobil'], all: true,
    famiglia: 'Sollevatori', categoria: 'Colonne mobili', priority: 35 },
  { patterns: ['ponte.*forbic|forbic.*ponte|sollevatore.*forbic'],
    famiglia: 'Sollevatori', categoria: 'Ponti a forbice', priority: 32 },
  { patterns: ['(ponte|sollevatore).*(2|due)\\s*colonn|(2|due)\\s*colonn.*ponte'],
    famiglia: 'Sollevatori', categoria: 'Ponti 2 colonne', priority: 32 },
  { patterns: ['(ponte|sollevatore).*(4|quattro)\\s*colonn|(4|quattro)\\s*colonn.*ponte'],
    famiglia: 'Sollevatori', categoria: 'Ponti 4 colonne', priority: 32 },
  { patterns: ['ponte da assetto|sollevatore.*assetto'],
    famiglia: 'Sollevatori', categoria: 'Ponti da assetto', priority: 33 },
  { patterns: ['sollevat|\\bponte\\b'],
    famiglia: 'Sollevatori', categoria: 'Sollevatori (generico)', priority: 15 },
  { patterns: ['\\bcric\\b|oleopneumat|sollevatore.*idraulico'],
    famiglia: 'Cric / Sollevatori manuali', categoria: 'Cric', priority: 25 },

  // === DIAGNOSI ===
  { patterns: ['handy\\s*scan|profilometr|profil.*pneumatic'],
    famiglia: 'Diagnosi', categoria: 'Profilometro', priority: 25 },
  { patterns: ['scanner.*diagnostic|diagnosi.*elettronic|obd'],
    famiglia: 'Diagnosi', categoria: 'Diagnosi elettronica', priority: 22 },

  // === INDUSTRIA 4.0 (cross-cutting: marca anche le macchine pertinenti) ===
  { patterns: ['industria\\s*4\\.0|kit\\s*4\\.0|smart\\s*app'],
    famiglia: 'Industria 4.0', categoria: 'Industria 4.0', priority: 18 },

  // === ATTREZZATURE VARIE ===
  { patterns: ['compressor'],
    famiglia: 'Attrezzature varie', categoria: 'Compressori', priority: 20 },
  { patterns: ['vulcaniz'],
    famiglia: 'Attrezzature varie', categoria: 'Vulcanizzatrici', priority: 20 },
  { patterns: ['\\bpressa\\b'],
    famiglia: 'Attrezzature varie', categoria: 'Presse', priority: 20 },
  { patterns: ['gonfiagomm|gruppo.*gonfiaggio'],
    famiglia: 'Attrezzature varie', categoria: 'Gonfiagomme', priority: 20 },

  // === ACCESSORI / RICAMBI ===
  { patterns: ['accessori|kit\\s+(coni|griffe|adattator)|set\\s+(coni|griffe)'],
    famiglia: 'Accessori', categoria: 'Accessori (generico)', priority: 5 }
];

async function safeIdbGet(key) {
  try {
    return await idbGet(key);
  } catch {
    return null;
  }
}

/** Carica le regole effettive: utente (IDB) > default. */
export async function loadRules() {
  const userRules = await safeIdbGet(USER_RULES_KEY);
  const rules = (userRules && Array.isArray(userRules) && userRules.length)
    ? userRules
    : DEFAULT_CLASSIFICATION_RULES;
  return [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/**
 * Classifica una descrizione contro un set di regole.
 * Ritorna { famiglia, categoria, matchedRule } oppure null se nulla matcha.
 */
export function classifyDescription(description, rules) {
  if (!description || typeof description !== 'string') return null;
  const text = description; // i pattern usano flag 'i', non serve toUpperCase

  for (const rule of rules) {
    if (!rule.patterns || !rule.patterns.length) continue;

    let matchFn;
    try {
      const regexes = rule.patterns.map(p => new RegExp(p, 'i'));
      matchFn = rule.all
        ? () => regexes.every(re => re.test(text))
        : () => regexes.some(re => re.test(text));
    } catch (e) {
      console.warn('Regex non valida nella regola:', rule, e);
      continue;
    }

    if (matchFn()) {
      return {
        famiglia: rule.famiglia,
        categoria: rule.categoria,
        matchedRule: rule.patterns.join(' & ')
      };
    }
  }
  return null;
}

/** Fallback per quando nessuna regola matcha. */
export function fallbackClassification() {
  return {
    famiglia: 'Attrezzature varie',
    categoria: 'Generico',
    matchedRule: '(nessun match — fallback)'
  };
}

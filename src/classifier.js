// Classification helpers: tier from price, commercial pitch and upsell defaults.

export function tierFromPrice(prezzoEur) {
  if (prezzoEur < 1000) return 'Entry';
  if (prezzoEur < 3000) return 'Mid';
  return 'Premium';
}

export const PITCH_BY_TIER = {
  Entry:   "Soluzione essenziale per l'uso quotidiano.",
  Mid:     "Buon equilibrio tra dotazione e investimento.",
  Premium: "Versione alta di gamma per uso professionale intenso."
};

export const FAMIGLIA_DEFAULTS = {
  'Assetti ruote':                  { plus: 'accessorio specialistico', upsell: 'griffe/adattatori, banca dati, monitor' },
  'Equilibratrici':                 { plus: 'soluzione standard',       upsell: 'coni/flange, NLS, sollevatore, Smart App' },
  'Smontagomme':                    { plus: 'soluzione standard',       upsell: 'helper arms, runflat kit, gruppo gonfiaggio' },
  'Sollevatori':                    { plus: 'soluzione standard',       upsell: 'tamponi, traverse, cablaggio, estensioni' },
  'Attrezzature varie':             { plus: 'soluzione standard',       upsell: 'accessori dedicati' },
  'Industria 4.0':                  { plus: 'industria 4.0',            upsell: 'accessori dedicati' },
  'Handy Scan':                     { plus: 'soluzione standard',       upsell: 'accessori dedicati' }
};

export const PREFIX_BY_FAMIGLIA = {
  'Assetti ruote':       'Assetto / Accessorio ',
  'Equilibratrici':      'Equilibratrice ',
  'Smontagomme':         'Smontagomme ',
  'Sollevatori':         'Sollevatore / Accessorio ',
  'Attrezzature varie':  '',
  'Industria 4.0':       'Industria 4.0 — ',
  'Handy Scan':          'Handy Scan '
};

// Whitelist of recognised heading texts (uppercased) -> canonical Famiglia name.
export const FAMIGLIA_HEADINGS = {
  'ASSETTI RUOTE': 'Assetti ruote',
  'EQUILIBRATRICI': 'Equilibratrici',
  'SMONTAGOMME': 'Smontagomme',
  'SOLLEVATORI': 'Sollevatori',
  'ATTREZZATURE VARIE': 'Attrezzature varie',
  'INDUSTRIA 4.0': 'Industria 4.0',
  'HANDY SCAN': 'Handy Scan'
};

export function classifyCommercial({ famiglia, prezzo }) {
  const baseFamiglia = (famiglia || '').split('|')[0].trim();
  const def = FAMIGLIA_DEFAULTS[baseFamiglia] || { plus: 'soluzione standard', upsell: 'accessori dedicati' };
  const tier = tierFromPrice(prezzo);
  return {
    tier,
    plus: def.plus,
    upsell: def.upsell,
    pitch: PITCH_BY_TIER[tier]
  };
}

export function commercialName({ famiglia, descrizione }) {
  const baseFamiglia = (famiglia || '').split('|')[0].trim();
  const prefix = PREFIX_BY_FAMIGLIA[baseFamiglia] ?? '';
  return prefix + (descrizione || '');
}

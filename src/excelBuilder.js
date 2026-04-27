// Excel workbook builder using SheetJS. Produces a 6-sheet xlsx in the order required by SPEC v3.

import * as XLSX from 'xlsx';
import { classifyRow, DEFAULT_PLUS_RULES } from './classifier.js';
import { DEFAULT_CLASSIFICATION_RULES, loadRules } from './keywordClassifier.js';
import { get as idbGet } from 'idb-keyval';

const TOOL_VERSION = 'listino-pdf-extractor v3.0.0';

const COL_WIDTHS = {
  Famiglia: 22,
  Categoria: 28,
  Codice: 12,
  Descrizione: 60,
  Descrizione_tecnica: 60,
  Nome_breve: 40,
  Nome_commerciale: 50,
  Prezzo_EUR: 14,
  Prezzo_listino_EUR: 16,
  Trasporto_EUR: 14,
  Installazione_EUR: 16,
  'Sconto_%': 10,
  Netto_macchina_EUR: 18,
  Totale_preventivo_EUR: 20,
  Pagine: 12,
  Occorrenze: 12,
  Match_Source: 14,
  Review_Flag: 12,
  Fonte: 30,
  Tier: 10,
  Plus_vendita: 28,
  Upsell_suggerito: 32,
  Pitch_breve: 50,
  Note: 30
};

function colsFromHeaders(headers, overrides = {}) {
  return headers.map(h => ({ wch: overrides[h] || COL_WIDTHS[h] || 14 }));
}

function setCellNumberFormat(ws, cellAddress, fmt) {
  const cell = ws[cellAddress];
  if (!cell) return;
  cell.z = fmt;
}

async function safeIdbGet(key) {
  try {
    return await idbGet(key);
  } catch {
    return null;
  }
}

// Sheet 01: cleaned listino with Match_Source column
function buildSheetListinoPulito(rows) {
  const headers = ['Famiglia', 'Categoria', 'Codice', 'Descrizione', 'Prezzo_EUR', 'Pagine', 'Occorrenze', 'Match_Source', 'Review_Flag', 'Fonte'];
  const aoa = [headers];
  for (const r of rows) {
    aoa.push([
      r.Famiglia || '',
      r.Categoria || '',
      r.Codice || '',
      r.Descrizione || '',
      Number(r.Prezzo_EUR) || 0,
      r.Pagine || '',
      Number(r.Occorrenze) || 0,
      r.Match_Source || '',
      r.Review_Flag || '',
      r.Fonte || ''
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  for (let i = 0; i < rows.length; i++) {
    ws[XLSX.utils.encode_cell({ c: 2, r: i + 1 })] = { t: 's', v: String(rows[i].Codice || '') };
    ws[XLSX.utils.encode_cell({ c: 5, r: i + 1 })] = { t: 's', v: String(rows[i].Pagine || '') };
    setCellNumberFormat(ws, XLSX.utils.encode_cell({ c: 4, r: i + 1 }), '#,##0');
    setCellNumberFormat(ws, XLSX.utils.encode_cell({ c: 6, r: i + 1 }), '0');
  }

  ws['!cols'] = colsFromHeaders(headers);
  return ws;
}

// Sheet 02: CSVXpressSmart with formulas
function buildSheetCsvXpressSmart(rows) {
  const headers = [
    'Famiglia', 'Categoria', 'Codice', 'Nome_breve', 'Descrizione_tecnica',
    'Prezzo_listino_EUR', 'Trasporto_EUR', 'Installazione_EUR', 'Sconto_%',
    'Netto_macchina_EUR', 'Totale_preventivo_EUR', 'Note', 'Fonte', 'Review_Flag'
  ];
  const aoa = [headers];
  for (const r of rows) {
    const desc = r.Descrizione || '';
    aoa.push([
      r.Famiglia || '',
      r.Categoria || '',
      r.Codice || '',
      desc.slice(0, 60),
      desc,
      Number(r.Prezzo_EUR) || 0,
      '', '', '', '', '', '',
      r.Fonte || '',
      r.Review_Flag || ''
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  for (let i = 0; i < rows.length; i++) {
    ws[XLSX.utils.encode_cell({ c: 2, r: i + 1 })] = { t: 's', v: String(rows[i].Codice || '') };
  }

  for (let i = 0; i < rows.length; i++) {
    const R = i + 2;
    const rowIdx = i + 1;
    setCellNumberFormat(ws, XLSX.utils.encode_cell({ c: 5, r: rowIdx }), '#,##0');
    setCellNumberFormat(ws, XLSX.utils.encode_cell({ c: 6, r: rowIdx }), '#,##0');
    setCellNumberFormat(ws, XLSX.utils.encode_cell({ c: 7, r: rowIdx }), '#,##0');
    setCellNumberFormat(ws, XLSX.utils.encode_cell({ c: 8, r: rowIdx }), '0.00%');

    const nettoAddr = XLSX.utils.encode_cell({ c: 9, r: rowIdx });
    ws[nettoAddr] = { t: 'n', f: `F${R}*(1-IFERROR(I${R},0))` };
    setCellNumberFormat(ws, nettoAddr, '#,##0');

    const totAddr = XLSX.utils.encode_cell({ c: 10, r: rowIdx });
    ws[totAddr] = { t: 'n', f: `J${R}+IFERROR(G${R},0)+IFERROR(H${R},0)` };
    setCellNumberFormat(ws, totAddr, '#,##0');
  }

  ws['!cols'] = colsFromHeaders(headers);
  return ws;
}

// Sheet 03: Commerciale view
function buildSheetCommerciale(rows) {
  const headers = [
    'Famiglia', 'Categoria', 'Codice', 'Nome_commerciale',
    'Prezzo_listino_EUR', 'Tier', 'Plus_vendita', 'Upsell_suggerito',
    'Pitch_breve', 'Review_Flag'
  ];
  const aoa = [headers];
  for (const r of rows) {
    aoa.push([
      r.Famiglia || '',
      r.Categoria || '',
      r.Codice || '',
      r.Nome_commerciale || '',
      Number(r.Prezzo_EUR) || 0,
      r.Tier || '',
      r.Plus_vendita || '',
      r.Upsell || '',
      r.Pitch || '',
      r.Review_Flag || ''
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  for (let i = 0; i < rows.length; i++) {
    const rowIdx = i + 1;
    ws[XLSX.utils.encode_cell({ c: 2, r: rowIdx })] = { t: 's', v: String(rows[i].Codice || '') };
    setCellNumberFormat(ws, XLSX.utils.encode_cell({ c: 4, r: rowIdx }), '#,##0');
  }

  ws['!cols'] = colsFromHeaders(headers);
  return ws;
}

// Sheet 98: Regole
async function buildSheetRegole() {
  const userClassRules = await safeIdbGet('user_classification_rules_v1');
  const userPlusRules = await safeIdbGet('user_plus_rules_v1');
  const classRules = (userClassRules && Array.isArray(userClassRules) && userClassRules.length)
    ? userClassRules : DEFAULT_CLASSIFICATION_RULES;
  const plusRules = (userPlusRules && Array.isArray(userPlusRules) && userPlusRules.length)
    ? userPlusRules : DEFAULT_PLUS_RULES;

  const aoa = [];
  aoa.push(['Sezione A — Regole di classificazione Famiglia/Categoria']);
  aoa.push(['Pattern(s)', 'Match all?', 'Famiglia', 'Categoria', 'Priority']);
  for (const r of classRules) {
    aoa.push([
      (r.patterns || []).join(' | '),
      r.all ? 'sì' : 'no',
      r.famiglia || '',
      r.categoria || '',
      r.priority ?? 0
    ]);
  }
  aoa.push([]);
  aoa.push(['Sezione B — Regole Plus_vendita']);
  aoa.push(['Regex', 'Tag']);
  for (const r of plusRules) {
    aoa.push([r.regex || '', r.tag || '']);
  }
  aoa.push([]);
  aoa.push(['Sezione C — Nota']);
  aoa.push(['Per modificare le regole apri la PWA → ⚙️ Admin. I cambiamenti sono salvati nel tuo browser.']);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 60 }, { wch: 14 }, { wch: 26 }, { wch: 28 }, { wch: 10 }];
  return ws;
}

// Sheet 99: Diagnostica
function buildSheetDiagnostica(enriched, parserLog) {
  const aoa = [];

  // A — Distribuzione classificazione
  aoa.push(['Sezione A — Distribuzione classificazione']);
  aoa.push(['Famiglia', 'Categoria', 'N_articoli']);
  const counts = new Map();
  for (const r of enriched) {
    const key = `${r.Famiglia}::${r.Categoria}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const distRows = [...counts.entries()]
    .map(([k, n]) => { const [f, c] = k.split('::'); return [f, c, n]; })
    .sort((a, b) => b[2] - a[2]);
  for (const r of distRows) aoa.push(r);
  aoa.push([]);

  // B — Righe non classificate (matchSource ≠ 'keyword')
  aoa.push(['Sezione B — Righe non classificate (Match_Source ≠ keyword)']);
  aoa.push(['Codice', 'Descrizione', 'Prezzo', 'Pagine', 'Match_Source', 'Suggerimento']);
  const unclassified = enriched.filter(r => r.Match_Source !== 'keyword');
  for (const r of unclassified) {
    aoa.push([r.Codice || '', r.Descrizione || '', Number(r.Prezzo_EUR) || 0, r.Pagine || '', r.Match_Source || '', '']);
  }
  aoa.push([]);

  // C — Log parser
  aoa.push(['Sezione C — Log parser']);
  aoa.push(['Pagine totali', parserLog.pages_total ?? 0]);
  aoa.push(['Pagine con testo', parserLog.pages_with_text ?? 0]);
  aoa.push(['Pagine solo immagine', parserLog.pages_image_only ?? 0]);
  aoa.push(['Righe estratte', parserLog.rows_extracted ?? 0]);
  aoa.push(['Righe scartate', (parserLog.discarded || []).length]);
  if ((parserLog.discarded || []).length) {
    aoa.push([]);
    aoa.push(['Pagina', 'Motivo', 'Tokens']);
    for (const d of parserLog.discarded.slice(0, 200)) {
      aoa.push([d.page, d.reason, (d.tokens || []).join(' ')]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 24 }, { wch: 40 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 30 }];
  return ws;
}

// Sheet 00: Note
function buildSheetNote(fileName, summary) {
  const aoa = [
    ['File di origine', fileName || ''],
    ['Versione app', '3.0.0'],
    ['Metodo classificazione', 'parole-chiave generiche (modificabili da Admin)'],
    ['Regole attive', `${summary.rules_total} (default: ${summary.rules_default}, custom: ${summary.rules_custom})`],
    ['Match keyword', `${summary.match_keyword_pct}% delle righe`],
    ['Review_Flag', 'CHECK = riga da verificare manualmente nel PDF (descrizione frammentata o poco leggibile).'],
    ['Uso foglio 02', 'Compila Trasporto, Installazione e Sconto %. Netto macchina e Totale preventivo si aggiornano automaticamente.'],
    ['Generato il', new Date().toISOString()],
    ['Tool', TOOL_VERSION],
    ['Avvertenza', 'Strumento AS-IS. Verificare sempre i dati estratti rispetto al PDF originale.']
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 24 }, { wch: 90 }];
  return ws;
}

/**
 * Build the full workbook.
 * @param {{rows:Array, parserLog:Object, sourcePdfName:string}} args
 */
export async function buildWorkbook({ rows, parserLog, sourcePdfName }) {
  const enriched = [];
  for (const r of rows) {
    const cls = await classifyRow({
      descrizione: r.Descrizione,
      prezzo: Number(r.Prezzo_EUR) || 0,
      famigliaRaw: r.famigliaRaw,
      categoriaRaw: r.categoriaRaw
    });
    enriched.push({
      ...r,
      Famiglia: cls.famiglia,
      Categoria: cls.categoria,
      Match_Source: cls.matchSource,
      Tier: cls.tier,
      Plus_vendita: cls.plus_vendita,
      Upsell: cls.upsell,
      Pitch: cls.pitch,
      Nome_commerciale: cls.nome_commerciale
    });
  }

  const userRules = await safeIdbGet('user_classification_rules_v1');
  const activeRules = (userRules && Array.isArray(userRules) && userRules.length) ? userRules : DEFAULT_CLASSIFICATION_RULES;
  const rules_default = userRules ? 0 : DEFAULT_CLASSIFICATION_RULES.length;
  const rules_custom = userRules ? activeRules.length : 0;
  const keywordCount = enriched.filter(r => r.Match_Source === 'keyword').length;
  const match_keyword_pct = enriched.length ? Math.round((keywordCount / enriched.length) * 100) : 0;

  const summary = {
    rules_total: activeRules.length,
    rules_default,
    rules_custom,
    match_keyword_pct
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheetNote(sourcePdfName, summary), '00_Note');
  XLSX.utils.book_append_sheet(wb, buildSheetListinoPulito(enriched), '01_Listino_pulito');
  XLSX.utils.book_append_sheet(wb, buildSheetCsvXpressSmart(enriched), '02_CSVXpressSmart');
  XLSX.utils.book_append_sheet(wb, buildSheetCommerciale(enriched), '03_Commerciale');
  XLSX.utils.book_append_sheet(wb, await buildSheetRegole(), '98_Regole');
  XLSX.utils.book_append_sheet(wb, buildSheetDiagnostica(enriched, parserLog), '99_Diagnostica');
  return wb;
}

export function buildOutputFilename(pdfFileName) {
  const base = (pdfFileName || 'listino').replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9_\-]+/g, '_');
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${base}_estratto_${stamp}.xlsx`;
}

export function downloadWorkbook(wb, filename) {
  XLSX.writeFile(wb, filename);
}

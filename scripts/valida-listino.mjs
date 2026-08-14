#!/usr/bin/env node
// Validazione end-to-end: carica un PDF di listino, esegue l'estrazione
// (riusa src/pdfParser.js) e stampa i contatori diagnostici.
//
// USO:  node scripts/valida-listino.mjs <path-al-pdf>
//       node scripts/valida-listino.mjs <path-al-pdf> --dump-page N
//
// Il path del PDF è OBBLIGATORIO e va passato come argomento: lo script non
// contiene path personali né dati del listino (vedi CLAUDE.md). Nessun file
// del listino viene scritto o copiato: si legge soltanto.
//
// --dump-page N: stampa i text item grezzi della pagina N (x, y, width, str)
//   ordinati per y poi x, per ispezionare la geometria delle tabelle. I valori
//   di prezzo sono MASCHERATI come "#.###,##" (mai prezzi reali a schermo).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { extractFromPdfDocument, normalizePdfjsItem } from '../src/pdfParser.js';

// pdfjs-dist legacy build: gira in Node senza worker/canvas.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = fileURLToPath(
  new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url)
);

function isVuota(desc) {
  return !desc || !String(desc).trim();
}

// Maschera i token che hanno la forma di un prezzo italiano (con o senza punto
// migliaia, con o senza simbolo €): mai un valore di prezzo reale a schermo.
const PRICE_RE = /^\d{1,3}(?:\.\d{3})*,\d{2}(?:\s*€)?$|^\d{4,9},\d{2}(?:\s*€)?$/;
function maskPrice(s) {
  return PRICE_RE.test(String(s).trim()) ? '#.###,##' : s;
}

async function dumpPage(pdfPath, pageNum) {
  const data = new Uint8Array(await readFile(pdfPath));
  const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  if (!Number.isInteger(pageNum) || pageNum < 1 || pageNum > pdf.numPages) {
    console.error(`Pagina fuori range (1..${pdf.numPages}).`);
    process.exit(2);
  }
  const page = await pdf.getPage(pageNum);
  const tc = await page.getTextContent();
  const vp = page.getViewport({ scale: 1 });
  const items = (tc.items || [])
    .map(it => normalizePdfjsItem(it, vp.height))
    .filter(it => it && String(it.str || '').trim())
    // y = coord display-top (piccolo = più in alto); ordina per y poi per x.
    .sort((a, b) => (Math.round(a.top) - Math.round(b.top)) || (a.x0 - b.x0));

  console.log('='.repeat(72));
  console.log(`DUMP PAGINA ${pageNum}  (${path.basename(pdfPath)})  — prezzi mascherati`);
  console.log(`pageWidth=${Math.round(vp.width)} pageHeight=${Math.round(vp.height)}  item=${items.length}`);
  console.log('  y     x     w     str');
  console.log('-'.repeat(72));
  for (const it of items) {
    const y = String(Math.round(it.top)).padStart(5);
    const x = String(Math.round(it.x0)).padStart(5);
    const w = String(Math.round(it.x1 - it.x0)).padStart(4);
    console.log(`${y} ${x} ${w}   ${maskPrice(it.str)}`);
  }
  console.log('='.repeat(72));
}

async function main() {
  const args = process.argv.slice(2);
  const pdfPath = args.find(a => !a.startsWith('--') &&
    args[args.indexOf(a) - 1] !== '--dump-page');
  if (!pdfPath) {
    console.error('USO: node scripts/valida-listino.mjs <path-al-pdf> [--dump-page N]');
    process.exit(2);
  }
  const di = args.indexOf('--dump-page');
  if (di >= 0) {
    await dumpPage(pdfPath, Number(args[di + 1]));
    return;
  }

  const data = new Uint8Array(await readFile(pdfPath));
  const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const { rows, meta, dotazioni } = await extractFromPdfDocument(pdf, () => {});

  const listino = rows;
  const conPrezzo = listino.filter(r => r.prezzo !== null && r.prezzo !== undefined && r.prezzo !== '');

  // Conteggio per singolo flag (una riga può avere flag multipli separati da ';').
  const flagCounts = new Map();
  for (const r of listino) {
    const flags = String(r.review_flag || '').split(';').map(s => s.trim()).filter(Boolean);
    for (const f of flags) flagCounts.set(f, (flagCounts.get(f) || 0) + 1);
  }

  const descParziali = listino.filter(r => String(r.review_flag || '').split(';').includes('DESC_PARZIALE'));
  const descVuote = listino.filter(r => isVuota(r.descrizione));

  console.log('='.repeat(64));
  console.log('VALIDAZIONE LISTINO:', path.basename(pdfPath));
  console.log('='.repeat(64));
  console.log(`Pagine totali:            ${meta.pages_total}`);
  console.log(`Righe listino totali:     ${listino.length}`);
  console.log(`Prezzi valorizzati:       ${conPrezzo.length}`);
  console.log(`Prezzi mancanti:          ${listino.length - conPrezzo.length}`);
  if (Array.isArray(dotazioni)) {
    console.log(`Righe "Dotazioni std":    ${dotazioni.length}  (codici-didascalia, fuori denominatore prezzi)`);
  }
  console.log('-'.repeat(64));
  console.log('Conteggio per flag:');
  const sortedFlags = [...flagCounts.entries()].sort((a, b) => b[1] - a[1]);
  if (!sortedFlags.length) console.log('  (nessun flag)');
  for (const [f, n] of sortedFlags) console.log(`  ${f.padEnd(28)} ${n}`);
  console.log('-'.repeat(64));
  console.log(`Codici con DESC_PARZIALE:  ${descParziali.length}`);
  for (const r of descParziali) {
    console.log(`  ${r.codice.padEnd(12)} p.${String(r.pagina).padEnd(10)} "${r.descrizione}"`);
  }
  console.log(`Codici con descrizione VUOTA: ${descVuote.length}`);
  for (const r of descVuote) {
    console.log(`  ${r.codice.padEnd(12)} p.${String(r.pagina).padEnd(10)} flag=${r.review_flag || '-'} sez="${r.sezione || ''}"`);
  }
  console.log('='.repeat(64));
}

main().catch(err => {
  console.error('ERRORE:', err && err.stack ? err.stack : err);
  process.exit(1);
});

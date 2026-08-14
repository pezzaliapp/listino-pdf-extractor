#!/usr/bin/env node
// Validazione end-to-end: carica un PDF di listino, esegue l'estrazione
// (riusa src/pdfParser.js) e stampa i contatori diagnostici.
//
// USO:  node scripts/valida-listino.mjs <path-al-pdf>
//
// Il path del PDF è OBBLIGATORIO e va passato come argomento: lo script non
// contiene path personali né dati del listino (vedi CLAUDE.md). Nessun file
// del listino viene scritto o copiato: si legge soltanto.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { extractFromPdfDocument } from '../src/pdfParser.js';

// pdfjs-dist legacy build: gira in Node senza worker/canvas.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = fileURLToPath(
  new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url)
);

function isVuota(desc) {
  return !desc || !String(desc).trim();
}

async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error('USO: node scripts/valida-listino.mjs <path-al-pdf>');
    process.exit(2);
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

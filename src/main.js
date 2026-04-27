// App entry point: wires UI, drag&drop, PDF parsing, preview, and Excel download.

import './style.css';
import { ensureDisclaimerAccepted, showDisclaimer } from './disclaimer.js';
import { showManual } from './manual.js';
import { extractFromPdf } from './pdfParser.js';
import { buildWorkbook, downloadWorkbook, buildOutputFilename } from './excelBuilder.js';

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const state = {
  rows: [],
  fileName: '',
  pageCount: 0
};

const $ = (sel) => document.querySelector(sel);

function setHidden(el, hidden) {
  if (!el) return;
  el.classList.toggle('hidden', hidden);
}

function appendLog(message) {
  const list = $('#log-list');
  if (!list) return;
  const li = document.createElement('li');
  li.textContent = message;
  list.appendChild(li);
  setHidden($('#log-section'), false);
}

function clearLog() {
  const list = $('#log-list');
  if (list) list.innerHTML = '';
}

function renderPreview(rows) {
  const tbody = $('#preview-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const slice = rows.slice(0, 20);
  for (const r of slice) {
    const tr = document.createElement('tr');
    const tds = [
      r.Famiglia || '',
      r.Categoria || '',
      r.Codice || '',
      r.Descrizione || '',
      formatEur(r.Prezzo_EUR),
      r.Pagine ?? '',
      r.Review_Flag || ''
    ];
    tds.forEach((val, idx) => {
      const td = document.createElement('td');
      td.textContent = val;
      if (idx === 6 && val === 'CHECK') td.classList.add('flag-check');
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  setHidden($('#preview-section'), rows.length === 0);
}

function formatEur(n) {
  if (n == null || isNaN(Number(n))) return '';
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(Number(n));
}

async function handleFile(file) {
  if (!file) return;
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
    alert('Per favore, carica un file PDF.');
    return;
  }
  state.fileName = file.name;
  state.rows = [];
  clearLog();
  setHidden($('#preview-section'), true);

  $('#file-name').textContent = file.name;
  $('#file-pages').textContent = '…';
  setHidden($('#file-info'), false);
  setHidden($('#actions'), false);
  $('#btn-download').disabled = true;

  appendLog('Lettura PDF in corso…');

  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    state.pageCount = pdf.numPages;
    $('#file-pages').textContent = String(pdf.numPages);

    const { rows } = await extractFromPdf(pdf, file.name, appendLog);
    state.rows = rows;

    if (rows.length === 0) {
      appendLog('Nessuna riga prodotto riconosciuta. Verifica che il PDF contenga testo selezionabile e abbia il formato listino atteso.');
      $('#btn-download').disabled = true;
    } else {
      renderPreview(rows);
      $('#btn-download').disabled = false;
    }
  } catch (err) {
    console.error(err);
    appendLog(`Errore durante l'elaborazione: ${err.message || err}`);
    $('#btn-download').disabled = true;
  }
}

function downloadExcel() {
  if (!state.rows.length) return;
  try {
    const wb = buildWorkbook(state.rows, state.fileName);
    const out = buildOutputFilename(state.fileName);
    downloadWorkbook(wb, out);
    appendLog(`Excel generato: ${out}`);
  } catch (err) {
    console.error(err);
    appendLog(`Errore generazione Excel: ${err.message || err}`);
  }
}

function bindUi() {
  const dropzone = $('#dropzone');
  const fileInput = $('#file-input');

  fileInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) handleFile(f);
  });

  ['dragenter', 'dragover'].forEach(ev => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('drag-over');
    });
  });
  ['dragleave', 'drop'].forEach(ev => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('drag-over');
    });
  });
  dropzone.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  $('#btn-download').addEventListener('click', downloadExcel);
  $('#btn-manual').addEventListener('click', showManual);
  $('#link-disclaimer').addEventListener('click', (e) => {
    e.preventDefault();
    showDisclaimer();
  });
}

(async function init() {
  const accepted = await ensureDisclaimerAccepted();
  if (!accepted) return;
  bindUi();
})();

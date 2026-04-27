// App entry point: wires UI, drag&drop, PDF parsing, preview, and Excel download.

import './style.css';
import { ensureDisclaimerAccepted, showDisclaimer } from './disclaimer.js';
import { showManual } from './manual.js';
import { extractFromPdfDocument } from './pdfParser.js';
import { buildWorkbook, downloadWorkbook, buildOutputFilename } from './excelBuilder.js';

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const state = {
  rows: [],
  meta: null,
  fileName: ''
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

function formatEur(n) {
  if (n == null || isNaN(Number(n))) return '';
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(Number(n));
}

function renderPreview(rows) {
  const tbody = $('#preview-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const r of rows.slice(0, 20)) {
    const tr = document.createElement('tr');
    const tds = [
      r.codice || '',
      r.descrizione || '',
      formatEur(r.prezzo),
      r.pagina ?? '',
      r.review_flag || ''
    ];
    tds.forEach((val, idx) => {
      const td = document.createElement('td');
      td.textContent = val;
      if (idx === 4 && val) td.classList.add('flag-check');
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  setHidden($('#preview-section'), rows.length === 0);
}

async function handleFile(file) {
  if (!file) return;
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
    alert('Per favore, carica un file PDF.');
    return;
  }
  state.fileName = file.name;
  state.rows = [];
  state.meta = null;
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
    $('#file-pages').textContent = String(pdf.numPages);

    const { rows, meta } = await extractFromPdfDocument(pdf, appendLog);
    state.rows = rows;
    state.meta = meta;

    if (rows.length === 0) {
      appendLog('Nessuna riga prodotto riconosciuta. Verifica che il PDF contenga testo selezionabile.');
      $('#btn-download').disabled = true;
      return;
    }

    renderPreview(rows);
    $('#btn-download').disabled = false;
  } catch (err) {
    console.error(err);
    appendLog(`Errore durante l'elaborazione: ${err.message || err}`);
    $('#btn-download').disabled = true;
  }
}

function downloadExcel() {
  if (!state.rows.length) return;
  try {
    const wb = buildWorkbook({
      rows: state.rows,
      meta: state.meta || { pages_total: 0, rows_extracted: state.rows.length, rows_in_check: 0 },
      sourcePdfName: state.fileName
    });
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

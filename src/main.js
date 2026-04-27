// App entry point: wires UI, drag&drop, PDF parsing, preview, and Excel download.

import './style.css';
import { ensureDisclaimerAccepted, showDisclaimer } from './disclaimer.js';
import { showManual } from './manual.js';
import { extractFromPdf } from './pdfParser.js';
import { buildWorkbook, downloadWorkbook, buildOutputFilename } from './excelBuilder.js';
import { classifyRow } from './classifier.js';
import { bindAdminButton } from './admin.js';

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const state = {
  rows: [],
  parserLog: null,
  fileName: '',
  pageCount: 0,
  previewRows: []
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

function renderPreview(previewRows) {
  const tbody = $('#preview-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const r of previewRows.slice(0, 20)) {
    const tr = document.createElement('tr');
    const tds = [
      r.Famiglia || '',
      r.Categoria || '',
      r.Codice || '',
      r.Descrizione || '',
      formatEur(r.Prezzo_EUR),
      r.Pagine ?? '',
      r.Match_Source || '',
      r.Review_Flag || ''
    ];
    tds.forEach((val, idx) => {
      const td = document.createElement('td');
      td.textContent = val;
      if (idx === 7 && val === 'CHECK') td.classList.add('flag-check');
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  setHidden($('#preview-section'), previewRows.length === 0);
}

function formatEur(n) {
  if (n == null || isNaN(Number(n))) return '';
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(Number(n));
}

async function buildPreview(rows) {
  const out = [];
  for (const r of rows.slice(0, 20)) {
    const cls = await classifyRow({
      descrizione: r.Descrizione,
      prezzo: Number(r.Prezzo_EUR) || 0,
      famigliaRaw: r.famigliaRaw,
      categoriaRaw: r.categoriaRaw
    });
    out.push({
      ...r,
      Famiglia: cls.famiglia,
      Categoria: cls.categoria,
      Match_Source: cls.matchSource
    });
  }
  return out;
}

async function handleFile(file) {
  if (!file) return;
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
    alert('Per favore, carica un file PDF.');
    return;
  }
  state.fileName = file.name;
  state.rows = [];
  state.parserLog = null;
  state.previewRows = [];
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

    const { rows, parserLog } = await extractFromPdf(pdf, file.name, appendLog);
    state.rows = rows;
    state.parserLog = parserLog;

    if (rows.length === 0) {
      appendLog('Nessuna riga prodotto riconosciuta. Verifica che il PDF contenga testo selezionabile e abbia il formato listino atteso.');
      $('#btn-download').disabled = true;
      return;
    }

    state.previewRows = await buildPreview(rows);
    renderPreview(state.previewRows);

    const matchKw = state.previewRows.filter(r => r.Match_Source === 'keyword').length;
    const pct = state.previewRows.length ? Math.round((matchKw / state.previewRows.length) * 100) : 0;
    appendLog(`Match keyword (sulle prime ${state.previewRows.length}): ${pct}%.`);

    $('#btn-download').disabled = false;
  } catch (err) {
    console.error(err);
    appendLog(`Errore durante l'elaborazione: ${err.message || err}`);
    $('#btn-download').disabled = true;
  }
}

async function downloadExcel() {
  if (!state.rows.length) return;
  try {
    const wb = await buildWorkbook({
      rows: state.rows,
      parserLog: state.parserLog || { pages_total: 0, pages_with_text: 0, pages_image_only: 0, rows_extracted: state.rows.length, discarded: [] },
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
  bindAdminButton();
}

(async function init() {
  const accepted = await ensureDisclaimerAccepted();
  if (!accepted) return;
  bindUi();
})();

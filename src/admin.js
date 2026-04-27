// Admin drawer: edit classification rules and plus rules, with backup/restore.

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { DEFAULT_CLASSIFICATION_RULES } from './keywordClassifier.js';
import { DEFAULT_PLUS_RULES } from './classifier.js';

const CLASS_KEY = 'user_classification_rules_v1';
const PLUS_KEY = 'user_plus_rules_v1';

let state = {
  classRules: [],
  plusRules: [],
  activeTab: 1
};

async function loadState() {
  let cls = null, plus = null;
  try { cls = await idbGet(CLASS_KEY); } catch { cls = null; }
  try { plus = await idbGet(PLUS_KEY); } catch { plus = null; }
  state.classRules = (cls && Array.isArray(cls) && cls.length) ? deepClone(cls) : deepClone(DEFAULT_CLASSIFICATION_RULES);
  state.plusRules  = (plus && Array.isArray(plus) && plus.length) ? deepClone(plus) : deepClone(DEFAULT_PLUS_RULES);
}

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function privacyNotice() {
  return `
    <div class="admin-notice">
      <strong>🔒 Privacy.</strong> Le regole che modifichi qui restano <strong>solo nel tuo browser</strong> (IndexedDB).
      Non vengono inviate a server, non vengono committate nel codice. Se cambi computer, dovrai riconfigurarle.
      Suggerimento: dopo aver finito le tue modifiche, esporta un backup (Tab 3 → Esporta).
    </div>
  `;
}

function tabBar() {
  return `
    <div class="admin-tabs" role="tablist">
      <button class="admin-tab ${state.activeTab===1?'is-active':''}" data-tab="1" role="tab">1. Regole Famiglia/Categoria</button>
      <button class="admin-tab ${state.activeTab===2?'is-active':''}" data-tab="2" role="tab">2. Regole Plus_vendita</button>
      <button class="admin-tab ${state.activeTab===3?'is-active':''}" data-tab="3" role="tab">3. Backup / Restore</button>
    </div>
  `;
}

function renderTab1() {
  const rows = state.classRules.map((r, i) => `
    <tr data-idx="${i}">
      <td><textarea class="adm-patterns" rows="3">${escapeHtml((r.patterns || []).join('\n'))}</textarea></td>
      <td><input type="checkbox" class="adm-all" ${r.all ? 'checked' : ''} /></td>
      <td><input type="text" class="adm-fam" value="${escapeHtml(r.famiglia || '')}" /></td>
      <td><input type="text" class="adm-cat" value="${escapeHtml(r.categoria || '')}" /></td>
      <td><input type="number" class="adm-pri" value="${Number(r.priority ?? 0)}" /></td>
      <td class="adm-actions">
        <button type="button" class="adm-up" title="Su">↑</button>
        <button type="button" class="adm-down" title="Giù">↓</button>
        <button type="button" class="adm-del" title="Elimina">✗</button>
      </td>
    </tr>
  `).join('');
  return `
    <div class="admin-pane" data-pane="1">
      ${privacyNotice()}
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr><th>Pattern(s) <small>(una regex per riga)</small></th><th>All?</th><th>Famiglia</th><th>Categoria</th><th>Priority</th><th></th></tr>
          </thead>
          <tbody class="adm-tbody-class">${rows}</tbody>
        </table>
      </div>
      <div class="adm-bar">
        <button type="button" class="btn btn-secondary" data-action="add-class">➕ Aggiungi regola</button>
        <button type="button" class="btn btn-secondary" data-action="reset-class">📋 Carica regole di default</button>
        <button type="button" class="btn btn-primary" data-action="save-class">💾 Salva tutto</button>
      </div>
    </div>
  `;
}

function renderTab2() {
  const rows = state.plusRules.map((r, i) => `
    <tr data-idx="${i}">
      <td><input type="text" class="adm-regex" value="${escapeHtml(r.regex || '')}" /></td>
      <td><input type="text" class="adm-tag" value="${escapeHtml(r.tag || '')}" /></td>
      <td class="adm-actions">
        <button type="button" class="adm-del" title="Elimina">✗</button>
      </td>
    </tr>
  `).join('');
  return `
    <div class="admin-pane" data-pane="2">
      ${privacyNotice()}
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead><tr><th>Regex</th><th>Tag</th><th></th></tr></thead>
          <tbody class="adm-tbody-plus">${rows}</tbody>
        </table>
      </div>
      <div class="adm-bar">
        <button type="button" class="btn btn-secondary" data-action="add-plus">➕ Aggiungi regola</button>
        <button type="button" class="btn btn-secondary" data-action="reset-plus">📋 Carica regole di default</button>
        <button type="button" class="btn btn-primary" data-action="save-plus">💾 Salva tutto</button>
      </div>
    </div>
  `;
}

function renderTab3() {
  return `
    <div class="admin-pane" data-pane="3">
      ${privacyNotice()}
      <p>Esporta un backup completo (regole classificazione + regole plus) come file JSON, oppure importane uno per ripristinare un set salvato in precedenza.</p>
      <div class="adm-bar">
        <button type="button" class="btn btn-primary" data-action="export">💾 Esporta tutte le regole (.json)</button>
        <label class="btn btn-secondary">
          📥 Importa regole (.json)
          <input type="file" accept="application/json,.json" hidden id="adm-import-input" />
        </label>
      </div>
    </div>
  `;
}

function readClassRulesFromDom(root) {
  const rows = root.querySelectorAll('.adm-tbody-class tr');
  const out = [];
  for (const tr of rows) {
    const patterns = (tr.querySelector('.adm-patterns').value || '').split('\n').map(s => s.trim()).filter(Boolean);
    out.push({
      patterns,
      all: tr.querySelector('.adm-all').checked,
      famiglia: tr.querySelector('.adm-fam').value.trim(),
      categoria: tr.querySelector('.adm-cat').value.trim(),
      priority: Number(tr.querySelector('.adm-pri').value) || 0
    });
  }
  return out;
}

function readPlusRulesFromDom(root) {
  const rows = root.querySelectorAll('.adm-tbody-plus tr');
  const out = [];
  for (const tr of rows) {
    out.push({
      regex: tr.querySelector('.adm-regex').value.trim(),
      tag: tr.querySelector('.adm-tag').value.trim()
    });
  }
  return out;
}

function validateAndHighlightClass(root, rules) {
  const trs = root.querySelectorAll('.adm-tbody-class tr');
  let valid = true;
  trs.forEach((tr, i) => {
    tr.classList.remove('adm-invalid');
    const r = rules[i];
    if (!r.patterns.length || !r.famiglia || !r.categoria) { tr.classList.add('adm-invalid'); valid = false; return; }
    for (const p of r.patterns) {
      try { new RegExp(p, 'i'); } catch { tr.classList.add('adm-invalid'); valid = false; return; }
    }
  });
  return valid;
}

function validateAndHighlightPlus(root, rules) {
  const trs = root.querySelectorAll('.adm-tbody-plus tr');
  let valid = true;
  trs.forEach((tr, i) => {
    tr.classList.remove('adm-invalid');
    const r = rules[i];
    if (!r.regex || !r.tag) { tr.classList.add('adm-invalid'); valid = false; return; }
    try { new RegExp(r.regex, 'i'); } catch { tr.classList.add('adm-invalid'); valid = false; }
  });
  return valid;
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importJson(file, drawer) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('JSON non valido');
    const cls = Array.isArray(parsed.classification_rules) ? parsed.classification_rules : null;
    const plus = Array.isArray(parsed.plus_rules) ? parsed.plus_rules : null;
    if (!cls && !plus) throw new Error('Struttura JSON non riconosciuta (servono classification_rules e/o plus_rules).');
    if (cls) await idbSet(CLASS_KEY, cls);
    if (plus) await idbSet(PLUS_KEY, plus);
    alert('Regole importate con successo. Ricarico il pannello.');
    await loadState();
    rerender(drawer);
  } catch (err) {
    alert('Errore importazione: ' + (err.message || err));
  }
}

function attachHandlers(drawer) {
  drawer.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeTab = Number(btn.dataset.tab);
      rerender(drawer);
    });
  });

  drawer.addEventListener('click', async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const action = t.dataset.action;

    if (action === 'add-class') {
      state.classRules = readClassRulesFromDom(drawer);
      state.classRules.push({ patterns: [''], all: false, famiglia: '', categoria: '', priority: 0 });
      rerender(drawer);
      return;
    }
    if (action === 'reset-class') {
      if (!confirm('Questo sovrascrive le regole correnti con quelle di default. Continuare?')) return;
      state.classRules = deepClone(DEFAULT_CLASSIFICATION_RULES);
      rerender(drawer);
      return;
    }
    if (action === 'save-class') {
      const rules = readClassRulesFromDom(drawer);
      if (!validateAndHighlightClass(drawer, rules)) {
        alert('Alcune regole non sono valide (regex non compilabili o campi mancanti). Le righe in rosso sono da correggere.');
        return;
      }
      try {
        await idbSet(CLASS_KEY, rules);
        state.classRules = rules;
        alert('Regole classificazione salvate.');
      } catch (err) {
        alert('Errore di salvataggio: ' + (err.message || err));
      }
      return;
    }
    if (action === 'add-plus') {
      state.plusRules = readPlusRulesFromDom(drawer);
      state.plusRules.push({ regex: '', tag: '' });
      rerender(drawer);
      return;
    }
    if (action === 'reset-plus') {
      if (!confirm('Questo sovrascrive le regole correnti con quelle di default. Continuare?')) return;
      state.plusRules = deepClone(DEFAULT_PLUS_RULES);
      rerender(drawer);
      return;
    }
    if (action === 'save-plus') {
      const rules = readPlusRulesFromDom(drawer);
      if (!validateAndHighlightPlus(drawer, rules)) {
        alert('Alcune regole non sono valide. Le righe in rosso sono da correggere.');
        return;
      }
      try {
        await idbSet(PLUS_KEY, rules);
        state.plusRules = rules;
        alert('Regole Plus_vendita salvate.');
      } catch (err) {
        alert('Errore di salvataggio: ' + (err.message || err));
      }
      return;
    }
    if (action === 'export') {
      let cls = null, plus = null;
      try { cls = await idbGet(CLASS_KEY); } catch {}
      try { plus = await idbGet(PLUS_KEY); } catch {}
      downloadJson('regole-listino-pdf-extractor.json', {
        classification_rules: cls && cls.length ? cls : state.classRules,
        plus_rules: plus && plus.length ? plus : state.plusRules
      });
      return;
    }

    // row buttons
    const tr = t.closest('tr[data-idx]');
    if (!tr) return;
    const idx = Number(tr.dataset.idx);
    if (state.activeTab === 1) {
      state.classRules = readClassRulesFromDom(drawer);
      if (t.classList.contains('adm-up') && idx > 0) {
        [state.classRules[idx-1], state.classRules[idx]] = [state.classRules[idx], state.classRules[idx-1]];
      } else if (t.classList.contains('adm-down') && idx < state.classRules.length - 1) {
        [state.classRules[idx+1], state.classRules[idx]] = [state.classRules[idx], state.classRules[idx+1]];
      } else if (t.classList.contains('adm-del')) {
        state.classRules.splice(idx, 1);
      } else { return; }
      rerender(drawer);
    } else if (state.activeTab === 2) {
      state.plusRules = readPlusRulesFromDom(drawer);
      if (t.classList.contains('adm-del')) {
        state.plusRules.splice(idx, 1);
        rerender(drawer);
      }
    }
  });

  const importInput = drawer.querySelector('#adm-import-input');
  if (importInput) {
    importInput.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importJson(f, drawer);
    });
  }
}

function renderInner() {
  let pane = '';
  if (state.activeTab === 1) pane = renderTab1();
  else if (state.activeTab === 2) pane = renderTab2();
  else pane = renderTab3();
  return `
    <div class="admin-modal" role="dialog" aria-modal="true" aria-label="Pannello Admin">
      <div class="admin-header">
        <h2>⚙️ Admin — Regole di classificazione</h2>
        <button type="button" class="modal-close" id="admin-close" aria-label="Chiudi">×</button>
      </div>
      <div class="admin-body">
        ${tabBar()}
        ${pane}
      </div>
    </div>
  `;
}

function rerender(drawer) {
  drawer.innerHTML = renderInner();
  bindClose(drawer);
  attachHandlers(drawer);
}

function bindClose(drawer) {
  const close = () => {
    drawer.hidden = true;
    drawer.innerHTML = '';
    document.removeEventListener('keydown', keyHandler);
  };
  function keyHandler(e) {
    if (e.key === 'Escape') close();
    else if (e.key === '1') { state.activeTab = 1; rerender(drawer); }
    else if (e.key === '2') { state.activeTab = 2; rerender(drawer); }
    else if (e.key === '3') { state.activeTab = 3; rerender(drawer); }
  }
  document.addEventListener('keydown', keyHandler);
  const closeBtn = drawer.querySelector('#admin-close');
  if (closeBtn) closeBtn.addEventListener('click', close);
}

export async function showAdmin() {
  const drawer = document.getElementById('admin-drawer');
  if (!drawer) return;
  await loadState();
  drawer.hidden = false;
  rerender(drawer);
}

export function bindAdminButton() {
  const btn = document.getElementById('admin-btn');
  if (btn) btn.addEventListener('click', showAdmin);
}

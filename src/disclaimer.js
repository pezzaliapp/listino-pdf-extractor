// Initial blocking disclaimer modal. Acceptance is persisted in IndexedDB via idb-keyval.

import { get, set } from 'idb-keyval';

export const DISCLAIMER_VERSION = 4;
const STORAGE_KEY = `disclaimer_accepted_v${DISCLAIMER_VERSION}`;

const DISCLAIMER_HTML = `
  <h2>⚠️ Avviso importante prima dell'uso</h2>
  <p><strong>Listino PDF Extractor</strong> è uno strumento di estrazione automatica fornito <strong>"così com'è" (AS-IS)</strong>, senza garanzie di alcun tipo, esplicite o implicite, comprese a titolo esemplificativo le garanzie di commerciabilità, idoneità a un particolare scopo o assenza di errori.</p>
  <h3>L'utente prende atto che:</h3>
  <ol>
    <li><strong>L'estrazione automatica può contenere errori, omissioni o interpretazioni scorrette</strong> dei contenuti del PDF (codici, descrizioni, prezzi, classificazioni). I risultati devono essere <strong>verificati manualmente</strong> prima di qualunque uso commerciale, contabile, fiscale o contrattuale.</li>
    <li><strong>I prezzi, le descrizioni e le classificazioni</strong> generati non sono in alcun modo un'offerta commerciale vincolante né una rappresentazione ufficiale del produttore o distributore del listino di origine.</li>
    <li><strong>L'app non sostituisce il listino ufficiale.</strong> In caso di discrepanza fa fede esclusivamente il documento PDF originale del produttore.</li>
    <li><strong>Lo sviluppatore non è responsabile</strong> per perdite economiche, danni diretti o indiretti, errori di preventivazione, contestazioni con clienti o fornitori, sanzioni o qualsiasi altra conseguenza derivante dall'uso dei dati estratti.</li>
    <li><strong>Il PDF caricato non lascia il dispositivo:</strong> l'elaborazione avviene interamente nel browser.</li>
    <li><strong>Titolarità.</strong> Listino PDF Extractor è un progetto open-source di <strong>pezzaliapp</strong>. I marchi e i nomi commerciali eventualmente presenti nei PDF caricati dall'utente appartengono ai rispettivi proprietari e non sono in alcun modo affiliati o sponsorizzati dall'autore dell'app.</li>
    <li><strong>Cosa fa l'app.</strong> Estrae da un PDF di listino le seguenti informazioni: codice articolo, descrizione, prezzo, pagina del PDF in cui appare. <strong>Non</strong> classifica gli articoli per famiglia o categoria, <strong>non</strong> suggerisce upselling o tier commerciali. La classificazione, se necessaria, è responsabilità dell'utente che potrà arricchire l'Excel di output con i propri strumenti (VLOOKUP, gestionale aziendale, ecc.).</li>
    <li><strong>Trattamento dati.</strong> Tutti i PDF caricati restano nel browser dell'utente. L'app non raccoglie analytics, telemetria o identificativi.</li>
  </ol>
  <h3>Procedendo dichiari di:</h3>
  <ul>
    <li>aver letto e compreso quanto sopra;</li>
    <li>aver compiuto <strong>18 anni</strong>;</li>
    <li>usare l'app sotto tua <strong>esclusiva responsabilità</strong>.</li>
  </ul>
`;

export async function isDisclaimerAccepted() {
  try {
    const v = await get(STORAGE_KEY);
    return !!(v && v.accepted);
  } catch (err) {
    console.warn('disclaimer storage read failed', err);
    return false;
  }
}

export async function persistAcceptance() {
  try {
    await set(STORAGE_KEY, {
      accepted: true,
      version: DISCLAIMER_VERSION,
      ts: new Date().toISOString()
    });
  } catch (err) {
    console.warn('disclaimer storage write failed', err);
  }
}

function showBlockedScreen() {
  const root = document.getElementById('app');
  if (root) root.style.display = 'none';
  const blocked = document.createElement('div');
  blocked.className = 'blocked-page';
  blocked.textContent = "L'app non può essere usata senza accettazione del disclaimer.";
  document.body.appendChild(blocked);
}

function buildModal({ blocking, onAccept, onDecline, onClose }) {
  const root = document.getElementById('modal-root') || document.body;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Disclaimer');
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>Disclaimer</h2>
        ${blocking ? '' : '<button class="modal-close" type="button" aria-label="Chiudi">×</button>'}
      </div>
      <div class="modal-body">${DISCLAIMER_HTML}</div>
      <div class="modal-footer">
        <button class="btn btn-danger" data-action="decline" type="button">❌ Non accetto, esci</button>
        <button class="btn btn-primary" data-action="accept" type="button">✅ Ho letto e accetto</button>
      </div>
    </div>
  `;
  root.appendChild(backdrop);

  const close = () => {
    backdrop.remove();
    if (onClose) onClose();
  };

  backdrop.querySelector('[data-action="accept"]').addEventListener('click', async () => {
    await persistAcceptance();
    close();
    if (onAccept) onAccept();
  });
  backdrop.querySelector('[data-action="decline"]').addEventListener('click', () => {
    backdrop.remove();
    if (onDecline) onDecline();
  });
  if (!blocking) {
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        close();
      }
    });
  }
  return backdrop;
}

// Show blocking disclaimer if not yet accepted; resolves true if accepted.
export async function ensureDisclaimerAccepted() {
  if (await isDisclaimerAccepted()) return true;
  return new Promise((resolve) => {
    buildModal({
      blocking: true,
      onAccept: () => resolve(true),
      onDecline: () => {
        showBlockedScreen();
        resolve(false);
      }
    });
  });
}

// Re-open the disclaimer (read-only style: closing returns to app, declining still blocks).
export function showDisclaimer() {
  buildModal({
    blocking: false,
    onAccept: () => {},
    onDecline: () => { showBlockedScreen(); }
  });
}

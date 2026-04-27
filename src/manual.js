// In-app user manual content and modal renderer (v5).

export const MANUAL_HTML = `
  <div class="manual-layout">
    <nav class="manual-toc" aria-label="Sommario manuale">
      <ol>
        <li><a href="#m-0">Privacy</a></li>
        <li><a href="#m-1">Cosa fa l'app</a></li>
        <li><a href="#m-2">Come si usa</a></li>
        <li><a href="#m-3">Cosa contiene l'Excel</a></li>
        <li><a href="#m-4">Review_Flag</a></li>
        <li><a href="#m-5">Cosa l'app NON fa</a></li>
        <li><a href="#m-6">Limiti noti</a></li>
        <li><a href="#m-7">FAQ</a></li>
        <li><a href="#m-8">Versione</a></li>
      </ol>
    </nav>
    <div class="manual-content">
      <section id="m-0">
        <h2>0. Privacy</h2>
        <p>Il PDF non lascia il tuo browser. L'elaborazione avviene tutta in locale.</p>
      </section>

      <section id="m-1">
        <h2>1. Cosa fa l'app</h2>
        <p>Legge un PDF di listino e produce un Excel a <strong>3 fogli</strong>:</p>
        <ul>
          <li><code>00_Info</code> — metadati di estrazione (versione app, versione parser, conteggi).</li>
          <li><code>Listino</code> — una riga per articolo, <strong>6 colonne</strong>: Codice, Descrizione, Prezzo_EUR, Pagina, Review_Flag, Sezione.</li>
          <li><code>Accessori_Standard</code> — codici di accessori inclusi in dotazione (senza prezzo proprio in quella posizione del PDF).</li>
        </ul>
        <p>La colonna <code>Sezione</code> è ricavata <strong>euristicamente</strong> dai titoli di pagina del PDF e dai sotto-marker tipo <em>"ACCESSORI STANDARD"</em>: è un'indicazione di provenienza, non una classificazione tassonomica.</p>
      </section>

      <section id="m-2">
        <h2>2. Come si usa (3 passi)</h2>
        <ol>
          <li>Trascina il PDF nell'area dedicata o usa <strong>Scegli file</strong>.</li>
          <li>Verifica l'anteprima delle prime 20 righe.</li>
          <li>Clicca <strong>Scarica Excel</strong>.</li>
        </ol>
      </section>

      <section id="m-3">
        <h2>3. Cosa contiene l'Excel</h2>
        <ul>
          <li><strong><code>00_Info</code></strong>: metadati di estrazione (file di origine, pagine, righe estratte, righe in CHECK, data, <code>Versione app</code>, <code>Versione_Parser</code>).</li>
          <li><strong><code>Listino</code></strong>: una riga per articolo, 6 colonne — <code>Codice</code>, <code>Descrizione</code>, <code>Prezzo_EUR</code>, <code>Pagina</code>, <code>Review_Flag</code>, <code>Sezione</code> (titolo della pagina del PDF e, se presente, il sotto-marker tipo <em>"ACCESSORI STANDARD"</em>).</li>
          <li><strong><code>Accessori_Standard</code></strong>: stessa struttura di <code>Listino</code>, ma raccoglie solo le righe con prezzo vuoto la cui sezione contiene <em>"ACCESSORI STANDARD"</em>, <em>"OPTIONAL"</em> o <em>"OPTIONAL CONSIGLIATI"</em> (codici di accessori inclusi in dotazione, senza listino in quella posizione). Il foglio è sempre presente, anche vuoto.</li>
        </ul>
      </section>

      <section id="m-4">
        <h2>4. La colonna <code>Review_Flag</code></h2>
        <ul>
          <li>Vuota = riga estratta correttamente.</li>
          <li><code>PREZZO_MANCANTE</code> = il parser non ha trovato un prezzo nella banda del codice. <strong>Apri il PDF originale alla pagina indicata e correggi a mano</strong> (oppure: se il codice è un accessorio incluso in dotazione, dovrebbe essere già nel foglio <code>Accessori_Standard</code>).</li>
          <li><code>MULTI_PRICE</code> = la banda del codice contiene più prezzi distinti, ambigui. <strong>Verifica nel PDF quale è quello corretto.</strong></li>
          <li><code>MERGED_FROM_PREV</code> = la riga è stata ricostruita perché il codice condivide la stessa cella tabella con il codice precedente (descrizione e prezzo copiati). <strong>Verifica che siano effettivamente del codice corretto.</strong></li>
          <li><code>CHECK_PREZZO_DIFFORME</code> = il codice appare in più pagine con prezzi diversi. <strong>Verifica.</strong></li>
        </ul>
      </section>

      <section id="m-5">
        <h2>5. Cosa l'app NON fa</h2>
        <ul>
          <li>Non classifica per famiglia/categoria.</li>
          <li>Non calcola sconti, totali, IVA.</li>
          <li>Non importa nel gestionale.</li>
          <li>Non legge PDF scannerizzati (servono PDF con testo selezionabile).</li>
        </ul>
        <p>Se ti serve <strong>arricchire i dati</strong> (es. associare a ogni codice una famiglia commerciale), apri l'Excel scaricato e usa <strong>VLOOKUP</strong> verso il tuo file di anagrafica. È un lavoro tuo, non della PWA.</p>
      </section>

      <section id="m-6">
        <h2>6. Limiti noti</h2>
        <ul>
          <li>I PDF scannerizzati non funzionano. Serve testo selezionabile.</li>
          <li>Listini con layout grafico molto irregolare possono produrre più righe in <code>CHECK</code>.</li>
          <li>L'app è ottimizzata per listini italiani con prezzi formato <code>1.234,56 €</code>.</li>
        </ul>
      </section>

      <section id="m-7">
        <h2>7. FAQ</h2>
        <p><strong>D: Posso usarla con PDF di altri produttori (Sice, Werther, Ravaglioli)?</strong><br />R: Sì, finché il PDF ha una struttura tabellare con codice + descrizione + prezzo per riga. Non garantito al 100% per layout particolarmente complessi.</p>
        <p><strong>D: Perché alcune descrizioni sono incomplete?</strong><br />R: Probabilmente il parser non è riuscito a unire più righe. Apri il PDF alla pagina indicata e completa a mano la descrizione nell'Excel.</p>
        <p><strong>D: Posso usarla offline?</strong><br />R: Sì, dopo la prima apertura. Installa la PWA dal browser per averla sul desktop.</p>
      </section>

      <section id="m-8">
        <h2>8. Versione</h2>
        <p>v5.0.0 — Autore: pezzaliapp.</p>
      </section>
    </div>
  </div>
`;

export function showManual() {
  const root = document.getElementById('modal-root') || document.body;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', "Manuale d'uso");
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>Manuale d'uso</h2>
        <button class="modal-close" type="button" aria-label="Chiudi">×</button>
      </div>
      <div class="modal-body">${MANUAL_HTML}</div>
    </div>
  `;
  root.appendChild(backdrop);

  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);
}

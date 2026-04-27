// In-app user manual content and modal renderer.

export const MANUAL_HTML = `
  <div class="manual-layout">
    <nav class="manual-toc" aria-label="Sommario manuale">
      <ol>
        <li><a href="#m-1">Cos'è questa app</a></li>
        <li><a href="#m-2">Come si usa</a></li>
        <li><a href="#m-3">Cosa contiene l'Excel</a></li>
        <li><a href="#m-4">Campo Review_Flag</a></li>
        <li><a href="#m-5">Logica di classificazione</a></li>
        <li><a href="#m-6">Privacy</a></li>
        <li><a href="#m-7">Limiti noti</a></li>
        <li><a href="#m-8">FAQ</a></li>
        <li><a href="#m-9">Versione</a></li>
        <li><a href="#m-10">Contatti / Bug</a></li>
      </ol>
    </nav>
    <div class="manual-content">
      <section id="m-1">
        <h2>1. Cos'è questa app</h2>
        <p>Un estrattore automatico di listini prezzi in PDF verso Excel multi-foglio. Pensato per il listino Cormach ma compatibile con qualunque PDF di listino con struttura simile (Famiglia → Categoria → righe codice/descrizione/prezzo).</p>
      </section>

      <section id="m-2">
        <h2>2. Come si usa (3 passi)</h2>
        <ol>
          <li><strong>Carica</strong> il PDF trascinandolo nell'area dedicata o con il pulsante "Scegli file".</li>
          <li><strong>Verifica</strong> l'anteprima (prime 20 righe estratte) e il riepilogo (pagine, righe trovate, righe da controllare).</li>
          <li><strong>Scarica</strong> il file Excel cliccando "Scarica Excel".</li>
        </ol>
      </section>

      <section id="m-3">
        <h2>3. Cosa contiene l'Excel</h2>
        <ul>
          <li><strong><code>00_Note</code></strong> — metadati e legenda.</li>
          <li><strong><code>01_Listino_pulito</code></strong> — listino estratto, una riga per articolo, pronto per import in altri sistemi.</li>
          <li><strong><code>02_CSVXpressSmart</code></strong> — vista preventivazione: compila a mano <code>Trasporto_EUR</code>, <code>Installazione_EUR</code>, <code>Sconto_%</code>. I campi <code>Netto_macchina_EUR</code> e <code>Totale_preventivo_EUR</code> si aggiornano automaticamente con le formule.</li>
          <li><strong><code>03_Commerciale</code></strong> — vista commerciale con classificazione <code>Tier</code> (Entry/Mid/Premium) e suggerimenti di upsell.</li>
        </ul>
      </section>

      <section id="m-4">
        <h2>4. Campo <code>Review_Flag</code></h2>
        <p>Se vedi <code>CHECK</code> in una riga, significa che l'estrazione automatica ha avuto difficoltà (descrizione spezzata, font irregolare, cella vuota nel PDF). <strong>Apri il PDF originale alla pagina indicata in <code>Pagine</code> e correggi a mano la descrizione.</strong></p>
      </section>

      <section id="m-5">
        <h2>5. Logica di classificazione (foglio 03)</h2>
        <ul>
          <li><strong>Tier:</strong> <code>Entry</code> se prezzo &lt; 1000 €, <code>Mid</code> se 1000–2999 €, <code>Premium</code> se ≥ 3000 €.</li>
          <li><strong>Plus_vendita / Upsell:</strong> assegnati di default in base alla Famiglia. Sono <strong>suggerimenti</strong>, non regole rigide. Modificali liberamente nell'Excel.</li>
        </ul>
      </section>

      <section id="m-6">
        <h2>6. Privacy</h2>
        <p><strong>Il PDF non viene mai caricato su nessun server.</strong> Tutta l'elaborazione avviene nel browser del tuo dispositivo. Puoi anche staccare la connessione internet dopo aver aperto l'app la prima volta.</p>
      </section>

      <section id="m-7">
        <h2>7. Limiti noti</h2>
        <ul>
          <li>I PDF <strong>scannerizzati</strong> (immagini, non testo selezionabile) non funzionano. Serve un PDF con testo vero. Se hai uno scan, passalo prima da un OCR (es. Adobe Acrobat).</li>
          <li>Listini con <strong>layout molto irregolare</strong> o multi-colonna fitto possono dare estrazioni parziali. Usa il <code>Review_Flag</code> come guida.</li>
          <li>L'app è ottimizzata per il <strong>formato Cormach 2025–2026</strong>. Su altri produttori funziona ma le Famiglie/Categorie potrebbero non essere riconosciute (resteranno come testo grezzo).</li>
        </ul>
      </section>

      <section id="m-8">
        <h2>8. FAQ</h2>
        <p><strong>D: I prezzi estratti sono affidabili al 100%?</strong><br />R: No. Verifica sempre. Vedi disclaimer iniziale.</p>
        <p><strong>D: Posso usarla offline?</strong><br />R: Sì, dopo la prima apertura. Installa l'app dal browser (icona "Installa app" nella barra indirizzi) per averla come icona sul desktop/home.</p>
        <p><strong>D: Dove finiscono i miei dati?</strong><br />R: Da nessuna parte. Restano nel browser. Solo l'accettazione del disclaimer è memorizzata in locale.</p>
      </section>

      <section id="m-9">
        <h2>9. Versione</h2>
        <p>v1.0.0 — vedi <code>README.md</code> su GitHub per changelog.</p>
      </section>

      <section id="m-10">
        <h2>10. Contatti / Bug</h2>
        <p>Apri una issue sul repository GitHub.</p>
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

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
        <p>Un estrattore automatico di listini prezzi in PDF verso Excel multi-foglio. Compatibile con qualunque PDF di listino del settore officina con struttura riga codice/descrizione/prezzo (auto-officina, gommista, attrezzature varie).</p>
      </section>

      <section id="m-2">
        <h2>2. Come si usa (3 passi)</h2>
        <ol>
          <li><strong>Carica</strong> il PDF trascinandolo nell'area dedicata o con il pulsante "Scegli file".</li>
          <li><strong>Verifica</strong> l'anteprima (prime 20 righe estratte) e il riepilogo (pagine, righe trovate, righe da controllare, percentuale match keyword).</li>
          <li><strong>Scarica</strong> il file Excel cliccando "Scarica Excel".</li>
        </ol>
      </section>

      <section id="m-3">
        <h2>3. Cosa contiene l'Excel</h2>
        <ul>
          <li><strong><code>00_Note</code></strong> — metadati, versione app, regole attive, percentuale match keyword.</li>
          <li><strong><code>01_Listino_pulito</code></strong> — listino estratto, una riga per articolo, con la colonna <code>Match_Source</code> (<code>keyword</code> / <code>pdf-heading</code> / <code>fallback</code>).</li>
          <li><strong><code>02_CSVXpressSmart</code></strong> — vista preventivazione: compila a mano <code>Trasporto_EUR</code>, <code>Installazione_EUR</code>, <code>Sconto_%</code>. <code>Netto_macchina_EUR</code> e <code>Totale_preventivo_EUR</code> si aggiornano automaticamente con le formule.</li>
          <li><strong><code>03_Commerciale</code></strong> — vista commerciale con classificazione <code>Tier</code> (Entry/Mid/Premium), <code>Plus_vendita</code>, <code>Upsell_suggerito</code> e <code>Pitch_breve</code>.</li>
          <li><strong><code>98_Regole</code></strong> — istantanea read-only delle regole di classificazione e dei tag Plus_vendita attivi (default o custom). Per modificarli usa il pannello <strong>⚙️ Admin</strong> nell'app.</li>
          <li><strong><code>99_Diagnostica</code></strong> — distribuzione articoli per Famiglia/Categoria, righe non classificate (Match_Source ≠ keyword) e log del parser PDF.</li>
        </ul>
      </section>

      <section id="m-4">
        <h2>4. Campo <code>Review_Flag</code></h2>
        <p>Se vedi <code>CHECK</code> in una riga, significa che l'estrazione automatica ha avuto difficoltà (descrizione spezzata, font irregolare, cella vuota nel PDF). <strong>Apri il PDF originale alla pagina indicata in <code>Pagine</code> e correggi a mano la descrizione.</strong></p>
      </section>

      <section id="m-5">
        <h2>5. Logica di classificazione</h2>

        <h3>Famiglia e Categoria</h3>
        <p>L'app cerca <strong>parole-chiave generiche</strong> nella descrizione di ogni articolo:</p>
        <ul>
          <li>Trova "equilibratrice" / "bilanciatrice" → <strong>Famiglia: Equilibratrici</strong></li>
          <li>Trova "smontagomme" → <strong>Famiglia: Smontagomme</strong></li>
          <li>Trova "assetto" o "geometria ruote" → <strong>Famiglia: Assetti ruote</strong></li>
          <li>Trova "sollevatore" / "ponte" → <strong>Famiglia: Sollevatori</strong></li>
          <li>Trova "compressore" → <strong>Famiglia: Attrezzature varie / Compressori</strong></li>
          <li>…e altre 15 regole.</li>
        </ul>
        <p>Le regole considerano anche <strong>modificatori</strong> (truck/moto/auto, 2 colonne / 4 colonne / forbice).</p>
        <p>Se nessuna regola matcha, viene usato il banner di sezione del PDF (se presente) oppure "Attrezzature varie / Generico" come fallback.</p>

        <h3>Personalizzazione delle regole</h3>
        <p>Dal pannello <strong>⚙️ Admin</strong> puoi:</p>
        <ul>
          <li>aggiungere nuove regole (es. "bilanciatrice" se un fornitore usa quella parola);</li>
          <li>modificare quelle esistenti;</li>
          <li>cambiare priorità (regole più specifiche → priority più alta);</li>
          <li>esportare e importare set di regole come backup.</li>
        </ul>
        <p>Le tue modifiche restano <strong>solo nel tuo browser</strong> e non vengono mai inviate altrove.</p>

        <h3>Tier (foglio 03)</h3>
        <ul>
          <li>prezzo &lt; 1000 € → <code>Entry</code></li>
          <li>1000–2999 € → <code>Mid</code></li>
          <li>≥ 3000 € → <code>Premium</code></li>
        </ul>

        <h3>Plus_vendita</h3>
        <p>Tag derivati da parole tecniche presenti nella descrizione: NLS → "bloccaggio rapido", LIFT/sollevatore → "sollevatore integrato", RLC → "analisi runout", LASER → "laser", SMART APP → "connettività app", e altri 8 (motoinverter, sonar, runflat, leverless, industria 4.0, bluetooth/wireless, touch screen).</p>
      </section>

      <section id="m-6">
        <h2>6. Privacy</h2>
        <p><strong>Il PDF non viene mai caricato su nessun server.</strong> Tutta l'elaborazione avviene nel browser del tuo dispositivo. Anche le regole personalizzate dell'Admin restano solo nel tuo browser (IndexedDB), non sono inviate altrove e non sono committate nel codice. Puoi staccare la connessione internet dopo aver aperto l'app la prima volta.</p>
      </section>

      <section id="m-7">
        <h2>7. Limiti noti</h2>
        <ul>
          <li>I PDF <strong>scannerizzati</strong> (immagini, non testo selezionabile) non funzionano. Serve un PDF con testo vero. Se hai uno scan, passalo prima da un OCR.</li>
          <li>Listini con <strong>layout molto irregolare</strong> o multi-colonna fitto possono dare estrazioni parziali. Usa il <code>Review_Flag</code> e il foglio <code>99_Diagnostica</code> come guida.</li>
          <li>La classificazione si basa sul <strong>vocabolario usato nel PDF</strong>. Se il fornitore usa termini inusuali, aggiungi una regola personalizzata in ⚙️ Admin invece di modificare il codice.</li>
        </ul>
      </section>

      <section id="m-8">
        <h2>8. FAQ</h2>
        <p><strong>D: I prezzi estratti sono affidabili al 100%?</strong><br />R: No. Verifica sempre. Vedi disclaimer iniziale.</p>
        <p><strong>D: Posso usarla offline?</strong><br />R: Sì, dopo la prima apertura. Installa l'app dal browser (icona "Installa app" nella barra indirizzi) per averla come icona sul desktop/home.</p>
        <p><strong>D: Dove finiscono i miei dati?</strong><br />R: Da nessuna parte. Restano nel browser. Solo l'accettazione del disclaimer e le tue regole personalizzate sono memorizzate in locale (IndexedDB).</p>
        <p><strong>D: Posso usarla anche con listini di altri fornitori (Sice, Werther, Ravaglioli, ecc.)?</strong><br />R: Sì. Le regole sono basate su parole italiane comuni del settore. Se un fornitore usa un termine specifico ("bilanciatrice", "verticalizzatore", ecc.) puoi aggiungerlo come regola personalizzata in ⚙️ Admin senza ridistribuire l'app.</p>
      </section>

      <section id="m-9">
        <h2>9. Versione</h2>
        <p>v3.0.0 — vedi <code>README.md</code> su GitHub per changelog.</p>
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

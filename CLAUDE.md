# CLAUDE.md — regole per questo repo (listino-pdf-extractor)

## Regola non negoziabile: riservatezza dei listini
- I listini (PDF, xlsx, csv) NON vanno MAI committati, pushati o copiati dentro il repo.
- I file di test riservati stanno in `../dati-riservati/` (fuori dall'albero git). Leggili da lì via path relativo; non copiarli in `repo/`.
- Non usare mai `git add -f` su file ignorati. Prima di ogni commit esegui `git status` e verifica che non compaiano PDF/xlsx.
- Se un test ha bisogno di dati, usa fixture sintetiche minime (poche righe inventate che riproducono il pattern), mai estratti reali del listino con prezzi veri.

## Riservatezza: nessun riferimento identificabile nel repo
- Nel repository — file, fixture, test, messaggi di commit, CHANGELOG, README, commenti — non devono MAI comparire: il nome del produttore del listino, i nomi dei suoi modelli, riferimenti a revisioni del listino, né valori di prezzo reali.
- Negli esempi e nelle fixture usa dati fittizi: nomi inventati (es. `ACME`, `MODELLO-X`), prezzi inventati con lo stesso formato (migliaia col punto, virgola decimale), codici fittizi a 8 cifre.
- Le diciture di layout (`ACCESSORI STANDARD`, `ACCESSORI OPTIONAL`) sono ammesse: descrivono la struttura del PDF, non il prodotto.
- Nei report da incollare in chat: niente prezzi.

## Struttura
- `src/pdfParser.js` — core di estrazione (il lavoro è quasi tutto qui)
- `src/excelBuilder.js` — generazione Excel
- `tests/` — test con `node --test` (`npm test`)
- Ambiente: PWA client-side, pdfjs-dist + SheetJS. Nessun backend: tutto resta nel browser.

## Flusso di lavoro
- Lavora sul branch `fix/pattern-estrazione`, mai su `main`.
- Un pattern = un commit (o più commit piccoli), mai un mega-commit che mescola i tre pattern.
- Dopo OGNI modifica a `src/pdfParser.js`: `npm test`. Gli 88 test esistenti non devono regredire; i nuovi comportamenti vanno coperti da nuovi test.
- Validazione end-to-end: script Node che carica `../dati-riservati/Listino_04_2026_ITA_rev_06.pdf`, esegue l'estrazione e stampa i contatori (righe totali, prezzi valorizzati, flag per categoria). Lo script può stare in `scripts/` ma NON deve contenere path assoluti personali né dati del listino; il path del PDF va passato come argomento.
- Baseline da non peggiorare: 286/293 prezzi corretti, ~250/296 descrizioni fedeli sul PDF di riferimento.

## Stile
- Niente nuove dipendenze senza chiederlo.
- Commenti e messaggi di commit in italiano.
- I nuovi flag di revisione seguono lo stile esistente (MAIUSCOLO_CON_UNDERSCORE nella colonna Review_Flag).

# Listino PDF Extractor

PWA offline-capable che estrae da un PDF di listino **codice articolo, descrizione, prezzo e pagina**, e produce un Excel pulito a 5 colonne pronto per essere arricchito a piacere (VLOOKUP, gestionale, ecc.). Niente classificazione automatica, niente regole keyword: una cosa sola, fatta bene.

🌐 **Live demo:** https://pezzaliapp.github.io/listino-pdf-extractor/

---

## ⚠️ Disclaimer (sintesi)

Strumento fornito **AS-IS**, senza garanzie. L'estrazione automatica può contenere errori: i risultati vanno **verificati manualmente** prima di qualunque uso commerciale, contabile o contrattuale. I prezzi/descrizioni generati **non costituiscono offerta commerciale** e l'app **non sostituisce il listino ufficiale**. Il PDF caricato **non lascia il dispositivo**: tutta l'elaborazione avviene nel browser. Vedi il disclaimer completo in-app alla prima apertura o dal footer.

---

## Cosa fa l'app

1. Apri un PDF di listino con testo selezionabile.
2. La PWA estrae le righe-prodotto (anche descrizioni spezzate su 2 o 3 righe).
3. Scarichi un Excel con due fogli: `00_Info` (metadati) e `Listino` (5 colonne).

| Codice | Descrizione | Prezzo_EUR | Pagina | Review_Flag |
|---|---|---|---|---|
| 00100208 | PUMA CE 1ph 230V 50-60Hz | 3940 | 6 | |
| 21100375 | KIT SMART APP: Include traffico dati per 36 mesi… | 880 | 6 | |
| 99999999 | Articolo isolato senza prezzo | (vuoto) | 10 | CHECK |

`Review_Flag` può essere:
- vuoto → riga estratta correttamente
- `CHECK` → prezzo non determinabile, da verificare manualmente
- `CHECK_PREZZO_DIFFORME` → il codice appare in più pagine con prezzi diversi

Nient'altro. Se vuoi una famiglia commerciale, un tier o un upsell, fa' un VLOOKUP nel tuo file.

---

## Requisiti

- Node.js ≥ 20 LTS
- npm

## Setup locale

```bash
git clone https://github.com/pezzaliapp/listino-pdf-extractor.git
cd listino-pdf-extractor
npm install
npm run icons     # genera le icone PWA
npm run dev       # avvia dev server (http://localhost:5173)
```

## Build di produzione

```bash
npm run build
npm run preview   # serve dist/ su http://localhost:4173
```

## Test

```bash
npm test
```

I test usano `node --test` e coprono:
- le funzioni helper di `pdfParser.js` (`parsePriceString`, `isProductCode`, `hasProductCode`, `isCompleteProductRow`);
- l'algoritmo `joinMultiLineRows` (merge a 2 e 3 righe, casi degeneri).

---

## Stack

- **Vite** (vanilla JS, no framework)
- **vite-plugin-pwa** (manifest + service worker via Workbox)
- **pdfjs-dist** (Mozilla PDF.js, parsing in browser)
- **xlsx** (SheetJS Community Edition tarball ufficiale)
- **idb-keyval** (persistenza accettazione disclaimer)
- CSS puro
- GitHub Pages + Actions per il deploy

---

## Manuale d'uso

Disponibile in-app dal pulsante **📖 Manuale** in alto a destra.

---

## Decisioni v5

La v5 mantiene il design minimale della v4 (un'app, un job: estrarre dati tabellari da un PDF di listino) ma aggiunge **un'estrazione molto più robusta** sui PDF reali grazie a 9 patch chirurgiche al parser. Niente nuove dipendenze, niente classificazione automatica, niente regole keyword.

### Cosa cambia rispetto alla v4

- **Pipeline di parsing riscritta in modalità "anchor-first"** (M1): la riga prodotto non è più "una y" ma una banda verticale ancorata al codice 8 cifre, con classificazione per fascia X auto-derivata (M2). Risultato: descrizioni multi-riga e codici "centrati" sulla cella sono catturati naturalmente.
- **Filtri pre-emit** per ridurre il rumore: header verticali con caratteri singoli (M3), icone testuali da badge ("AUTO", "MOBILE SERVICE", ...) (M4), marker laterali tipo "x12" / "(2pcs)" (M9), bucket Y proporzionale al font dominante (M8).
- **Merge multi-codice** (M5): due codici che condividono una cella tabella unita producono ora una riga completa + una seconda marcata `MERGED_FROM_PREV`, invece di due righe entrambe rotte.
- **Colonna `Sezione`** (M6): metadato derivato euristicamente dal titolo della pagina del PDF e dai sotto-marker (`ACCESSORI STANDARD`, `OPTIONAL`, ...). Non è una classificazione tassonomica, è un'indicazione di provenienza.
- **Foglio `Accessori_Standard`** (M7): le righe senza prezzo proprio che cadono in sezioni accessori-standard vengono spostate in un foglio separato. Le righe senza prezzo in sezioni "regolari" (es. nome modello commerciale) restano in `Listino` con flag `PREZZO_MANCANTE` per revisione manuale.

### Patch applicate (in ordine cronologico di commit)

| # | Patch | Cosa fa |
|---|-------|---------|
| M8 | Y bucket dinamico | Bucket Y proporzionale alla moda dei font del corpo (sostituisce il valore fisso `2`) |
| M2 | Detection fasce X auto | Calcola `code` / `descrizione` / `prezzo` / `compatibilita` / `noteLaterali` dalla moda di codici e prezzi |
| M3 | Filtro header verticale | Rimuove caratteri 1-2 di intestazioni di colonna ruotate 90° |
| M9 | Filtro note laterali | Rimuove "x4" / "x12" / "(2pcs)" / "Ømm58" nelle fasce note laterali |
| M1 | Anchor-first row-band | Riscrittura cuore del parser, sostituisce line-by-line |
| M4 | Filtro icone testuali | Rimuove "AUTO" / "MOBILE SERVICE" / "B" isolata da descrizione |
| M5 | Merge multi-codice | Coppia di codici che condividono cella → una riga + un `MERGED_FROM_PREV` |
| M6 | Sezione corrente | Aggiunge colonna `Sezione` come metadato derivato |
| M7 | Foglio Accessori_Standard | Split di `Listino` + nuovo foglio dedicato + bump versione 5.0.0 |

### Nuovi valori di `Review_Flag` attivi in v5

- `PREZZO_MANCANTE` — codice senza prezzo nella sua banda
- `MULTI_PRICE` — banda con più prezzi distinti
- `MERGED_FROM_PREV` — riga ricostruita via merge multi-codice
- `CHECK_PREZZO_DIFFORME` — codice presente su più pagine con prezzi diversi (ereditato da v4)

## Limitazioni note v5

Tre limiti documentati nel codice (commenti `LIMITE NOTO` nel relativo JSDoc) e una funzionalità SPEC non implementata. Tutti candidati a v5.1:

1. **M4 — pattern mirror-via-PDF-transform.** Il filtro icone non gestisce stringhe multi-char già reversed dal PDF transform (es. `'ECIVRE'` per `'SERVICE'`, pattern §P4 SPEC v5 pag. 25). Coperti: char singoli sparsi su una o due y vicine. Da affrontare in v5.1 se compaiono nei listini reali.
2. **M5 — comportamento cascade non testato.** Il merge è iterativo, quindi cascade `A → B → C` si propaga (B prende da A, poi C prende da B). Sui PDF di test della SPEC v5 non sono attesi cascade (i pattern P5 sono sempre coppie), ma il comportamento non è esplicitamente verificato. Se in futuro un listino producesse cascade indesiderati, l'opzione è limitare l'iterazione a un singolo passaggio.
3. **M6 — marker di sezione spezzati su 3+ token.** La detection `findSectionMarkers` richiede match esatto (line text uppercased+space-normalized === marker). Marker spezzati su 3+ token con tolleranze di y > 2pt, oppure in formato esotico (case mista, accenti, suffissi tipo `"ACCESSORI STANDARD A"`), non vengono catturati. Da rivisitare in v5.1.
4. **`Review_Flag = DESCRIZIONE_TRONCATA` non implementato.** La SPEC v5 lo elenca tra i possibili valori (descrizione che termina con "..." o senza punto finale dopo word non comune), ma nessuna delle 9 patch lo emette. Da aggiungere in v5.1 se considerato utile.

---

## Decisioni v4

Tornati a un design **minimale** dopo aver capito che l'utente preferisce arricchire i dati a parte invece che farli classificare automaticamente dall'app.

- **Niente Famiglia / Categoria / Tier / Plus_vendita / Match_Source**: tutto rimosso. La PWA fa una cosa sola — estrarre i dati tabellari del PDF — e la fa bene.
- **Niente pannello Admin, niente regole keyword, niente IndexedDB per regole utente**. Cancellati `src/admin.js`, `src/keywordClassifier.js`, `src/classifier.js`.
- **Output Excel ridotto a 2 fogli**: `00_Info` (metadati read-only) + `Listino` (5 colonne).
- **`parsePriceString` rifiuta interi senza separatori** (`"36"`, `"110"`, `"880"`): un prezzo italiano deve avere `.` (migliaia) o `,` (decimali). Lieve deviazione dal blocco letterale §3.1 della SPEC, necessaria perché i test §8 sull'`isCompleteProductRow` lo richiedono implicitamente (token come `"36"` dentro una descrizione non devono attivare il match come prezzo). Documentato in `src/pdfParser.js`.
- **Algoritmo multi-riga** (`joinMultiLineRows`): supporta merge fino a 3 righe consecutive. Il caso reale `21100375 KIT SMART APP: … installazione della / macchine / 880,00 €` produce ora **una sola riga** con descrizione completa e prezzo 880.
- **Aggregazione multi-pagina**: per ogni codice si tiene la prima occorrenza con prezzo valido, le pagine vengono concatenate come stringa `"p1, p2"`, e prezzi difformi tra pagine sono segnalati come `CHECK_PREZZO_DIFFORME`.
- **Disclaimer bumpato a v4**: punto 7 riscritto in chiave minimale ("Cosa fa l'app"). Nuova accettazione richiesta a chi aveva accettato la v3.

---

## CI/CD

Il workflow `.github/workflows/deploy.yml` fa build + deploy su GitHub Pages a ogni push su `main`. Per attivarlo: Settings → Pages → Source: **GitHub Actions**.

---

## Licenza

[MIT](LICENSE) © 2026 pezzaliapp

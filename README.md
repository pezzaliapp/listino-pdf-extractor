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

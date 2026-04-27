# Listino PDF Extractor

PWA offline-capable per estrarre listini prezzi (formato Cormach o simile) da PDF e produrre un file Excel a 4 fogli pronto per import e preventivazione.

🌐 **Live demo:** https://pezzaliapp.github.io/listino-pdf-extractor/

---

## ⚠️ Disclaimer (sintesi)

Strumento fornito **AS-IS**, senza garanzie. L'estrazione automatica può contenere errori: i risultati vanno **verificati manualmente** prima di qualunque uso commerciale, contabile o contrattuale. I prezzi/descrizioni generati **non costituiscono offerta commerciale** e l'app **non sostituisce il listino ufficiale**. Il PDF caricato **non lascia il dispositivo**: tutta l'elaborazione avviene nel browser. Vedi il disclaimer completo in-app alla prima apertura o dal footer.

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

I test usano il runner integrato di Node (`node --test`) e coprono `classifier.js` e le funzioni pure di `pdfParser.js`.

---

## Cosa contiene l'Excel generato

| Foglio | Contenuto |
|---|---|
| `00_Note` | Metadati, legenda e avvertenze |
| `01_Listino_pulito` | Listino estratto, una riga per articolo |
| `02_CSVXpressSmart` | Vista preventivazione con formule (`Netto_macchina_EUR`, `Totale_preventivo_EUR`) |
| `03_Commerciale` | Vista commerciale con `Tier`, `Plus_vendita`, `Upsell`, `Pitch` |

Il foglio `02_CSVXpressSmart` contiene formule reali: aprendo il file in Excel/LibreOffice basta compilare a mano `Trasporto_EUR`, `Installazione_EUR` e `Sconto_%` per vedere `Netto_macchina_EUR` e `Totale_preventivo_EUR` aggiornarsi automaticamente.

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

## Decisioni di default

Tutte le scelte ambigue lasciate dalla SPEC sono state risolte con il default più ragionevole. Le elenco qui per trasparenza:

- **Larghezze colonne `02_CSVXpressSmart` non specificate.** Ho usato 14 px per le colonne EUR generiche, 16 px per `Prezzo_listino_EUR`/`Installazione_EUR`, 18 px per `Netto_macchina_EUR`, 20 px per `Totale_preventivo_EUR`, 10 px per `Sconto_%`. Coerenti con il pattern del foglio `01`.
- **Foglio `00_Note` come prima tab.** La SPEC §8 elenca i fogli con `01` prima di `00`, ma la naming convention numerica e l'esempio del template `listino_cormach_punti_1_2_3.xlsx` suggeriscono `00_Note` come prima tab. Ho ordinato i fogli `00_Note → 01_Listino_pulito → 02_CSVXpressSmart → 03_Commerciale`.
- **`Nome_breve` (foglio 02).** Spec dice "primi 60 char di `Descrizione`". Implementato con `descrizione.slice(0, 60)` senza aggiunta di `…` per non alterare il valore numerico/testuale che potrebbe essere usato in import successivi.
- **Heuristics heading Famiglia.** Quando un heading non è nella whitelist `FAMIGLIA_HEADINGS` ma è in maiuscolo, breve (≤ 60 char), senza cifre e con caratteri tipici, lo conservo come Famiglia grezza (come previsto da §6.2). La detection di Categoria richiede font-size ≥ 9 e prima lettera maiuscola, non tutta maiuscola.
- **Tolleranza Y per raggruppamento righe**: ±2 px (valore minimo della SPEC §6.1).
- **Comportamento "Non accetto, esci"**: nasconde l'app e mostra una schermata bianca con messaggio. Non chiude la tab del browser perché i browser bloccano `window.close()` per pagine non aperte da script.
- **Disclaimer richiamato dal footer.** Quando l'utente apre il disclaimer dal footer (già accettato in passato), la chiusura con la X o ESC equivale ad acconsentire di nuovo; cliccare "Non accetto, esci" mostra la schermata bloccante.
- **Disclaimer modal scroll**: il body del modal è scrollabile in caso di viewport piccoli — i due pulsanti restano sempre visibili in fondo.
- **Heading detection robustness**: se la prima riga di una pagina contiene già un prodotto con codice+prezzo, viene parsata anche se la Famiglia è ancora vuota. La Famiglia/Categoria restano vuote — l'utente può correggerle nell'Excel.
- **`Pagine` numerica nel foglio 01** (non come stringa "p. N") per consentire ordinamento numerico.

---

## CI/CD

Il workflow `.github/workflows/deploy.yml` fa build + deploy su GitHub Pages a ogni push su `main`. Per attivarlo: Settings → Pages → Source: **GitHub Actions**.

---

## Licenza

[MIT](LICENSE) © 2026 pezzaliapp

# Changelog

## v5.4.0 — Residui di estrazione e celle-descrizione condivise

Raffinamenti sui casi-limite emersi dopo la v5.3.0, diagnosticati sul listino di
riferimento con il nuovo tooling a coordinate. Nessuna nuova dipendenza.

### Pattern A — didascalie, casi residui
- **Box ACCESSORI STANDARD uniformato**: un frammento di layout con l'iniziale
  maiuscola (la parola-marker `OPTIONAL`, una nota-dimensione `Ø mm N`) non
  "salva" più un codice dal box — `stripLayoutNoise()` toglie marker di sezione,
  note-quantità `(n pcs)` e note-dimensione prima del controllo, così l'INTERO
  box va in Dotazioni standard invece di lasciare fuori qualche codice con un
  frammento.
- **Filtro sezioni-appendice**: la pagina riassuntiva pesi/misure imballi
  (`DIMENSIONI IMBALLI`) non è un listino — l'unica riga che il parser vi
  agganciava (l'intera tabella come descrizione) viene filtrata come un banner.
- **Didascalie con descrizione contaminata**: un codice-didascalia senza prezzo
  né nome proprio che aveva catturato la descrizione di un'altra riga (coincide o
  è prefisso/suffisso della descrizione del proprietario) va in Dotazioni con
  descrizione vuota, invece di restare nel Listino con testo altrui.
- **Gallerie ACCESSORI STANDARD a colonne** (pagg. 52/63/64): il box a due
  colonne `ACCESSORI STANDARD | OPTIONAL` (e la variante `ACCESSORI STANDARD PER
  COD. NNN`) non era riconosciuto; ora quei codici-didascalia vanno in Dotazioni
  con descrizione vuota, scartando le pseudo-etichette di icona/specifica
  (`PC`, `4x`, `Diametro Cerchio …`). Vedi nota sullo scope più sotto.

### Pattern B — celle condivise, casi residui
- **Coppie celle-condivise mancate**: continuazioni tutte MAIUSCOLE
  (`isShortUpperContinuation`), righe vuote a prezzo nullo sotto una capofila a
  prezzo unico, e descrizioni di gruppo ripulite dalle note-quantità.
- **Disaccoppiamento descrizione/prezzo nelle celle "a cavallo"**: quando
  un'unica cella-descrizione è condivisa da più codici che hanno CIASCUNO il
  proprio prezzo (tabelle a colonne), ora si propaga solo la **descrizione**
  (`DESCRIZIONE_GRUPPO`) e mai il prezzo — la descrizione condivisa è
  riconosciuta a livello di banda (etichetta non allineata alla riga del codice).
  La guardia sui prezzi distinti resta intatta.

### Tooling
- `scripts/valida-listino.mjs --dump-page N`: stampa i text item grezzi di una
  pagina (x, y, width, str) ordinati per y poi x, con i **prezzi mascherati**
  (`#.###,##`), per ispezionare la geometria delle tabelle.

### Contatori aggregati sul listino di riferimento (v5.3.0 → v5.4.0)

| Metrica                              | v5.3.0 | v5.4.0 |
|--------------------------------------|:------:|:------:|
| Righe di listino                     |  319   |  306   |
| Prezzi valorizzati                   |  301   |  303   |
| Prezzi mancanti (denominatore)       |   18   |    3   |
| Dotazioni standard (codici-didascalia) |  20   |   32   |

I prezzi valorizzati non calano (nessun prezzo viene mai propagato o inventato);
i prezzi mancanti scendono perché i codici-didascalia escono dal denominatore.

### Nota sullo scope (gate a pagine fisse 52/63/64)
Il riconoscimento delle gallerie ACCESSORI STANDARD a colonne è limitato alle
pagine 52/63/64 (`ACC_STD_GALLERY_PAGES`). È una **decisione diagnostica
deliberata**: lo stesso box a due colonne è presente anche sulle schede prodotto,
dove però quei codici sono membri di matrice/righe reali; una regola geometrica
generale li travolgerebbe. **Da rivedere se cambia l'impaginazione del listino.**

## v5.3.0 — Pattern strutturali del PDF (didascalie, celle-matrice, banner)

Tre pattern strutturali del listino, diagnosticati sul listino di riferimento (96 pag.), corretti
uno alla volta. Nessuna nuova dipendenza.

### Pattern A — Codici-didascalia (box "ACCESSORI STANDARD")
Le foto del box ACCESSORI STANDARD portano il codice stampato sotto come
didascalia. Il parser le emetteva come righe di listino con `PREZZO_MANCANTE` e
descrizioni residue (`(TAG1)`, `( )`, note sotto le foto).

- `classifyDidascalie()` separa le occorrenze-didascalia **prima** di Pattern B
  e dell'aggregazione: un'occorrenza senza prezzo dentro ACCESSORI STANDARD è
  una didascalia; un codice mai prezzato e senza descrizione "sostanziale"
  (iniziale maiuscola) che compare in ACCESSORI STANDARD — o come badge
  degenerato su ≥ 3 pagine (es. marchio CE `( )`) — è un codice-didascalia
  intero.
- Se il codice ha comunque una vera riga prezzata (es. **21100240** a pag. 18) le didascalie sono scartate e resta solo quella; se non è mai prezzato
  finisce nel nuovo foglio **Dotazioni standard** con flag `CODICE_DIDASCALIA`,
  elenco pagine e sezioni (`MODELLO-X > ACCESSORI STANDARD`).
- I codici-didascalia escono dal denominatore dei prezzi mancanti.
- `excelBuilder`: foglio **Dotazioni standard** al posto di `Accessori_Standard`;
  ritirato `partitionRowsByAccessoriStandard` (la separazione avviene nel parser).

### Pattern B — Celle condivise verticali (tabelle-matrice)
Nelle matrici accessori una cella unica copre 2-3 codici; pdf.js la agganciava
al codice più vicino, spezzando la descrizione e lasciando gli altri nudi.

- `mergeMatrixGroups()` raggruppa i codici consecutivi che condividono una cella
  (stessa sezione, vicini; riga successiva = frammento minuscolo o vuota con lo
  stesso prezzo) e propaga la **descrizione intera ricomposta** a tutti i membri.
- Il **prezzo** è propagato solo se unico nel gruppo; con più prezzi distinti
  (es. p.36 un prezzo per codice) si propaga solo la descrizione.
- Flag `DESCRIZIONE_GRUPPO` / `PREZZO_GRUPPO` sulle righe non-capofila.
  Complementa `mergeMultiCodeRows` (`MERGED_FROM_PREV/NEXT`), invariato per i
  rowspan a codice nudo.
- Guardia `flagPartialDescriptions()`: ogni descrizione finale che inizia in
  minuscola o è solo una parentesi esce con `DESC_PARZIALE`, mai in silenzio.

### Pattern C — Banner ricorrente
- `stripOptionalBanner()` rimuove il banner `ACCESSORI OPTIONAL a pag. N` mentre
  la descrizione viene composta. Match mirato: la vera riga **20100334** ("Nuovo
  dispositivo per avere più luce sul tuo lavoro …") resta integra.

### Contatori sul listino di riferimento (prima → dopo)

| Metrica                              | v5.2.0 | v5.3.0 |
|--------------------------------------|:------:|:------:|
| Righe di listino                     |  339   |  319   |
| Prezzi valorizzati                   |  297   |  301   |
| Prezzi mancanti (denominatore)       |   42   |   18   |
| Codici-didascalia (Dotazioni std)    |    0   |   20   |
| `DESC_PARZIALE`                      |    —   |    4   |
| `DESCRIZIONE_GRUPPO` / `PREZZO_GRUPPO` |  —   | 16 / 5 |

Test: 100 → 112 (tutti verdi).

### Casi residui segnalati (flag, non silenziosi)
- `DESC_PARZIALE` su 20100355, 20100363, 20100265, 23100387 (residui `(n pcs)` /
  `Ø mm` / `4x`: note-quantità, non descrizioni).
- Righe con descrizione vuota e prezzo valido su pag. 54/63 (colonna descrizione
  mal-allineata in quelle matrici) e alcuni accessori senza prezzo:
  restano nel Listino con `PREZZO_MANCANTE`, da rivedere a mano.

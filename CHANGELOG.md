# Changelog

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

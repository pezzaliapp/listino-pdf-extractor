import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinMultiLineRows } from '../src/pdfParser.js';

test('unisce 2 righe consecutive: codice+desc parziale, poi resto+prezzo', () => {
  const linee = [
    { tokens: ['21100375', 'KIT', 'SMART', 'APP:', 'Include', 'traffico', 'dati', 'per', '36', 'mesi', 'dalla', 'data', 'di', 'installazione', 'della'] },
    { tokens: ['macchine', '880,00'] }
  ];
  const out = joinMultiLineRows(linee, 6);  // pagina 6
  assert.equal(out.length, 1);
  assert.equal(out[0].codice, '21100375');
  assert.match(out[0].descrizione, /KIT SMART APP/);
  assert.match(out[0].descrizione, /macchine/);
  assert.equal(out[0].prezzo, 880);
  assert.equal(out[0].review_flag, '');
});

test('unisce 3 righe: codice+desc1, desc2 (no prezzo), desc3+prezzo', () => {
  const linee = [
    { tokens: ['21100420', 'Disponibile', 'per', 'MEC', '810', '-', 'MEC', '820', '-', 'MEC', '200'] },
    { tokens: ['TRUCK', '-', 'MEC', '22', '-', 'MEC', '110', 'fino', 'ad'] },
    { tokens: ['esaurimento', 'scorte', '880,00'] }
  ];
  const out = joinMultiLineRows(linee, 6);
  assert.equal(out.length, 1);
  assert.equal(out[0].prezzo, 880);
  assert.match(out[0].descrizione, /TRUCK/);
  assert.match(out[0].descrizione, /esaurimento/);
});

test('NON unisce se la riga successiva ha un altro codice', () => {
  const linee = [
    { tokens: ['00100208', 'PUMA', 'CE', '3.940,00'] },
    { tokens: ['00100210', 'CM', '1200BB', '3.940,00'] }
  ];
  const out = joinMultiLineRows(linee, 6);
  assert.equal(out.length, 2);
  assert.equal(out[0].codice, '00100208');
  assert.equal(out[1].codice, '00100210');
});

test('riga con codice ma senza prezzo né continuazione → CHECK', () => {
  const linee = [
    { tokens: ['99999999', 'Articolo', 'isolato', 'senza', 'prezzo'] }
  ];
  const out = joinMultiLineRows(linee, 10);
  assert.equal(out.length, 1);
  assert.equal(out[0].review_flag, 'CHECK');
  assert.equal(out[0].prezzo, null);
});

test('rifiuta i codici-didascalia (3+ punti, no virgola) come prezzo', () => {
  // Caso pag. 8 PDF: 21200418 (didascalia foto) e 21.100.057 letto come prezzo.
  // Risultato atteso: la riga viene segnata CHECK perché 21.100.057 non è prezzo valido.
  const linee = [
    { tokens: ['21100076', 'Kit', 'CONI', 'per', 'configurazione', 'NLS'] }
    // niente riga successiva con prezzo
  ];
  const out = joinMultiLineRows(linee, 8);
  assert.equal(out.length, 1);
  assert.equal(out[0].review_flag, 'CHECK');
});

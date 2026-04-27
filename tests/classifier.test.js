import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRow, tierFromPrice } from '../src/classifier.js';

test('tier ranges', () => {
  assert.equal(tierFromPrice(500), 'Entry');
  assert.equal(tierFromPrice(1500), 'Mid');
  assert.equal(tierFromPrice(5000), 'Premium');
});

test('classifyRow integra tutto', async () => {
  const r = await classifyRow({
    descrizione: 'Equilibratrice MEC 10 con LIFT e NLS',
    prezzo: 4500
  });
  assert.equal(r.famiglia, 'Equilibratrici');
  assert.equal(r.tier, 'Premium');
  assert.match(r.plus_vendita, /sollevatore integrato/);
  assert.match(r.plus_vendita, /bloccaggio rapido/);
  assert.equal(r.matchSource, 'keyword');
});

test('classifyRow usa fallback quando descrizione vuota', async () => {
  const r = await classifyRow({ descrizione: '', prezzo: 100 });
  assert.equal(r.matchSource, 'fallback');
  assert.equal(r.famiglia, 'Attrezzature varie');
});

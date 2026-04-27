import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierFromPrice, classifyCommercial } from '../src/classifier.js';

test('tier Entry sotto 1000', () => {
  assert.equal(tierFromPrice(250), 'Entry');
  assert.equal(tierFromPrice(999), 'Entry');
});

test('tier Mid 1000-2999', () => {
  assert.equal(tierFromPrice(1000), 'Mid');
  assert.equal(tierFromPrice(2999), 'Mid');
});

test('tier Premium >= 3000', () => {
  assert.equal(tierFromPrice(3000), 'Premium');
  assert.equal(tierFromPrice(62650), 'Premium');
});

test('classifyCommercial Famiglia composta usa la prima', () => {
  const r = classifyCommercial({ famiglia: 'Smontagomme | Assetti ruote', prezzo: 1500 });
  assert.equal(r.tier, 'Mid');
  assert.match(r.upsell, /helper arms/);
});

test('classifyCommercial Famiglia ignota -> default', () => {
  const r = classifyCommercial({ famiglia: 'Sconosciuta', prezzo: 500 });
  assert.equal(r.plus, 'soluzione standard');
});

test('classifyCommercial pitch coerente con tier', () => {
  const r = classifyCommercial({ famiglia: 'Equilibratrici', prezzo: 5000 });
  assert.equal(r.tier, 'Premium');
  assert.match(r.pitch, /alta di gamma/);
});

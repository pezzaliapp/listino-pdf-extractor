import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDescription, fallbackClassification, DEFAULT_CLASSIFICATION_RULES } from '../src/keywordClassifier.js';

const RULES = [...DEFAULT_CLASSIFICATION_RULES].sort((a,b)=>(b.priority??0)-(a.priority??0));

test('equilibratrice auto', () => {
  const r = classifyDescription('Equilibratrice elettronica MEC 10 1ph 230V', RULES);
  assert.equal(r.famiglia, 'Equilibratrici');
  assert.equal(r.categoria, 'Equilibratrici auto');
});

test('equilibratrice truck (priorità più alta di auto)', () => {
  const r = classifyDescription('Equilibratrice ruote autocarro WR 328A', RULES);
  assert.equal(r.categoria, 'Equilibratrici truck');
});

test('smontagomme moto', () => {
  const r = classifyDescription('Smontagomme moto F 26A BIKE 1ph 230V', RULES);
  assert.equal(r.categoria, 'Smontagomme moto');
});

test('ponte 2 colonne', () => {
  const r = classifyDescription('Sollevatore elettromeccanico a 2 colonne L 3300', RULES);
  assert.equal(r.categoria, 'Ponti 2 colonne');
});

test('assetto ruote', () => {
  const r = classifyDescription('Apparecchiatura assetto ruote GEO 25 con monitor', RULES);
  assert.equal(r.famiglia, 'Assetti ruote');
});

test('compressore', () => {
  const r = classifyDescription('Compressore aria 100 lt 3HP 230V', RULES);
  assert.equal(r.categoria, 'Compressori');
});

test('handy scan -> diagnosi/profilometro', () => {
  const r = classifyDescription('HANDY SCAN + Handy Scan MANAGER SOFTWARE', RULES);
  assert.equal(r.famiglia, 'Diagnosi');
});

test('descrizione vuota -> null', () => {
  assert.equal(classifyDescription('', RULES), null);
  assert.equal(classifyDescription(null, RULES), null);
});

test('fallback funziona', () => {
  const fb = fallbackClassification();
  assert.equal(fb.famiglia, 'Attrezzature varie');
  assert.equal(fb.categoria, 'Generico');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Module } from 'node:module';

// react-native cannot load under node; stub only StyleSheet.create.
const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, ...rest: unknown[]) {
  if (request === 'react-native') return { StyleSheet: { create: (s: unknown) => s } };
  return originalLoad.call(this, request, ...rest);
};
const { themedStyles, setActiveBrand, recolorStyle } = require('../../brand/themedStyles') as typeof import('../../brand/themedStyles');

const base = {
  button: { backgroundColor: '#7C3AED', borderColor: '#ddd6fe', padding: 8, shadowColor: '#6D28D9' },
  plain: { color: '#111111', margin: 2 },
  nested: { transform: [{ scale: 1 }], color: '#4C1D95' },
};

test('Close With Mario styles are returned exactly as written', () => {
  const styles = themedStyles(base);
  setActiveBrand('close-with-mario');
  assert.equal(styles.button.backgroundColor, '#7C3AED');
  assert.strictEqual(styles.button, base.button);
});

test('with no confirmed brand, styles are returned as written (public screens never recolour)', () => {
  const styles = themedStyles(base);
  setActiveBrand(null);
  assert.equal(styles.button.backgroundColor, '#7C3AED');
});

test('AgentLOConnect maps violet literals to the cobalt/ink palette, case-insensitively', () => {
  const styles = themedStyles(base);
  setActiveBrand('agent-lo-connect');
  assert.equal(styles.button.backgroundColor, '#2563EB');
  assert.equal(styles.button.borderColor, '#BFD3FB');
  assert.equal(styles.button.shadowColor, '#1D4ED8');
  assert.equal(styles.nested.color, '#0B1220');
});

test('non-colour values and unrelated colours are untouched', () => {
  const styles = themedStyles(base);
  setActiveBrand('agent-lo-connect');
  assert.equal(styles.button.padding, 8);
  assert.deepEqual(styles.nested.transform, [{ scale: 1 }]);
  assert.strictEqual(styles.plain, base.plain);
});

test('switching brand at runtime never serves the other brand from cache', () => {
  const styles = themedStyles(base);
  setActiveBrand('agent-lo-connect');
  assert.equal(styles.button.backgroundColor, '#2563EB');
  setActiveBrand('close-with-mario');
  assert.equal(styles.button.backgroundColor, '#7C3AED');
  setActiveBrand('agent-lo-connect');
  assert.equal(styles.button.backgroundColor, '#2563EB');
  setActiveBrand(null);
});

test('recolorStyle does not mutate its input', () => {
  const input = { backgroundColor: '#7C3AED' };
  const out = recolorStyle(input, { '#7C3AED': '#2563EB' });
  assert.equal(input.backgroundColor, '#7C3AED');
  assert.equal(out.backgroundColor, '#2563EB');
});

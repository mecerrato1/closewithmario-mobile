import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRatesPayload } from '../../utils/rateService';

const good = {
  updatedAt: '2026-11-13T10:00:00.000Z',
  conventional30: { apr: 6.6, noteRate: 6.5 },
  fha30: { apr: 6.4, noteRate: 6.25 },
  va30: { noteRate: 6.0 },
};

test('a complete payload is marked live and keeps its timestamp', () => {
  const rates = parseRatesPayload(good);
  assert.ok(rates);
  assert.equal(rates.source, 'live');
  assert.equal(rates.updatedAt, '2026-11-13T10:00:00.000Z');
  assert.equal(rates.conventional30.noteRate, 6.5);
});

test('a missing APR falls back to the note rate', () => {
  const rates = parseRatesPayload(good);
  assert.equal(rates?.va30.apr, 6.0);
});

test('partial, malformed or non-positive payloads are rejected, never shown as live', () => {
  const bad = [
    null,
    undefined,
    'html',
    {},
    { ...good, va30: undefined },
    { ...good, fha30: { noteRate: 0 } },
    { ...good, conventional30: { noteRate: '6.5' } },
    { ...good, conventional30: { noteRate: -1 } },
  ];
  for (const payload of bad) assert.equal(parseRatesPayload(payload as never), null, JSON.stringify(payload));
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanAnswer, sourceTitle, withoutTracking } from './gioAnswer';

test('removes inline citations from sentences and keeps them as sources', () => {
  const { content, citations } = cleanAnswer(
    'Verify funds to close. ([hud.gov](https://www.hud.gov/a.pdf?utm_source=openai))\n\nSee **income** rules ([fanniemae.com](https://selling-guide.fanniemae.com/sel/b3?utm_source=openai)).',
    [{ id: '1', title: 'B3-1-01', url: 'https://selling-guide.fanniemae.com/sel/b3?utm_source=openai' }]
  );
  assert.equal(content, 'Verify funds to close.\n\nSee income rules.');
  assert.deepEqual(citations.map((c) => [c.title, c.url]), [
    ['B3-1-01', 'https://selling-guide.fanniemae.com/sel/b3'],
    ['hud.gov', 'https://www.hud.gov/a.pdf'],
  ]);
});

test('keeps the words of a link used in a sentence', () => {
  assert.equal(cleanAnswer('Read the [Selling Guide](https://x.test/g) first.', []).content, 'Read the Selling Guide first.');
});

test('leaves ordinary brackets alone', () => {
  const plain = 'Debt-to-income (DTI) must be 45% or less [in most cases].';
  assert.equal(cleanAnswer(plain, []).content, plain);
});

test('tidies source titles and tracking parameters', () => {
  assert.equal(sourceTitle('HUD 4155.1\nChapter 1', null), 'HUD 4155.1 Chapter 1');
  assert.equal(sourceTitle('# 4. General In', 'https://www.hud.gov/x'), 'hud.gov');
  assert.equal(withoutTracking('https://x.test/p?utm_source=openai'), 'https://x.test/p');
  assert.equal(withoutTracking('https://x.test/p?id=2&utm_medium=a#s'), 'https://x.test/p?id=2#s');
  assert.equal(withoutTracking('https://x.test/p?utm_source=a&id=2'), 'https://x.test/p?id=2');
});

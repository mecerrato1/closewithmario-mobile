import test from 'node:test';
import assert from 'node:assert/strict';

import { gioRequestBody, readGioReply, type GioMessage } from './gioChat';

const turn = (index: number): GioMessage => ({
  id: String(index), role: index % 2 === 0 ? 'user' : 'assistant', content: `m${index}`,
});

test('sends at most nine messages, starting and ending with the loan officer', () => {
  const history = Array.from({ length: 13 }, (_, index) => turn(index));
  const body = gioRequestBody('lo', history, 'assistant');
  assert.ok(body.messages.length <= 9);
  assert.equal(body.messages[0].role, 'user');
  assert.equal(body.messages.at(-1)?.content, 'm12');
  assert.deepEqual(Object.keys(body.messages[0]), ['role', 'content']);
});

test('drops a leading answer left by trimming', () => {
  const history = Array.from({ length: 12 }, (_, index) => turn(index + 1));
  assert.equal(gioRequestBody('lo', history, 'compare').messages[0].role, 'user');
});

test('reads an answer and keeps only https source links', () => {
  const reply = readGioReply(true, {
    ok: true,
    message: { content: ' 580. ', citations: [{ id: 'a', title: 'HUD', url: 'https://hud.gov' }, { title: 'Doc', url: 'javascript:x' }, { url: 'https://x' }] },
  });
  assert.deepEqual(reply, {
    content: '580.',
    citations: [{ id: 'a', title: 'HUD', url: 'https://hud.gov' }, { id: '1', title: 'Doc', url: null }],
  });
});

test('shows the server message when it refuses', () => {
  assert.deepEqual(readGioReply(false, { ok: false, error: 'Please wait a few minutes.' }), { error: 'Please wait a few minutes.' });
  assert.ok('error' in readGioReply(true, null));
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { callbackWhen, callQueuePath, callReason, callSection, parseCallQueuePage, type CallQueueItem } from './callQueue';

const item = (extra: Partial<CallQueueItem>): CallQueueItem => ({
  leadId: '1', leadSource: 'organic', name: 'A', phone: '3050000000', status: 'new',
  reason: 'Callback overdue', priority: 1, bucket: 'overdue', nextFollowUpAt: null, ...extra,
});

test('asks the website endpoint with the same parameters', () => {
  assert.equal(
    callQueuePath({ scope: 'mine', bucket: 'all', timeZone: 'America/New_York', limit: 3, offset: 0 }),
    '/api/crm/call-queue?scope=mine&bucket=all&timeZone=America%2FNew_York&limit=3&offset=0'
  );
  assert.match(
    callQueuePath({ scope: 'all', bucket: 'overdue', timeZone: 'UTC', limit: 50, offset: 50, loanOfficerId: 'abc' }),
    /scope=all&bucket=overdue.*offset=50&loId=abc/
  );
});

test('rejects anything that is not a call list', () => {
  assert.equal(parseCallQueuePage(null), null);
  assert.equal(parseCallQueuePage({ error: 'mfa_required' }), null);
  assert.deepEqual(parseCallQueuePage({ items: [], total: 0 })?.counts.follow_up, 0);
});

test('groups like the website', () => {
  assert.equal(callSection(item({})), 'Missed callbacks');
  assert.equal(callSection(item({ priority: 5 })), 'Older missed callbacks');
  assert.equal(callSection(item({ bucket: 'reply_needed' })), 'Call requests');
  assert.equal(callSection(item({ callWindowUntil: '2026-11-25T22:00:00Z' })), 'Call window open');
});

test('words the reason, preferring an open call window', () => {
  const window = { callWindowUntil: '2026-11-25T22:00:00Z', callWindowTimeZone: 'America/New_York' };
  assert.match(callReason(item({ ...window, reason: 'Call window open' })), /^Call window open until 5:00/);
  assert.equal(callReason(item({ ...window, reason: 'Program follow-up due' })), 'Program follow-up due');
  assert.equal(callReason(item({ ...window, callWindowOpen: false })), 'Callback overdue');
});

test('shows the scheduled callback time only when there is one', () => {
  assert.equal(callbackWhen(item({})), null);
  assert.match(callbackWhen(item({ nextFollowUpAt: '2026-11-03T19:00:00Z' })) ?? '', /^Callback Nov 3/);
});

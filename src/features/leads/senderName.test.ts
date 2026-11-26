import test from 'node:test';
import assert from 'node:assert/strict';

import { senderNames, SENDER_NAME_PLACEHOLDER } from './senderName';

test('signs with the sender record', () => {
  assert.deepEqual(senderNames({ firstName: 'Ana', lastName: 'Ruiz' }, 'Other Name'), {
    loFullname: 'Ana Ruiz',
    loFname: 'Ana',
  });
});

test("without a record, uses the account's own name", () => {
  assert.deepEqual(senderNames(null, '  Luis Perez '), { loFullname: 'Luis Perez', loFname: 'Luis' });
});

test('a record with empty or missing names never prints "null"', () => {
  assert.deepEqual(senderNames({ firstName: null, lastName: null }, 'Luis Perez'), {
    loFullname: 'Luis Perez',
    loFname: 'Luis',
  });
});

test('with nothing known, leaves a visible placeholder and never a person\'s name', () => {
  for (const record of [null, undefined, { firstName: '', lastName: '' }]) {
    assert.deepEqual(senderNames(record, undefined), {
      loFullname: SENDER_NAME_PLACEHOLDER,
      loFname: SENDER_NAME_PLACEHOLDER,
    });
  }
});

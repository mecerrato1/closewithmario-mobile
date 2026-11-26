import test from 'node:test';
import assert from 'node:assert/strict';

import { isTextSuggestion, readableStatuses, suggestedMessage } from './followUpText';

test('keeps the whole message when it contains apostrophes', () => {
  assert.equal(
    suggestedMessage("Send a text: 'Hi Ana, I'm checking in. Did the lender's list help?'"),
    "Hi Ana, I'm checking in. Did the lender's list help?"
  );
});

test('handles the short "Text:" form and double or curly quotes', () => {
  assert.equal(suggestedMessage("Text: 'Hi Jose, just checking in.'"), 'Hi Jose, just checking in.');
  assert.equal(suggestedMessage('Send a text: "Hi Jose"'), 'Hi Jose');
  assert.equal(suggestedMessage('Send a text: “Hi Jose, it’s me”'), 'Hi Jose, it’s me');
});

test('an unquoted suggestion is used as written', () => {
  assert.equal(suggestedMessage("Send a text: Hi Ana, let's talk"), "Hi Ana, let's talk");
});

test('recognises text suggestions only', () => {
  assert.equal(isTextSuggestion("Text: 'Hi'"), true);
  assert.equal(isTextSuggestion("Send a text: 'Hi'"), true);
  assert.equal(isTextSuggestion('Call the lead tomorrow'), false);
  assert.equal(isTextSuggestion(undefined), false);
});

test('shows status labels instead of codes', () => {
  assert.equal(
    readableStatuses('Lead is in the gathering_docs stage, not working_on_credit.'),
    'Lead is in the Docs Requested stage, not Working on Credit.'
  );
  assert.equal(readableStatuses('A new lead that closed.'), 'A new lead that closed.');
});

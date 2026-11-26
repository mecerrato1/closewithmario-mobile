// Turns the server's AI follow-up wording into what the app shows and sends.

import { STATUS_DISPLAY_MAP } from '../../lib/leadsHelpers';

const TEXT_PREFIX = /^[\s\S]*?\b(?:send a text|text)\s*:\s*/i;

/** True when the suggestion is a text message the user can send. */
export function isTextSuggestion(action: string | null | undefined): boolean {
  return /\bsend a text\b|\btext\s*:/i.test(action ?? '');
}

/**
 * The message inside a suggestion such as "Send a text: 'Hi Ana, I'm checking in'".
 * Apostrophes inside the message must not end it.
 */
export function suggestedMessage(action: string): string {
  const rest = action.replace(TEXT_PREFIX, '').trim();
  const opening = /(^|[\s:])(["'“‘])/.exec(rest);
  if (opening) {
    const quote = opening[2];
    const closing = quote === '“' ? '”' : quote === '‘' ? '’' : quote;
    const start = opening.index + opening[0].length;
    // The last closing quote that is not an apostrophe inside a word.
    for (let end = rest.length - 1; end > start; end -= 1) {
      if (rest[end] === closing && !/[A-Za-zÀ-ÿ]/.test(rest[end + 1] ?? '')) {
        return rest.slice(start, end).trim();
      }
    }
  }
  return rest;
}

/** Replaces internal status codes such as "gathering_docs" with their labels. */
export function readableStatuses(text: string): string {
  return Object.entries(STATUS_DISPLAY_MAP)
    .filter(([code]) => code.includes('_'))
    .reduce((out, [code, label]) => out.replace(new RegExp(`\\b${code}\\b`, 'g'), label), text);
}

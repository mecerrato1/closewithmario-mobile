// Gio answers arrive as Markdown with web citations inline. The app shows plain text with the
// sources listed underneath, so links move out of the sentences and nothing is lost.

import type { GioCitation } from './gioChat';

// A web address, allowing one level of brackets inside it.
const ADDRESS = String.raw`https?:\/\/(?:[^\s()]|\([^\s()]*\))+`;
const LINK = String.raw`\[([^\]]*)\]\(\s*(${ADDRESS})\s*\)`;
const BARE_LINK = String.raw`\[[^\]]*\]\(\s*${ADDRESS}\s*\)`;

const hostOf = (url: string) => url.replace(/^https?:\/\/(?:www\.)?/, '').split(/[/?#]/)[0];

/** Drops tracking parameters added by the search tool. */
export function withoutTracking(url: string): string {
  return url
    .replace(/([?&])utm_[a-z]+=[^&#]*/gi, '$1')
    .replace(/([?&])&+/g, '$1')
    .replace(/[?&]+(?=#|$)/, '');
}

export function sourceTitle(title: string, url: string | null): string {
  const tidy = title.replace(/\s+/g, ' ').trim();
  // A title that is a cut-off document heading says nothing; the site name does.
  if ((!tidy || tidy.startsWith('#')) && url) return hostOf(url);
  return tidy.replace(/^#+\s*/, '');
}

export function cleanAnswer(content: string, citations: GioCitation[]): { content: string; citations: GioCitation[] } {
  const sources = citations.map((citation) => {
    const url = citation.url ? withoutTracking(citation.url) : null;
    return { ...citation, url, title: sourceTitle(citation.title, url) };
  });
  const listed = new Set(sources.map((source) => source.url).filter(Boolean));

  for (const [, label, address] of content.matchAll(new RegExp(LINK, 'g'))) {
    const url = withoutTracking(address);
    if (!url.startsWith('https://') || listed.has(url)) continue;
    listed.add(url);
    sources.push({ id: url, url, title: sourceTitle(label, url) });
  }

  const text = content
    // "(( [site](url); [other](url) ))" after a sentence is only a citation: remove it whole.
    .replace(new RegExp(String.raw`[ \t]*\(\s*${BARE_LINK}(?:\s*[,;]\s*${BARE_LINK})*\s*\)`, 'g'), '')
    // A link used as words keeps its words.
    .replace(new RegExp(LINK, 'g'), '$1')
    .replace(new RegExp(String.raw`[ \t]*\(\s*${ADDRESS}\s*\)`, 'g'), '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/[ \t]+([.,;:])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { content: text, citations: sources };
}

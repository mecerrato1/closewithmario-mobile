// The website's loan officer Gio (POST /api/crm/gio-chat). The server owns what Gio may
// answer; this only shapes the request and reads the reply.

export type GioMode = 'assistant' | 'guidelines' | 'compare' | 'changes';

export type GioCitation = { id: string; title: string; url: string | null };

export type GioMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: GioCitation[];
};

/** Server limits: nine messages, starting and ending with the loan officer's. */
export const MAX_QUESTION_LENGTH = 1000;
const MAX_MESSAGES = 9;
const MAX_CONTENT_LENGTH = 4000;

/** The starter questions the website offers. */
export const GIO_STARTERS: { question: string; mode: GioMode }[] = [
  { question: 'What guideline changes should I review right now?', mode: 'changes' },
  { question: 'Compare Fannie, Freddie, FHA, VA, and USDA purchase options.', mode: 'compare' },
  { question: 'What should I verify before issuing a pre-approval?', mode: 'guidelines' },
];

export function gioRequestBody(loanOfficerId: string, history: GioMessage[], mode: GioMode) {
  const recent = history.slice(-MAX_MESSAGES);
  while (recent.length && recent[0].role !== 'user') recent.shift();
  return {
    loanOfficerId,
    mode,
    messages: recent.map(({ role, content }) => ({ role, content: content.slice(0, MAX_CONTENT_LENGTH) })),
    workspace: { view: 'dashboard' as const },
  };
}

type Reply = { content: string; citations: GioCitation[] } | { error: string };

export function readGioReply(ok: boolean, body: unknown): Reply {
  const value = body as {
    ok?: boolean;
    error?: string;
    message?: { content?: string; citations?: unknown };
  } | null;
  const content = value?.message?.content?.trim();
  if (!ok || value?.ok !== true || !content) {
    return { error: value?.error || 'Gio could not answer right now. Please try again.' };
  }
  const list = Array.isArray(value.message?.citations) ? (value.message.citations as any[]) : [];
  const citations = list
    .filter((c) => c && typeof c.title === 'string')
    .map((c, index) => ({
      id: String(c.id ?? index),
      title: c.title as string,
      url: typeof c.url === 'string' && c.url.startsWith('https://') ? c.url : null,
    }));
  return { content, citations };
}

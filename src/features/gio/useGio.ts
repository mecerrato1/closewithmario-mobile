import { useCallback, useEffect, useRef, useState } from 'react';

import { API_BASE_URL } from '../../lib/apiBaseUrl';
import { authenticatedFetch } from '../../lib/authenticatedFetch';
import { fetchLoanOfficerId } from './loanOfficerId';
import { gioRequestBody, readGioReply, type GioMessage, type GioMode } from './gioChat';

/** Gio chat is held for the release after 1.4.0. Set to true to bring back "Ask Gio". */
const GIO_CHAT_ENABLED = false;

/**
 * Lives with the dashboard so the conversation survives closing the chat.
 * `loanOfficerId` stays null for accounts without a loan officer record: no Gio.
 */
export function useGio(userId: string | undefined, email: string | undefined, enabled: boolean) {
  const [loanOfficerId, setLoanOfficerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<GioMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = useRef<GioMessage[]>([]);
  const busy = useRef(false);
  const owner = useRef(0);

  useEffect(() => {
    // A new account never sees the previous one's conversation.
    owner.current += 1;
    history.current = [];
    busy.current = false;
    setMessages([]);
    setThinking(false);
    setError(null);
    setLoanOfficerId(null);
    if (!GIO_CHAT_ENABLED || !enabled || !userId || !email) return;
    const current = owner.current;
    void fetchLoanOfficerId(userId, email).then((id) => {
      if (current === owner.current) setLoanOfficerId(id);
    });
  }, [enabled, userId, email]);

  const ask = useCallback(
    async (question: string, mode: GioMode = 'assistant') => {
      const content = question.trim();
      if (!content || !loanOfficerId || busy.current) return;
      busy.current = true;
      const current = owner.current;
      const mine: GioMessage = { id: `u${Date.now()}`, role: 'user', content };
      const sent = [...history.current, mine];
      setMessages(sent);
      setThinking(true);
      setError(null);

      let reply: ReturnType<typeof readGioReply>;
      try {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/crm/gio-chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gioRequestBody(loanOfficerId, sent, mode)),
        });
        reply = readGioReply(response.ok, await response.json().catch(() => null));
      } catch {
        reply = { error: 'Gio could not be reached. Check your connection and try again.' };
      }
      if (current !== owner.current) return;
      busy.current = false;
      setThinking(false);
      if ('error' in reply) {
        // The unanswered question is left out of what is sent next time.
        setError(reply.error);
        return;
      }
      history.current = [...sent, { id: `a${Date.now()}`, role: 'assistant', content: reply.content, citations: reply.citations }];
      setMessages(history.current);
    },
    [loanOfficerId]
  );

  return { available: Boolean(loanOfficerId), messages, thinking, error, ask };
}

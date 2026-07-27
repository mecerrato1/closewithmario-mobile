import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { loadMessageInbox } from './messageInboxClient';
import { isAbortError, LatestRequestGate } from './messagePagination';
import type { ConversationSummary } from './messageTypes';

type LoadReason = 'initial' | 'refresh' | 'background';

export function useMessageInbox(session: Session) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const gateRef = useRef(new LatestRequestGate());
  const inFlightRef = useRef<Promise<void> | null>(null);
  const queuedBackgroundRef = useRef(false);
  const runLoadRef = useRef<(reason: LoadReason) => Promise<void>>(
    async () => undefined
  );

  useEffect(() => {
    const gate = gateRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queuedBackgroundRef.current = false;
      gate.cancel();
    };
  }, []);

  const runLoad = useCallback(
    async (reason: LoadReason) => {
      if (reason === 'background' && inFlightRef.current) {
        queuedBackgroundRef.current = true;
        return inFlightRef.current;
      }

      queuedBackgroundRef.current = false;
      const request = gateRef.current.begin();
      if (reason === 'initial') setLoading(true);
      if (reason === 'refresh') setRefreshing(true);
      setError(null);

      const promise = (async () => {
        try {
          if (!session.user.id || !session.user.email) {
            if (gateRef.current.isCurrent(request) && mountedRef.current) {
              setConversations([]);
            }
            return;
          }

          const nextConversations = await loadMessageInbox({
            userId: session.user.id,
            email: session.user.email,
            signal: request.signal,
          });
          if (!gateRef.current.isCurrent(request) || !mountedRef.current)
            return;
          setConversations(nextConversations);
        } catch (loadError) {
          if (
            isAbortError(loadError) ||
            !gateRef.current.isCurrent(request) ||
            !mountedRef.current
          ) {
            return;
          }
          console.error('Error loading message inbox:', loadError);
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load conversations'
          );
        } finally {
          const isCurrent =
            gateRef.current.isCurrent(request) && mountedRef.current;
          gateRef.current.finish(request);
          if (isCurrent) {
            setLoading(false);
            setRefreshing(false);
            inFlightRef.current = null;
            if (queuedBackgroundRef.current) {
              queuedBackgroundRef.current = false;
              void runLoadRef.current('background');
            }
          }
        }
      })();

      inFlightRef.current = promise;
      return promise;
    },
    [session.user.email, session.user.id]
  );
  runLoadRef.current = runLoad;

  useEffect(() => {
    const gate = gateRef.current;
    void runLoad('initial');
    return () => {
      gate.cancel();
      inFlightRef.current = null;
    };
  }, [runLoad]);

  useEffect(() => {
    const subscription = supabase
      .channel('messages_tab_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sms_messages' },
        () => {
          void runLoadRef.current('background');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meta_dm_messages' },
        () => {
          void runLoadRef.current('background');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meta_dm_conversations' },
        () => {
          void runLoadRef.current('background');
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'qualification_link_submissions',
        },
        () => {
          void runLoadRef.current('background');
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(subscription);
    };
  }, []);

  const markLocallyRead = useCallback((conversationKey: string) => {
    setConversations((current) => {
      const next = current.map((conversation) =>
        conversation.key === conversationKey
          ? { ...conversation, unreadCount: 0 }
          : conversation
      );
      return next.sort((left, right) => {
        const unreadDifference =
          Number(right.unreadCount > 0) - Number(left.unreadCount > 0);
        if (unreadDifference !== 0) return unreadDifference;
        return (
          new Date(right.latestMessageAt).getTime() -
          new Date(left.latestMessageAt).getTime()
        );
      });
    });
  }, []);

  const refresh = useCallback(() => runLoad('refresh'), [runLoad]);
  const reload = useCallback(() => runLoad('background'), [runLoad]);

  return {
    conversations,
    loading,
    refreshing,
    error,
    refresh,
    reload,
    markLocallyRead,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '../../lib/authenticatedFetch';
import {
  fetchMetaDmConversation,
  type MetaDmConversation,
} from './messageHistoryClient';
import { isAbortError, LatestRequestGate } from './messagePagination';

type LoadReason = 'initial' | 'refresh' | 'background';

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.closewithmario.com'
).replace(/\/$/, '');

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function useMetaDmConversation({
  leadId,
  leadSource,
  conversationId,
}: {
  leadId: string;
  leadSource: 'organic' | 'meta';
  conversationId?: string | null;
}) {
  const [conversation, setConversation] = useState<MetaDmConversation | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const gateRef = useRef(new LatestRequestGate());
  const inFlightRef = useRef<Promise<void> | null>(null);
  const queuedBackgroundRef = useRef(false);
  const runRef = useRef<(reason: LoadReason) => Promise<void>>(
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

  const syncConversation = useCallback(
    async (force: boolean, signal: AbortSignal) => {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/api/meta-dm-sync`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId,
            leadSource,
            conversationId,
            force,
          }),
          signal,
        }
      );
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          isRecord(payload) && typeof payload.error === 'string'
            ? payload.error
            : 'Failed to sync Messenger conversation'
        );
      }
      return isRecord(payload) ? payload : {};
    },
    [conversationId, leadId, leadSource]
  );

  const fetchStored = useCallback(
    (signal: AbortSignal) =>
      fetchMetaDmConversation({
        leadId,
        leadSource,
        conversationId,
        signal,
      }),
    [conversationId, leadId, leadSource]
  );

  const run = useCallback(
    async (reason: LoadReason) => {
      if (reason === 'background' && inFlightRef.current) {
        queuedBackgroundRef.current = true;
        return inFlightRef.current;
      }

      queuedBackgroundRef.current = false;
      const request = gateRef.current.begin();
      if (reason === 'initial') setLoading(true);
      if (reason === 'refresh') setSyncing(true);
      setError(null);

      const promise = (async () => {
        let delayedError: Error | null = null;
        let nextEmptyReason: string | null | undefined;
        try {
          let nextConversation: MetaDmConversation | null = null;

          if (reason === 'refresh') {
            try {
              const payload = await syncConversation(true, request.signal);
              if (payload.matched === false) {
                nextEmptyReason =
                  typeof payload.reason === 'string'
                    ? payload.reason
                    : 'No Messenger conversation matched this lead yet.';
              } else {
                nextEmptyReason = null;
              }
            } catch (syncError) {
              if (isAbortError(syncError)) throw syncError;
              delayedError =
                syncError instanceof Error
                  ? syncError
                  : new Error('Failed to sync Messenger conversation');
            }
            nextConversation = await fetchStored(request.signal);
          } else {
            nextConversation = await fetchStored(request.signal);
            if (!nextConversation && reason === 'initial') {
              try {
                const payload = await syncConversation(false, request.signal);
                if (payload.matched === false) {
                  nextEmptyReason =
                    typeof payload.reason === 'string'
                      ? payload.reason
                      : 'No Messenger conversation matched this lead yet.';
                } else {
                  nextEmptyReason = null;
                }
              } catch (syncError) {
                if (isAbortError(syncError)) throw syncError;
                delayedError =
                  syncError instanceof Error
                    ? syncError
                    : new Error('Failed to sync Messenger conversation');
              }
              nextConversation = await fetchStored(request.signal);
            }
          }

          if (!gateRef.current.isCurrent(request) || !mountedRef.current)
            return;
          setConversation(nextConversation);
          if (nextConversation) {
            setEmptyReason(null);
          } else if (nextEmptyReason !== undefined) {
            setEmptyReason(nextEmptyReason);
          }
          if (delayedError) setError(delayedError.message);
        } catch (loadError) {
          if (
            isAbortError(loadError) ||
            !gateRef.current.isCurrent(request) ||
            !mountedRef.current
          ) {
            return;
          }
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load Messenger conversation'
          );
        } finally {
          const isCurrent =
            gateRef.current.isCurrent(request) && mountedRef.current;
          gateRef.current.finish(request);
          if (isCurrent) {
            setLoading(false);
            setSyncing(false);
            inFlightRef.current = null;
            if (queuedBackgroundRef.current) {
              queuedBackgroundRef.current = false;
              void runRef.current('background');
            }
          }
        }
      })();

      inFlightRef.current = promise;
      return promise;
    },
    [fetchStored, syncConversation]
  );
  runRef.current = run;

  useEffect(() => {
    const gate = gateRef.current;
    gateRef.current.cancel();
    setConversation(null);
    setEmptyReason(null);
    setError(null);
    void run('initial');
    return () => {
      gate.cancel();
      inFlightRef.current = null;
    };
  }, [run]);

  const refresh = useCallback(() => run('refresh'), [run]);
  const reloadStored = useCallback(() => run('background'), [run]);
  const clearError = useCallback(() => setError(null), []);

  return {
    conversation,
    loading,
    syncing,
    error,
    emptyReason,
    refresh,
    reloadStored,
    clearError,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getOldestHistoryCursor,
  isAbortError,
  LatestRequestGate,
  mergeChronologicalMessages,
  type HistoryCursor,
  type HistoryMessageIdentity,
  type HistoryPage,
} from './messagePagination';

type HistoryLoadMode = 'replace' | 'latest' | 'older';

export function usePaginatedMessageHistory<T extends HistoryMessageIdentity>({
  queryKey,
  enabled = true,
  fetchPage,
}: {
  queryKey: string;
  enabled?: boolean;
  fetchPage: (
    cursor: HistoryCursor | null,
    signal: AbortSignal
  ) => Promise<HistoryPage<T>>;
}) {
  const [messages, setMessages] = useState<T[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrollRevision, setScrollRevision] = useState(0);
  const messagesRef = useRef<T[]>([]);
  const hasOlderRef = useRef(false);
  const mountedRef = useRef(true);
  const gateRef = useRef(new LatestRequestGate());
  const inFlightRef = useRef<Promise<void> | null>(null);
  const failedModeRef = useRef<HistoryLoadMode>('replace');

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    hasOlderRef.current = hasOlder;
  }, [hasOlder]);

  useEffect(() => {
    const gate = gateRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      gate.cancel();
    };
  }, []);

  const load = useCallback(
    async (mode: HistoryLoadMode) => {
      if (!enabled) return;
      if (mode === 'older') {
        if (
          inFlightRef.current ||
          !hasOlderRef.current ||
          messagesRef.current.length === 0
        ) {
          return inFlightRef.current || undefined;
        }
      }

      const request = gateRef.current.begin();
      const cursor =
        mode === 'older' ? getOldestHistoryCursor(messagesRef.current) : null;
      failedModeRef.current = mode;
      if (mode === 'replace') setLoading(messagesRef.current.length === 0);
      if (mode === 'older') setLoadingOlder(true);
      setError(null);

      const promise = (async () => {
        try {
          const page = await fetchPage(cursor, request.signal);
          if (!gateRef.current.isCurrent(request) || !mountedRef.current)
            return;

          setMessages((current) =>
            mode === 'older'
              ? mergeChronologicalMessages(current, page.items)
              : mode === 'latest'
              ? mergeChronologicalMessages(current, page.items)
              : mergeChronologicalMessages([], page.items)
          );
          setHasOlder((current) =>
            mode === 'latest' ? current || page.hasOlder : page.hasOlder
          );
          if (mode !== 'older') {
            setScrollRevision((revision) => revision + 1);
          }
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
              : 'Failed to load messages'
          );
        } finally {
          const isCurrent =
            gateRef.current.isCurrent(request) && mountedRef.current;
          gateRef.current.finish(request);
          if (isCurrent) {
            setLoading(false);
            setLoadingOlder(false);
            inFlightRef.current = null;
          }
        }
      })();

      inFlightRef.current = promise;
      return promise;
    },
    [enabled, fetchPage]
  );

  useEffect(() => {
    const gate = gateRef.current;
    gateRef.current.cancel();
    inFlightRef.current = null;
    messagesRef.current = [];
    hasOlderRef.current = false;
    setMessages([]);
    setHasOlder(false);
    setError(null);
    setLoading(enabled);
    setLoadingOlder(false);
    if (enabled) void load('replace');

    return () => {
      gate.cancel();
      inFlightRef.current = null;
    };
  }, [enabled, load, queryKey]);

  const mutateMessages = useCallback((updater: (current: T[]) => T[]) => {
    setMessages((current) => {
      const next = updater(current);
      messagesRef.current = next;
      return next;
    });
  }, []);
  const reload = useCallback(() => load('latest'), [load]);
  const loadOlder = useCallback(() => load('older'), [load]);
  const retry = useCallback(() => load(failedModeRef.current), [load]);
  const clearError = useCallback(() => setError(null), []);

  return {
    messages,
    loading,
    loadingOlder,
    hasOlder,
    error,
    scrollRevision,
    reload,
    loadOlder,
    retry,
    clearError,
    mutateMessages,
  };
}

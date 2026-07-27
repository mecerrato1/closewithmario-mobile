import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lead, MetaLead, SelectedLeadRef } from '../../lib/types/leads';
import type { LeadDetailBootstrap } from './crmLeadApi';
import { loadLeadDetail } from './leadDetailLoader';

type State = {
  key: string;
  lead: Lead | MetaLead | null;
  bootstrap: LeadDetailBootstrap | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  bootstrapWarning: string | null;
};

export function useLeadDetailBootstrap(
  selected: SelectedLeadRef,
  initialLead: Lead | MetaLead | null
) {
  const source = selected.source === 'lead' ? 'organic' : 'meta';
  const selectionKey = `${source}:${selected.id}`;
  const [state, setState] = useState<State>({
    key: selectionKey,
    lead: initialLead,
    bootstrap: null,
    loading: true,
    refreshing: false,
    error: null,
    bootstrapWarning: null,
  });
  const generationRef = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const initialLeadRef = useRef(initialLead);
  initialLeadRef.current = initialLead;

  const run = useCallback(
    async (refreshing: boolean) => {
      const generation = ++generationRef.current;
      requestRef.current?.abort();
      const request = new AbortController();
      requestRef.current = request;
      setState((current) => ({
        ...current,
        key: selectionKey,
        lead:
          current.key === selectionKey
            ? current.lead ?? initialLeadRef.current
            : initialLeadRef.current,
        bootstrap: current.key === selectionKey ? current.bootstrap : null,
        bootstrapWarning: null,
        loading: !refreshing,
        refreshing,
        error: null,
      }));
      try {
        const result = await loadLeadDetail(selected.id, source, {
          signal: request.signal,
        });
        if (request.signal.aborted || generation !== generationRef.current)
          return;
        setState((current) => ({
          key: selectionKey,
          lead: result.lead,
          bootstrap:
            result.bootstrap ??
            (refreshing && current.key === selectionKey
              ? current.bootstrap
              : null),
          loading: false,
          refreshing: false,
          error: null,
          bootstrapWarning: result.bootstrapError,
        }));
      } catch (error) {
        if (request.signal.aborted || generation !== generationRef.current)
          return;
        setState((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error:
            error instanceof Error
              ? error.message
              : 'Could not load lead details.',
        }));
      } finally {
        if (requestRef.current === request) requestRef.current = null;
      }
    },
    [selected.id, selectionKey, source]
  );

  useEffect(() => {
    setState({
      key: selectionKey,
      lead: initialLeadRef.current,
      bootstrap: null,
      loading: true,
      refreshing: false,
      error: null,
      bootstrapWarning: null,
    });
    void run(false);
    return () => {
      generationRef.current += 1;
      requestRef.current?.abort();
    };
  }, [run, selected.id, selectionKey, source]);

  if (state.key !== selectionKey) {
    return {
      key: selectionKey,
      lead: initialLead?.id === selected.id ? initialLead : null,
      bootstrap: null,
      loading: true,
      refreshing: false,
      error: null,
      bootstrapWarning: null,
      refresh: () => run(true),
      retry: () => run(false),
    };
  }
  return {
    ...state,
    refresh: () => run(true),
    retry: () => run(false),
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';

import { API_BASE_URL } from '../../lib/apiBaseUrl';
import { authenticatedFetch } from '../../lib/authenticatedFetch';
import {
  callQueuePath,
  parseCallQueuePage,
  type CallQueueFilter,
  type CallQueuePage,
  type CallQueueScope,
} from './callQueue';

type Options = {
  enabled: boolean;
  scope: CallQueueScope;
  loanOfficerId?: string | null;
  bucket?: CallQueueFilter;
  pageSize: number;
};

const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

export function useCallQueue({ enabled, scope, loanOfficerId = null, bucket = 'all', pageSize }: Options) {
  const key = `${scope}:${loanOfficerId ?? ''}:${bucket}`;
  const [state, setState] = useState<{ key: string; page: CallQueuePage | null; error: boolean }>({
    key: '', page: null, error: false,
  });
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const pageRef = useRef<CallQueuePage | null>(null);
  pageRef.current = state.key === key ? state.page : null;

  const load = useCallback(
    async (offset: number) => {
      const id = ++request.current;
      setLoading(true);
      try {
        const response = await authenticatedFetch(
          `${API_BASE_URL}${callQueuePath({ scope, bucket, loanOfficerId, offset, limit: pageSize, timeZone: deviceTimeZone() })}`,
          { headers: { Accept: 'application/json' } }
        );
        const page = response.ok ? parseCallQueuePage(await response.json()) : null;
        if (id !== request.current) return;
        if (!page) throw new Error('call list unavailable');
        setState({
          key,
          page: offset && pageRef.current ? { ...page, items: [...pageRef.current.items, ...page.items] } : page,
          error: false,
        });
      } catch {
        // Keep what is already shown; say so rather than showing an empty list.
        if (id === request.current) setState((previous) => ({ key, page: previous.key === key ? previous.page : null, error: true }));
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [bucket, key, loanOfficerId, pageSize, scope]
  );

  useEffect(() => {
    if (enabled) void load(0);
  }, [enabled, load]);

  const page = state.key === key ? state.page : null;
  const refresh = useCallback(() => (enabled ? load(0) : Promise.resolve()), [enabled, load]);
  const loadMore = useCallback(() => {
    const current = pageRef.current;
    if (enabled && !loading && current && current.items.length < current.total) void load(current.items.length);
  }, [enabled, load, loading]);

  return { page, loading, error: state.key === key && state.error, refresh, loadMore };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import {
  fetchMessageInboxPage,
  type MessageInboxQuery,
} from './messageInboxClient';
import {
  MessageInboxRealtimeReloadQueue,
  MessageInboxPaginationController,
  type MessageInboxState,
} from './messageInboxPagination';

export function useMessageInbox(
  session: Session,
  options: {
    search?: string;
    unreadOnly?: boolean;
    enabled?: boolean;
  } = {}
) {
  const query: MessageInboxQuery = {
    userId: session.user.id,
    search: options.search?.trim() || '',
    unreadOnly: options.unreadOnly === true,
  };
  const queryKey = JSON.stringify(query);
  const enabled = options.enabled !== false;
  const controllerRef = useRef<MessageInboxPaginationController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new MessageInboxPaginationController(
      query,
      (nextQuery, requestOptions) =>
        fetchMessageInboxPage(nextQuery, requestOptions)
    );
  }
  const controller = controllerRef.current;
  const [state, setState] = useState<MessageInboxState>(controller.getState());
  const hasStartedRef = useRef(false);

  useEffect(() => controller.subscribe(setState), [controller]);

  useEffect(() => {
    if (!enabled) return;
    const isFirstEnabledLoad = !hasStartedRef.current;
    hasStartedRef.current = true;
    void controller
      .setQuery(JSON.parse(queryKey) as MessageInboxQuery)
      .then((queryChanged) => {
        if (isFirstEnabledLoad && !queryChanged) {
          return controller.loadFirst();
        }
      });
  }, [controller, enabled, queryKey]);

  useEffect(() => () => controller.dispose(), [controller]);

  useEffect(() => {
    if (!enabled) return;
    const reloadQueue = new MessageInboxRealtimeReloadQueue(
      (includeScenarioUpdates) => controller.reload(includeScenarioUpdates)
    );
    const subscription = supabase
      .channel('messages_tab_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sms_messages' },
        () => {
          reloadQueue.schedule(false);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meta_dm_messages' },
        () => {
          reloadQueue.schedule(false);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meta_dm_conversations' },
        () => {
          reloadQueue.schedule(false);
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
          reloadQueue.schedule(true);
        }
      )
      .subscribe();

    return () => {
      reloadQueue.dispose();
      void supabase.removeChannel(subscription);
    };
  }, [controller, enabled]);

  const refresh = useCallback(() => controller.refresh(), [controller]);
  const reload = useCallback(
    (includeScenarioUpdates = true) =>
      controller.reload(includeScenarioUpdates),
    [controller]
  );
  const retry = useCallback(() => controller.retry(), [controller]);
  const loadMore = useCallback(() => controller.loadMore(), [controller]);
  const markLocallyRead = useCallback(
    (conversationKey: string) => controller.markRead(conversationKey),
    [controller]
  );

  return useMemo(
    () => ({
      conversations: state.items,
      loading: enabled ? state.loading : false,
      refreshing: state.refreshing,
      loadingMore: state.loadingMore,
      hasMore: state.hasMore,
      totalCount: state.totalCount,
      error: state.error,
      refresh,
      reload,
      retry,
      loadMore,
      markLocallyRead,
    }),
    [enabled, loadMore, markLocallyRead, refresh, reload, retry, state]
  );
}

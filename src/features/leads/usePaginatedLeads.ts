import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCrmLeadListPage, type CrmLeadListQuery } from './crmLeadApi';
import {
  LeadPaginationController,
  type LeadPaginationState,
} from './leadPagination';

export function usePaginatedLeads(query: CrmLeadListQuery, enabled = true) {
  const queryKey = JSON.stringify(query);
  const controllerRef = useRef<LeadPaginationController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new LeadPaginationController(
      query,
      (nextQuery, options) => fetchCrmLeadListPage(nextQuery, options)
    );
  }
  const controller = controllerRef.current;
  const [state, setState] = useState<LeadPaginationState>(
    controller.getState()
  );
  const hasStartedRef = useRef(false);

  useEffect(() => controller.subscribe(setState), [controller]);

  useEffect(() => {
    if (!enabled) return;
    const isFirstEnabledLoad = !hasStartedRef.current;
    hasStartedRef.current = true;
    void controller
      .setQuery(JSON.parse(queryKey) as CrmLeadListQuery)
      .then((queryChanged) => {
        if (isFirstEnabledLoad && !queryChanged) return controller.loadFirst();
      });
  }, [controller, enabled, queryKey]);

  useEffect(() => () => controller.dispose(), [controller]);

  const refresh = useCallback(() => controller.refresh(), [controller]);
  const retry = useCallback(() => controller.retry(), [controller]);
  const loadMore = useCallback(() => controller.loadMore(), [controller]);
  const updateItem = useCallback(
    (source: 'organic' | 'meta', id: string, patch: Record<string, unknown>) =>
      controller.updateItem(source, id, patch),
    [controller]
  );
  const upsertItem = useCallback(
    (
      item: Parameters<LeadPaginationController['upsertItem']>[0],
      prepend?: boolean
    ) => controller.upsertItem(item, prepend),
    [controller]
  );
  const removeItem = useCallback(
    (source: 'organic' | 'meta', id: string) =>
      controller.removeItem(source, id),
    [controller]
  );

  return useMemo(
    () => ({
      ...state,
      refresh,
      retry,
      loadMore,
      updateItem,
      upsertItem,
      removeItem,
    }),
    [loadMore, refresh, removeItem, retry, state, updateItem, upsertItem]
  );
}

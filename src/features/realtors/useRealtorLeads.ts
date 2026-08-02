import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchRealtorLeadPage } from './realtorLeadApi';
import {
  RealtorLeadPaginationController,
  type RealtorLeadPaginationState,
} from './realtorLeadPagination';

export function useRealtorLeads(realtorId: string) {
  const controllerRef = useRef<RealtorLeadPaginationController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new RealtorLeadPaginationController(
      realtorId,
      (nextRealtorId, options) =>
        fetchRealtorLeadPage(nextRealtorId, options)
    );
  }
  const controller = controllerRef.current;
  const [state, setState] = useState<RealtorLeadPaginationState>(
    controller.getState()
  );
  const startedRef = useRef(false);

  useEffect(() => controller.subscribe(setState), [controller]);

  useEffect(() => {
    const firstLoad = !startedRef.current;
    startedRef.current = true;
    void controller.setRealtor(realtorId).then((changed) => {
      if (firstLoad && !changed) return controller.loadFirst();
    });
  }, [controller, realtorId]);

  useEffect(() => () => controller.dispose(), [controller]);

  const refresh = useCallback(() => controller.refresh(), [controller]);
  const retry = useCallback(() => controller.retry(), [controller]);
  const loadMore = useCallback(() => controller.loadMore(), [controller]);

  return useMemo(
    () => ({ ...state, refresh, retry, loadMore }),
    [loadMore, refresh, retry, state]
  );
}

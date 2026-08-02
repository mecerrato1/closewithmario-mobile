import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCrmLeadActivityBody, type CrmLeadSource } from './crmLeadApi';

const ACTIVITY_BODY_TIMEOUT_MS = 15_000;
const ACTIVITY_BODY_TIMEOUT_MESSAGE = 'The email body took too long to load. Retry.';

export function useLeadActivityBodies(input: {
  leadId: string;
  leadSource: CrmLeadSource;
}) {
  const identity = `${input.leadSource}:${input.leadId}`;
  const [bodies, setBodies] = useState<Map<string, string | null>>(() => new Map());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Map<string, string>>(() => new Map());
  const bodiesRef = useRef(bodies);
  const controllersRef = useRef(new Map<string, AbortController>());
  const generationRef = useRef(0);

  useEffect(() => {
    const controllers = controllersRef.current;
    generationRef.current += 1;
    controllers.forEach((controller) => controller.abort());
    controllers.clear();
    bodiesRef.current = new Map();
    setBodies(new Map());
    setLoadingIds(new Set());
    setErrors(new Map());

    return () => {
      generationRef.current += 1;
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
    };
  }, [identity]);

  const load = useCallback(async (activityId: string) => {
    if (bodiesRef.current.has(activityId)) {
      return bodiesRef.current.get(activityId) ?? null;
    }

    controllersRef.current.get(activityId)?.abort();
    const controller = new AbortController();
    controllersRef.current.set(activityId, controller);
    const generation = generationRef.current;
    setLoadingIds((current) => new Set(current).add(activityId));
    setErrors((current) => {
      const next = new Map(current);
      next.delete(activityId);
      return next;
    });

    let timeout: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error(ACTIVITY_BODY_TIMEOUT_MESSAGE));
      }, ACTIVITY_BODY_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([
        fetchCrmLeadActivityBody(
          input.leadId,
          input.leadSource,
          activityId,
          { signal: controller.signal }
        ),
        deadline,
      ]);
      if (
        controller !== controllersRef.current.get(activityId) ||
        generation !== generationRef.current
      ) return undefined;

      const nextBodies = new Map(bodiesRef.current);
      nextBodies.set(activityId, result.body);
      bodiesRef.current = nextBodies;
      setBodies(nextBodies);
      if (result.body === null) {
        setErrors((current) => new Map(current).set(
          activityId,
          'Full email content is unavailable.'
        ));
      }
      return result.body;
    } catch (error) {
      if (
        controller !== controllersRef.current.get(activityId) ||
        generation !== generationRef.current
      ) return undefined;
      if (!timedOut && (error as { name?: unknown })?.name === 'AbortError') {
        return undefined;
      }
      setErrors((current) => new Map(current).set(
        activityId,
        timedOut
          ? ACTIVITY_BODY_TIMEOUT_MESSAGE
          : 'Full email content is temporarily unavailable. Retry.'
      ));
      return undefined;
    } finally {
      if (timeout) clearTimeout(timeout);
      if (controller === controllersRef.current.get(activityId)) {
        controllersRef.current.delete(activityId);
        if (generation === generationRef.current) {
          setLoadingIds((current) => {
            const next = new Set(current);
            next.delete(activityId);
            return next;
          });
        }
      }
    }
  }, [input.leadId, input.leadSource]);

  return { bodies, loadingIds, errors, load };
}

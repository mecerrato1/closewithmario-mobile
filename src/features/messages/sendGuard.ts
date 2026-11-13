import { useRef } from 'react';

export type SendGuard = {
  /** Returns true and takes the lock, or false if a send is already in flight. */
  tryAcquire: () => boolean;
  release: () => void;
};

/**
 * A synchronous in-flight lock for outbound sends. Disabling a button from
 * React state is not enough: two quick taps can both run before the state
 * update renders. This lock closes that window.
 */
export function createSendGuard(): SendGuard {
  let busy = false;
  return {
    tryAcquire() {
      if (busy) return false;
      busy = true;
      return true;
    },
    release() {
      busy = false;
    },
  };
}

export function useSendGuard(): SendGuard {
  const ref = useRef<SendGuard | null>(null);
  if (ref.current === null) ref.current = createSendGuard();
  return ref.current;
}

export const SEND_TIMEOUT_MESSAGE =
  'The request timed out. Your message may already have been sent, so check the conversation before sending again.';
export const PARTNER_UPDATE_TIMEOUT_MESSAGE =
  'The request timed out. The update may already have been sent, so check before sending again.';

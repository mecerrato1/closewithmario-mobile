import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

/**
 * Android's Back button and gesture. While `enabled`, one step back runs
 * `onBack` instead of closing the app. The screen opened last answers first.
 */
export function useAndroidBack(enabled: boolean, onBack: () => void) {
  const latest = useRef(onBack);
  latest.current = onBack;

  useEffect(() => {
    if (!enabled) return;
    // Registered once per opening, so a re-render does not change the order.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      latest.current();
      return true;
    });
    return () => subscription.remove();
  }, [enabled]);
}

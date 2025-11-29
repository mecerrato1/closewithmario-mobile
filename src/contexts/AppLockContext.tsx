// src/contexts/AppLockContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { AppState, AppStateStatus } from 'react-native';

type AppLockContextType = {
  isLocked: boolean;
  requireUnlock: () => Promise<boolean>;
  enableLock: () => void;
  disableLock: () => void;
};

const AppLockContext = createContext<AppLockContextType | undefined>(undefined);

// How long before we re-lock after going to background (in minutes)
const IDLE_MINUTES = 10;

export const AppLockProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isLocked, setIsLocked] = useState(false);
  const lastBackgroundAtRef = useRef<number | null>(null);

  const enableLock = () => setIsLocked(true);
  const disableLock = () => setIsLocked(false);

  const requireUnlock = useCallback(async (): Promise<boolean> => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const canBiometric = hasHardware && supported.length > 0;

    if (!canBiometric) {
      // If no biometrics, you could either:
      // - leave app unlocked, or
      // - keep it locked and force re-login somewhere else.
      // For now, we just "unlock".
      setIsLocked(false);
      return true;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Close With Mario',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    if (result.success) {
      setIsLocked(false);
      return true;
    }

    return false;
  }, []);

  // Track app going background/foreground to apply idle timeout
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background') {
        lastBackgroundAtRef.current = Date.now();
      }
      if (nextState === 'active') {
        // Check how long we were in background
        if (lastBackgroundAtRef.current) {
          const diffMs = Date.now() - lastBackgroundAtRef.current;
          const diffMinutes = diffMs / 1000 / 60;
          if (diffMinutes >= IDLE_MINUTES) {
            setIsLocked(true);
          }
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      sub.remove();
    };
  }, []);

  return (
    <AppLockContext.Provider
      value={{
        isLocked,
        requireUnlock,
        enableLock,
        disableLock,
      }}
    >
      {children}
    </AppLockContext.Provider>
  );
};

export const useAppLock = (): AppLockContextType => {
  const ctx = useContext(AppLockContext);
  if (!ctx) {
    throw new Error('useAppLock must be used within AppLockProvider');
  }
  return ctx;
};

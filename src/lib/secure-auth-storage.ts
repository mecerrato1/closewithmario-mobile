// src/lib/secure-auth-storage.ts
// Secure storage for biometric sign-in using expo-secure-store.
// Stores the Supabase refresh token so users can sign in with Face ID / Touch ID.

import * as LocalAuthentication from 'expo-local-authentication';

// Lazy-load SecureStore so the app doesn't hard-crash
// if the native module hasn't been built yet.
let SecureStore: typeof import('expo-secure-store') | null = null;
try {
  SecureStore = require('expo-secure-store');
} catch {
  console.warn('[secure-auth] expo-secure-store native module not available — biometric sign-in disabled');
}

const REFRESH_TOKEN_KEY = 'cwm_biometric_refresh_token';
const BIOMETRIC_EMAIL_KEY = 'cwm_biometric_email';
const BIOMETRIC_ENABLED_KEY = 'cwm_biometric_enabled';

// ── Biometric capabilities ──

export async function checkBiometricCapabilities(): Promise<{
  isAvailable: boolean;
  isEnrolled: boolean;
  biometricType: 'Face ID' | 'Touch ID' | 'Biometrics';
}> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();

  let biometricType: 'Face ID' | 'Touch ID' | 'Biometrics' = 'Biometrics';
  if (supported.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    biometricType = 'Face ID';
  } else if (supported.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    biometricType = 'Touch ID';
  }

  return {
    isAvailable: hasHardware,
    isEnrolled,
    biometricType,
  };
}

// ── Store / retrieve credentials ──

export async function saveRefreshToken(refreshToken: string, email: string): Promise<void> {
  if (!SecureStore) return;
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, email);
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
  } catch (error) {
    console.error('[secure-auth] Failed to save refresh token:', error);
  }
}

export async function getRefreshToken(): Promise<string | null> {
  if (!SecureStore) return null;
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('[secure-auth] Failed to get refresh token:', error);
    return null;
  }
}

export async function getStoredEmail(): Promise<string | null> {
  if (!SecureStore) return null;
  try {
    return await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
  } catch (error) {
    return null;
  }
}

export async function isBiometricLoginEnabled(): Promise<boolean> {
  if (!SecureStore) return false;
  try {
    const val = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function clearBiometricCredentials(): Promise<void> {
  if (!SecureStore) return;
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
  } catch (error) {
    console.error('[secure-auth] Failed to clear credentials:', error);
  }
}

// ── Biometric sign-in flow ──

export async function biometricSignIn(): Promise<{
  success: boolean;
  refreshToken: string | null;
  error?: string;
}> {
  // 1. Check if biometric login is enabled
  const enabled = await isBiometricLoginEnabled();
  if (!enabled) {
    return { success: false, refreshToken: null, error: 'Biometric login not enabled.' };
  }

  // 2. Check device capabilities
  const caps = await checkBiometricCapabilities();
  if (!caps.isAvailable || !caps.isEnrolled) {
    return { success: false, refreshToken: null, error: 'Biometric authentication not available.' };
  }

  // 3. Prompt user for biometric auth
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Sign in to Close With Mario',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });

  if (!result.success) {
    return { success: false, refreshToken: null, error: 'Authentication cancelled.' };
  }

  // 4. Retrieve stored refresh token
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return { success: false, refreshToken: null, error: 'No saved session found. Please sign in with your password.' };
  }

  return { success: true, refreshToken };
}

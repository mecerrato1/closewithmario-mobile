// src/lib/secure-auth-storage.ts
// Secure storage for biometric sign-in using expo-secure-store.
// Stores credentials in iOS Keychain so users can sign in with Face ID / Touch ID.

import * as LocalAuthentication from 'expo-local-authentication';

// Lazy-load SecureStore so the app doesn't hard-crash
// if the native module hasn't been built yet.
let SecureStore: typeof import('expo-secure-store') | null = null;
try {
  SecureStore = require('expo-secure-store');
} catch {
  console.warn('[secure-auth] expo-secure-store native module not available — biometric sign-in disabled');
}

const BIOMETRIC_EMAIL_KEY = 'cwm_biometric_email';
const BIOMETRIC_PASSWORD_KEY = 'cwm_biometric_password';
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
  const canAuthenticate = hasHardware && supported.length > 0;

  let biometricType: 'Face ID' | 'Touch ID' | 'Biometrics' = 'Biometrics';
  if (supported.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    biometricType = 'Face ID';
  } else if (supported.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    biometricType = 'Touch ID';
  }

  return {
    isAvailable: canAuthenticate,
    isEnrolled,
    biometricType,
  };
}

// ── Store / retrieve credentials ──

export async function saveBiometricCredentials(email: string, password: string): Promise<boolean> {
  if (!SecureStore) return false;
  try {
    await SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, email);
    await SecureStore.setItemAsync(BIOMETRIC_PASSWORD_KEY, password, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
    return true;
  } catch (error) {
    console.error('[secure-auth] Failed to save biometric credentials:', error);
    return false;
  }
}

export async function getStoredPassword(): Promise<string | null> {
  if (!SecureStore) return null;
  try {
    return await SecureStore.getItemAsync(BIOMETRIC_PASSWORD_KEY);
  } catch (error) {
    console.error('[secure-auth] Failed to get stored password:', error);
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
    await SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_PASSWORD_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
  } catch (error) {
    console.error('[secure-auth] Failed to clear credentials:', error);
  }
}

// ── Biometric sign-in flow ──

export async function biometricSignIn(): Promise<{
  success: boolean;
  email: string | null;
  password: string | null;
  error?: string;
}> {
  // 1. Check if biometric login is enabled
  const enabled = await isBiometricLoginEnabled();
  if (!enabled) {
    return { success: false, email: null, password: null, error: 'Biometric login not enabled.' };
  }

  // 2. Check device capabilities
  const caps = await checkBiometricCapabilities();
  if (!caps.isAvailable) {
    return { success: false, email: null, password: null, error: 'Biometric authentication not available.' };
  }

  // 3. Prompt user for biometric auth
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Sign in to Close With Mario',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });

  if (!result.success) {
    return { success: false, email: null, password: null, error: 'Authentication cancelled.' };
  }

  // 4. Retrieve stored credentials
  const email = await getStoredEmail();
  const password = await getStoredPassword();
  if (!email || !password) {
    return { success: false, email: null, password: null, error: 'No saved credentials found. Please sign in with your password.' };
  }

  return { success: true, email, password };
}

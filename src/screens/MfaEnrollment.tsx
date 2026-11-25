// src/screens/MfaEnrollment.tsx
// Guided authenticator setup on the phone. A QR code cannot be scanned from the
// same screen, so the user either opens their authenticator app straight from the
// setup link or copies the setup key into it. Mirrors the web CRM's enrolment
// (supabase.auth.mfa.enroll + challengeAndVerify).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../lib/supabase';
import { formatSetupKey, uniqueFactorName } from '../features/session/mfaAccount';
import BrandLogo from '../brand/BrandLogo';
import { PUBLIC_BRAND } from '../brand/brands';

const brand = PUBLIC_BRAND;

// Shown in the authenticator app next to the account, same as the web CRM.
const MFA_ISSUER = 'Agent LO Connect';
const AUTHENTICATOR_STORE_URL =
  Platform.OS === 'android'
    ? 'https://play.google.com/store/apps/details?id=com.azure.authenticator'
    : 'https://apps.apple.com/app/microsoft-authenticator/id983156458';
const OTHER_AUTHENTICATORS =
  Platform.OS === 'android'
    ? 'Google Authenticator works too.'
    : 'Google Authenticator and the iPhone Passwords app work too.';
// Default name for this authenticator on the account's security page.
const DEVICE_NAME = Platform.OS === 'android' ? 'Android phone' : 'iPhone';

type Step = 'intro' | 'connect' | 'done';
type Enrollment = { factorId: string; secret: string; uri: string };

type Props = {
  /** Why setup is being asked for now. */
  intro: string;
  /** Called when the user taps Continue after a confirmed setup. */
  onVerified: () => void;
  /** Leaves setup without finishing. Omit when setup is mandatory. */
  onSkip?: () => void;
  skipLabel?: string;
  onSignOut: () => void;
};

/** Removes setup attempts that were never confirmed and returns the names still in use. */
async function removeUnfinishedFactors(): Promise<string[]> {
  const { data } = await supabase.auth.mfa.listFactors();
  const all = data?.all ?? [];
  for (const factor of all.filter((item) => item.status !== 'verified')) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  return all.filter((item) => item.status === 'verified').map((item) => item.friendly_name || '');
}

export default function MfaEnrollment({ intro, onVerified, onSkip, skipLabel = 'Not now', onSignOut }: Props) {
  const [step, setStep] = useState<Step>('intro');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const enrollmentRef = useRef<Enrollment | null>(null);
  enrollmentRef.current = enrollment;

  // An abandoned setup leaves an unconfirmed factor; remove it when this screen closes.
  useEffect(
    () => () => {
      const pending = enrollmentRef.current;
      if (pending) void supabase.auth.mfa.unenroll({ factorId: pending.factorId });
    },
    []
  );

  // The user leaves to read the code in the authenticator app. iOS hides the keyboard
  // while the app is in the background, so bring it back on return.
  useEffect(() => {
    if (step !== 'connect') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        inputRef.current?.blur();
        inputRef.current?.focus();
      }, 350);
    });
    return () => {
      subscription.remove();
      if (timer) clearTimeout(timer);
    };
  }, [step]);

  const discardPending = useCallback(async () => {
    const pending = enrollmentRef.current;
    enrollmentRef.current = null;
    setEnrollment(null);
    setCode('');
    setError(null);
    if (pending) await supabase.auth.mfa.unenroll({ factorId: pending.factorId });
  }, []);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const taken = await removeUnfinishedFactors();
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: uniqueFactorName(DEVICE_NAME, taken),
        issuer: MFA_ISSUER,
      });
      if (enrollError || !data) {
        setError('Could not start setup. Please try again.');
        return;
      }
      setEnrollment({ factorId: data.id, secret: data.totp.secret, uri: data.totp.uri });
      setCopied(false);
      setShowKey(false);
      setStep('connect');
    } catch {
      setError('Could not start setup. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  const openAuthenticator = useCallback(async () => {
    if (!enrollment) return;
    try {
      await Linking.openURL(enrollment.uri);
    } catch {
      // No installed app handles the link: fall back to the manual key.
      setShowKey(true);
      setError('Could not open an authenticator app. Copy the setup key below instead.');
    }
  }, [enrollment]);

  const copyKey = useCallback(async () => {
    if (!enrollment) return;
    try {
      await Clipboard.setStringAsync(enrollment.secret);
      setCopied(true);
      setError(null);
    } catch {
      setShowKey(true);
      setError('Could not copy automatically. Press and hold the key to copy it.');
    }
  }, [enrollment]);

  const confirm = useCallback(async () => {
    if (!enrollment || busy) return;
    const trimmed = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(trimmed)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollment.factorId,
      code: trimmed,
    });
    setBusy(false);
    if (verifyError) {
      setCode('');
      setError(
        /rate|too many/i.test(verifyError.message)
          ? 'Too many attempts. Wait a minute, then try again.'
          : 'That code did not match. Type the newest code the app shows. If it keeps failing, make sure your phone sets its time automatically.'
      );
      inputRef.current?.focus();
      return;
    }
    enrollmentRef.current = null;
    setEnrollment(null);
    setCode('');
    setStep('done');
  }, [busy, code, enrollment]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logo}>
          <BrandLogo brand={brand} />
        </View>

        {step === 'intro' ? (
          <>
            <Text style={styles.title}>Set up two-step verification</Text>
            <Text style={styles.body}>{intro}</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Step 1: Get an authenticator app</Text>
              <Text style={styles.cardBody}>
                We recommend Microsoft Authenticator. It is free. {OTHER_AUTHENTICATORS}
              </Text>
              <TouchableOpacity
                accessibilityRole="link"
                style={styles.linkButton}
                onPress={() => void Linking.openURL(AUTHENTICATOR_STORE_URL)}
              >
                <Text style={styles.linkText}>Get Microsoft Authenticator</Text>
              </TouchableOpacity>
            </View>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={start}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>I have an app, continue</Text>
              )}
            </TouchableOpacity>
          </>
        ) : null}

        {step === 'connect' && enrollment ? (
          <>
            <Text style={styles.title}>Connect your app</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Step 2: Add this account</Text>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.button}
                onPress={openAuthenticator}
              >
                <Text style={styles.buttonText}>Open my authenticator app</Text>
              </TouchableOpacity>
              <Text style={styles.cardBody}>
                Didn't open the app? In Microsoft Authenticator tap +, choose Other account, then Enter
                code manually, and paste the setup key.
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.secondaryButton}
                onPress={copyKey}
              >
                <Text style={styles.secondaryButtonText}>
                  {copied ? 'Copied. Paste it in your app' : 'Copy setup key'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={() => setShowKey((v) => !v)}>
                <Text style={styles.linkText}>{showKey ? 'Hide setup key' : 'Show setup key'}</Text>
              </TouchableOpacity>
              {showKey ? (
                <Text selectable style={styles.key}>
                  {formatSetupKey(enrollment.secret)}
                </Text>
              ) : null}
            </View>

            <Text style={styles.cardTitle}>Then enter the 6-digit code</Text>
            <TextInput
              ref={inputRef}
              accessibilityLabel="Authenticator code"
              style={styles.input}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={7}
              onSubmitEditing={confirm}
            />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={confirm}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Verify</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.secondary}
              onPress={() => {
                void discardPending();
                setStep('intro');
              }}
              disabled={busy}
            >
              <Text style={styles.secondaryText}>Back</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {step === 'done' ? (
          <>
            <Text style={styles.title}>You're all set</Text>
            <Text style={styles.body}>Two-step verification is on.</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>If you lose your phone</Text>
              <Text style={styles.cardBody}>
                Add a backup authenticator on the web CRM, for example on a second phone or a password
                manager. If you lose every authenticator, ask your administrator to reset two-step
                verification. They confirm who you are first.
              </Text>
            </View>
            <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={onVerified}>
              <Text style={styles.buttonText}>Continue</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {step !== 'done' && onSkip ? (
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.secondary}
            onPress={() => {
              void discardPending();
              onSkip();
            }}
            disabled={busy}
          >
            <Text style={styles.secondaryText}>{skipLabel}</Text>
          </TouchableOpacity>
        ) : null}
        {step !== 'done' ? (
          <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={onSignOut}>
            <Text style={styles.secondaryText}>Sign out</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.colors.canvas },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32, gap: 12 },
  logo: { alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: brand.colors.textPrimary, textAlign: 'center' },
  body: { fontSize: 14, color: brand.colors.textSecondary, textAlign: 'center' },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: brand.colors.textPrimary },
  cardBody: { fontSize: 14, color: brand.colors.textSecondary },
  linkButton: { minHeight: 44, justifyContent: 'center' },
  linkText: { color: brand.colors.accentStrong, fontWeight: '700', fontSize: 15 },
  key: {
    fontSize: 16,
    letterSpacing: 1,
    color: '#0F172A',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 12,
    textAlign: 'center',
  },
  input: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 6,
    color: '#0F172A',
  },
  error: { color: '#B91C1C', fontSize: 14, textAlign: 'center' },
  button: {
    minHeight: 48,
    backgroundColor: brand.colors.accentStrong,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: '#0F172A', fontWeight: '600', fontSize: 15 },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: brand.colors.textSecondary, fontWeight: '600' },
});

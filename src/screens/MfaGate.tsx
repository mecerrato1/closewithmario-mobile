// src/screens/MfaGate.tsx
// The CRM database and API now require a session verified with an authenticator
// code (aal2, TOTP under 30 days old) for anyone who has an authenticator. Without
// this gate the app's calls are refused and the lead list loads empty.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSessionMfaVerified } from '../features/session/mfaPolicy';
import { fetchAccountMfaStatus, isReminderSnoozed } from '../features/session/mfaAccount';
import { API_BASE_URL } from '../lib/apiBaseUrl';
import MfaEnrollment from './MfaEnrollment';
import BrandLogo from '../brand/BrandLogo';
import { PUBLIC_BRAND } from '../brand/brands';

const brand = PUBLIC_BRAND;

type GateState = 'checking' | 'open' | 'challenge' | 'enroll' | 'remind' | 'error';

const snoozeKey = (userId: string) => `mfa_setup_snoozed_at:${userId}`;

async function readSnooze(userId: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(snoozeKey(userId));
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

type Props = {
  session: Session;
  onSignOut: () => void;
  children: React.ReactNode;
};

export default function MfaGate({ session, onSignOut, children }: Props) {
  const [state, setState] = useState<GateState>('checking');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const inputRef = useRef<TextInput>(null);

  const accessToken = session.access_token;

  useEffect(() => {
    let cancelled = false;
    setState('checking');
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (error) {
        setState('error');
        return;
      }
      const totp = (data?.totp ?? []).find((f) => f.status === 'verified');
      // Always judge the newest token: a code just verified refreshes the session.
      const { data: current } = await supabase.auth.getSession();
      const token = current.session?.access_token ?? accessToken;
      if (!totp) {
        // No authenticator yet. The server decides whether this account must set one up.
        const status = await fetchAccountMfaStatus(API_BASE_URL, token);
        if (cancelled) return;
        if (!status) {
          setState('error');
          return;
        }
        if (status.decision === 'enrollment_required') {
          setState('enroll');
          return;
        }
        if (status.requiredRole && !isReminderSnoozed(await readSnooze(session.user.id))) {
          if (cancelled) return;
          setState('remind');
          return;
        }
        setState('open');
        return;
      }
      if (isSessionMfaVerified(token)) {
        setState('open');
        return;
      }
      setFactorId(totp.id);
      setState('challenge');
    })().catch(() => {
      if (!cancelled) setState('error');
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, attempt, session.user.id]);

  // People leave the app to read their authenticator code. iOS dismisses the
  // keyboard while the app is in the background and autoFocus only runs once, so
  // bring the keyboard back whenever the app returns to the foreground.
  useEffect(() => {
    if (state !== 'challenge') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      if (timer) clearTimeout(timer);
      // The input may still think it is focused; blur first so focus() reopens the keyboard.
      timer = setTimeout(() => {
        inputRef.current?.blur();
        inputRef.current?.focus();
      }, 350);
    });
    return () => {
      subscription.remove();
      if (timer) clearTimeout(timer);
    };
  }, [state]);

  const verify = useCallback(async () => {
    if (!factorId || submitting) return;
    const trimmed = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(trimmed)) {
      setMessage('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setSubmitting(true);
    setMessage(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: trimmed,
    });
    setSubmitting(false);
    if (error) {
      setCode('');
      setMessage('That code did not work. Check the code and try again.');
      return;
    }
    // The refreshed session arrives through onAuthStateChange; re-check it.
    setCode('');
    setAttempt((n) => n + 1);
  }, [code, factorId, submitting]);

  if (state === 'open') return <>{children}</>;

  if (state === 'enroll' || state === 'remind') {
    const mandatory = state === 'enroll';
    return (
      <MfaEnrollment
        intro={
          mandatory
            ? 'Your account needs two-step verification before you can open your leads. It takes about a minute.'
            : 'Your role will need two-step verification soon. Set it up now so your leads keep loading.'
        }
        onVerified={() => setAttempt((n) => n + 1)}
        onSkip={
          mandatory
            ? undefined
            : () => {
                void AsyncStorage.setItem(snoozeKey(session.user.id), String(Date.now())).catch(() => {});
                setState('open');
              }
        }
        skipLabel="Remind me later"
        onSignOut={onSignOut}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.logo}>
        <BrandLogo brand={brand} />
      </View>
      {state === 'checking' ? (
        <ActivityIndicator accessibilityLabel="Checking account security" />
      ) : state === 'error' ? (
        <>
          <Text style={styles.title}>Couldn't check your account</Text>
          <Text style={styles.subtitle}>Check your connection and try again.</Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.button}
            onPress={() => setAttempt((n) => n + 1)}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.title}>Two-step verification</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit code from your authenticator app.
          </Text>
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
            autoFocus
            onSubmitEditing={verify}
          />
          {message ? <Text style={styles.error}>{message}</Text> : null}
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={verify}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Verify</Text>
            )}
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={onSignOut}>
        <Text style={styles.secondaryText}>Sign out</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: brand.colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: { marginBottom: 32 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: brand.colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: brand.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 6,
    color: '#0F172A',
    marginBottom: 12,
  },
  error: { color: '#B91C1C', fontSize: 14, textAlign: 'center', marginBottom: 12 },
  button: {
    alignSelf: 'stretch',
    minHeight: 48,
    backgroundColor: brand.colors.accentStrong,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  secondary: { minHeight: 44, marginTop: 12, justifyContent: 'center' },
  secondaryText: { color: brand.colors.textSecondary, fontWeight: '600' },
});

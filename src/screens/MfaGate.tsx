// src/screens/MfaGate.tsx
// The CRM database and API now require a session verified with an authenticator
// code (aal2, TOTP under 30 days old) for anyone who has an authenticator. Without
// this gate the app's calls are refused and the lead list loads empty.
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { isSessionMfaVerified } from '../features/session/mfaPolicy';
const brand = {
  colors: {
    canvas: '#F8FAFC',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    accentStrong: '#0F172A',
  },
};

type GateState = 'checking' | 'open' | 'challenge' | 'error';

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
      // No authenticator on the account: nothing to verify.
      if (!totp) {
        setState('open');
        return;
      }
      if (isSessionMfaVerified(accessToken)) {
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
  }, [accessToken, attempt]);

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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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

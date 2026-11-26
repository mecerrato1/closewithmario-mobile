import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Factor } from '@supabase/supabase-js';

import { API_BASE_URL } from '../../lib/apiBaseUrl';
import { authenticatedFetch } from '../../lib/authenticatedFetch';
import { supabase } from '../../lib/supabase';
import MfaEnrollment from '../../screens/MfaEnrollment';
import { DeviceList } from './DeviceList';
import { confirmedRecoveryPhone, maskedPhone, normalizeRecoveryPhone } from './settingsData';
import { ui } from './settingsStyles';

type Open = 'twoStep' | 'phone' | null;

function Row({ title, detail, expanded, onPress }: { title: string; detail?: string; expanded?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }} style={ui.row} onPress={onPress}>
      <View style={ui.rowText}>
        <Text style={ui.title}>{title}</Text>
        {detail ? <Text style={ui.hint}>{detail}</Text> : null}
      </View>
      <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={18} color="#94A3B8" />
    </TouchableOpacity>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  return (
    <TextInput
      style={ui.input}
      value={value}
      onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, 6))}
      placeholder="6-digit code"
      placeholderTextColor="#94A3B8"
      keyboardType="number-pad"
      textContentType="oneTimeCode"
      accessibilityLabel="Verification code"
    />
  );
}

/** Authenticator apps: add one, or remove one after a fresh code. */
function TwoStep({ factors, reload, onAdd }: { factors: Factor[]; reload: () => Promise<void>; onAdd: () => void }) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remove = async (factorId: string) => {
    setBusy(true);
    setError('');
    const verified = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (verified.error) {
      setCode('');
      setError('That code did not match. Try the newest code.');
      setBusy(false);
      return;
    }
    const removed = await supabase.auth.mfa.unenroll({ factorId });
    if (removed.error) setError('Could not remove this authenticator. Please try again.');
    else {
      // Remembered devices were trusted with the old authenticator.
      await supabase.auth.signOut({ scope: 'others' });
      setRemoving(null);
      setCode('');
      await reload();
    }
    setBusy(false);
  };

  return (
    <>
      {factors.map((factor) => (
        <View key={factor.id} style={{ gap: 8 }}>
          <View style={ui.row}>
            <Text style={[ui.hint, ui.rowText]}>{factor.friendly_name || 'Authenticator app'}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                setRemoving(removing === factor.id ? null : factor.id);
                setCode('');
                setError('');
              }}
            >
              <Text style={[ui.link, ui.danger]}>{removing === factor.id ? 'Cancel' : 'Remove'}</Text>
            </TouchableOpacity>
          </View>
          {removing === factor.id ? (
            <>
              <Text style={ui.hint}>Enter a code from this authenticator. Removing it signs out your other devices.</Text>
              <CodeInput value={code} onChange={setCode} />
              <TouchableOpacity
                accessibilityRole="button"
                style={[ui.button, (busy || code.length !== 6) && ui.buttonDisabled]}
                disabled={busy || code.length !== 6}
                onPress={() => void remove(factor.id)}
              >
                <Text style={ui.buttonText}>{busy ? 'Removing…' : 'Remove authenticator'}</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      ))}
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <TouchableOpacity accessibilityRole="button" onPress={onAdd}>
        <Text style={ui.link}>{factors.length ? 'Add another authenticator' : 'Set up two-step verification'}</Text>
      </TouchableOpacity>
    </>
  );
}

/** Text-message password recovery: verify a mobile number while signed in. */
function RecoveryPhone({ confirmed, available, reload }: { confirmed: string | null; available: boolean; reload: () => Promise<void> }) {
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (sentTo) {
        const { data, error } = await supabase.auth.verifyOtp({ phone: sentTo, token: code, type: 'phone_change' });
        if (error || !data.user || confirmedRecoveryPhone(data.user) !== sentTo) {
          throw new Error('Could not verify this number. Check the code and try again.');
        }
        setSentTo(null);
        setCode('');
        setPhone('');
        await reload();
        setMessage({ text: 'Recovery phone verified.' });
      } else {
        const normalized = normalizeRecoveryPhone(phone);
        const { error } = await supabase.auth.updateUser({ phone: normalized });
        if (error) throw new Error('Could not send a verification text. Please wait and try again.');
        setSentTo(normalized);
        setMessage({ text: 'Enter the code sent to your phone.' });
      }
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Could not verify your recovery phone.', error: true });
    } finally {
      setBusy(false);
    }
  };

  if (confirmed) return <Text style={ui.hint}>Keep this number active. Contact an administrator if you need to change it.</Text>;
  if (!available) return <Text style={ui.hint}>Text recovery is not enabled for this account. Email recovery still works.</Text>;

  return (
    <>
      <Text style={ui.hint}>
        Verify a US mobile number so you can reset your password without email. Anyone with this number can recover your account; carrier charges may apply.
      </Text>
      <TextInput
        style={ui.input}
        value={phone}
        onChangeText={setPhone}
        editable={!busy && !sentTo}
        placeholder="(305) 555-0123"
        placeholderTextColor="#94A3B8"
        keyboardType="phone-pad"
        accessibilityLabel="Mobile number"
      />
      {sentTo ? <CodeInput value={code} onChange={setCode} /> : null}
      <TouchableOpacity
        accessibilityRole="button"
        style={[ui.button, (busy || (sentTo ? code.length !== 6 : !phone.trim())) && ui.buttonDisabled]}
        disabled={busy || (sentTo ? code.length !== 6 : !phone.trim())}
        onPress={() => void submit()}
      >
        <Text style={ui.buttonText}>{busy ? 'Working…' : sentTo ? 'Verify recovery phone' : 'Send verification text'}</Text>
      </TouchableOpacity>
      {sentTo ? (
        <TouchableOpacity accessibilityRole="button" onPress={() => { setSentTo(null); setCode(''); setMessage(null); }}>
          <Text style={ui.link}>Start over</Text>
        </TouchableOpacity>
      ) : null}
      {message ? <Text style={message.error ? ui.error : ui.notice}>{message.text}</Text> : null}
    </>
  );
}

async function textRecoveryEnabled(): Promise<boolean> {
  const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '' },
  });
  if (!response.ok) return false;
  const settings = await response.json();
  // An automatically confirmed number is never recovery proof.
  return settings.external?.phone === true && settings.phone_autoconfirm === false;
}

export function SecuritySettings({ onSignOut }: { onSignOut: () => void }) {
  const [open, setOpen] = useState<Open>(null);
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [phoneAvailable, setPhoneAvailable] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deviceRefresh, setDeviceRefresh] = useState(0);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const reload = useCallback(async () => {
    const [listed, current, enabled] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.getUser(),
      textRecoveryEnabled().catch(() => false),
    ]);
    // A failed lookup stays unknown instead of reading as "off".
    setFactors(listed.error ? null : listed.data.totp.filter((factor) => factor.status === 'verified'));
    const user = current.data.user;
    setPhone(user ? confirmedRecoveryPhone(user) : null);
    setPhoneAvailable(Boolean(user) && enabled);
  }, []);

  useEffect(() => {
    void reload().catch(() => setFactors(null));
  }, [reload]);

  const signOutOthers = () => {
    Alert.alert('Sign out other devices?', 'This device stays signed in. The others will need your password and code again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out others',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          setMessage(null);
          let failed = Boolean((await supabase.auth.signOut({ scope: 'others' })).error);
          if (!failed) {
            // Remembered browsers would otherwise skip the code at their next sign-in.
            try {
              const response = await authenticatedFetch(`${API_BASE_URL}/api/account/security`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'forget_trusted_devices', keepCurrent: true }),
              });
              failed = !response.ok;
            } catch {
              failed = true;
            }
          }
          setSigningOut(false);
          setDeviceRefresh((count) => count + 1);
          setMessage(
            failed ? { text: 'Could not sign out other devices. Please try again.', error: true } : { text: 'Other devices are signed out.' }
          );
        },
      },
    ]);
  };

  return (
    <View style={ui.card}>
      <Row
        title="Two-step verification"
        detail={factors === null ? 'Status unavailable' : factors.length ? 'On · authenticator app' : 'Off'}
        expanded={open === 'twoStep'}
        onPress={() => setOpen(open === 'twoStep' ? null : 'twoStep')}
      />
      {open === 'twoStep' && factors ? <TwoStep factors={factors} reload={reload} onAdd={() => setEnrolling(true)} /> : null}
      <View style={ui.divider} />
      <Row
        title="Recovery phone"
        detail={phone ? maskedPhone(phone) : 'Not added'}
        expanded={open === 'phone'}
        onPress={() => setOpen(open === 'phone' ? null : 'phone')}
      />
      {open === 'phone' ? <RecoveryPhone confirmed={phone} available={phoneAvailable} reload={reload} /> : null}
      <View style={ui.divider} />
      <DeviceList refreshKey={deviceRefresh} />
      <View style={ui.divider} />
      <Row title={signingOut ? 'Signing out…' : 'Sign out other devices'} onPress={signingOut ? () => {} : signOutOthers} />
      {message ? <Text style={message.error ? ui.error : ui.notice}>{message.text}</Text> : null}
      <Modal visible={enrolling} animationType="slide" onRequestClose={() => setEnrolling(false)}>
        {enrolling ? (
          <MfaEnrollment
            intro="Protect your account with a code from an authenticator app."
            onVerified={() => {
              setEnrolling(false);
              void reload();
            }}
            onSkip={() => setEnrolling(false)}
            skipLabel="Cancel"
            onSignOut={onSignOut}
          />
        ) : null}
      </Modal>
    </View>
  );
}

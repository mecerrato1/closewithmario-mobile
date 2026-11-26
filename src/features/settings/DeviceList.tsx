import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { API_BASE_URL } from '../../lib/apiBaseUrl';
import { authenticatedFetch } from '../../lib/authenticatedFetch';
import { shortDate } from './settingsData';
import { ui } from './settingsStyles';

type Device = { id: string; label: string; lastActiveAt: string | null; verifiedWithCode: boolean; current: boolean };
type TrustedDevice = { id: string; label: string; expiresAt: string | null; lastUsedAt: string | null };

const ENDPOINT = `${API_BASE_URL}/api/account/security`;

// The server only recognises browsers, so name the device in hand ourselves.
const THIS_DEVICE = Platform.OS === 'ios' ? (Platform.isPad ? 'This iPad' : 'This iPhone') : 'This phone';

/** Signed-in devices and remembered browsers, the same list the website shows. */
export function DeviceList({ refreshKey }: { refreshKey: number }) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [trusted, setTrusted] = useState<TrustedDevice[]>([]);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const response = await authenticatedFetch(`${ENDPOINT}?include=devices`);
      const body = response.ok ? await response.json() : null;
      if (!Array.isArray(body?.devices)) throw new Error('unavailable');
      setDevices(body.devices);
      setTrusted(Array.isArray(body.trustedDevices) ? body.trustedDevices : []);
    } catch {
      // Unknown is not the same as no devices.
      setDevices(null);
      setTrusted([]);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const act = (id: string, title: string, confirm: string, body: object, done: string) => {
    Alert.alert(title, confirm, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: title.replace('?', ''),
        style: 'destructive',
        onPress: async () => {
          setBusy(id);
          setMessage(null);
          try {
            const response = await authenticatedFetch(ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error('failed');
            setMessage({ text: done });
            await load();
          } catch {
            setMessage({ text: 'That did not work. Please try again.', error: true });
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={ui.row}
        onPress={() => setOpen(!open)}
      >
        <View style={ui.rowText}>
          <Text style={ui.title}>Signed-in devices</Text>
          <Text style={ui.hint}>
            {devices ? `${devices.length} signed in` : failed ? 'List unavailable' : 'Loading…'}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color="#94A3B8" />
      </TouchableOpacity>
      {open ? (
        <>
          {failed ? (
            <TouchableOpacity accessibilityRole="button" onPress={() => void load()}>
              <Text style={ui.link}>Try again</Text>
            </TouchableOpacity>
          ) : null}
          {devices?.map((device) => (
            <View key={device.id} style={ui.row}>
              <View style={ui.rowText}>
                <Text style={ui.title}>{device.current ? THIS_DEVICE : device.label}</Text>
                <Text style={ui.hint}>
                  {device.current ? 'Signed in now' : `Last active ${shortDate(device.lastActiveAt) || 'recently'}`}
                  {device.verifiedWithCode ? ' · verified with code' : ''}
                </Text>
              </View>
              {device.current ? null : (
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={busy === device.id}
                  onPress={() =>
                    act(
                      device.id,
                      'Sign out?',
                      `${device.label} will need your password and code to sign in again.`,
                      { action: 'revoke_device', sessionId: device.id },
                      `${device.label} is signed out.`
                    )
                  }
                >
                  <Text style={[ui.link, ui.danger]}>{busy === device.id ? 'Signing out…' : 'Sign out'}</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          {trusted.length ? (
            <>
              <Text style={ui.hint}>Remembered browsers skip the code until the date shown.</Text>
              {trusted.map((device) => (
                <View key={device.id} style={ui.row}>
                  <View style={ui.rowText}>
                    <Text style={ui.title}>{device.label}</Text>
                    <Text style={ui.hint}>
                      Code again {shortDate(device.expiresAt) || 'soon'}
                      {device.lastUsedAt ? ` · used ${shortDate(device.lastUsedAt)}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={busy === device.id}
                    onPress={() =>
                      act(
                        device.id,
                        'Forget?',
                        `${device.label} will ask for a code at its next sign-in.`,
                        { action: 'forget_trusted_device', deviceId: device.id },
                        `${device.label} will ask for a code next time.`
                      )
                    }
                  >
                    <Text style={ui.link}>{busy === device.id ? 'Forgetting…' : 'Forget'}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          ) : null}
        </>
      ) : null}
      {message ? <Text style={message.error ? ui.error : ui.notice}>{message.text}</Text> : null}
    </>
  );
}

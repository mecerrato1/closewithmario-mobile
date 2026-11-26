import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Share, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { API_BASE_URL } from '../../lib/apiBaseUrl';
import { authenticatedFetch } from '../../lib/authenticatedFetch';
import { supabase } from '../../lib/supabase';
import { readDpaLink, type DpaLink } from './settingsData';
import { ui } from './settingsStyles';

type CardProps = {
  title: string;
  /** What is shown, copied and shared. Empty when none is saved. */
  url: string;
  loading: boolean;
  loadError: string;
  onRetry: () => void;
  /** What Edit starts from, and how the new value is saved. */
  editValue: string;
  editHint: string;
  placeholder: string;
  onSave: (value: string) => Promise<void>;
};

function LinkCard({ title, url, loading, loadError, onRetry, editValue, editHint, placeholder, onSave }: CardProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const save = async () => {
    if (draft === null) return;
    setSaving(true);
    setMessage(null);
    try {
      await onSave(draft.trim());
      setDraft(null);
      setMessage({ text: 'Saved.' });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Could not save.', error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={ui.card}>
      <Text style={ui.title}>{title}</Text>
      {loading ? (
        <ActivityIndicator color="#2563EB" />
      ) : loadError ? (
        <TouchableOpacity accessibilityRole="button" onPress={onRetry}>
          <Text style={ui.error}>{loadError}</Text>
          <Text style={ui.link}>Try again</Text>
        </TouchableOpacity>
      ) : (
        <>
          <Text style={ui.hint} selectable numberOfLines={2}>{url || 'Not added yet'}</Text>
          {draft === null ? (
            <View style={ui.actions}>
              {url ? (
                <>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={async () => {
                      await Clipboard.setStringAsync(url);
                      setMessage({ text: 'Link copied.' });
                    }}
                  >
                    <Text style={ui.link}>Copy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" onPress={() => void Share.share({ message: url })}>
                    <Text style={ui.link}>Share</Text>
                  </TouchableOpacity>
                </>
              ) : null}
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => {
                  setDraft(editValue);
                  setMessage(null);
                }}
              >
                <Text style={ui.link}>{url ? 'Edit' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={ui.hint}>{editHint}</Text>
              <TextInput
                style={ui.input}
                value={draft}
                onChangeText={setDraft}
                placeholder={placeholder}
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <View style={ui.actions}>
                <TouchableOpacity accessibilityRole="button" disabled={saving || draft.trim() === editValue} onPress={() => void save()}>
                  <Text style={[ui.link, (saving || draft.trim() === editValue) && ui.buttonDisabled]}>{saving ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => setDraft(null)}>
                  <Text style={ui.link}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </>
      )}
      {message ? <Text style={message.error ? ui.error : ui.notice}>{message.text}</Text> : null}
    </View>
  );
}

async function request(path: string, init?: RequestInit) {
  const response = await authenticatedFetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || 'Something went wrong. Please try again.');
  return body;
}

/** Loads one link and keeps its loading and retry state. */
function useLink<T>(load: () => Promise<T>, failure: string) {
  const [value, setValue] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setValue(await load());
    } catch {
      setError(failure);
    } finally {
      setLoading(false);
    }
  }, [load, failure]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { value, setValue, loading, error, reload };
}

/** The loan officer's down payment assistance page, application and booking links. */
export function LinksSettings({ loId }: { loId: string }) {
  const dpa = useLink<DpaLink>(
    useCallback(async () => readDpaLink(await request('/api/crm/dpa-link')), []),
    'Your personal link could not be loaded.'
  );
  const application = useLink<string>(
    useCallback(async () => String((await request('/api/crm/online-application-url'))?.url ?? ''), []),
    'Your application link could not be loaded.'
  );
  const booking = useLink<string>(
    useCallback(async () => {
      const result = await supabase.from('loan_officers').select('bookings_url').eq('id', loId).single();
      if (result.error) throw result.error;
      return String(result.data.bookings_url ?? '');
    }, [loId]),
    'Your booking link could not be loaded.'
  );

  const dpaUrl = dpa.value ? `${API_BASE_URL}${dpa.value.publicPath || dpa.value.path}` : '';

  return (
    <>
      <LinkCard
        title="Down payment assistance page"
        url={dpaUrl}
        loading={dpa.loading}
        loadError={dpa.error}
        onRetry={() => void dpa.reload()}
        editValue={dpa.value?.slug ?? ''}
        editHint="Choose the end of your address: 3–60 letters, numbers or hyphens. Previous links keep working."
        placeholder="firstname-lastname"
        onSave={async (slug) => {
          // An account without an address yet has to have one prepared first, as on the website.
          if (!dpa.value?.slug) dpa.setValue(readDpaLink(await request('/api/crm/dpa-link', { method: 'POST' })));
          dpa.setValue(readDpaLink(await request('/api/crm/dpa-link', { method: 'PATCH', body: JSON.stringify({ slug: slug.toLowerCase() }) })));
        }}
      />
      <LinkCard
        title="Online application"
        url={application.value ?? ''}
        loading={application.loading}
        loadError={application.error}
        onRetry={() => void application.reload()}
        editValue={application.value ?? ''}
        editHint="The page borrowers use to start their application. Saving confirms this page is yours."
        placeholder="yourcompany.com/yourname"
        onSave={async (url) => {
          const saved = await request('/api/crm/online-application-url', {
            method: 'POST',
            body: JSON.stringify({ action: 'save', url, ...(url ? { confirmed: true } : {}) }),
          });
          application.setValue(String(saved?.url ?? ''));
        }}
      />
      <LinkCard
        title="Booking calendar"
        url={booking.value ?? ''}
        loading={booking.loading}
        loadError={booking.error}
        onRetry={() => void booking.reload()}
        editValue={booking.value ?? ''}
        editHint="Your Microsoft Bookings page. Leave it empty to disconnect."
        placeholder="https://outlook.office.com/book/…"
        onSave={async (url) => {
          await request(url ? '/api/outlook-bookings-connect' : '/api/outlook-bookings-disconnect', {
            method: 'POST',
            body: JSON.stringify({ loId, ...(url ? { url } : {}) }),
          });
          booking.setValue(url);
        }}
      />
    </>
  );
}

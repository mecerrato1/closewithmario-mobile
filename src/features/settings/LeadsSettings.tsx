import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Switch, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';

import { API_BASE_URL } from '../../lib/apiBaseUrl';
import { authenticatedFetch } from '../../lib/authenticatedFetch';
import { supabase } from '../../lib/supabase';
import { countiesChanged, FLORIDA_COUNTIES } from './settingsData';
import { ui } from './settingsStyles';

/** The loan officer's own AI texting switch, off when an administrator turned it off for everyone. */
export function AiTextingCard({ loId }: { loId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [globalOff, setGlobalOff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.from('loan_officers').select('automation_enabled').eq('id', loId).single(),
      supabase.from('automation_settings').select('automation_enabled').limit(1).maybeSingle(),
    ]).then(([own, global]) => {
      if (!active) return;
      if (own.error || global.error) {
        setError('AI texting could not be loaded.');
        return;
      }
      setEnabled(own.data?.automation_enabled ?? true);
      setGlobalOff(!(global.data?.automation_enabled ?? false));
    });
    return () => {
      active = false;
    };
  }, [loId]);

  const toggle = async (value: boolean) => {
    setSaving(true);
    setError('');
    const result = await supabase
      .from('loan_officers')
      .update({ automation_enabled: value })
      .eq('id', loId)
      .select('automation_enabled')
      .single();
    if (result.error) setError('Not saved. Please try again.');
    else setEnabled(result.data.automation_enabled === true);
    setSaving(false);
  };

  return (
    <View style={ui.card}>
      <View style={ui.row}>
        <View style={ui.rowText}>
          <Text style={ui.title}>AI texting</Text>
          <Text style={ui.hint}>
            {globalOff ? 'Disabled by an administrator' : enabled === false ? 'Paused for your personal leads' : 'Active for your personal leads'}
          </Text>
        </View>
        {enabled === null && !error ? (
          <ActivityIndicator color="#2563EB" />
        ) : (
          <Switch
            accessibilityLabel="AI texting"
            value={!globalOff && enabled === true}
            disabled={globalOff || saving || enabled === null}
            onValueChange={toggle}
            trackColor={{ false: '#D1D5DB', true: '#2563EB' }}
            thumbColor="#FFFFFF"
          />
        )}
      </View>
      {error ? <Text style={ui.error}>{error}</Text> : null}
    </View>
  );
}

type Officer = { id: string; county_filter?: string[] | null };

/** Meta Lead Program service counties. Shown only to loan officers the program answers for. */
export function ServiceCountiesCard({ loId }: { loId: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'hidden' | 'error'>('loading');
  const [saved, setSaved] = useState<string[] | null>(null);
  const [specific, setSpecific] = useState(false);
  const [counties, setCounties] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/crm/lead-program`);
      // Not an approved member: the website offers no counties either.
      if (response.status === 403) return setState('hidden');
      if (!response.ok) return setState('error');
      const report = (await response.json()) as { officers?: Officer[] };
      const officer = report.officers?.find((item) => item.id === loId);
      if (!officer) return setState('hidden');
      const filter = officer.county_filter ?? null;
      setSaved(filter);
      setSpecific(filter !== null);
      setCounties(filter ?? []);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [loId]);

  useEffect(() => {
    void load();
  }, [load]);

  const next = specific ? counties : null;
  const canSave = !saving && countiesChanged(saved, next) && !(specific && counties.length === 0);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/crm/lead-program`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'service_counties', loId, counties: next }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Counties could not be saved.');
      }
      setSaved(next);
      setMessage({ text: 'Service counties saved.' });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Counties could not be saved.', error: true });
    } finally {
      setSaving(false);
    }
  };

  if (state === 'hidden') return null;

  const matches = search.trim()
    ? FLORIDA_COUNTIES.filter((c) => c.toLowerCase().includes(search.trim().toLowerCase()) && !counties.includes(c)).slice(0, 6)
    : [];

  return (
    <View style={ui.card}>
      <View>
        <Text style={ui.title}>Service counties</Text>
        <Text style={ui.hint}>Where your new Meta leads can come from. Leads you already have stay with you.</Text>
      </View>
      {state === 'loading' ? <ActivityIndicator color="#2563EB" /> : null}
      {state === 'error' ? (
        <TouchableOpacity accessibilityRole="button" onPress={() => void load()}>
          <Text style={ui.error}>Counties could not be loaded.</Text>
          <Text style={ui.link}>Try again</Text>
        </TouchableOpacity>
      ) : null}
      {state === 'ready' ? (
        <>
          <View style={styles.segment}>
            {[false, true].map((value) => (
              <TouchableOpacity
                key={String(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: specific === value }}
                style={[styles.segmentItem, specific === value && styles.segmentOn]}
                onPress={() => {
                  setSpecific(value);
                  setMessage(null);
                }}
              >
                <Text style={[styles.segmentText, specific === value && styles.segmentTextOn]}>{value ? 'Specific' : 'All counties'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {specific ? (
            <>
              <View style={styles.chips}>
                {counties.map((county) => (
                  <TouchableOpacity
                    key={county}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${county}`}
                    style={styles.chip}
                    onPress={() => {
                      setCounties(counties.filter((c) => c !== county));
                      setMessage(null);
                    }}
                  >
                    <Text style={styles.chipText}>{county} ×</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={ui.input} value={search} onChangeText={setSearch} placeholder="Add a county…" placeholderTextColor="#94A3B8" autoCorrect={false} />
              {matches.map((county) => (
                <TouchableOpacity
                  key={county}
                  accessibilityRole="button"
                  onPress={() => {
                    setCounties([...counties, county].sort());
                    setSearch('');
                    setMessage(null);
                  }}
                >
                  <Text style={ui.link}>{county}</Text>
                </TouchableOpacity>
              ))}
              {counties.length === 0 ? <Text style={ui.hint}>Choose at least one county.</Text> : null}
            </>
          ) : null}
          <TouchableOpacity accessibilityRole="button" style={[ui.button, !canSave && ui.buttonDisabled]} disabled={!canSave} onPress={() => void save()}>
            <Text style={ui.buttonText}>{saving ? 'Saving…' : 'Save counties'}</Text>
          </TouchableOpacity>
        </>
      ) : null}
      {message ? <Text style={message.error ? ui.error : ui.notice}>{message.text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 3 },
  segmentItem: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  segmentOn: { backgroundColor: '#FFFFFF' },
  segmentText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  segmentTextOn: { color: '#0F172A' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#EAF1FE', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { color: '#1D4ED8', fontSize: 14, fontWeight: '600' },
});

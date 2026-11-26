import React from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';

import type { LeadAvailability } from './useLeadAvailability';

type Props = {
  availability: LeadAvailability;
  saving: boolean;
  error: string | null;
  onChange: (enabled: boolean) => void;
};

export function LeadAvailabilityCard({ availability, saving, error, onChange }: Props) {
  const { enabled, adminPaused, hours } = availability;
  const on = enabled && !adminPaused;

  return (
    <View style={[styles.card, adminPaused && styles.paused]}>
      <View style={styles.row}>
        <View style={styles.text}>
          <Text style={styles.title}>New Meta leads</Text>
          <Text style={[styles.status, on && styles.statusOn, adminPaused && styles.statusPaused]}>
            {adminPaused ? 'Paused by your administrator' : enabled ? `On · ${hours}` : "Off · you won't get new ones"}
          </Text>
        </View>
        {saving ? <ActivityIndicator size="small" color="#64748B" /> : null}
        <Switch
          accessibilityLabel="Receive new leads"
          value={on}
          onValueChange={onChange}
          disabled={saving || adminPaused}
          trackColor={{ false: '#CBD5E1', true: '#10B981' }}
          ios_backgroundColor="#CBD5E1"
        />
      </View>
      {adminPaused || !enabled ? (
        <Text style={styles.note}>
          {adminPaused ? 'Contact your administrator to resume. ' : ''}Your current leads stay with you.
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 14,
    marginHorizontal: 14,
    marginTop: 12,
    padding: 14,
  },
  paused: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { flex: 1 },
  title: { color: '#0F172A', fontSize: 16, fontWeight: '700' },
  status: { color: '#64748B', fontSize: 13, marginTop: 2 },
  statusOn: { color: '#047857' },
  statusPaused: { color: '#92400E' },
  note: { color: '#64748B', fontSize: 12, marginTop: 8 },
  error: { color: '#B91C1C', fontSize: 12, marginTop: 8 },
});

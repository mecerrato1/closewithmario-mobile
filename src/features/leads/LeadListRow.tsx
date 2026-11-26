import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

import { formatStatus } from '../../lib/leadsHelpers';
import type { NextStep } from './leadRowPresentation';

// Color is used only for leads that need you.
const URGENT = { red: { dot: '#DC2626', text: '#B91C1C' }, amber: { dot: '#D97706', text: '#92400E' } };

type Props = {
  name: string;
  status: string;
  source: string;
  time: string;
  step: NextStep;
  tracked: boolean;
  hasPhone: boolean;
  /** Extra lines, e.g. the loan officer or an active scenario. */
  notes: string[];
  onOpen: () => void;
  onCall: () => void;
  onText: () => void;
  onContacted: () => void;
  onUnqualified: () => void;
  onDelete?: () => void;
};

export function LeadListRow({
  name, status, source, time, step, tracked, hasPhone, notes,
  onOpen, onCall, onText, onContacted, onUnqualified, onDelete,
}: Props) {
  const urgent = step.needsYou ? URGENT[step.tone === 'red' ? 'red' : 'amber'] : null;

  const swipeAction = (label: string, color: string, onPress: () => void) => (
    <TouchableOpacity
      accessibilityRole="button"
      key={label}
      style={[styles.swipeButton, { backgroundColor: color }]}
      onPress={onPress}
    >
      <Text style={styles.swipeText}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Swipeable
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={
        hasPhone
          ? () => (
              <View style={styles.swipeRow}>
                {swipeAction('Call', '#1D4ED8', onCall)}
                {swipeAction('Text', '#2563EB', onText)}
              </View>
            )
          : undefined
      }
      renderRightActions={() => (
        <View style={styles.swipeRow}>
          {swipeAction('Contacted', '#3B82F6', onContacted)}
          {swipeAction('Unqualified', '#64748B', onUnqualified)}
          {onDelete ? swipeAction('Delete', '#DC2626', onDelete) : null}
        </View>
      )}
    >
      <TouchableOpacity accessibilityRole="button" style={styles.row} onPress={onOpen} activeOpacity={0.7}>
        <View style={styles.dotColumn}>
          {urgent ? <View style={[styles.dot, { backgroundColor: urgent.dot }]} accessibilityLabel="Needs you" /> : null}
        </View>
        <View style={styles.text}>
          <View style={styles.line}>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            {tracked ? <Ionicons name="pin" size={12} color="#94A3B8" accessibilityLabel="Tracked" /> : null}
            <Text style={styles.time}>{time}</Text>
          </View>
          <Text style={styles.detail} numberOfLines={1}>{formatStatus(status)} · {source}</Text>
          {urgent && step.reason ? (
            <Text style={[styles.reason, { color: urgent.text }]} numberOfLines={1}>{step.reason}</Text>
          ) : null}
          {notes.map((note) => (
            <Text key={note} style={styles.detail} numberOfLines={1}>{note}</Text>
          ))}
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EEF2F7', paddingVertical: 12, paddingRight: 16 },
  dotColumn: { width: 32, alignItems: 'center', paddingTop: 7 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  text: { flex: 1, gap: 3 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, color: '#0F172A', fontSize: 16, fontWeight: '600' },
  time: { color: '#64748B', fontSize: 12 },
  detail: { color: '#64748B', fontSize: 13 },
  reason: { fontSize: 13, fontWeight: '600' },
  swipeRow: { flexDirection: 'row', alignItems: 'stretch' },
  swipeButton: { minWidth: 78, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  swipeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});

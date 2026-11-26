import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

import { formatStatus, STATUS_COLOR_MAP } from '../../lib/leadsHelpers';
import type { NextStep, NextStepKind, NextStepTone } from './leadRowPresentation';

type IconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<NextStepKind, { name: IconName; label: string }> = {
  reply: { name: 'arrow-undo-outline', label: 'Reply needed' },
  docs: { name: 'document-text-outline', label: 'Documents follow-up' },
  call: { name: 'call-outline', label: 'Call back' },
  attention: { name: 'alert-circle-outline', label: 'Needs attention' },
  first_call: { name: 'person-add-outline', label: 'First call' },
  none: { name: 'checkmark', label: 'Nothing due' },
};

const TONES: Record<NextStepTone, { bg: string; fg: string; text: string }> = {
  red: { bg: '#FEE2E2', fg: '#B91C1C', text: '#B91C1C' },
  amber: { bg: '#FEF3C7', fg: '#92400E', text: '#92400E' },
  blue: { bg: '#DBEAFE', fg: '#1D4ED8', text: '#1D4ED8' },
  quiet: { bg: '#F1F5F9', fg: '#64748B', text: '#64748B' },
};

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
  const tone = TONES[step.tone];
  const icon = ICONS[step.kind];
  const statusColor = STATUS_COLOR_MAP[status] ?? { bg: '#F1F5F9', text: '#475569' };

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
        hasPhone && !step.card
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
      <View style={step.card ? styles.card : styles.plain}>
        <TouchableOpacity accessibilityRole="button" style={styles.body} onPress={onOpen} activeOpacity={0.7}>
          <View style={[styles.icon, { backgroundColor: tone.bg }]} accessibilityLabel={icon.label}>
            <Ionicons name={icon.name} size={19} color={tone.fg} />
          </View>
          <View style={styles.text}>
            <View style={styles.line}>
              {tracked ? <Ionicons name="pin" size={13} color="#2563EB" accessibilityLabel="Tracked" /> : null}
              <Text style={[styles.name, step.card && styles.nameStrong]} numberOfLines={1}>{name}</Text>
              <Text style={styles.time}>{time}</Text>
            </View>
            {step.card ? (
              <View style={styles.line}>
                <View style={[styles.pill, { backgroundColor: statusColor.bg }]}>
                  <Text style={[styles.pillText, { color: statusColor.text }]}>{formatStatus(status)}</Text>
                </View>
                <Text style={styles.detail} numberOfLines={1}>{source}</Text>
              </View>
            ) : (
              <Text style={styles.detail} numberOfLines={1}>{formatStatus(status)} · {source}</Text>
            )}
            {step.reason ? (
              <Text style={[styles.reason, { color: tone.text }]} numberOfLines={1}>{step.reason}</Text>
            ) : null}
            {notes.map((note) => (
              <Text key={note} style={styles.note} numberOfLines={1}>{note}</Text>
            ))}
          </View>
        </TouchableOpacity>
        {step.card && hasPhone ? (
          <View style={styles.bar}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Call ${name}`} style={styles.barButton} onPress={onCall}>
              <Ionicons name="call-outline" size={16} color="#1D4ED8" />
              <Text style={styles.barText}>Call</Text>
            </TouchableOpacity>
            <View style={styles.barDivider} />
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Text ${name}`} style={styles.barButton} onPress={onText}>
              <Ionicons name="chatbubble-outline" size={16} color="#1D4ED8" />
              <Text style={styles.barText}>Text</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    marginHorizontal: 10,
    marginVertical: 4,
    overflow: 'hidden',
  },
  plain: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EEF2F7', paddingHorizontal: 10 },
  body: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 3 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, color: '#0F172A', fontSize: 16, fontWeight: '500' },
  nameStrong: { fontWeight: '700' },
  time: { color: '#64748B', fontSize: 12 },
  pill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: '700' },
  detail: { color: '#64748B', fontSize: 13, flexShrink: 1 },
  reason: { fontSize: 13, fontWeight: '600' },
  note: { color: '#64748B', fontSize: 12 },
  bar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#EEF2F7' },
  barButton: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  barDivider: { width: 1, backgroundColor: '#EEF2F7' },
  barText: { color: '#1D4ED8', fontSize: 14, fontWeight: '600' },
  swipeRow: { flexDirection: 'row', alignItems: 'stretch' },
  swipeButton: { minWidth: 78, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  swipeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});

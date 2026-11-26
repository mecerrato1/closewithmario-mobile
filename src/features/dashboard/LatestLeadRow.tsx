import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { formatStatus, STATUS_COLOR_MAP } from '../../lib/leadsHelpers';

type Props = {
  name: string;
  status: string;
  /** Source and age, e.g. "Facebook · Florida DPA · 3d ago". */
  detail: string;
  hasPhone: boolean;
  first: boolean;
  onOpen: () => void;
  onCall: () => void;
  onText: () => void;
};

export function LatestLeadRow({ name, status, detail, hasPhone, first, onOpen, onCall, onText }: Props) {
  const color = STATUS_COLOR_MAP[status] ?? { bg: '#F1F5F9', text: '#475569' };
  return (
    <View style={[styles.row, !first && styles.divider]}>
      <TouchableOpacity accessibilityRole="button" style={styles.body} onPress={onOpen}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <View style={[styles.pill, { backgroundColor: color.bg }]}>
            <Text style={[styles.pillText, { color: color.text }]}>{formatStatus(status)}</Text>
          </View>
        </View>
        <Text style={styles.detail} numberOfLines={1}>{detail}</Text>
      </TouchableOpacity>
      {hasPhone ? (
        <>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Call ${name}`} style={styles.action} onPress={onCall}>
            <Ionicons name="call-outline" size={19} color="#1D4ED8" />
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Text ${name}`} style={styles.action} onPress={onText}>
            <Ionicons name="chatbubble-outline" size={19} color="#1D4ED8" />
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12 },
  divider: { borderTopWidth: 1, borderTopColor: '#EEF2F7' },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: '#0F172A', fontSize: 15, fontWeight: '600', flexShrink: 1 },
  pill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  pillText: { fontSize: 10, fontWeight: '700' },
  detail: { color: '#64748B', fontSize: 12, marginTop: 3 },
  action: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E8F0FE', alignItems: 'center', justifyContent: 'center' },
});

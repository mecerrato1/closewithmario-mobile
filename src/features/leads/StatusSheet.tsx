import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { formatStatus, STATUSES } from '../../lib/leadsHelpers';
import { PIPELINE_STAGE_KEYS, pipelineProgress } from './leadPipeline';

const OFF_PIPELINE = STATUSES.filter((s) => !(PIPELINE_STAGE_KEYS as readonly string[]).includes(s));

const DOT_COLORS: Record<string, string> = {
  working_on_credit: '#DC2626',
  nurturing: '#F59E0B',
  unqualified: '#94A3B8',
  lost_deal: '#475569',
};

type Props = {
  visible: boolean;
  status: string | null | undefined;
  onSelect: (status: string) => void;
  onClose: () => void;
};

export function StatusSheet({ visible, status, onSelect, onClose }: Props) {
  const current = status || 'new';
  const reached = pipelineProgress(current);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close status list" />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.titleRow}>
            <Text style={styles.title}>Change status</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>
          <ScrollView bounces={false}>
            <Text style={styles.heading}>PIPELINE</Text>
            {PIPELINE_STAGE_KEYS.map((key, index) => {
              const done = index + 1 < reached;
              const active = key === current;
              return (
                <TouchableOpacity
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => onSelect(key)}
                >
                  <View style={styles.step}>
                    {index > 0 ? <View style={[styles.line, styles.lineTop, (done || active) && styles.lineOn]} /> : null}
                    {index < PIPELINE_STAGE_KEYS.length - 1 ? (
                      <View style={[styles.line, styles.lineBottom, done && styles.lineOn]} />
                    ) : null}
                    <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                      {done ? <Ionicons name="checkmark" size={10} color="#FFFFFF" /> : null}
                    </View>
                  </View>
                  <Text style={styles.label}>{formatStatus(key)}</Text>
                  {active ? <Text style={styles.currentText}>Current</Text> : null}
                </TouchableOpacity>
              );
            })}
            <Text style={[styles.heading, styles.headingOff]}>OFF THE PIPELINE</Text>
            <View style={styles.grid}>
              {OFF_PIPELINE.map((key) => {
                const active = key === current;
                return (
                  <TouchableOpacity
                    key={key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.tile, active && styles.tileActive]}
                    onPress={() => onSelect(key)}
                  >
                    <View style={[styles.tileDot, { backgroundColor: DOT_COLORS[key] ?? '#94A3B8' }]} />
                    <Text style={styles.tileText} numberOfLines={1} adjustsFontSizeToFit>
                      {formatStatus(key)}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={16} color="#1D4ED8" /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2,6,23,0.55)' },
  backdrop: { flex: 1 },
  sheet: {
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 34,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#CBD5E1', marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '800', color: '#0B1220' },
  heading: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, color: '#64748B', marginBottom: 4 },
  headingOff: { marginTop: 16, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 46, borderRadius: 12, paddingHorizontal: 10 },
  rowActive: { backgroundColor: '#EFF6FF' },
  step: { width: 20, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  line: { position: 'absolute', left: 9, width: 2, height: '50%', backgroundColor: '#E2E8F0' },
  lineTop: { top: 0 },
  lineBottom: { bottom: 0 },
  lineOn: { backgroundColor: '#3B82F6' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  dotDone: { borderColor: '#3B82F6', backgroundColor: '#3B82F6' },
  dotActive: { width: 18, height: 18, borderRadius: 9, borderWidth: 5, borderColor: '#3B82F6' },
  label: { flex: 1, fontSize: 16, fontWeight: '600', color: '#0F172A' },
  currentText: { fontSize: 12, fontWeight: '700', color: '#1D4ED8' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  tile: { width: '48.8%', flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 46, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 12 },
  tileActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  tileDot: { width: 9, height: 9, borderRadius: 5 },
  tileText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0F172A' },
});

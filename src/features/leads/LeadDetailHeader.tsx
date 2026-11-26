import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { formatStatus, STATUS_COLOR_MAP } from '../../lib/leadsHelpers';
import { PIPELINE_STAGE_KEYS, pipelineProgress } from './leadPipeline';
import { screenTop } from '../../lib/screenTop';

type IconName = keyof typeof Ionicons.glyphMap;

export type LeadDetailTab<K extends string> = { key: K; label: string; badge?: string | null };

type Props<K extends string> = {
  name: string;
  phone: string;
  status: string | null;
  /** Only the name, call and text, and the tabs: used while scrolling and in conversations. */
  compact: boolean;
  position: string;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onStatusPress: () => void;
  onCall?: () => void;
  onText?: () => void;
  onSchedule: () => void;
  onEmail?: () => void;
  tabs: LeadDetailTab<K>[];
  activeTab: K;
  onTabPress: (key: K) => void;
};

export function LeadDetailHeader<K extends string>({
  name, phone, status, compact, position, onClose, onPrevious, onNext, onStatusPress,
  onCall, onText, onSchedule, onEmail, tabs, activeTab, onTabPress,
}: Props<K>) {
  const statusColor = STATUS_COLOR_MAP[status || 'new'] ?? { bg: '#F1F5F9', text: '#475569' };
  const reached = pipelineProgress(status);
  const statusLabel = status ? formatStatus(status) : 'No status';

  const icon = (name_: IconName, label: string, onPress: (() => void) | undefined, color = '#FFFFFF', size = 24) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
    >
      <Ionicons name={name_} size={size} color={onPress ? color : '#475569'} />
    </TouchableOpacity>
  );

  const action = (label: string, name_: IconName, onPress: (() => void) | undefined) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      style={styles.action}
    >
      <Ionicons name={name_} size={20} color={onPress ? '#93C5FD' : '#475569'} />
      <Text style={[styles.actionText, !onPress && styles.disabledText]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.header}>
      <View style={styles.top}>
        {icon('close', 'Close lead', onClose, '#FFFFFF', 26)}
        <View style={styles.title}>
          <Text style={[styles.name, compact && styles.nameCompact]} numberOfLines={1}>{name}</Text>
          {!compact && phone ? <Text style={styles.phone}>{phone}</Text> : null}
        </View>
        {compact ? (
          <>
            {icon('call-outline', 'Call', onCall, '#93C5FD')}
            {icon('chatbubble-outline', 'Text', onText, '#93C5FD')}
          </>
        ) : (
          <>
            {icon('chevron-back', 'Previous lead', onPrevious)}
            <Text style={styles.position}>{position}</Text>
            {icon('chevron-forward', 'Next lead', onNext)}
          </>
        )}
      </View>

      {compact ? null : (
        <>
          <View style={styles.statusRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Status ${statusLabel}, change`}
              onPress={onStatusPress}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              style={styles.pill}
            >
              <View style={[styles.pillDot, { backgroundColor: statusColor.text }]} />
              <Text style={styles.pillText}>{statusLabel}</Text>
              <Ionicons name="chevron-down" size={13} color="#94A3B8" />
            </TouchableOpacity>
            <View
              style={styles.progress}
              accessibilityLabel={reached ? `Stage ${reached} of ${PIPELINE_STAGE_KEYS.length}` : undefined}
            >
              {PIPELINE_STAGE_KEYS.map((key, index) => (
                <View key={key} style={[styles.segment, index < reached && styles.segmentOn]} />
              ))}
            </View>
          </View>
          <View style={styles.actions}>
            {action('Call', 'call-outline', onCall)}
            {action('Text', 'chatbubble-outline', onText)}
            {action('Schedule', 'calendar-outline', onSchedule)}
            {action('Email', 'mail-outline', onEmail)}
          </View>
        </>
      )}

      <View style={styles.tabs}>
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={tab.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => onTabPress(tab.key)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              {tab.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{tab.badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: '#0B1220', paddingTop: screenTop(60, 40), paddingHorizontal: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 },
  title: { flex: 1 },
  name: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  nameCompact: { fontSize: 18 },
  phone: { color: '#94A3B8', fontSize: 13, marginTop: 1 },
  position: { color: '#94A3B8', fontSize: 12, marginHorizontal: -6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: '#1E2638' },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  progress: { flex: 1, flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#334155' },
  segmentOn: { backgroundColor: '#3B82F6' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  action: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 7, borderRadius: 10, backgroundColor: '#1E2638' },
  actionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  disabledText: { color: '#475569' },
  tabs: { flexDirection: 'row', gap: 22, marginTop: 6 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#3B82F6' },
  tabText: { color: '#94A3B8', fontSize: 15, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
});

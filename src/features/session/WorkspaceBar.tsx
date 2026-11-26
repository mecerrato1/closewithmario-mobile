import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWorkspace } from './useWorkspace';
import { describeAssisted, isAssisting, setAssistedLoanOfficer, type WorkspaceMode } from './workspace';
import { chooseWorkspaceMode } from './workspaceMemory';
import { sheetBottom } from '../../lib/screenTop';

/**
 * Says whose leads are on screen and switches between them. Renders nothing for
 * people who assist nobody. Amber always means "these are not my own leads".
 */
export function WorkspaceBar() {
  const workspace = useWorkspace();
  const [picking, setPicking] = useState(false);
  if (!workspace.userId || !workspace.assisted.length) return null;

  const assisting = isAssisting(workspace);
  const picked = workspace.assisted.find((lo) => lo.id === workspace.loId);
  const options = [{ id: 'all', name: 'All loan officers' }, ...workspace.assisted];

  const segment = (mode: WorkspaceMode, label: string) => {
    const on = workspace.mode === mode;
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        style={[styles.segment, on && (mode === 'assisting' ? styles.segmentAmber : styles.segmentOn)]}
        onPress={() => chooseWorkspaceMode(workspace.userId as string, mode)}
      >
        <Text style={[styles.segmentText, on && (mode === 'assisting' ? styles.segmentTextAmber : styles.segmentTextOn)]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View>
      {workspace.hasOwn ? (
        <View style={styles.switchBand}>
          <View style={styles.segments}>
            {segment('own', 'My leads')}
            {segment('assisting', 'Assisting')}
          </View>
        </View>
      ) : null}
      {assisting ? (
        <View style={styles.bar}>
          <View style={styles.barText}>
            <Text style={styles.title} numberOfLines={1}>
              Assisting {describeAssisted(picked ? [picked] : workspace.assisted)}
            </Text>
            <Text style={styles.hint}>Changes are saved to their leads</Text>
          </View>
          {workspace.assisted.length > 1 ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Loan officer you are assisting: ${picked?.name ?? 'All loan officers'}`}
              style={styles.drop}
              onPress={() => setPicking(true)}
            >
              <Text style={styles.dropText} numberOfLines={1}>{picked?.name ?? 'All'}</Text>
              <Ionicons name="chevron-down" size={14} color="#451A03" />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" style={styles.shade} onPress={() => setPicking(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Loan officer you are assisting</Text>
          <ScrollView style={styles.sheetList}>
            {options.map((option) => (
              <TouchableOpacity
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: workspace.loId === option.id }}
                style={styles.option}
                onPress={() => {
                  setAssistedLoanOfficer(option.id);
                  setPicking(false);
                }}
              >
                <Text style={styles.optionText}>{option.name}</Text>
                {workspace.loId === option.id ? <Ionicons name="checkmark" size={18} color="#2563EB" /> : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  switchBand: { backgroundColor: '#0B1220', paddingHorizontal: 16, paddingVertical: 8 },
  segments: { flexDirection: 'row', backgroundColor: '#1E2638', borderRadius: 10, padding: 3 },
  segment: { flex: 1, minHeight: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: '#FFFFFF' },
  segmentAmber: { backgroundColor: '#FBBF24' },
  segmentText: { color: '#94A3B8', fontSize: 13, fontWeight: '700' },
  segmentTextOn: { color: '#0B1220' },
  segmentTextAmber: { color: '#451A03' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 1,
    borderBottomColor: '#FCD34D',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  barText: { flex: 1 },
  title: { color: '#451A03', fontSize: 13, fontWeight: '700' },
  hint: { color: '#451A03', fontSize: 11 },
  drop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 150,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#FBBF24',
    backgroundColor: '#FFFFFF',
  },
  dropText: { color: '#451A03', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  shade: { flex: 1, backgroundColor: 'rgba(11,18,32,0.45)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: sheetBottom(34) },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: '#0B1220', marginBottom: 6 },
  sheetList: { maxHeight: 360 },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F3',
  },
  optionText: { fontSize: 15, fontWeight: '600', color: '#0B1220' },
});

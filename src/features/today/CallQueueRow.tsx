import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { callbackWhen, callReason, type CallQueueItem } from './callQueue';

type Props = {
  item: CallQueueItem;
  first: boolean;
  onOpen: () => void;
  onCall: () => void;
  onText: () => void;
};

export function CallQueueRow({ item, first, onOpen, onCall, onText }: Props) {
  const late = item.bucket === 'overdue';
  const callback = callbackWhen(item);
  return (
    <View style={[styles.row, !first && styles.divider]}>
      <TouchableOpacity accessibilityRole="button" style={styles.body} onPress={onOpen}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.reason, late && styles.late]} numberOfLines={2}>{callReason(item)}</Text>
        {callback ? <Text style={styles.reason}>{callback}</Text> : null}
      </TouchableOpacity>
      {item.phone ? (
        <>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Call ${item.name}`} style={styles.action} onPress={onCall}>
            <Ionicons name="call-outline" size={19} color="#1D4ED8" />
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Text ${item.name}`} style={styles.action} onPress={onText}>
            <Ionicons name="chatbubble-outline" size={19} color="#1D4ED8" />
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#FFFFFF' },
  divider: { borderTopWidth: 1, borderTopColor: '#EEF2F7' },
  body: { flex: 1 },
  name: { color: '#0F172A', fontSize: 15, fontWeight: '600' },
  reason: { color: '#64748B', fontSize: 12, marginTop: 3 },
  late: { color: '#92400E' },
  action: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E8F0FE', alignItems: 'center', justifyContent: 'center' },
});

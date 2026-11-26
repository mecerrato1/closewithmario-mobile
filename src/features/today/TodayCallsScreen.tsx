import React, { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { PUBLIC_BRAND } from '../../brand/brands';
import { CALL_QUEUE_FILTERS, callSection, type CallQueueFilter, type CallQueueItem, type CallQueueScope } from './callQueue';
import { CallQueueRow } from './CallQueueRow';
import { useCallQueue } from './useCallQueue';
import { CaughtUp } from '../gio/CaughtUp';
import { screenTop } from '../../lib/screenTop';

type Props = {
  scope: CallQueueScope;
  loanOfficerId?: string | null;
  bucket: CallQueueFilter;
  onBucketChange: (bucket: CallQueueFilter) => void;
  onBack: () => void;
  onOpen: (item: CallQueueItem, action?: 'call' | 'text') => void;
};

export function TodayCallsScreen({ scope, loanOfficerId, bucket, onBucketChange, onBack, onOpen }: Props) {
  const { page, loading, error, refresh, loadMore } = useCallQueue({ enabled: true, scope, loanOfficerId, bucket, pageSize: 50 });
  // Counts stay on screen while another category loads.
  const [counts, setCounts] = useState<{ all: number; by: Record<string, number> } | null>(null);
  React.useEffect(() => {
    if (page) setCounts({ all: page.allTotal, by: page.counts });
  }, [page]);

  const items = page?.items ?? [];
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Who should I call today?</Text>
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CALL_QUEUE_FILTERS.map(({ key, label }) => {
            const active = key === bucket;
            const count = counts ? (key === 'all' ? counts.all : counts.by[key]) : null;
            return (
              <TouchableOpacity
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => onBucketChange(key)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {label}{count === null ? '' : `  ${count}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => `${item.leadSource}-${item.leadId}`}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading && items.length > 0} onRefresh={() => void refresh()} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        renderItem={({ item, index }) => {
          const section = callSection(item);
          const startsSection = index === 0 || section !== callSection(items[index - 1]);
          return (
            <View>
              {startsSection ? <Text style={styles.section}>{section}</Text> : null}
              <CallQueueRow
                item={item}
                first={startsSection}
                onOpen={() => onOpen(item)}
                onCall={() => onOpen(item, 'call')}
                onText={() => onOpen(item, 'text')}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.state} color="#2563EB" />
          ) : error ? (
            <TouchableOpacity accessibilityRole="button" style={styles.state} onPress={() => void refresh()}>
              <Text style={styles.stateText}>Couldn't load the call list. Tap to retry.</Text>
            </TouchableOpacity>
          ) : bucket === 'all' ? (
            <CaughtUp />
          ) : (
            <Text style={[styles.state, styles.stateText]}>No contacts in this category.</Text>
          )
        }
        ListFooterComponent={loading && items.length > 0 ? <ActivityIndicator style={styles.footer} color="#2563EB" /> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PUBLIC_BRAND.colors.canvas },
  header: { backgroundColor: PUBLIC_BRAND.colors.primary, paddingTop: screenTop(58, 40), paddingBottom: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', flex: 1 },
  chips: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  chipActive: { borderColor: '#BFD3FB', backgroundColor: '#E8F0FE' },
  chipText: { color: '#475569', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#1D4ED8' },
  list: { paddingBottom: 24 },
  section: { color: '#475569', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },
  state: { marginTop: 48, alignSelf: 'center', paddingHorizontal: 24 },
  stateText: { color: '#64748B', fontSize: 14, textAlign: 'center' },
  footer: { padding: 16 },
});

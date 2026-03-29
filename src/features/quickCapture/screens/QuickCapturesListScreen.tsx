// src/features/quickCapture/screens/QuickCapturesListScreen.tsx

import React from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuickCaptures } from '../hooks/useQuickCaptures';
import type { QuickCapture, QuickCaptureStatus } from '../types';

interface QuickCapturesListScreenProps {
  onCapturePress: (capture: QuickCapture) => void;
  onAddPress: () => void;
  onBack: () => void;
}

const PLUM = '#4C1D95';

const STATUS_FILTERS: { key: QuickCaptureStatus | 'all'; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'converted', label: 'Converted' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
];

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getStatusColor(status: QuickCaptureStatus): string {
  switch (status) {
    case 'open':
      return '#059669';
    case 'converted':
      return PLUM;
    case 'archived':
      return '#6B7280';
    default:
      return '#6B7280';
  }
}

export default function QuickCapturesListScreen({
  onCapturePress,
  onAddPress,
  onBack,
}: QuickCapturesListScreenProps) {
  const {
    captures,
    loading,
    refreshing,
    error,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    onRefresh,
  } = useQuickCaptures();

  const renderItem = ({ item }: { item: QuickCapture }) => {
    const fullName = [item.first_name, item.last_name].filter(Boolean).join(' ') || '(No name)';
    const realtorLabel =
      item.realtor_first_name || item.realtor_last_name
        ? `${item.realtor_first_name || ''} ${item.realtor_last_name || ''}`.trim()
        : null;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => onCapturePress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardLeft}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarLetter}>
                {(item.first_name || '?')[0].toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={styles.cardCenter}>
            <Text style={styles.cardName} numberOfLines={1}>
              {fullName}
            </Text>
            {item.phone ? (
              <Text style={styles.cardSub} numberOfLines={1}>
                {item.phone}
              </Text>
            ) : item.email ? (
              <Text style={styles.cardSub} numberOfLines={1}>
                {item.email}
              </Text>
            ) : null}
            {realtorLabel && (
              <View style={styles.realtorChip}>
                <Ionicons name="person-outline" size={12} color={PLUM} />
                <Text style={styles.realtorChipText} numberOfLines={1}>
                  {realtorLabel}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.timeAgo}>
              {getTimeAgo(item.last_touched_at || item.created_at)}
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(item.status) + '18' },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  { color: getStatusColor(item.status) },
                ]}
              >
                {item.status}
              </Text>
            </View>
          </View>
        </View>
        {item.notes ? (
          <Text style={styles.notesPreview} numberOfLines={1}>
            {item.notes}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
        <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📸</Text>
        <Text style={styles.emptyTitle}>
          {searchQuery ? 'No captures found' : 'No quick captures yet'}
        </Text>
        <Text style={styles.emptyText}>
          {searchQuery
            ? 'Try adjusting your search'
            : 'Tap + to quickly capture a lead with notebook photos'}
        </Text>
        {!searchQuery && (
          <TouchableOpacity style={styles.emptyBtn} onPress={onAddPress}>
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.emptyBtnText}>Quick Capture</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            Quick Captures{' '}
            <Text style={styles.headerCount}>({captures.length})</Text>
          </Text>
          <TouchableOpacity onPress={onAddPress} style={styles.headerBtn}>
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.7)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, phone, email..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            cursorColor="#FFFFFF"
            selectionColor="rgba(255,255,255,0.4)"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons
                name="close-circle"
                size={18}
                color="rgba(255,255,255,0.7)"
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => {
          const isActive =
            f.key === 'all' ? !statusFilter : statusFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() =>
                setStatusFilter(f.key === 'all' ? undefined : (f.key as QuickCaptureStatus))
              }
            >
              <Text
                style={[
                  styles.filterChipText,
                  isActive && styles.filterChipTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      {loading && !refreshing ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={PLUM} />
          <Text style={styles.loadingText}>Loading captures...</Text>
        </View>
      ) : (
        <FlatList
          data={captures}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={
            captures.length === 0 ? styles.emptyList : styles.list
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={PLUM}
              colors={[PLUM]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: PLUM,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerCount: {
    fontSize: 16,
    fontWeight: '500',
    opacity: 0.7,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    flex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  filterChipActive: {
    backgroundColor: PLUM,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
  emptyList: {
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardLeft: {},
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PLUM,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cardCenter: {
    flex: 1,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  cardSub: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  realtorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  realtorChipText: {
    fontSize: 12,
    color: PLUM,
    fontWeight: '500',
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  timeAgo: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  notesPreview: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
    paddingLeft: 52,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 100,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    color: '#6B7280',
    marginBottom: 24,
    lineHeight: 20,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PLUM,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

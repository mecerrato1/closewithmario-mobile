// src/features/quickCapture/components/SelectRealtorModal.tsx
// Modal picker to select an existing realtor

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRealtors } from '../../../hooks/useRealtors';
import type { AssignedRealtor } from '../../../lib/types/realtors';

interface SelectRealtorModalProps {
  visible: boolean;
  userId: string;
  onSelect: (realtor: { realtor_id: string; realtor_name: string }) => void;
  onClose: () => void;
  selectedRealtorId?: string | null;
}

export default function SelectRealtorModal({
  visible,
  userId,
  onSelect,
  onClose,
  selectedRealtorId,
}: SelectRealtorModalProps) {
  const [search, setSearch] = useState('');
  const {
    realtors,
    loading,
    loadingMore,
    hasMore,
    error,
    setSearchQuery,
    loadMore,
    retry,
  } = useRealtors({
    userId,
    autoFetch: visible,
  });

  useEffect(() => {
    setSearchQuery(search);
  }, [search, setSearchQuery]);

  useEffect(() => {
    if (!visible) {
      setSearch('');
      setSearchQuery('');
    }
  }, [setSearchQuery, visible]);

  const handleSelect = useCallback(
    (r: AssignedRealtor) => {
      const name = `${r.first_name || ''} ${r.last_name || ''}`.trim();
      onSelect({ realtor_id: r.realtor_id, realtor_name: name });
    },
    [onSelect]
  );

  const renderItem = useCallback(
    ({ item }: { item: AssignedRealtor }) => {
      const name = `${item.first_name || ''} ${item.last_name || ''}`.trim();
      const isSelected = item.realtor_id === selectedRealtorId;

      return (
        <TouchableOpacity
          style={[styles.row, isSelected && styles.rowSelected]}
          onPress={() => handleSelect(item)}
          activeOpacity={0.7}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(item.first_name || '?')[0].toUpperCase()}
            </Text>
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.rowName} numberOfLines={1}>
              {name || 'Unknown'}
            </Text>
            {item.brokerage ? (
              <Text style={styles.rowSub} numberOfLines={1}>
                {item.brokerage}
              </Text>
            ) : null}
          </View>
          {isSelected && (
            <Ionicons name="checkmark-circle" size={22} color="#7C3AED" />
          )}
        </TouchableOpacity>
      );
    },
    [selectedRealtorId, handleSelect]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Select Realtor</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, brokerage..."
              placeholderTextColor="#9CA3AF"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          {/* Clear selection option */}
          {selectedRealtorId && (
            <TouchableOpacity
              style={styles.clearRow}
              onPress={() => onSelect({ realtor_id: '', realtor_name: '' })}
            >
              <Ionicons
                name="remove-circle-outline"
                size={20}
                color="#EF4444"
              />
              <Text style={styles.clearText}>Remove Realtor Link</Text>
            </TouchableOpacity>
          )}

          {/* List */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#7C3AED" />
            </View>
          ) : (
            <FlatList
              data={realtors}
              keyExtractor={(item) => item.realtor_id}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  {error ? (
                    <>
                      <Text style={styles.emptyText}>{error}</Text>
                      <TouchableOpacity
                        style={styles.retryButton}
                        onPress={() => void retry()}
                      >
                        <Text style={styles.retryText}>Retry</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <Text style={styles.emptyText}>
                      {search
                        ? 'No realtors match your search'
                        : 'No realtors found'}
                    </Text>
                  )}
                </View>
              }
              ListFooterComponent={
                loadingMore ? (
                  <ActivityIndicator
                    style={styles.footerLoader}
                    color="#7C3AED"
                  />
                ) : error && realtors.length > 0 ? (
                  <TouchableOpacity
                    style={styles.footerRetry}
                    onPress={() => void retry()}
                  >
                    <Text style={styles.retryText}>Retry loading realtors</Text>
                  </TouchableOpacity>
                ) : hasMore ? (
                  <TouchableOpacity
                    style={styles.footerRetry}
                    onPress={() => void loadMore()}
                  >
                    <Text style={styles.retryText}>Load more realtors</Text>
                  </TouchableOpacity>
                ) : null
              }
              onEndReached={() => {
                if (hasMore) void loadMore();
              }}
              onEndReachedThreshold={0.4}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeBtn: {
    padding: 4,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  clearText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '500',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    borderRadius: 8,
    backgroundColor: '#7C3AED',
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  footerLoader: {
    paddingVertical: 16,
  },
  footerRetry: {
    alignSelf: 'center',
    marginVertical: 12,
    borderRadius: 8,
    backgroundColor: '#7C3AED',
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  rowSelected: {
    backgroundColor: '#F5F3FF',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  rowSub: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
});

// src/screens/realtors/RealtorsListScreen.tsx
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
import { useThemeColors } from '../../styles/theme';
import { useRealtors } from '../../hooks/useRealtors';
import { AssignedRealtor, RelationshipStage } from '../../lib/types/realtors';
import RealtorCard from '../../components/realtors/RealtorCard';

interface RealtorsListScreenProps {
  userId: string | undefined;
  onRealtorPress: (realtor: AssignedRealtor) => void;
  onAddPress: () => void;
  onClose?: () => void;
}

export default function RealtorsListScreen({
  userId,
  onRealtorPress,
  onAddPress,
  onClose,
}: RealtorsListScreenProps) {
  const { colors } = useThemeColors();
  const {
    realtors,
    loading,
    refreshing,
    error,
    searchQuery,
    setSearchQuery,
    stageFilter,
    setStageFilter,
    onRefresh,
  } = useRealtors({ userId });

  const FILTER_OPTIONS: { key: RelationshipStage | 'all'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'hot', label: 'Hot' },
    { key: 'warm', label: 'Warm' },
    { key: 'cold', label: 'Cold' },
  ];

  const renderHeader = () => (
    <View style={styles.listHeader}>
      {/* Inline minimal filters */}
      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((option) => {
          const isSelected = stageFilter === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.filterTab, isSelected && styles.filterTabActive]}
              onPress={() => setStageFilter(option.key)}
            >
              <Text style={[
                styles.filterTabText,
                { color: isSelected ? '#7C3AED' : colors.textSecondary },
              ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderEmptyState = () => {
    if (loading) return null;

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🤝</Text>
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
          {searchQuery || stageFilter !== 'all'
            ? 'No realtors found'
            : 'No realtors yet'}
        </Text>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          {searchQuery || stageFilter !== 'all'
            ? 'Try adjusting your search or filters'
            : 'Add your first realtor to start building your partner network'}
        </Text>
        {!searchQuery && stageFilter === 'all' && (
          <TouchableOpacity style={styles.emptyButton} onPress={onAddPress}>
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.emptyButtonText}>Add Realtor</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderItem = ({ item }: { item: AssignedRealtor }) => (
    <RealtorCard realtor={item} onPress={() => onRealtorPress(item)} />
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBackground }]}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Realtors{' '}
            <Text style={styles.headerCount}>({realtors.length})</Text>
          </Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.addButton} onPress={onAddPress}>
              <Ionicons name="add" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            {onClose && (
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchContainer, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.7)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, brokerage, phone..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Error State */}
      {error && (
        <View style={[styles.errorBanner, { backgroundColor: '#FEE2E2' }]}>
          <Ionicons name="alert-circle" size={18} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Loading State */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading realtors...
          </Text>
        </View>
      ) : (
        <FlatList
          data={realtors}
          keyExtractor={(item) => item.realtor_id}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={realtors.length === 0 ? styles.emptyList : styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#7C3AED"
              colors={['#7C3AED']}
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
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    paddingHorizontal: 16,
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
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerCount: {
    fontSize: 20,
    fontWeight: '500',
    opacity: 0.7,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  list: {
    paddingBottom: 24,
  },
  emptyList: {
    flexGrow: 1,
  },
  listHeader: {
    paddingTop: 8,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 4,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#7C3AED',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '500',
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
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#7C3AED',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

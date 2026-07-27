import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { Session } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import type { UserRole } from '../../lib/roles';
import { useThemeColors } from '../../styles/theme';
import { SmsMessaging } from '../../components/SmsMessaging';
import { MetaDmMessaging } from '../../components/MetaDmMessaging';
import {
  loadReadScenarioUpdateIds,
  saveReadScenarioUpdateIds,
} from '../../features/messages/messageInboxClient';
import { useMessageInbox } from '../../features/messages/useMessageInbox';
import type {
  ConversationSummary,
  PendingScenarioUpdate,
  PendingScenarioUpdateChange,
  ThreadSource,
} from '../../features/messages/messageTypes';

type FilterMode = 'all' | 'unread';

type ScreenState =
  | { screen: 'list' }
  | { screen: 'thread'; conversation: ConversationSummary };

interface MessagesTabScreenProps {
  session: Session;
  userRole: UserRole;
  onNavigateToLead?: (leadId: string, source: ThreadSource) => void;
}

const ACCENT = '#7C3AED';
const AMBER = '#D97706';

function getMetaDmInboxIcon(
  platform?: string | null
): keyof typeof Ionicons.glyphMap {
  const normalized = platform?.trim().toLowerCase() || '';
  if (normalized.includes('ig') || normalized.includes('instagram')) {
    return 'logo-instagram';
  }
  if (normalized.includes('messenger')) {
    return 'logo-facebook';
  }
  return 'chatbubble-ellipses-outline';
}

function formatPhoneNumber(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(
      7
    )}`;
  }
  if (digits.length === 10) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(
      6
    )}`;
  }
  return phone;
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function getChannelLabel(channel: ConversationSummary['channel']) {
  if (channel === 'scenario_update') return 'Scenario';
  return channel === 'dm' ? 'DM' : 'SMS';
}

function formatScenarioUpdateSubmitter(update: PendingScenarioUpdate) {
  const name = update.recipientName?.trim() || 'Shared link recipient';
  const role =
    update.recipientType === 'co_borrower'
      ? 'Co-borrower'
      : update.recipientType === 'key_contact'
      ? 'Key contact'
      : update.recipientType === 'realtor'
      ? 'Realtor'
      : 'Borrower';
  return `${name} • ${role}`;
}

function formatScenarioChangeValue(
  change: PendingScenarioUpdateChange,
  side: 'before' | 'after'
) {
  const label = side === 'before' ? change.beforeLabel : change.afterLabel;
  if (label) return label;
  const value = side === 'before' ? change.before : change.after;
  if (value == null || value === '') return 'blank';
  if (change.kind === 'currency') {
    const numeric = Number(value);
    return Number.isFinite(numeric)
      ? numeric.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        })
      : String(value);
  }
  if (change.kind === 'percent') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${numeric}%` : String(value);
  }
  return String(value);
}

export default function MessagesTabScreen({
  session,
  userRole,
  onNavigateToLead,
}: MessagesTabScreenProps) {
  const { colors } = useThemeColors();
  const [screenState, setScreenState] = useState<ScreenState>({
    screen: 'list',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  const isSearchTooShort = searchQuery.trim().length === 1;
  const {
    conversations,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    refresh,
    reload,
    retry,
    loadMore,
    markLocallyRead,
  } = useMessageInbox(session, {
    search: debouncedSearch.length >= 2 ? debouncedSearch : '',
    unreadOnly: filterMode === 'unread',
    enabled: userRole !== 'buyer',
  });

  const markConversationAsRead = useCallback(
    async (conversation: ConversationSummary) => {
      markLocallyRead(conversation.key);

      if (conversation.channel === 'scenario_update') {
        const updateIds = (conversation.scenarioUpdates || [])
          .map((update) => update.id)
          .filter(Boolean);
        if (updateIds.length === 0) return;

        setScreenState((current) =>
          current.screen === 'thread' &&
          current.conversation.key === conversation.key
            ? {
                screen: 'thread',
                conversation: {
                  ...current.conversation,
                  unreadCount: 0,
                },
              }
            : current
        );

        const readIds = await loadReadScenarioUpdateIds(session.user.id);
        updateIds.forEach((id) => readIds.add(id));
        await saveReadScenarioUpdateIds(session.user.id, readIds);
        return;
      }

      if (conversation.channel === 'sms') {
        const { error: updateError } = await supabase
          .from('sms_messages')
          .update({ read_at: new Date().toISOString() })
          .eq('lead_id', conversation.leadId)
          .eq('direction', 'inbound')
          .is('read_at', null);

        if (updateError) {
          console.error(
            'Error marking inbox SMS conversation read:',
            updateError
          );
        }
        return;
      }

      // The mounted DM thread marks its own conversation read so the same RPC
      // is not issued once here and again by MetaDmMessaging.
    },
    [markLocallyRead, session.user.id]
  );

  const filteredConversations = useMemo(() => {
    if (isSearchTooShort) return [];
    const trimmedQuery = searchQuery.trim().toLowerCase();
    const digitQuery = searchQuery.replace(/\D/g, '');

    return conversations.filter((conversation) => {
      if (filterMode === 'unread' && conversation.unreadCount === 0) {
        return false;
      }

      if (!trimmedQuery) {
        return true;
      }

      const phoneDigits = conversation.phone.replace(/\D/g, '');

      return (
        conversation.leadName.toLowerCase().includes(trimmedQuery) ||
        conversation.preview.toLowerCase().includes(trimmedQuery) ||
        conversation.phone.toLowerCase().includes(trimmedQuery) ||
        (!!digitQuery && phoneDigits.includes(digitQuery))
      );
    });
  }, [conversations, filterMode, isSearchTooShort, searchQuery]);

  const handleConversationPress = useCallback(
    (conversation: ConversationSummary) => {
      setScreenState({ screen: 'thread', conversation });
      if (conversation.unreadCount > 0) {
        markConversationAsRead(conversation).catch(() => undefined);
      }
    },
    [markConversationAsRead]
  );

  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  if (screenState.screen === 'thread') {
    const conversation = screenState.conversation;
    const isScenarioUpdate = conversation.channel === 'scenario_update';
    const scenarioUpdateCount =
      conversation.scenarioUpdates?.length || conversation.unreadCount;
    const threadSubtitleParts = [
      getChannelLabel(conversation.channel),
      isScenarioUpdate
        ? `${scenarioUpdateCount} pending update${
            scenarioUpdateCount === 1 ? '' : 's'
          }`
        : conversation.phone
        ? formatPhoneNumber(conversation.phone)
        : null,
    ].filter(Boolean);

    return (
      <View
        style={[
          styles.safeAreaShell,
          { backgroundColor: colors.cardBackground },
        ]}
      >
        <SafeAreaView
          style={[styles.container, { backgroundColor: colors.background }]}
        >
          <View
            style={[
              styles.threadHeader,
              {
                backgroundColor: colors.cardBackground,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.threadBackButton}
              onPress={() => {
                setScreenState({ screen: 'list' });
                void reload();
              }}
            >
              <Ionicons name="chevron-back" size={22} color={ACCENT} />
            </TouchableOpacity>

            <View style={styles.threadHeaderContent}>
              <Text
                style={[styles.threadTitle, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {conversation.leadName}
              </Text>
              <Text
                style={[styles.threadSubtitle, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {threadSubtitleParts.join(' • ') || 'Conversation'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.leadDetailsButton}
              onPress={() =>
                onNavigateToLead?.(conversation.leadId, conversation.source)
              }
            >
              <Ionicons
                name={
                  isScenarioUpdate ? 'calculator-outline' : 'person-outline'
                }
                size={16}
                color={isScenarioUpdate ? AMBER : ACCENT}
              />
              <Text
                style={[
                  styles.leadDetailsButtonText,
                  isScenarioUpdate && styles.leadDetailsButtonTextAmber,
                ]}
              >
                {isScenarioUpdate ? 'Review' : 'Lead'}
              </Text>
            </TouchableOpacity>
          </View>

          {isScenarioUpdate ? (
            <ScrollView contentContainerStyle={styles.scenarioDetailContent}>
              <View style={styles.scenarioNoticeCard}>
                <View style={styles.scenarioNoticeIcon}>
                  <Ionicons name="calculator-outline" size={20} color={AMBER} />
                </View>
                <View style={styles.scenarioNoticeBody}>
                  <Text style={styles.scenarioNoticeTitle}>
                    Shared scenario updates
                  </Text>
                  <Text style={styles.scenarioNoticeText}>
                    Review these changes from the lead detail Scenarios section.
                  </Text>
                </View>
              </View>

              {(conversation.scenarioUpdates || []).map((update) => (
                <View
                  key={update.id}
                  style={[
                    styles.scenarioUpdateCard,
                    {
                      backgroundColor: colors.cardBackground,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.scenarioUpdateHeader}>
                    <View style={styles.scenarioUpdateTitleBlock}>
                      <Text
                        style={[
                          styles.scenarioUpdateSubmitter,
                          { color: colors.textPrimary },
                        ]}
                        numberOfLines={1}
                      >
                        {formatScenarioUpdateSubmitter(update)}
                      </Text>
                      <Text
                        style={[
                          styles.scenarioUpdateMeta,
                          { color: colors.textSecondary },
                        ]}
                        numberOfLines={2}
                      >
                        {[
                          update.scenarioName || 'Saved scenario',
                          formatTimestamp(update.submittedAt),
                        ]
                          .filter(Boolean)
                          .join(' • ')}
                      </Text>
                    </View>
                    <View style={styles.scenarioUpdateBadge}>
                      <Text style={styles.scenarioUpdateBadgeText}>
                        Pending
                      </Text>
                    </View>
                  </View>

                  <View style={styles.scenarioChangeList}>
                    {update.changedSummary.length > 0 ? (
                      update.changedSummary.map((change, index) => (
                        <View
                          key={`${update.id}:${change.key || index}`}
                          style={styles.scenarioChangeRow}
                        >
                          <Text
                            style={[
                              styles.scenarioChangeLabel,
                              { color: colors.textPrimary },
                            ]}
                            numberOfLines={1}
                          >
                            {change.label || change.key || 'Changed field'}
                          </Text>
                          <Text
                            style={styles.scenarioChangeValue}
                            numberOfLines={2}
                          >
                            {formatScenarioChangeValue(change, 'before')} →{' '}
                            {formatScenarioChangeValue(change, 'after')}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text
                        style={[
                          styles.scenarioNoChangesText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        No field summary was included.
                      </Text>
                    )}
                  </View>
                </View>
              ))}

              <TouchableOpacity
                style={styles.scenarioReviewButton}
                onPress={() =>
                  onNavigateToLead?.(conversation.leadId, conversation.source)
                }
              >
                <Ionicons name="open-outline" size={16} color="#FFFFFF" />
                <Text style={styles.scenarioReviewButtonText}>
                  Review on Lead Detail
                </Text>
              </TouchableOpacity>
            </ScrollView>
          ) : conversation.channel === 'sms' ? (
            <SmsMessaging
              leadId={conversation.leadId}
              leadPhone={conversation.phone}
              leadName={conversation.leadName}
              leadSource={conversation.source === 'meta' ? 'meta_ads' : 'leads'}
              initialSmsOptIn={conversation.smsOptIn}
              initialSmsOptedOut={conversation.smsOptedOut}
              onMessageSent={() => {
                void reload();
              }}
              showHeader={false}
            />
          ) : (
            <MetaDmMessaging
              leadId={conversation.leadId}
              leadSource={conversation.source === 'meta' ? 'meta' : 'organic'}
              conversationId={conversation.conversationId}
              leadName={conversation.leadName}
              leadPhone={conversation.phone || null}
              leadEmail={conversation.leadEmail || null}
              onMessageSent={() => {
                void reload();
              }}
            />
          )}
        </SafeAreaView>
      </View>
    );
  }

  const renderConversationItem = ({ item }: { item: ConversationSummary }) => {
    const hasUnread = item.unreadCount > 0;
    const previewPrefix =
      item.latestDirection === 'outbound'
        ? `${item.isAutomated ? 'Gio' : 'You'}: `
        : '';
    const iconName =
      item.channel === 'scenario_update'
        ? 'calculator-outline'
        : item.channel === 'dm'
        ? getMetaDmInboxIcon(item.platform)
        : 'chatbubble-ellipses-outline';
    const iconColor = hasUnread
      ? '#FFFFFF'
      : item.channel === 'scenario_update'
      ? AMBER
      : item.channel === 'dm'
      ? '#4338CA'
      : ACCENT;

    return (
      <TouchableOpacity
        style={[
          styles.conversationCard,
          {
            backgroundColor: colors.cardBackground,
            borderColor: colors.border,
          },
        ]}
        activeOpacity={0.85}
        onPress={() => handleConversationPress(item)}
      >
        <View style={styles.avatarWrap}>
          <View
            style={[
              styles.avatarCircle,
              item.channel === 'scenario_update'
                ? styles.avatarCircleScenario
                : item.channel === 'dm'
                ? styles.avatarCircleDm
                : styles.avatarCircleSms,
              hasUnread && styles.avatarCircleUnread,
              hasUnread &&
                item.channel === 'scenario_update' &&
                styles.avatarCircleScenarioUnread,
            ]}
          >
            <Ionicons name={iconName} size={18} color={iconColor} />
          </View>
        </View>

        <View style={styles.conversationBody}>
          <View style={styles.conversationTopRow}>
            <View style={styles.conversationTitleWrap}>
              <Text
                style={[
                  styles.conversationName,
                  { color: colors.textPrimary },
                  hasUnread && styles.conversationNameUnread,
                ]}
                numberOfLines={1}
              >
                {item.leadName}
              </Text>
              <View
                style={[
                  styles.channelBadge,
                  item.channel === 'scenario_update'
                    ? styles.channelBadgeScenario
                    : item.channel === 'dm'
                    ? styles.channelBadgeDm
                    : styles.channelBadgeSms,
                ]}
              >
                <Text
                  style={[
                    styles.channelBadgeText,
                    item.channel === 'scenario_update'
                      ? styles.channelBadgeTextScenario
                      : item.channel === 'dm'
                      ? styles.channelBadgeTextDm
                      : styles.channelBadgeTextSms,
                  ]}
                >
                  {getChannelLabel(item.channel)}
                </Text>
              </View>
            </View>
            <Text
              style={[styles.conversationTime, { color: colors.textSecondary }]}
            >
              {formatTimestamp(item.latestMessageAt)}
            </Text>
          </View>

          <Text
            style={[styles.conversationPhone, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {item.channel === 'scenario_update'
              ? 'Shared qualification link'
              : item.phone
              ? formatPhoneNumber(item.phone)
              : 'No phone on file'}
          </Text>

          <View style={styles.conversationBottomRow}>
            <Text
              style={[
                styles.conversationPreview,
                {
                  color: hasUnread ? colors.textPrimary : colors.textSecondary,
                },
                hasUnread && styles.conversationPreviewUnread,
              ]}
              numberOfLines={2}
            >
              {previewPrefix}
              {item.preview}
            </Text>

            {hasUnread ? (
              <View
                style={[
                  styles.unreadBadge,
                  item.channel === 'scenario_update' &&
                    styles.unreadBadgeScenario,
                ]}
              >
                <Text style={styles.unreadBadgeText}>
                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView
      style={[
        styles.safeAreaShell,
        { backgroundColor: colors.headerBackground },
      ]}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View
          style={[styles.header, { backgroundColor: colors.headerBackground }]}
        >
          <Text style={styles.headerTitle}>Messages</Text>
          <Text style={styles.headerSubtitle}>
            Recent SMS, MMS, and DM conversations
          </Text>
        </View>

        <View
          style={[
            styles.controlsCard,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.searchWrap,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Search conversations"
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.filterRow}>
            {(['all', 'unread'] as FilterMode[]).map((mode) => {
              const isActive = filterMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.filterChip,
                    isActive
                      ? styles.filterChipActive
                      : styles.filterChipInactive,
                  ]}
                  onPress={() => setFilterMode(mode)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      isActive
                        ? styles.filterChipTextActive
                        : styles.filterChipTextInactive,
                    ]}
                  >
                    {mode === 'all' ? 'All' : 'Unread'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {isSearchTooShort ? (
            <Text style={[styles.searchHint, { color: colors.textSecondary }]}>
              Enter at least 2 characters to search all conversations.
            </Text>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Loading conversations...
            </Text>
          </View>
        ) : (
          <View style={styles.listShell}>
            {error && conversations.length > 0 ? (
              <TouchableOpacity
                style={styles.errorBanner}
                onPress={() => void retry()}
              >
                <Ionicons name="alert-circle" size={18} color="#B91C1C" />
                <Text style={styles.errorBannerText}>{error}</Text>
                <Text style={styles.errorBannerRetry}>Retry</Text>
              </TouchableOpacity>
            ) : null}
            <FlatList
              data={filteredConversations}
              keyExtractor={(item) => item.key}
              renderItem={renderConversationItem}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={ACCENT}
                />
              }
              onEndReached={() => void loadMore()}
              onEndReachedThreshold={0.4}
              ListFooterComponent={
                loadingMore ? (
                  <View style={styles.listFooter}>
                    <ActivityIndicator size="small" color={ACCENT} />
                  </View>
                ) : hasMore && !error ? (
                  <TouchableOpacity
                    style={styles.listFooter}
                    onPress={() => void loadMore()}
                  >
                    <Text style={styles.loadMoreText}>
                      Load more conversations
                    </Text>
                  </TouchableOpacity>
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={44}
                    color={colors.textSecondary}
                  />
                  <Text
                    style={[styles.emptyTitle, { color: colors.textPrimary }]}
                  >
                    {error
                      ? 'Could not load messages'
                      : isSearchTooShort
                      ? 'Keep typing to search'
                      : filterMode === 'unread'
                      ? 'No unread conversations'
                      : 'No conversations yet'}
                  </Text>
                  <Text
                    style={[
                      styles.emptySubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {error
                      ? error
                      : isSearchTooShort
                      ? 'Enter at least 2 characters to search all conversations.'
                      : searchQuery.trim()
                      ? 'Try a different name, phone number, or message preview.'
                      : 'Incoming and outgoing lead messages will appear here.'}
                  </Text>
                  {error ? (
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={() => void retry()}
                    >
                      <Text style={styles.retryButtonText}>Try again</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              }
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeAreaShell: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.82)',
  },
  controlsCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  searchHint: {
    fontSize: 12,
    lineHeight: 16,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  filterChipActive: {
    backgroundColor: '#EDE9FE',
  },
  filterChipInactive: {
    backgroundColor: '#F1F5F9',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: ACCENT,
  },
  filterChipTextInactive: {
    color: '#475569',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  listShell: {
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorBannerText: {
    flex: 1,
    color: '#B91C1C',
    fontSize: 12,
  },
  errorBannerRetry: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 10,
    flexGrow: 1,
  },
  listFooter: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: '700',
  },
  conversationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  avatarWrap: {
    paddingTop: 2,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F3FF',
  },
  avatarCircleSms: {
    backgroundColor: '#F5F3FF',
  },
  avatarCircleDm: {
    backgroundColor: '#EEF2FF',
  },
  avatarCircleScenario: {
    backgroundColor: '#FEF3C7',
  },
  avatarCircleUnread: {
    backgroundColor: ACCENT,
  },
  avatarCircleScenarioUnread: {
    backgroundColor: AMBER,
  },
  conversationBody: {
    flex: 1,
    gap: 4,
  },
  conversationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  conversationTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  conversationName: {
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  conversationNameUnread: {
    fontWeight: '700',
  },
  channelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  channelBadgeSms: {
    backgroundColor: '#F1F5F9',
  },
  channelBadgeDm: {
    backgroundColor: '#E0E7FF',
  },
  channelBadgeScenario: {
    backgroundColor: '#FEF3C7',
  },
  channelBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  channelBadgeTextSms: {
    color: '#475569',
  },
  channelBadgeTextDm: {
    color: '#4338CA',
  },
  channelBadgeTextScenario: {
    color: '#B45309',
  },
  conversationTime: {
    fontSize: 12,
    fontWeight: '500',
  },
  conversationPhone: {
    fontSize: 13,
  },
  conversationBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  conversationPreview: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  conversationPreviewUnread: {
    fontWeight: '600',
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeScenario: {
    backgroundColor: AMBER,
  },
  unreadBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 64,
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  threadBackButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F3FF',
  },
  threadHeaderContent: {
    flex: 1,
  },
  threadTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  threadSubtitle: {
    marginTop: 2,
    fontSize: 13,
  },
  leadDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F5F3FF',
  },
  leadDetailsButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: ACCENT,
  },
  leadDetailsButtonTextAmber: {
    color: AMBER,
  },
  scenarioDetailContent: {
    padding: 16,
    gap: 12,
  },
  scenarioNoticeCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
    padding: 14,
  },
  scenarioNoticeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
  },
  scenarioNoticeBody: {
    flex: 1,
  },
  scenarioNoticeTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#92400E',
  },
  scenarioNoticeText: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    color: '#B45309',
  },
  scenarioUpdateCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  scenarioUpdateHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  scenarioUpdateTitleBlock: {
    flex: 1,
  },
  scenarioUpdateSubmitter: {
    fontSize: 15,
    fontWeight: '800',
  },
  scenarioUpdateMeta: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
  },
  scenarioUpdateBadge: {
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  scenarioUpdateBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
    textTransform: 'uppercase',
  },
  scenarioChangeList: {
    gap: 8,
  },
  scenarioChangeRow: {
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    padding: 10,
  },
  scenarioChangeLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  scenarioChangeValue: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: '#B45309',
    fontWeight: '700',
  },
  scenarioNoChangesText: {
    fontSize: 13,
    lineHeight: 18,
  },
  scenarioReviewButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: AMBER,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  scenarioReviewButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});

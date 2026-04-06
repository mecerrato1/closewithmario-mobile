import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { Session } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { canSeeAllLeads, getUserRole, getUserTeamMemberId } from '../../lib/roles';
import { useThemeColors } from '../../styles/theme';
import { SmsMessaging } from '../../components/SmsMessaging';
import { getSmsMessageMedia, getSmsMessagePreviewText, type SmsRawPayload } from '../../lib/smsMedia';

type ThreadSource = 'lead' | 'meta';
type FilterMode = 'all' | 'unread';

type ScreenState =
  | { screen: 'list' }
  | { screen: 'thread'; conversation: ConversationSummary };

interface MessagesTabScreenProps {
  session: Session;
  onNavigateToLead?: (leadId: string, source: ThreadSource) => void;
}

interface LeadRecord {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  sms_opt_in?: boolean | null;
  sms_opted_out?: boolean | null;
}

interface ConversationContact extends LeadRecord {
  source: ThreadSource;
}

interface SmsMessageRow {
  id: string;
  lead_id: string | null;
  direction: 'inbound' | 'outbound';
  message_text: string | null;
  created_at: string;
  read_at?: string | null;
  raw_payload?: SmsRawPayload | string | null;
}

interface ConversationSummary {
  leadId: string;
  source: ThreadSource;
  leadName: string;
  phone: string;
  preview: string;
  latestMessageAt: string;
  latestDirection: 'inbound' | 'outbound';
  unreadCount: number;
  smsOptIn?: boolean | null;
  smsOptedOut?: boolean | null;
}

const ACCENT = '#7C3AED';

function getLeadDisplayName(lead: Pick<LeadRecord, 'first_name' | 'last_name'>) {
  return [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim() || 'Unknown lead';
}

function formatPhoneNumber(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
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

function sortConversations(conversations: ConversationSummary[]) {
  return [...conversations].sort((a, b) => {
    const unreadDifference = Number(b.unreadCount > 0) - Number(a.unreadCount > 0);
    if (unreadDifference !== 0) return unreadDifference;

    return new Date(b.latestMessageAt).getTime() - new Date(a.latestMessageAt).getTime();
  });
}

export default function MessagesTabScreen({ session, onNavigateToLead }: MessagesTabScreenProps) {
  const { colors } = useThemeColors();
  const [screenState, setScreenState] = useState<ScreenState>({ screen: 'list' });
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(
    async (options?: { showLoading?: boolean }) => {
      const showLoading = options?.showLoading ?? false;

      if (showLoading) {
        setLoading(true);
      }

      try {
        setError(null);

        if (!session?.user?.id || !session?.user?.email) {
          setConversations([]);
          return;
        }

        const role = await getUserRole(session.user.id, session.user.email);

        let leadsQuery = supabase
          .from('leads')
          .select('id, first_name, last_name, phone, sms_opt_in, sms_opted_out');
        let metaQuery = supabase
          .from('meta_ads')
          .select('id, first_name, last_name, phone, sms_opt_in, sms_opted_out');

        if (!canSeeAllLeads(role)) {
          if (role === 'loan_officer') {
            const teamMemberId = await getUserTeamMemberId(session.user.id, 'loan_officer');
            if (teamMemberId) {
              leadsQuery = leadsQuery.eq('lo_id', teamMemberId);
              metaQuery = metaQuery.eq('lo_id', teamMemberId);
            } else {
              leadsQuery = leadsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
              metaQuery = metaQuery.eq('id', '00000000-0000-0000-0000-000000000000');
            }
          } else if (role === 'realtor') {
            const teamMemberId = await getUserTeamMemberId(session.user.id, 'realtor');
            if (teamMemberId) {
              leadsQuery = leadsQuery.eq('realtor_id', teamMemberId);
              metaQuery = metaQuery.eq('realtor_id', teamMemberId);
            } else {
              leadsQuery = leadsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
              metaQuery = metaQuery.eq('id', '00000000-0000-0000-0000-000000000000');
            }
          } else {
            leadsQuery = leadsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
            metaQuery = metaQuery.eq('id', '00000000-0000-0000-0000-000000000000');
          }
        }

        const [
          { data: leadsData, error: leadsError },
          { data: metaData, error: metaError },
        ] = await Promise.all([leadsQuery, metaQuery]);

        if (leadsError) throw leadsError;
        if (metaError) throw metaError;

        const leadMap = new Map<string, ConversationContact>();

        ((leadsData || []) as LeadRecord[]).forEach((lead) => {
          leadMap.set(lead.id, { ...lead, source: 'lead' });
        });

        ((metaData || []) as LeadRecord[]).forEach((lead) => {
          if (!leadMap.has(lead.id)) {
            leadMap.set(lead.id, { ...lead, source: 'meta' });
          }
        });

        const accessibleLeadIds = Array.from(leadMap.keys());
        if (accessibleLeadIds.length === 0) {
          setConversations([]);
          return;
        }

        const { data: messageRows, error: messageError } = await supabase
          .from('sms_messages')
          .select('id, lead_id, direction, message_text, created_at, read_at, raw_payload')
          .in('lead_id', accessibleLeadIds)
          .order('created_at', { ascending: false });

        if (messageError) throw messageError;

        const conversationMap = new Map<string, ConversationSummary>();

        ((messageRows || []) as SmsMessageRow[]).forEach((message) => {
          if (!message.lead_id) return;

          const lead = leadMap.get(message.lead_id);
          if (!lead) return;

          const existingConversation = conversationMap.get(message.lead_id);

          if (!existingConversation) {
            const preview =
              getSmsMessagePreviewText(message) ||
              (getSmsMessageMedia(message).length > 0 ? 'Media attachment' : message.direction === 'outbound' ? 'Sent a message' : 'New message');

            conversationMap.set(message.lead_id, {
              leadId: message.lead_id,
              source: lead.source,
              leadName: getLeadDisplayName(lead),
              phone: lead.phone || '',
              preview,
              latestMessageAt: message.created_at,
              latestDirection: message.direction,
              unreadCount: message.direction === 'inbound' && !message.read_at ? 1 : 0,
              smsOptIn: lead.sms_opt_in,
              smsOptedOut: lead.sms_opted_out,
            });
            return;
          }

          if (message.direction === 'inbound' && !message.read_at) {
            existingConversation.unreadCount += 1;
          }
        });

        setConversations(sortConversations(Array.from(conversationMap.values())));
      } catch (loadError) {
        console.error('Error loading message inbox:', loadError);
        setError('Failed to load conversations');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session?.user?.email, session?.user?.id]
  );

  const markConversationAsRead = useCallback(async (leadId: string) => {
    setConversations((prev) =>
      sortConversations(
        prev.map((conversation) =>
          conversation.leadId === leadId ? { ...conversation, unreadCount: 0 } : conversation
        )
      )
    );

    const { error: updateError } = await supabase
      .from('sms_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('lead_id', leadId)
      .eq('direction', 'inbound')
      .is('read_at', null);

    if (updateError) {
      console.error('Error marking inbox conversation read:', updateError);
    }
  }, []);

  useEffect(() => {
    loadConversations({ showLoading: true });
  }, [loadConversations]);

  useEffect(() => {
    const subscription = supabase
      .channel('messages_tab_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sms_messages' },
        () => {
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [loadConversations]);

  const filteredConversations = useMemo(() => {
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
  }, [conversations, filterMode, searchQuery]);

  const handleConversationPress = useCallback(
    (conversation: ConversationSummary) => {
      setScreenState({ screen: 'thread', conversation });
      if (conversation.unreadCount > 0) {
        markConversationAsRead(conversation.leadId).catch(() => undefined);
      }
    },
    [markConversationAsRead]
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadConversations();
  }, [loadConversations]);

  if (screenState.screen === 'thread') {
    const conversation = screenState.conversation;

    return (
      <View style={[styles.safeAreaShell, { backgroundColor: colors.cardBackground }]}>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={[styles.threadHeader, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
            <TouchableOpacity
              style={styles.threadBackButton}
              onPress={() => {
                setScreenState({ screen: 'list' });
                loadConversations();
              }}
            >
              <Ionicons name="chevron-back" size={22} color={ACCENT} />
            </TouchableOpacity>

            <View style={styles.threadHeaderContent}>
              <Text style={[styles.threadTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {conversation.leadName}
              </Text>
              <Text style={[styles.threadSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                {conversation.phone ? formatPhoneNumber(conversation.phone) : 'No phone on file'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.leadDetailsButton}
              onPress={() => onNavigateToLead?.(conversation.leadId, conversation.source)}
            >
              <Ionicons name="person-outline" size={16} color={ACCENT} />
              <Text style={styles.leadDetailsButtonText}>Lead</Text>
            </TouchableOpacity>
          </View>

          <SmsMessaging
            leadId={conversation.leadId}
            leadPhone={conversation.phone}
            leadName={conversation.leadName}
            leadSource={conversation.source === 'meta' ? 'meta_ads' : 'leads'}
            initialSmsOptIn={conversation.smsOptIn}
            initialSmsOptedOut={conversation.smsOptedOut}
            onMessageSent={() => {
              loadConversations();
            }}
            showHeader={false}
          />
        </SafeAreaView>
      </View>
    );
  }

  const renderConversationItem = ({ item }: { item: ConversationSummary }) => {
    const hasUnread = item.unreadCount > 0;
    const previewPrefix = item.latestDirection === 'outbound' ? 'You: ' : '';

    return (
      <TouchableOpacity
        style={[styles.conversationCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
        activeOpacity={0.85}
        onPress={() => handleConversationPress(item)}
      >
        <View style={styles.avatarWrap}>
          <View style={[styles.avatarCircle, hasUnread && styles.avatarCircleUnread]}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={hasUnread ? '#FFFFFF' : ACCENT} />
          </View>
        </View>

        <View style={styles.conversationBody}>
          <View style={styles.conversationTopRow}>
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
            <Text style={[styles.conversationTime, { color: colors.textSecondary }]}>
              {formatTimestamp(item.latestMessageAt)}
            </Text>
          </View>

          <Text style={[styles.conversationPhone, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.phone ? formatPhoneNumber(item.phone) : 'No phone on file'}
          </Text>

          <View style={styles.conversationBottomRow}>
            <Text
              style={[
                styles.conversationPreview,
                { color: hasUnread ? colors.textPrimary : colors.textSecondary },
                hasUnread && styles.conversationPreviewUnread,
              ]}
              numberOfLines={2}
            >
              {previewPrefix}
              {item.preview}
            </Text>

            {hasUnread ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.safeAreaShell, { backgroundColor: colors.headerBackground }]}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.headerBackground }]}>
          <Text style={styles.headerTitle}>Messages</Text>
          <Text style={styles.headerSubtitle}>Recent SMS and MMS conversations</Text>
        </View>

        <View style={[styles.controlsCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
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
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
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
                    isActive ? styles.filterChipActive : styles.filterChipInactive,
                  ]}
                  onPress={() => setFilterMode(mode)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      isActive ? styles.filterChipTextActive : styles.filterChipTextInactive,
                    ]}
                  >
                    {mode === 'all' ? 'All' : 'Unread'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading conversations...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredConversations}
            keyExtractor={(item) => item.leadId}
            renderItem={renderConversationItem}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ACCENT} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="chatbubble-ellipses-outline" size={44} color={colors.textSecondary} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                  {error ? 'Could not load messages' : filterMode === 'unread' ? 'No unread conversations' : 'No conversations yet'}
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  {error
                    ? error
                    : searchQuery.trim()
                      ? 'Try a different name, phone number, or message preview.'
                      : 'Incoming and outgoing lead messages will appear here.'}
                </Text>
              </View>
            }
          />
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
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 10,
    flexGrow: 1,
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
  avatarCircleUnread: {
    backgroundColor: ACCENT,
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
  conversationName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  conversationNameUnread: {
    fontWeight: '700',
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
});

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
import { canSeeAllLeads, getUserRole, getUserTeamMemberId } from '../../lib/roles';
import { useThemeColors } from '../../styles/theme';
import { SmsMessaging } from '../../components/SmsMessaging';
import { MetaDmMessaging } from '../../components/MetaDmMessaging';
import {
  getSmsMessageMedia,
  getSmsMessagePreviewText,
  type SmsRawPayload,
  type SmsVoiceSummary,
} from '../../lib/smsMedia';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThreadSource = 'lead' | 'meta';
type ApiLeadSource = 'organic' | 'meta';
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
  email: string | null;
  phone: string | null;
  platform?: string | null;
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
  voice_transcription_status?: string | null;
  voice_transcript?: string | null;
  voice_summary?: SmsVoiceSummary | string | null;
  voice_transcribed_at?: string | null;
  voice_transcription_error?: string | null;
}

interface ConversationSummary {
  key: string;
  channel: 'sms' | 'dm' | 'scenario_update';
  conversationId: string | null;
  leadId: string;
  source: ThreadSource;
  leadName: string;
  leadEmail?: string | null;
  platform?: string | null;
  phone: string;
  preview: string;
  latestMessageAt: string;
  latestDirection: 'inbound' | 'outbound' | null;
  unreadCount: number;
  isAutomated?: boolean;
  smsOptIn?: boolean | null;
  smsOptedOut?: boolean | null;
  scenarioUpdates?: PendingScenarioUpdate[];
}

interface PendingScenarioUpdateChange {
  key?: string;
  label?: string;
  kind?: 'currency' | 'percent' | 'number' | 'text';
  before?: number | string | null;
  after?: number | string | null;
  beforeLabel?: string;
  afterLabel?: string;
}

interface PendingScenarioUpdate {
  id: string;
  leadId: string;
  leadSource: ApiLeadSource;
  scenarioId: string | null;
  scenarioName?: string | null;
  recipientType: 'borrower' | 'co_borrower' | 'realtor' | 'key_contact';
  recipientName: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  changedSummary: PendingScenarioUpdateChange[];
  status: 'pending' | 'applied' | 'dismissed';
  submittedAt: string;
}

interface MetaDmConversationRow {
  id: string;
  lead_id: string | null;
  lead_source: 'organic' | 'meta' | null;
  platform: 'messenger' | 'instagram' | null;
  participant_name: string | null;
  last_message_at: string | null;
}

interface MetaDmMessageRow {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  message_text: string | null;
  created_at: string;
  attachments?: unknown;
  read_at?: string | null;
}

const ACCENT = '#7C3AED';
const AMBER = '#D97706';
const CRM_API_BASE_URL = 'https://www.closewithmario.com';
const SCENARIO_UPDATE_READ_STORAGE_PREFIX = 'messages.scenarioUpdateReadIds.v1';

function toApiLeadSource(source: ThreadSource): ApiLeadSource {
  return source === 'meta' ? 'meta' : 'organic';
}

function toThreadSource(source: ApiLeadSource): ThreadSource {
  return source === 'meta' ? 'meta' : 'lead';
}

function getScenarioUpdateReadStorageKey(userId?: string | null) {
  return `${SCENARIO_UPDATE_READ_STORAGE_PREFIX}:${userId || 'anonymous'}`;
}

async function loadReadScenarioUpdateIds(userId?: string | null) {
  try {
    const stored = await AsyncStorage.getItem(getScenarioUpdateReadStorageKey(userId));
    const parsed = stored ? JSON.parse(stored) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch (error) {
    console.warn('Failed to load read scenario update ids:', error);
    return new Set<string>();
  }
}

async function saveReadScenarioUpdateIds(userId: string | undefined, ids: Set<string>) {
  try {
    const serialized = JSON.stringify(Array.from(ids).slice(-1000));
    await AsyncStorage.setItem(getScenarioUpdateReadStorageKey(userId), serialized);
  } catch (error) {
    console.warn('Failed to save read scenario update ids:', error);
  }
}

function getMetaDmInboxIcon(platform?: string | null): keyof typeof Ionicons.glyphMap {
  const normalized = platform?.trim().toLowerCase() || '';
  if (normalized.includes('ig') || normalized.includes('instagram')) {
    return 'logo-instagram';
  }
  if (normalized.includes('messenger')) {
    return 'logo-facebook';
  }
  return 'chatbubble-ellipses-outline';
}

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

function getMetaDmAttachmentPreview(attachments: unknown) {
  const attachmentItems = Array.isArray((attachments as { data?: unknown } | null)?.data)
    ? ((attachments as { data?: unknown[] }).data || [])
    : [];

  for (const item of attachmentItems) {
    if (!item || typeof item !== 'object') continue;

    const record = item as Record<string, unknown>;
    const genericTemplate =
      record.generic_template && typeof record.generic_template === 'object'
        ? (record.generic_template as Record<string, unknown>)
        : null;

    if (typeof genericTemplate?.title === 'string' && genericTemplate.title.trim()) {
      return genericTemplate.title.trim();
    }

    if (typeof record.name === 'string' && record.name.trim()) {
      return record.name.trim();
    }

    if (typeof record.url === 'string' && record.url.trim()) {
      return 'Attachment';
    }
  }

  return null;
}

function getChannelLabel(channel: ConversationSummary['channel']) {
  if (channel === 'scenario_update') return 'Scenario';
  return channel === 'dm' ? 'DM' : 'SMS';
}

function getScenarioUpdatePreview(updates: PendingScenarioUpdate[]) {
  const count = updates.length;
  const latestScenario = updates[0]?.scenarioName;
  const suffix = count === 1 ? 'pending scenario update' : 'pending scenario updates';
  return latestScenario ? `${count} ${suffix} for ${latestScenario}` : `${count} ${suffix}`;
}

function formatScenarioUpdateSubmitter(update: PendingScenarioUpdate) {
  const name = update.recipientName?.trim() || 'Shared link recipient';
  const role = update.recipientType === 'co_borrower'
    ? 'Co-borrower'
    : update.recipientType === 'key_contact'
      ? 'Key contact'
      : update.recipientType === 'realtor'
        ? 'Realtor'
        : 'Borrower';
  return `${name} • ${role}`;
}

function formatScenarioChangeValue(change: PendingScenarioUpdateChange, side: 'before' | 'after') {
  const label = side === 'before' ? change.beforeLabel : change.afterLabel;
  if (label) return label;
  const value = side === 'before' ? change.before : change.after;
  if (value == null || value === '') return 'blank';
  if (change.kind === 'currency') {
    const numeric = Number(value);
    return Number.isFinite(numeric)
      ? numeric.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
      : String(value);
  }
  if (change.kind === 'percent') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${numeric}%` : String(value);
  }
  return String(value);
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
        const readScenarioUpdateIds = await loadReadScenarioUpdateIds(session.user.id);

        let leadsQuery = supabase
          .from('leads')
          .select('id, first_name, last_name, email, phone, sms_opt_in, sms_opted_out');
        let metaQuery = supabase
          .from('meta_ads')
          .select('id, first_name, last_name, email, phone, platform, sms_opt_in, sms_opted_out');

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

        const leadByScopedKey = new Map<string, ConversationContact>();
        Array.from(leadMap.values()).forEach((lead) => {
          leadByScopedKey.set(`${toApiLeadSource(lead.source)}:${lead.id}`, lead);
        });

        const accessibleLeadIds = Array.from(leadMap.keys());
        const accessibleMetaLeadIds = ((metaData || []) as LeadRecord[]).map((lead) => lead.id);
        if (accessibleLeadIds.length === 0) {
          setConversations([]);
          return;
        }

        const [
          { data: messageRows, error: messageError },
          { data: dmConversationRows, error: dmConversationError },
          pendingScenarioPayload,
        ] = await Promise.all([
          supabase
            .from('sms_messages')
            .select('id, lead_id, direction, message_text, created_at, read_at, raw_payload, voice_transcription_status, voice_transcript, voice_summary, voice_transcribed_at, voice_transcription_error')
            .in('lead_id', accessibleLeadIds)
            .order('created_at', { ascending: false }),
          accessibleMetaLeadIds.length > 0
            ? supabase
                .from('meta_dm_conversations')
                .select('id, lead_id, lead_source, platform, participant_name, last_message_at')
                .in('lead_id', accessibleMetaLeadIds)
                .order('last_message_at', { ascending: false })
            : Promise.resolve({ data: [] as MetaDmConversationRow[], error: null }),
          fetch(`${CRM_API_BASE_URL}/api/leads/qualification-submissions?pending=1&limit=1000`, {
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
          }),
        ]);

        if (messageError) throw messageError;
        if (dmConversationError) throw dmConversationError;
        const pendingScenarioResult = (await pendingScenarioPayload.json()) as {
          error?: string;
          submissions?: PendingScenarioUpdate[];
        };
        if (!pendingScenarioPayload.ok) {
          throw new Error(pendingScenarioResult.error || 'Failed to load scenario updates');
        }

        const conversationMap = new Map<string, ConversationSummary>();

        ((messageRows || []) as SmsMessageRow[]).forEach((message) => {
          if (!message.lead_id) return;

          const lead = leadMap.get(message.lead_id);
          if (!lead) return;

          const existingConversation = conversationMap.get(`sms:${message.lead_id}`);

          if (!existingConversation) {
            const preview =
              getSmsMessagePreviewText(message) ||
              (getSmsMessageMedia(message).length > 0 ? 'Media attachment' : message.direction === 'outbound' ? 'Sent a message' : 'New message');

            conversationMap.set(`sms:${message.lead_id}`, {
              key: `sms:${lead.source}:${message.lead_id}`,
              channel: 'sms',
              conversationId: null,
              leadId: message.lead_id,
              source: lead.source,
              leadName: getLeadDisplayName(lead),
              leadEmail: lead.email,
              platform: lead.platform,
              phone: lead.phone || '',
              preview,
              latestMessageAt: message.created_at,
              latestDirection: message.direction,
              unreadCount: message.direction === 'inbound' && !message.read_at ? 1 : 0,
              isAutomated: false,
              smsOptIn: lead.sms_opt_in,
              smsOptedOut: lead.sms_opted_out,
            });
            return;
          }

          if (message.direction === 'inbound' && !message.read_at) {
            existingConversation.unreadCount += 1;
          }
        });

        const dmConversationIds = ((dmConversationRows || []) as MetaDmConversationRow[]).map((conversation) => conversation.id);
        let latestDmMessageByConversation = new Map<string, MetaDmMessageRow>();
        let unreadDmCountByConversation = new Map<string, number>();

        if (dmConversationIds.length > 0) {
          const { data: dmMessageRows, error: dmMessageError } = await supabase
            .from('meta_dm_messages')
            .select('id, conversation_id, direction, message_text, created_at, attachments, read_at')
            .in('conversation_id', dmConversationIds)
            .order('created_at', { ascending: false });

          if (dmMessageError) throw dmMessageError;

          ((dmMessageRows || []) as MetaDmMessageRow[]).forEach((message) => {
            if (!latestDmMessageByConversation.has(message.conversation_id)) {
              latestDmMessageByConversation.set(message.conversation_id, message);
            }

            if (message.direction === 'inbound' && !message.read_at) {
              unreadDmCountByConversation.set(
                message.conversation_id,
                (unreadDmCountByConversation.get(message.conversation_id) || 0) + 1
              );
            }
          });
        }

        ((dmConversationRows || []) as MetaDmConversationRow[]).forEach((conversation) => {
          if (!conversation.lead_id || conversation.lead_source !== 'meta') return;

          const lead = leadMap.get(conversation.lead_id);
          if (!lead || lead.source !== 'meta') return;

          const latestMessage = latestDmMessageByConversation.get(conversation.id);
          conversationMap.set(`dm:${conversation.id}`, {
            key: `dm:${conversation.id}`,
            channel: 'dm',
            conversationId: conversation.id,
            leadId: lead.id,
            source: lead.source,
            leadName: getLeadDisplayName(lead),
            leadEmail: lead.email,
            platform: conversation.platform,
            phone: lead.phone || '',
            preview:
              latestMessage?.message_text?.trim() ||
              getMetaDmAttachmentPreview(latestMessage?.attachments) ||
              'New DM',
            latestMessageAt: latestMessage?.created_at || conversation.last_message_at || new Date(0).toISOString(),
            latestDirection: latestMessage?.direction || null,
            unreadCount: unreadDmCountByConversation.get(conversation.id) || 0,
            isAutomated: false,
            smsOptIn: lead.sms_opt_in,
            smsOptedOut: lead.sms_opted_out,
          });
        });

        const pendingScenarioUpdatesByLeadKey = new Map<string, PendingScenarioUpdate[]>();
        (pendingScenarioResult.submissions || []).forEach((submission) => {
          if (submission.status !== 'pending') return;
          const key = `${submission.leadSource}:${submission.leadId}`;
          if (!leadByScopedKey.has(key)) return;
          const updates = pendingScenarioUpdatesByLeadKey.get(key) || [];
          updates.push(submission);
          pendingScenarioUpdatesByLeadKey.set(key, updates);
        });

        pendingScenarioUpdatesByLeadKey.forEach((updates, leadKey) => {
          const sortedUpdates = [...updates].sort(
            (left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime()
          );
          const lead = leadByScopedKey.get(leadKey);
          const latestUpdate = sortedUpdates[0];
          if (!lead || !latestUpdate) return;

          conversationMap.set(`scenario_update:${leadKey}`, {
            key: `scenario_update:${leadKey}`,
            channel: 'scenario_update',
            conversationId: null,
            leadId: lead.id,
            source: toThreadSource(latestUpdate.leadSource),
            leadName: getLeadDisplayName(lead),
            leadEmail: lead.email,
            platform: lead.platform,
            phone: lead.phone || '',
            preview: getScenarioUpdatePreview(sortedUpdates),
            latestMessageAt: latestUpdate.submittedAt,
            latestDirection: 'inbound',
            unreadCount: sortedUpdates.filter((update) => !readScenarioUpdateIds.has(update.id)).length,
            isAutomated: false,
            smsOptIn: lead.sms_opt_in,
            smsOptedOut: lead.sms_opted_out,
            scenarioUpdates: sortedUpdates,
          });
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
    [session?.access_token, session?.user?.email, session?.user?.id]
  );

  const markConversationAsRead = useCallback(async (conversation: ConversationSummary) => {
    if (conversation.channel === 'scenario_update') {
      const updateIds = (conversation.scenarioUpdates || [])
        .map((update) => update.id)
        .filter(Boolean);
      if (updateIds.length === 0) {
        return;
      }

      setConversations((prev) =>
        sortConversations(
          prev.map((item) =>
            item.key === conversation.key ? { ...item, unreadCount: 0 } : item
          )
        )
      );
      setScreenState((current) =>
        current.screen === 'thread' && current.conversation.key === conversation.key
          ? { screen: 'thread', conversation: { ...current.conversation, unreadCount: 0 } }
          : current
      );

      const readIds = await loadReadScenarioUpdateIds(session?.user?.id);
      updateIds.forEach((id) => readIds.add(id));
      await saveReadScenarioUpdateIds(session?.user?.id, readIds);
      return;
    }

    setConversations((prev) =>
      sortConversations(
        prev.map((item) =>
          item.key === conversation.key ? { ...item, unreadCount: 0 } : item
        )
      )
    );

    if (conversation.channel === 'sms') {
      const { error: updateError } = await supabase
        .from('sms_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('lead_id', conversation.leadId)
        .eq('direction', 'inbound')
        .is('read_at', null);

      if (updateError) {
        console.error('Error marking inbox SMS conversation read:', updateError);
      }
      return;
    }

    if (conversation.channel === 'dm' && conversation.conversationId) {
      const { error: markDmReadError } = await supabase.rpc('mark_meta_dm_conversation_read', {
        p_conversation_id: conversation.conversationId,
      });

      if (markDmReadError) {
        console.error('Error marking inbox DM conversation read:', markDmReadError);
      }
    }
  }, [session?.user?.id]);

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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meta_dm_messages' },
        () => {
          loadConversations();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meta_dm_conversations' },
        () => {
          loadConversations();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'qualification_link_submissions' },
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
        markConversationAsRead(conversation).catch(() => undefined);
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
    const isScenarioUpdate = conversation.channel === 'scenario_update';
    const scenarioUpdateCount = conversation.scenarioUpdates?.length || conversation.unreadCount;
    const threadSubtitleParts = [
      getChannelLabel(conversation.channel),
      isScenarioUpdate
        ? `${scenarioUpdateCount} pending update${scenarioUpdateCount === 1 ? '' : 's'}`
        : conversation.phone ? formatPhoneNumber(conversation.phone) : null,
    ].filter(Boolean);

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
                {threadSubtitleParts.join(' • ') || 'Conversation'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.leadDetailsButton}
              onPress={() => onNavigateToLead?.(conversation.leadId, conversation.source)}
            >
              <Ionicons name={isScenarioUpdate ? 'calculator-outline' : 'person-outline'} size={16} color={isScenarioUpdate ? AMBER : ACCENT} />
              <Text style={[styles.leadDetailsButtonText, isScenarioUpdate && styles.leadDetailsButtonTextAmber]}>
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
                  <Text style={styles.scenarioNoticeTitle}>Shared scenario updates</Text>
                  <Text style={styles.scenarioNoticeText}>
                    Review these changes from the lead detail Scenarios section.
                  </Text>
                </View>
              </View>

              {(conversation.scenarioUpdates || []).map((update) => (
                <View key={update.id} style={[styles.scenarioUpdateCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                  <View style={styles.scenarioUpdateHeader}>
                    <View style={styles.scenarioUpdateTitleBlock}>
                      <Text style={[styles.scenarioUpdateSubmitter, { color: colors.textPrimary }]} numberOfLines={1}>
                        {formatScenarioUpdateSubmitter(update)}
                      </Text>
                      <Text style={[styles.scenarioUpdateMeta, { color: colors.textSecondary }]} numberOfLines={2}>
                        {[update.scenarioName || 'Saved scenario', formatTimestamp(update.submittedAt)].filter(Boolean).join(' • ')}
                      </Text>
                    </View>
                    <View style={styles.scenarioUpdateBadge}>
                      <Text style={styles.scenarioUpdateBadgeText}>Pending</Text>
                    </View>
                  </View>

                  <View style={styles.scenarioChangeList}>
                    {update.changedSummary.length > 0 ? (
                      update.changedSummary.map((change, index) => (
                        <View key={`${update.id}:${change.key || index}`} style={styles.scenarioChangeRow}>
                          <Text style={[styles.scenarioChangeLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                            {change.label || change.key || 'Changed field'}
                          </Text>
                          <Text style={styles.scenarioChangeValue} numberOfLines={2}>
                            {formatScenarioChangeValue(change, 'before')} → {formatScenarioChangeValue(change, 'after')}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={[styles.scenarioNoChangesText, { color: colors.textSecondary }]}>
                        No field summary was included.
                      </Text>
                    )}
                  </View>
                </View>
              ))}

              <TouchableOpacity
                style={styles.scenarioReviewButton}
                onPress={() => onNavigateToLead?.(conversation.leadId, conversation.source)}
              >
                <Ionicons name="open-outline" size={16} color="#FFFFFF" />
                <Text style={styles.scenarioReviewButtonText}>Review on Lead Detail</Text>
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
                loadConversations();
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
              onConversationRead={() => {
                loadConversations();
              }}
              onMessageSent={() => {
                loadConversations();
              }}
            />
          )}
        </SafeAreaView>
      </View>
    );
  }

  const renderConversationItem = ({ item }: { item: ConversationSummary }) => {
    const hasUnread = item.unreadCount > 0;
    const previewPrefix = item.latestDirection === 'outbound' ? `${item.isAutomated ? 'Gio' : 'You'}: ` : '';
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
        style={[styles.conversationCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
        activeOpacity={0.85}
        onPress={() => handleConversationPress(item)}
      >
        <View style={styles.avatarWrap}>
          <View
            style={[
              styles.avatarCircle,
              item.channel === 'scenario_update'
                ? styles.avatarCircleScenario
                : item.channel === 'dm' ? styles.avatarCircleDm : styles.avatarCircleSms,
              hasUnread && styles.avatarCircleUnread,
              hasUnread && item.channel === 'scenario_update' && styles.avatarCircleScenarioUnread,
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
                    : item.channel === 'dm' ? styles.channelBadgeDm : styles.channelBadgeSms,
                ]}
              >
                <Text
                  style={[
                    styles.channelBadgeText,
                    item.channel === 'scenario_update'
                      ? styles.channelBadgeTextScenario
                      : item.channel === 'dm' ? styles.channelBadgeTextDm : styles.channelBadgeTextSms,
                  ]}
                >
                  {getChannelLabel(item.channel)}
                </Text>
              </View>
            </View>
            <Text style={[styles.conversationTime, { color: colors.textSecondary }]}>
              {formatTimestamp(item.latestMessageAt)}
            </Text>
          </View>

          <Text style={[styles.conversationPhone, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.channel === 'scenario_update'
              ? 'Shared qualification link'
              : item.phone ? formatPhoneNumber(item.phone) : 'No phone on file'}
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
              <View style={[styles.unreadBadge, item.channel === 'scenario_update' && styles.unreadBadgeScenario]}>
              <Text style={styles.unreadBadgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
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
          <Text style={styles.headerSubtitle}>Recent SMS, MMS, and DM conversations</Text>
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
            keyExtractor={(item) => item.key}
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

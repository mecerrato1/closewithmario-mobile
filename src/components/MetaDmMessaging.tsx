import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useThemeColors } from '../styles/theme';

type LeadSource = 'organic' | 'meta';

type MetaDmConversation = {
  id: string;
  participant_name: string | null;
  can_reply: boolean;
  conversation_link: string | null;
  last_message_at: string | null;
  message_count: number | null;
  matched_via: string | null;
};

type MetaDmMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  message_text: string | null;
  created_at: string;
  sender_name: string | null;
  attachments?: unknown;
  status?: string | null;
  received_at?: string | null;
  read_at?: string | null;
};

interface MetaDmMessagingProps {
  leadId: string;
  leadSource: LeadSource;
  leadName: string;
  leadPhone?: string | null;
  leadEmail?: string | null;
  onMessageSent?: () => void;
}

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.closewithmario.com').replace(/\/$/, '');

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map((item) => getRecord(item)).filter(Boolean) as Record<string, unknown>[]
    : [];
}

function getAttachmentPreview(attachments: unknown) {
  const attachmentItems = getRecordArray(getRecord(attachments)?.data);
  for (const item of attachmentItems) {
    const genericTemplate = getRecord(item.generic_template);
    if (typeof genericTemplate?.title === 'string' && genericTemplate.title.trim()) {
      return genericTemplate.title.trim();
    }

    if (typeof item.name === 'string' && item.name.trim()) {
      return item.name.trim();
    }

    if (typeof item.url === 'string' && item.url.trim()) {
      return 'Attachment';
    }
  }

  return null;
}

function formatTime(timestamp: string) {
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
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function toMetaInboxUrl(link: string | null) {
  if (!link) return null;
  if (link.startsWith('http://') || link.startsWith('https://')) return link;
  return `https://www.facebook.com${link}`;
}

function getOutboundStatusText(message: MetaDmMessage) {
  if (message.read_at || message.status === 'read') return 'Seen';
  if (message.status === 'delivered') return 'Delivered';
  if (message.status === 'failed') return 'Failed';
  if (message.status) return 'Sent';
  return null;
}

export function MetaDmMessaging({
  leadId,
  leadSource,
  leadName,
  leadPhone,
  leadEmail,
  onMessageSent,
}: MetaDmMessagingProps) {
  const { colors } = useThemeColors();
  const [conversation, setConversation] = useState<MetaDmConversation | null>(null);
  const [messages, setMessages] = useState<MetaDmMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const flatListRef = useRef<FlatList<MetaDmMessage>>(null);

  const scrollToBottom = useCallback(() => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const getAccessToken = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session?.access_token) {
        throw new Error('Your session expired. Please sign in again.');
      }
      return data.session.access_token;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      return session.access_token;
    }

    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) {
      throw new Error('Your session expired. Please sign in again.');
    }

    return data.session.access_token;
  }, []);

  const fetchWithAuthRetry = useCallback(
    async (path: string, init: RequestInit) => {
      let token = await getAccessToken(false);

      const makeRequest = async (accessToken: string) =>
        fetch(`${API_BASE_URL}${path}`, {
          ...init,
          headers: {
            ...(init.headers || {}),
            Authorization: `Bearer ${accessToken}`,
          },
        });

      let response = await makeRequest(token);
      if (response.status === 401) {
        token = await getAccessToken(true);
        response = await makeRequest(token);
      }

      return response;
    },
    [getAccessToken]
  );

  const fetchStoredConversation = useCallback(async () => {
    const { data: conversationData, error: conversationError } = await supabase
      .from('meta_dm_conversations')
      .select('id, participant_name, can_reply, conversation_link, last_message_at, message_count, matched_via')
      .eq('lead_id', leadId)
      .eq('lead_source', leadSource)
      .eq('platform', 'messenger')
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (conversationError) {
      throw conversationError;
    }

    const nextConversation = (conversationData as MetaDmConversation | null) || null;
    setConversation(nextConversation);

    if (!nextConversation?.id) {
      setMessages([]);
      return null;
    }

    const { data: messageData, error: messageError } = await supabase
      .from('meta_dm_messages')
      .select('id, direction, message_text, created_at, sender_name, attachments, status, received_at, read_at')
      .eq('conversation_id', nextConversation.id)
      .order('created_at', { ascending: true });

    if (messageError) {
      throw messageError;
    }

    setMessages((messageData || []) as MetaDmMessage[]);
    return nextConversation;
  }, [leadId, leadSource]);

  const performSync = useCallback(
    async (force = false) => {
      const response = await fetchWithAuthRetry('/api/meta-dm-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leadId,
          leadSource,
          force,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Failed to sync Messenger conversation');
      }

      setEmptyReason(result.matched ? null : result.reason || 'No Messenger conversation matched this lead yet.');
      return fetchStoredConversation();
    },
    [fetchStoredConversation, fetchWithAuthRetry, leadId, leadSource]
  );

  const handleRefresh = useCallback(async () => {
    setSyncing(true);
    setError(null);

    try {
      await performSync(true);
    } catch (refreshError) {
      const message =
        refreshError instanceof Error ? refreshError.message : 'Failed to sync Messenger conversation';
      setError(message);
      await fetchStoredConversation().catch((fetchError) => {
        console.error('[MetaDmMessaging] Failed to reload stored conversation after refresh error', fetchError);
      });
    } finally {
      setSyncing(false);
    }
  }, [fetchStoredConversation, performSync]);

  useEffect(() => {
    let cancelled = false;

    setConversation(null);
    setMessages([]);
    setDraft('');
    setError(null);
    setEmptyReason(null);
    setLoading(true);

    const loadConversation = async () => {
      try {
        const existingConversation = await fetchStoredConversation();
        if (cancelled) return;

        if (!existingConversation) {
          try {
            await performSync(false);
          } catch (syncError) {
            if (cancelled) return;
            const message =
              syncError instanceof Error ? syncError.message : 'Failed to sync Messenger conversation';
            setError(message);
            await fetchStoredConversation().catch((fetchError) => {
              console.error('[MetaDmMessaging] Failed to load stored conversation after initial sync error', fetchError);
            });
          }
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load Messenger conversation');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadConversation();

    return () => {
      cancelled = true;
    };
  }, [fetchStoredConversation, performSync]);

  useEffect(() => {
    if (messages.length === 0) return;

    const timeoutId = setTimeout(() => {
      scrollToBottom();
    }, 80);

    return () => clearTimeout(timeoutId);
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!conversation?.id) return;

    const hasUnreadInbound = messages.some((message) => message.direction === 'inbound' && !message.read_at);
    if (!hasUnreadInbound) return;

    let cancelled = false;

    const markRead = async () => {
      const { error: readError } = await supabase.rpc('mark_meta_dm_conversation_read', {
        p_conversation_id: conversation.id,
      });

      if (readError) {
        console.error('[MetaDmMessaging] Failed to mark Messenger conversation read', readError);
        return;
      }

      if (cancelled) return;

      const readAt = new Date().toISOString();
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.direction === 'inbound' && !message.read_at
            ? { ...message, read_at: readAt }
            : message
        )
      );
    };

    void markRead();

    return () => {
      cancelled = true;
    };
  }, [conversation?.id, messages]);

  useEffect(() => {
    if (!conversation?.id) return;

    const messageChannel = supabase
      .channel(`meta_dm_messages_${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meta_dm_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        () => {
          void fetchStoredConversation();
        }
      )
      .subscribe();

    const conversationChannel = supabase
      .channel(`meta_dm_conversation_${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'meta_dm_conversations',
          filter: `id=eq.${conversation.id}`,
        },
        () => {
          void fetchStoredConversation();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(messageChannel);
      void supabase.removeChannel(conversationChannel);
    };
  }, [conversation?.id, fetchStoredConversation]);

  const sendMessage = useCallback(async () => {
    if (!conversation?.id || !draft.trim() || sending || !conversation.can_reply) {
      return;
    }

    const messageToSend = draft.trim();
    setSending(true);
    setError(null);

    try {
      const response = await fetchWithAuthRetry('/api/meta-dm-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: conversation.id,
          message: messageToSend,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Failed to send Messenger reply');
      }

      setDraft('');
      Keyboard.dismiss();
      await fetchStoredConversation();
      onMessageSent?.();
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Failed to send Messenger reply';
      setError(message);
    } finally {
      setSending(false);
    }
  }, [conversation, draft, fetchStoredConversation, fetchWithAuthRetry, onMessageSent, sending]);

  const openInMetaUrl = toMetaInboxUrl(conversation?.conversation_link || null);
  const composerDisabled = !conversation?.id || !conversation.can_reply || sending;
  const composerPlaceholder = !conversation?.id
    ? 'No Messenger thread yet. Tap Refresh to try matching again.'
    : !conversation.can_reply
      ? 'Messenger replies are blocked for this thread.'
      : 'Type a Messenger reply...';

  const renderMessage = ({ item }: { item: MetaDmMessage }) => {
    const isOutbound = item.direction === 'outbound';
    const displayText = item.message_text?.trim() || getAttachmentPreview(item.attachments) || 'Attachment';
    const statusText = isOutbound ? getOutboundStatusText(item) : null;

    return (
      <View
        style={[
          dmStyles.messageRow,
          isOutbound ? dmStyles.messageRowOutbound : dmStyles.messageRowInbound,
        ]}
      >
        <View
          style={[
            dmStyles.messageBubble,
            isOutbound
              ? [dmStyles.outboundBubble, { backgroundColor: PLUM }]
              : [dmStyles.inboundBubble, { backgroundColor: colors.cardBackground, borderColor: colors.border }],
          ]}
        >
          <Text
            style={[
              dmStyles.messageText,
              { color: isOutbound ? '#FFFFFF' : colors.textPrimary },
            ]}
          >
            {displayText}
          </Text>
          <View style={dmStyles.messageFooter}>
            <Text
              style={[
                dmStyles.messageTime,
                { color: isOutbound ? 'rgba(255,255,255,0.8)' : colors.textSecondary },
              ]}
            >
              {formatTime(item.created_at)}
            </Text>
            {statusText ? (
              <Text
                style={[
                  dmStyles.messageStatus,
                  { color: isOutbound ? 'rgba(255,255,255,0.85)' : colors.textSecondary },
                ]}
              >
                {statusText}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[dmStyles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="small" color={PLUM} />
        <Text style={[dmStyles.loadingText, { color: colors.textSecondary }]}>
          Loading Messenger conversation...
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[dmStyles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 84 : 0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={dmStyles.container}>
          <View
            style={[
              dmStyles.header,
              {
                backgroundColor: colors.cardBackground,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <View style={dmStyles.headerTopRow}>
              <View style={dmStyles.headerLeadBlock}>
                <View style={[dmStyles.headerIcon, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={PLUM} />
                </View>
                <View style={dmStyles.headerTextBlock}>
                  <Text style={[dmStyles.headerTitle, { color: colors.textPrimary }]}>
                    {conversation?.participant_name || leadName}
                  </Text>
                  <Text style={[dmStyles.headerSubtitle, { color: colors.textSecondary }]}>
                    Facebook Messenger
                    {leadPhone ? ` • ${leadPhone}` : ''}
                    {!leadPhone && leadEmail ? ` • ${leadEmail}` : ''}
                  </Text>
                </View>
              </View>

              <View style={dmStyles.headerActions}>
                <TouchableOpacity
                  style={[dmStyles.headerButton, { borderColor: colors.border }]}
                  onPress={() => {
                    void handleRefresh();
                  }}
                  disabled={syncing}
                >
                  <Text style={[dmStyles.headerButtonText, { color: colors.textSecondary }]}>
                    {syncing ? 'Refreshing...' : 'Refresh'}
                  </Text>
                </TouchableOpacity>

                {openInMetaUrl ? (
                  <TouchableOpacity
                    style={[dmStyles.headerButton, dmStyles.headerButtonPrimary]}
                    onPress={() => {
                      void Linking.openURL(openInMetaUrl);
                    }}
                  >
                    <Text style={dmStyles.headerButtonPrimaryText}>Open in Meta</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {conversation?.matched_via ? (
              <Text style={[dmStyles.matchHint, { color: colors.textSecondary }]}>
                Matched from stored Meta thread data
              </Text>
            ) : null}

            <View style={dmStyles.bannerStack}>
              <View style={dmStyles.infoBanner}>
                <Text style={dmStyles.infoBannerText}>
                  Messenger history syncs from your Facebook Page inbox. Replies to real leads may still be blocked until the Meta app is live and approved for pages_messaging.
                </Text>
              </View>

              {error ? (
                <View style={dmStyles.errorBanner}>
                  <Text style={dmStyles.errorBannerText}>{error}</Text>
                </View>
              ) : null}

              {!conversation && emptyReason ? (
                <View style={dmStyles.warningBanner}>
                  <Text style={dmStyles.warningBannerText}>{emptyReason}</Text>
                </View>
              ) : null}

              {conversation && !conversation.can_reply ? (
                <View style={dmStyles.warningBanner}>
                  <Text style={dmStyles.warningBannerText}>
                    Meta currently marks this thread as reply-restricted, so the composer is disabled.
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <FlatList
            ref={flatListRef}
            style={dmStyles.messagesListContainer}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={[
              dmStyles.messagesList,
              messages.length === 0 && dmStyles.messagesListEmpty,
            ]}
            ListEmptyComponent={
              <View
                style={[
                  dmStyles.emptyState,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[dmStyles.emptyTitle, { color: colors.textPrimary }]}>
                  No Messenger thread stored yet
                </Text>
                <Text style={[dmStyles.emptySubtitle, { color: colors.textSecondary }]}>
                  Use Refresh to try matching this lead against your Page inbox again.
                </Text>
              </View>
            }
          />

          <View
            style={[
              dmStyles.composer,
              {
                backgroundColor: colors.cardBackground,
                borderTopColor: colors.border,
              },
            ]}
          >
            <TextInput
              style={[
                dmStyles.input,
                {
                  backgroundColor: colors.background,
                  color: colors.textPrimary,
                  borderColor: colors.border,
                },
              ]}
              value={draft}
              onChangeText={setDraft}
              placeholder={composerPlaceholder}
              placeholderTextColor={colors.textSecondary}
              multiline
              editable={!composerDisabled}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[
                dmStyles.sendButton,
                (!draft.trim() || composerDisabled) && dmStyles.sendButtonDisabled,
              ]}
              onPress={() => {
                void sendMessage();
              }}
              disabled={!draft.trim() || composerDisabled}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="send" size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const PLUM = '#4C1D95';

const dmStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: 14,
  },
  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerLeadBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextBlock: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  headerButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerButtonPrimary: {
    backgroundColor: '#DBEAFE',
    borderColor: '#BFDBFE',
  },
  headerButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerButtonPrimaryText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '600',
  },
  matchHint: {
    fontSize: 11,
  },
  bannerStack: {
    gap: 8,
  },
  infoBanner: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  infoBannerText: {
    color: '#1D4ED8',
    fontSize: 12,
    lineHeight: 18,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorBannerText: {
    color: '#B91C1C',
    fontSize: 12,
    lineHeight: 18,
  },
  warningBanner: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  warningBannerText: {
    color: '#92400E',
    fontSize: 12,
    lineHeight: 18,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  messagesListContainer: {
    flex: 1,
  },
  messagesListEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  messageRow: {
    width: '100%',
    flexDirection: 'row',
  },
  messageRowInbound: {
    justifyContent: 'flex-start',
  },
  messageRowOutbound: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inboundBubble: {
    borderWidth: 1,
  },
  outboundBubble: {
    borderWidth: 0,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  messageFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  messageTime: {
    fontSize: 11,
  },
  messageStatus: {
    fontSize: 11,
    fontWeight: '600',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PLUM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#C4B5FD',
  },
});

export default MetaDmMessaging;

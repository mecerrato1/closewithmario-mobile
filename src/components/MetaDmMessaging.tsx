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
import { authenticatedFetch } from '../lib/authenticatedFetch';
import {
  fetchMetaDmHistoryPage,
  type MetaDmHistoryMessage,
} from '../features/messages/messageHistoryClient';
import { useMetaDmConversation } from '../features/messages/useMetaDmConversation';
import { usePaginatedMessageHistory } from '../features/messages/usePaginatedMessageHistory';
import { useThemeColors } from '../styles/theme';

type LeadSource = 'organic' | 'meta';
type MetaDmMessage = MetaDmHistoryMessage;

interface MetaDmMessagingProps {
  leadId: string;
  leadSource: LeadSource;
  conversationId?: string | null;
  leadName: string;
  leadPhone?: string | null;
  leadEmail?: string | null;
  onMessageSent?: () => void;
  onConversationRead?: () => void;
}

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.closewithmario.com'
).replace(/\/$/, '');

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? (value.map((item) => getRecord(item)).filter(Boolean) as Record<
        string,
        unknown
      >[])
    : [];
}

function getAttachmentPreview(attachments: unknown) {
  const attachmentItems = getRecordArray(getRecord(attachments)?.data);
  for (const item of attachmentItems) {
    const genericTemplate = getRecord(item.generic_template);
    if (
      typeof genericTemplate?.title === 'string' &&
      genericTemplate.title.trim()
    ) {
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
  conversationId,
  leadName,
  leadPhone,
  leadEmail,
  onMessageSent,
  onConversationRead,
}: MetaDmMessagingProps) {
  const { colors } = useThemeColors();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList<MetaDmMessage>>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const onConversationReadRef = useRef(onConversationRead);
  const {
    conversation,
    loading: conversationLoading,
    syncing,
    error: conversationError,
    emptyReason,
    refresh: refreshConversation,
    reloadStored,
    clearError: clearConversationError,
  } = useMetaDmConversation({
    leadId,
    leadSource,
    conversationId,
  });
  const fetchHistoryPage = useCallback(
    (
      cursor: Parameters<typeof fetchMetaDmHistoryPage>[0]['cursor'],
      signal: AbortSignal
    ) => {
      if (!conversation?.id) {
        return Promise.resolve({ items: [], hasOlder: false });
      }
      return fetchMetaDmHistoryPage({
        conversationId: conversation.id,
        cursor,
        signal,
      });
    },
    [conversation?.id]
  );
  const {
    messages,
    loading: historyLoading,
    loadingOlder,
    hasOlder,
    error: historyError,
    scrollRevision,
    reload: reloadHistory,
    loadOlder,
    retry: retryHistory,
    clearError: clearHistoryError,
    mutateMessages,
  } = usePaginatedMessageHistory({
    queryKey: `dm:${conversation?.id || 'none'}`,
    enabled: Boolean(conversation?.id),
    fetchPage: fetchHistoryPage,
  });
  const loading =
    conversationLoading || (Boolean(conversation?.id) && historyLoading);
  const error = actionError || conversationError || historyError;
  activeConversationIdRef.current = conversation?.id || null;

  useEffect(() => {
    onConversationReadRef.current = onConversationRead;
  }, [onConversationRead]);

  const scrollToBottom = useCallback(() => {
    if (flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setActionError(null);
    clearConversationError();
    clearHistoryError();
    await refreshConversation();
    await reloadHistory();
  }, [
    clearConversationError,
    clearHistoryError,
    refreshConversation,
    reloadHistory,
  ]);

  useEffect(() => {
    setDraft('');
    setActionError(null);
  }, [conversationId, leadId, leadSource]);

  useEffect(() => {
    if (messages.length === 0) return;

    const timeoutId = setTimeout(() => {
      scrollToBottom();
    }, 80);

    return () => clearTimeout(timeoutId);
  }, [messages.length, scrollRevision, scrollToBottom]);

  const markConversationRead = useCallback(async () => {
    const activeConversationId = conversation?.id;
    if (!activeConversationId) return;

    const { error: readError } = await supabase.rpc(
      'mark_meta_dm_conversation_read',
      {
        p_conversation_id: activeConversationId,
      }
    );

    if (readError) {
      console.error(
        '[MetaDmMessaging] Failed to mark Messenger conversation read',
        readError
      );
      return;
    }
    if (activeConversationIdRef.current !== activeConversationId) return;

    onConversationReadRef.current?.();

    const readAt = new Date().toISOString();
    mutateMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.direction === 'inbound' && !message.read_at
          ? { ...message, read_at: readAt }
          : message
      )
    );
  }, [conversation?.id, mutateMessages]);

  useEffect(() => {
    void markConversationRead();
  }, [markConversationRead]);

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
        (payload) => {
          void reloadHistory();
          void reloadStored();
          if (
            payload.eventType === 'INSERT' &&
            (payload.new as { direction?: unknown }).direction === 'inbound'
          ) {
            void markConversationRead();
          }
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
          void reloadStored();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(messageChannel);
      void supabase.removeChannel(conversationChannel);
    };
  }, [conversation?.id, markConversationRead, reloadHistory, reloadStored]);

  const sendMessage = useCallback(async () => {
    if (
      !conversation?.id ||
      !draft.trim() ||
      sending ||
      !conversation.can_reply
    ) {
      return;
    }

    const messageToSend = draft.trim();
    setSending(true);
    setActionError(null);
    clearConversationError();
    clearHistoryError();

    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/api/meta-dm-send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            conversationId: conversation.id,
            message: messageToSend,
          }),
        }
      );

      const result: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const resultRecord = getRecord(result);
        throw new Error(
          typeof resultRecord?.error === 'string'
            ? resultRecord.error
            : 'Failed to send Messenger reply'
        );
      }

      setDraft('');
      Keyboard.dismiss();
      await Promise.all([reloadStored(), reloadHistory()]);
      onMessageSent?.();
    } catch (sendError) {
      const message =
        sendError instanceof Error
          ? sendError.message
          : 'Failed to send Messenger reply';
      setActionError(message);
    } finally {
      setSending(false);
    }
  }, [
    clearConversationError,
    clearHistoryError,
    conversation,
    draft,
    onMessageSent,
    reloadHistory,
    reloadStored,
    sending,
  ]);

  const openInMetaUrl = toMetaInboxUrl(conversation?.conversation_link || null);
  const composerDisabled =
    !conversation?.id || !conversation.can_reply || sending;
  const composerPlaceholder = !conversation?.id
    ? 'No Messenger thread yet. Tap Refresh to try matching again.'
    : !conversation.can_reply
    ? 'Messenger replies are blocked for this thread.'
    : 'Type a Messenger reply...';

  const renderMessage = ({ item }: { item: MetaDmMessage }) => {
    const isOutbound = item.direction === 'outbound';
    const displayText =
      item.message_text?.trim() ||
      getAttachmentPreview(item.attachments) ||
      'Attachment';
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
              : [
                  dmStyles.inboundBubble,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.border,
                  },
                ],
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
                {
                  color: isOutbound
                    ? 'rgba(255,255,255,0.8)'
                    : colors.textSecondary,
                },
              ]}
            >
              {formatTime(item.created_at)}
            </Text>
            {statusText ? (
              <Text
                style={[
                  dmStyles.messageStatus,
                  {
                    color: isOutbound
                      ? 'rgba(255,255,255,0.85)'
                      : colors.textSecondary,
                  },
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
      <View
        style={[
          dmStyles.loadingContainer,
          { backgroundColor: colors.background },
        ]}
      >
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
                <View
                  style={[dmStyles.headerIcon, { backgroundColor: '#EEF2FF' }]}
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={18}
                    color={PLUM}
                  />
                </View>
                <View style={dmStyles.headerTextBlock}>
                  <Text
                    style={[
                      dmStyles.headerTitle,
                      { color: colors.textPrimary },
                    ]}
                  >
                    {conversation?.participant_name || leadName}
                  </Text>
                  <Text
                    style={[
                      dmStyles.headerSubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Facebook Messenger
                    {leadPhone ? ` • ${leadPhone}` : ''}
                    {!leadPhone && leadEmail ? ` • ${leadEmail}` : ''}
                  </Text>
                </View>
              </View>

              <View style={dmStyles.headerActions}>
                <TouchableOpacity
                  style={[
                    dmStyles.headerButton,
                    { borderColor: colors.border },
                  ]}
                  onPress={() => {
                    void handleRefresh();
                  }}
                  disabled={syncing}
                >
                  <Text
                    style={[
                      dmStyles.headerButtonText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {syncing ? 'Refreshing...' : 'Refresh'}
                  </Text>
                </TouchableOpacity>

                {openInMetaUrl ? (
                  <TouchableOpacity
                    style={[
                      dmStyles.headerButton,
                      dmStyles.headerButtonPrimary,
                    ]}
                    onPress={() => {
                      void Linking.openURL(openInMetaUrl);
                    }}
                  >
                    <Text style={dmStyles.headerButtonPrimaryText}>
                      Open in Meta
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {conversation?.matched_via ? (
              <Text
                style={[dmStyles.matchHint, { color: colors.textSecondary }]}
              >
                Matched from stored Meta thread data
              </Text>
            ) : null}

            <View style={dmStyles.bannerStack}>
              <View style={dmStyles.infoBanner}>
                <Text style={dmStyles.infoBannerText}>
                  Messenger history syncs from your Facebook Page inbox. Replies
                  to real leads may still be blocked until the Meta app is live
                  and approved for pages_messaging.
                </Text>
              </View>

              {error ? (
                <View style={dmStyles.errorBanner}>
                  <Text style={dmStyles.errorBannerText}>{error}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      if (actionError) {
                        void sendMessage();
                      } else if (historyError && conversation?.id) {
                        void retryHistory();
                      } else {
                        void handleRefresh();
                      }
                    }}
                  >
                    <Text style={dmStyles.errorRetryText}>Retry</Text>
                  </TouchableOpacity>
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
                    Meta currently marks this thread as reply-restricted, so the
                    composer is disabled.
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
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            ListHeaderComponent={
              hasOlder ? (
                <TouchableOpacity
                  style={dmStyles.loadOlderButton}
                  onPress={() => {
                    void loadOlder();
                  }}
                  disabled={loadingOlder}
                >
                  {loadingOlder ? (
                    <ActivityIndicator size="small" color={PLUM} />
                  ) : (
                    <Text style={dmStyles.loadOlderText}>
                      Load older messages
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null
            }
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
                <Text
                  style={[dmStyles.emptyTitle, { color: colors.textPrimary }]}
                >
                  No Messenger thread stored yet
                </Text>
                <Text
                  style={[
                    dmStyles.emptySubtitle,
                    { color: colors.textSecondary },
                  ]}
                >
                  Use Refresh to try matching this lead against your Page inbox
                  again.
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
                (!draft.trim() || composerDisabled) &&
                  dmStyles.sendButtonDisabled,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorBannerText: {
    flex: 1,
    color: '#B91C1C',
    fontSize: 12,
    lineHeight: 18,
  },
  errorRetryText: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '700',
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
  loadOlderButton: {
    alignSelf: 'center',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    marginBottom: 4,
    borderRadius: 18,
    backgroundColor: '#EDE9FE',
  },
  loadOlderText: {
    color: PLUM,
    fontSize: 13,
    fontWeight: '700',
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

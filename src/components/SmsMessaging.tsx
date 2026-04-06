import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Keyboard,
  TouchableWithoutFeedback,
  Image,
  Modal,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio, InterruptionModeIOS } from 'expo-av';
import { File as FSFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '../lib/supabase';
import {
  getSmsVoiceTranscript,
  getSmsVoiceTranscriptionStatus,
  hasSmsAudioAttachment,
  getSmsMessageMedia,
  getSmsMediaFallbackLabel,
  parseSmsVoiceSummary,
  type SmsMediaAttachment,
  type SmsRawPayload,
  type SmsVoiceSummary,
} from '../lib/smsMedia';

interface SmsMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  from_number: string;
  to_number: string;
  message_text: string | null;
  created_at: string;
  sent_at?: string;
  received_at?: string;
  status?: string;
  raw_payload?: SmsRawPayload | string | null;
  voice_transcription_status?: string | null;
  voice_transcript?: string | null;
  voice_summary?: SmsVoiceSummary | string | null;
  voice_transcribed_at?: string | null;
  voice_transcription_error?: string | null;
}

function formatVoiceMetaValue(value: string) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getAttachmentTitle(attachment: SmsMediaAttachment) {
  switch (attachment.kind) {
    case 'audio':
      return 'Voice message';
    case 'image':
      return 'Photo';
    case 'video':
      return 'Video';
    default:
      return 'Media attachment';
  }
}

function getAttachmentIcon(attachment: SmsMediaAttachment) {
  switch (attachment.kind) {
    case 'audio':
      return 'mic';
    case 'image':
      return 'image';
    case 'video':
      return 'videocam';
    default:
      return 'attach';
  }
}

function formatAttachmentMeta(attachment: SmsMediaAttachment) {
  const parts: string[] = [];

  if (attachment.contentType) {
    parts.push(attachment.contentType);
  }

  if (typeof attachment.size === 'number' && attachment.size > 0) {
    const sizeInKb = attachment.size / 1024;
    parts.push(sizeInKb >= 1024 ? `${(sizeInKb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(sizeInKb))} KB`);
  }

  return parts.join(' • ');
}

interface SmsMessagingProps {
  leadId: string;
  leadPhone: string;
  leadName: string;
  leadSource: 'leads' | 'meta_ads';
  initialSmsOptIn?: boolean | null;
  initialSmsOptedOut?: boolean | null;
  onMessageSent?: () => void;
  showHeader?: boolean;
}

// API base URL - uses the same backend as the website (www to avoid redirect)
const API_BASE_URL = 'https://www.closewithmario.com';

export function SmsMessaging({
  leadId,
  leadPhone,
  leadName,
  leadSource,
  initialSmsOptIn,
  initialSmsOptedOut,
  onMessageSent,
  showHeader = true,
}: SmsMessagingProps) {
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [smsOptIn, setSmsOptIn] = useState<boolean | null | undefined>(initialSmsOptIn);
  const [smsOptedOut, setSmsOptedOut] = useState<boolean | null | undefined>(initialSmsOptedOut);
  const [currentMediaSound, setCurrentMediaSound] = useState<Audio.Sound | null>(null);
  const [playingMediaId, setPlayingMediaId] = useState<string | null>(null);
  const [expandedImageUrl, setExpandedImageUrl] = useState<string | null>(null);
  const [sharingImage, setSharingImage] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const isSmsOptedOut = !!smsOptedOut || smsOptIn === false;

  // Scroll to bottom (newest messages)
  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  };

  // Fetch messages on mount and set up realtime subscription
  useEffect(() => {
    fetchMessages();
    refreshSmsStatus();

    // Set up realtime subscription for new messages
    const subscription = supabase
      .channel(`sms_messages_${leadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sms_messages',
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          console.log('📱 SMS message change detected:', payload);
          fetchMessages();
          refreshSmsStatus();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [leadId, leadSource]);

  async function refreshSmsStatus() {
    try {
      const { data, error: statusError } = await supabase
        .from(leadSource)
        .select('sms_opt_in, sms_opted_out')
        .eq('id', leadId)
        .maybeSingle();

      if (statusError) throw statusError;

      if (data) {
        setSmsOptIn(data.sms_opt_in);
        setSmsOptedOut(data.sms_opted_out);
      }
    } catch (err) {
      console.error('Error fetching SMS opt-out state:', err);
    }
  }

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(scrollToBottom, 100);
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (currentMediaSound) {
        currentMediaSound.unloadAsync().catch(() => undefined);
      }
    };
  }, [currentMediaSound]);

  async function fetchMessages() {
    try {
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('sms_messages')
        .select('id, direction, from_number, to_number, message_text, created_at, sent_at, received_at, status, raw_payload, voice_transcription_status, voice_transcript, voice_summary, voice_transcribed_at, voice_transcription_error')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      setMessages(data || []);
    } catch (err: any) {
      console.error('Error fetching messages:', err);
      setError('Failed to load messages');
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !leadPhone) {
      console.log('📱 [SMS] Send aborted - empty message or no phone');
      return;
    }

    if (isSmsOptedOut) {
      setError(`${leadName || 'This lead'} has opted out of SMS. Reply START from their phone to re-enable texting.`);
      return;
    }

    console.log('📱 [SMS] Sending message...', {
      leadId,
      toNumber: leadPhone,
      messageLength: newMessage.length,
    });

    setSending(true);
    setError(null);

    try {
      const url = `${API_BASE_URL}/api/send-sms-message`;
      console.log('📱 [SMS] POST to:', url);
      
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          toNumber: leadPhone,
          message: newMessage,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      console.log('📱 [SMS] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('📱 [SMS] Error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        throw new Error(errorData.error || 'Failed to send message');
      }

      const result = await response.json();
      console.log('📱 [SMS] Success:', result);

      setNewMessage('');
      Keyboard.dismiss();
      await fetchMessages();
      onMessageSent?.();
    } catch (err: any) {
      console.log('📱 [SMS] Error:', err.name, err.message || err);
      if (err.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError(err.message || 'Failed to send message');
      }
    } finally {
      setSending(false);
    }
  }

  const formatPhoneNumber = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phone;
  };

  const formatTime = (timestamp: string) => {
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
  };

  const openAttachment = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (openError) {
      console.error('Error opening media attachment:', openError);
      Alert.alert('Unable to open attachment', 'This media attachment could not be opened right now.');
    }
  };

  const shareExpandedImage = async () => {
    if (!expandedImageUrl || sharingImage) return;

    try {
      setSharingImage(true);

      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!sharingAvailable) {
        Alert.alert('Sharing unavailable', 'This device cannot open the share sheet right now.');
        return;
      }

      const downloadedFile = await FSFile.downloadFileAsync(expandedImageUrl, Paths.cache, {
        idempotent: true,
      });

      await Sharing.shareAsync(downloadedFile.uri, {
        UTI: 'public.image',
      });
    } catch (shareError) {
      console.error('Error sharing image attachment:', shareError);
      Alert.alert('Unable to share image', 'This photo could not be prepared for sharing right now.');
    } finally {
      setSharingImage(false);
    }
  };

  const stopMediaPlayback = async () => {
    if (!currentMediaSound) return;

    try {
      await currentMediaSound.stopAsync();
    } catch (stopError) {
      console.error('Error stopping media attachment playback:', stopError);
    }

    try {
      await currentMediaSound.unloadAsync();
    } catch (unloadError) {
      console.error('Error unloading media attachment playback:', unloadError);
    }

    setCurrentMediaSound(null);
    setPlayingMediaId(null);
  };

  const toggleAudioAttachment = async (attachment: SmsMediaAttachment) => {
    try {
      if (playingMediaId === attachment.id && currentMediaSound) {
        await stopMediaPlayback();
        return;
      }

      if (currentMediaSound) {
        await stopMediaPlayback();
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
      });

      const { sound } = await Audio.Sound.createAsync({ uri: attachment.url });
      setCurrentMediaSound(sound);
      setPlayingMediaId(attachment.id);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;

        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => undefined);
          setCurrentMediaSound(null);
          setPlayingMediaId(null);
        }
      });

      await sound.playAsync();
    } catch (playError) {
      console.error('Error playing media attachment:', playError);
      setCurrentMediaSound(null);
      setPlayingMediaId(null);
      Alert.alert(
        'Unable to play audio',
        'This voice message could not be played in the app. You can open the file instead.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open',
            onPress: () => {
              openAttachment(attachment.url).catch(() => undefined);
            },
          },
        ]
      );
    }
  };

  const renderAttachment = (attachment: SmsMediaAttachment, isOutbound: boolean) => {
    const textColor = isOutbound ? '#FFFFFF' : '#0F172A';
    const secondaryTextColor = isOutbound ? 'rgba(255, 255, 255, 0.75)' : '#64748B';
    const cardStyle = isOutbound ? smsStyles.outboundAttachmentCard : smsStyles.inboundAttachmentCard;
    const actionStyle = isOutbound ? smsStyles.outboundAttachmentAction : smsStyles.inboundAttachmentAction;
    const actionTextStyle = isOutbound ? smsStyles.outboundAttachmentActionText : smsStyles.inboundAttachmentActionText;
    const isPlaying = playingMediaId === attachment.id;

    if (attachment.kind === 'image') {
      return (
        <TouchableOpacity
          key={attachment.id}
          activeOpacity={0.85}
          style={smsStyles.imageAttachmentWrap}
          onPress={() => setExpandedImageUrl(attachment.url)}
        >
          <Image source={{ uri: attachment.url }} style={smsStyles.imageAttachment} resizeMode="cover" />
          <View style={smsStyles.imageAttachmentBadge}>
            <Text style={smsStyles.imageAttachmentBadgeText}>Photo</Text>
          </View>
          <View style={[smsStyles.imageAttachmentOverlay, isOutbound && smsStyles.outboundImageAttachmentOverlay]}>
            <Ionicons name="expand-outline" size={14} color="#FFFFFF" />
            <Text style={smsStyles.imageAttachmentOverlayText}>Open photo</Text>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <View key={attachment.id} style={[smsStyles.attachmentCard, cardStyle]}>
        <View style={smsStyles.attachmentHeader}>
          <Ionicons name={getAttachmentIcon(attachment)} size={18} color={textColor} />
          <View style={smsStyles.attachmentTextWrap}>
            <Text style={[smsStyles.attachmentTitle, { color: textColor }]}>{getAttachmentTitle(attachment)}</Text>
            {!!formatAttachmentMeta(attachment) && (
              <Text style={[smsStyles.attachmentMeta, { color: secondaryTextColor }]}>
                {formatAttachmentMeta(attachment)}
              </Text>
            )}
          </View>
        </View>

        <View style={smsStyles.attachmentActions}>
          {attachment.kind === 'audio' ? (
            <TouchableOpacity
              style={[smsStyles.attachmentAction, actionStyle]}
              onPress={() => toggleAudioAttachment(attachment)}
            >
              <Text style={[smsStyles.attachmentActionText, actionTextStyle]}>
                {isPlaying ? 'Stop' : 'Play'}
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[smsStyles.attachmentAction, actionStyle]}
            onPress={() => {
              openAttachment(attachment.url).catch(() => undefined);
            }}
          >
            <Text style={[smsStyles.attachmentActionText, actionTextStyle]}>
              {attachment.kind === 'audio' ? 'Open' : attachment.kind === 'video' ? 'Open video' : 'Open'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderVoiceAnalysis = (item: SmsMessage, isOutbound: boolean) => {
    if (!hasSmsAudioAttachment(item)) return null;

    const voiceStatus = getSmsVoiceTranscriptionStatus(item);
    const voiceSummary = parseSmsVoiceSummary(item.voice_summary);
    const voiceTranscript = getSmsVoiceTranscript(item);
    const summaryText = voiceSummary?.one_sentence_summary?.trim() || '';
    const urgency = voiceSummary?.urgency?.trim() || '';
    const requestedCallbackTime = voiceSummary?.requested_callback_time?.trim() || '';
    const mentionsDocs = voiceSummary?.mentions_docs === true;
    const mentionsProperty = voiceSummary?.mentions_property === true;
    const transcriptionError = item.voice_transcription_error?.trim() || '';

    const analysisCardStyle = isOutbound ? smsStyles.outboundVoiceInsightCard : smsStyles.inboundVoiceInsightCard;
    const titleColor = isOutbound ? '#FFFFFF' : '#0F172A';
    const bodyColor = isOutbound ? 'rgba(255, 255, 255, 0.92)' : '#334155';
    const secondaryColor = isOutbound ? 'rgba(255, 255, 255, 0.76)' : '#64748B';
    const chipStyle = isOutbound ? smsStyles.outboundVoiceChip : smsStyles.inboundVoiceChip;
    const chipTextStyle = isOutbound ? smsStyles.outboundVoiceChipText : smsStyles.inboundVoiceChipText;

    if (voiceStatus === 'pending' || voiceStatus === 'processing') {
      return (
        <View style={[smsStyles.voiceInsightCard, analysisCardStyle]}>
          <View style={smsStyles.voiceInsightHeaderRow}>
            <ActivityIndicator size="small" color={isOutbound ? '#FFFFFF' : '#7C3AED'} />
            <Text style={[smsStyles.voiceInsightTitle, { color: titleColor }]}>
              Transcribing this voice message...
            </Text>
          </View>
          <Text style={[smsStyles.voiceInsightBody, { color: secondaryColor }]}>
            We&apos;ll show the transcript here once processing finishes.
          </Text>
        </View>
      );
    }

    if (voiceStatus === 'failed') {
      return (
        <View style={[smsStyles.voiceInsightCard, analysisCardStyle]}>
          <View style={smsStyles.voiceInsightHeaderRow}>
            <Ionicons name="alert-circle-outline" size={16} color={isOutbound ? '#FFFFFF' : '#DC2626'} />
            <Text style={[smsStyles.voiceInsightTitle, { color: titleColor }]}>
              Voice transcript unavailable
            </Text>
          </View>
          <Text style={[smsStyles.voiceInsightBody, { color: bodyColor }]}>
            We couldn&apos;t transcribe this voice message yet.
          </Text>
          {transcriptionError ? (
            <Text style={[smsStyles.voiceInsightFootnote, { color: secondaryColor }]} numberOfLines={2}>
              {transcriptionError}
            </Text>
          ) : null}
        </View>
      );
    }

    if (voiceStatus !== 'completed' || (!summaryText && !voiceTranscript)) {
      return null;
    }

    const chips: string[] = [];
    if (urgency) chips.push(`Urgency: ${formatVoiceMetaValue(urgency)}`);
    if (requestedCallbackTime) chips.push(requestedCallbackTime);
    if (mentionsDocs) chips.push('Docs mentioned');
    if (mentionsProperty) chips.push('Property mentioned');

    return (
      <View style={[smsStyles.voiceInsightCard, analysisCardStyle]}>
        <View style={smsStyles.voiceInsightHeaderRow}>
          <Ionicons name="sparkles-outline" size={16} color={isOutbound ? '#FFFFFF' : '#7C3AED'} />
          <Text style={[smsStyles.voiceInsightTitle, { color: titleColor }]}>
            Voice note
          </Text>
        </View>

        {summaryText ? (
          <Text style={[smsStyles.voiceInsightSummary, { color: titleColor }]}>
            {summaryText}
          </Text>
        ) : null}

        {chips.length > 0 ? (
          <View style={smsStyles.voiceChipRow}>
            {chips.map((chip) => (
              <View key={chip} style={[smsStyles.voiceChip, chipStyle]}>
                <Text style={[smsStyles.voiceChipText, chipTextStyle]}>{chip}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {voiceTranscript ? (
          <View style={smsStyles.voiceTranscriptWrap}>
            <Text style={[smsStyles.voiceTranscriptLabel, { color: secondaryColor }]}>Transcript</Text>
            <Text style={[smsStyles.voiceInsightBody, { color: bodyColor }]}>
              {voiceTranscript}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  const renderMessage = ({ item }: { item: SmsMessage }) => {
    const isOutbound = item.direction === 'outbound';
    const mediaAttachments = getSmsMessageMedia(item);
    const messageText = item.message_text?.trim() || '';
    const shouldShowFallbackText = !messageText && mediaAttachments.length > 1;
    const fallbackText = shouldShowFallbackText ? getSmsMediaFallbackLabel(mediaAttachments) : '';
    const displayText = messageText || fallbackText;
    const isFallbackText = !messageText && !!displayText;

    return (
      <View
        style={[
          smsStyles.messageBubbleContainer,
          isOutbound ? smsStyles.outboundContainer : smsStyles.inboundContainer,
        ]}
      >
        <View
          style={[
            smsStyles.messageBubble,
            isOutbound ? smsStyles.outboundBubble : smsStyles.inboundBubble,
          ]}
        >
          {displayText ? (
            <Text
              style={[
                smsStyles.messageText,
                isOutbound ? smsStyles.outboundText : smsStyles.inboundText,
                isFallbackText && smsStyles.messageFallbackText,
              ]}
            >
              {displayText}
            </Text>
          ) : null}

          {mediaAttachments.length > 0 ? (
            <View style={[smsStyles.mediaAttachments, displayText ? smsStyles.mediaAttachmentsWithText : null]}>
              {mediaAttachments.map((attachment) => renderAttachment(attachment, isOutbound))}
            </View>
          ) : null}

          {renderVoiceAnalysis(item, isOutbound)}

          <View style={smsStyles.messageFooter}>
            <Text
              style={[
                smsStyles.messageTime,
                isOutbound ? smsStyles.outboundTime : smsStyles.inboundTime,
              ]}
            >
              {formatTime(item.created_at)}
            </Text>
            {item.status && isOutbound && (
              <Text style={smsStyles.messageStatus}>
                {item.status === 'sent' && ' ✓'}
                {item.status === 'delivered' && ' ✓✓'}
                {item.status === 'failed' && ' ❌'}
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={smsStyles.loadingContainer}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={smsStyles.loadingText}>Loading messages...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={smsStyles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 240 : 0}
    >
      {/* Header */}
      {showHeader ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={smsStyles.header}>
            <Ionicons name="chatbubbles" size={20} color="#7C3AED" />
            <View style={smsStyles.headerInfo}>
              <Text style={smsStyles.headerName}>{leadName}</Text>
              <Text style={smsStyles.headerPhone}>{formatPhoneNumber(leadPhone)}</Text>
            </View>
          </View>
        </TouchableWithoutFeedback>
      ) : null}

      {/* Error Banner */}
      {error && (
        <View style={smsStyles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color="#DC2626" />
          <Text style={smsStyles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Ionicons name="close" size={16} color="#DC2626" />
          </TouchableOpacity>
        </View>
      )}

      {isSmsOptedOut && (
        <View style={smsStyles.optOutBanner}>
          <Ionicons name="alert-circle" size={16} color="#C2410C" />
          <Text style={smsStyles.optOutBannerText}>
            SMS opted out via STOP. Reply START from the lead&apos;s phone to re-enable texting.
          </Text>
        </View>
      )}

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={smsStyles.messagesList}
        extraData={playingMediaId}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        ListEmptyComponent={
          <View style={smsStyles.emptyContainer}>
            <Ionicons name="chatbubble-outline" size={48} color="#CBD5E1" />
            <Text style={smsStyles.emptyText}>No messages yet</Text>
            <Text style={smsStyles.emptySubtext}>Send the first message!</Text>
          </View>
        }
        onContentSizeChange={scrollToBottom}
      />

      {/* Input Area */}
      <View style={smsStyles.inputContainer}>
        <TextInput
          style={smsStyles.textInput}
          placeholder={isSmsOptedOut ? 'SMS disabled until the lead replies START' : 'Type a message...'}
          placeholderTextColor="#94A3B8"
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          maxLength={1600}
          editable={!sending && !isSmsOptedOut}
        />
        <TouchableOpacity
          style={[
            smsStyles.sendButton,
            (!newMessage.trim() || sending || isSmsOptedOut) && smsStyles.sendButtonDisabled,
          ]}
          onPress={sendMessage}
          disabled={!newMessage.trim() || sending || isSmsOptedOut}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="send" size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={!!expandedImageUrl} transparent animationType="fade">
        <View style={smsStyles.fullScreenOverlay}>
          <TouchableOpacity
            style={[smsStyles.fullScreenActionButton, smsStyles.fullScreenShareButton]}
            onPress={() => {
              shareExpandedImage().catch(() => undefined);
            }}
            disabled={sharingImage}
          >
            {sharingImage ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="share-outline" size={24} color="#FFFFFF" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[smsStyles.fullScreenActionButton, smsStyles.fullScreenClose]}
            onPress={() => setExpandedImageUrl(null)}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          {expandedImageUrl ? (
            <Image
              source={{ uri: expandedImageUrl }}
              style={smsStyles.fullScreenImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const smsStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerInfo: {
    marginLeft: 12,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  headerPhone: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#DC2626',
  },
  optOutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FDBA74',
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  optOutBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#9A3412',
    fontWeight: '600',
  },
  messagesList: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  messageBubbleContainer: {
    marginBottom: 8,
    maxWidth: '84%',
  },
  outboundContainer: {
    alignSelf: 'flex-end',
  },
  inboundContainer: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  outboundBubble: {
    backgroundColor: '#7C3AED',
    borderBottomRightRadius: 4,
  },
  inboundBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageFallbackText: {
    fontStyle: 'italic',
  },
  outboundText: {
    color: '#FFFFFF',
  },
  inboundText: {
    color: '#1E293B',
  },
  mediaAttachments: {
    gap: 8,
  },
  mediaAttachmentsWithText: {
    marginTop: 8,
  },
  imageAttachmentWrap: {
    width: 180,
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  imageAttachment: {
    width: '100%',
    height: '100%',
  },
  imageAttachmentBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
  imageAttachmentBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  imageAttachmentOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  outboundImageAttachmentOverlay: {
    backgroundColor: 'rgba(76, 29, 149, 0.55)',
  },
  imageAttachmentOverlayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  attachmentCard: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    minWidth: 220,
  },
  inboundAttachmentCard: {
    backgroundColor: '#F8FAFC',
  },
  outboundAttachmentCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  attachmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  attachmentTextWrap: {
    flex: 1,
  },
  attachmentTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  attachmentMeta: {
    marginTop: 2,
    fontSize: 12,
  },
  attachmentActions: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
  },
  attachmentAction: {
    minWidth: 84,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  inboundAttachmentAction: {
    backgroundColor: '#E2E8F0',
  },
  outboundAttachmentAction: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  attachmentActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inboundAttachmentActionText: {
    color: '#1E293B',
  },
  outboundAttachmentActionText: {
    color: '#FFFFFF',
  },
  voiceInsightCard: {
    marginTop: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  inboundVoiceInsightCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  outboundVoiceInsightCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  voiceInsightHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceInsightTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  voiceInsightSummary: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  voiceInsightBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  voiceInsightFootnote: {
    fontSize: 12,
    lineHeight: 16,
  },
  voiceChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  voiceChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  inboundVoiceChip: {
    backgroundColor: '#EDE9FE',
  },
  outboundVoiceChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  voiceChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  inboundVoiceChipText: {
    color: '#6D28D9',
  },
  outboundVoiceChipText: {
    color: '#FFFFFF',
  },
  voiceTranscriptWrap: {
    gap: 4,
  },
  voiceTranscriptLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  messageTime: {
    fontSize: 11,
  },
  outboundTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  inboundTime: {
    color: '#94A3B8',
  },
  messageStatus: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 24,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1E293B',
    maxHeight: 100,
    minHeight: 40,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
  fullScreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.96)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenClose: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 10,
    padding: 8,
  },
  fullScreenActionButton: {
    position: 'absolute',
    top: 48,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreenShareButton: {
    left: 16,
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
  },
});

export default SmsMessaging;

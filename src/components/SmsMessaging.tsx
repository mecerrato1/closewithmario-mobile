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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

interface SmsMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  from_number: string;
  to_number: string;
  message_text: string;
  created_at: string;
  sent_at?: string;
  received_at?: string;
  status?: string;
}

interface SmsMessagingProps {
  leadId: string;
  leadPhone: string;
  leadName: string;
}

// API base URL - uses the same backend as the website (www to avoid redirect)
const API_BASE_URL = 'https://www.closewithmario.com';

export function SmsMessaging({ leadId, leadPhone, leadName }: SmsMessagingProps) {
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Scroll to bottom (newest messages)
  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  };

  // Fetch messages on mount and set up realtime subscription
  useEffect(() => {
    fetchMessages();

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
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [leadId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(scrollToBottom, 100);
    }
  }, [messages]);

  async function fetchMessages() {
    try {
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('sms_messages')
        .select('*')
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

  const renderMessage = ({ item }: { item: SmsMessage }) => {
    const isOutbound = item.direction === 'outbound';

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
          <Text
            style={[
              smsStyles.messageText,
              isOutbound ? smsStyles.outboundText : smsStyles.inboundText,
            ]}
          >
            {item.message_text}
          </Text>
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
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={smsStyles.header}>
          <Ionicons name="chatbubbles" size={20} color="#7C3AED" />
          <View style={smsStyles.headerInfo}>
            <Text style={smsStyles.headerName}>{leadName}</Text>
            <Text style={smsStyles.headerPhone}>{formatPhoneNumber(leadPhone)}</Text>
          </View>
        </View>
      </TouchableWithoutFeedback>

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

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={smsStyles.messagesList}
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
          placeholder="Type a message..."
          placeholderTextColor="#94A3B8"
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          maxLength={1600}
          editable={!sending}
        />
        <TouchableOpacity
          style={[
            smsStyles.sendButton,
            (!newMessage.trim() || sending) && smsStyles.sendButtonDisabled,
          ]}
          onPress={sendMessage}
          disabled={!newMessage.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="send" size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
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
  messagesList: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    flexGrow: 1,
  },
  messageBubbleContainer: {
    marginBottom: 8,
    maxWidth: '80%',
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
  outboundText: {
    color: '#FFFFFF',
  },
  inboundText: {
    color: '#1E293B',
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
});

export default SmsMessaging;

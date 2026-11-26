import React, { useRef, useState } from 'react';
import {
  Image, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { PUBLIC_BRAND } from '../../brand/brands';
import { GIO_STARTERS, MAX_QUESTION_LENGTH, type GioMessage, type GioMode } from './gioChat';
import { GIO } from './gioImages';
import { screenTop } from '../../lib/screenTop';

type Props = {
  visible: boolean;
  firstName: string | null;
  messages: GioMessage[];
  thinking: boolean;
  error: string | null;
  onAsk: (question: string, mode?: GioMode) => void;
  onClose: () => void;
};

export function GioScreen({ visible, firstName, messages, thinking, error, onAsk, onClose }: Props) {
  const [draft, setDraft] = useState('');
  const scroll = useRef<ScrollView>(null);
  const send = () => {
    if (!draft.trim() || thinking) return;
    onAsk(draft);
    setDraft('');
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close Gio" style={styles.back} onPress={onClose}>
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>Gio</Text>
            <Text style={styles.subtitle}>AI assistant for loan officers</Text>
          </View>
        </View>

        <ScrollView
          ref={scroll}
          style={styles.screen}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => messages.length && scroll.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 ? (
            <View style={styles.welcome}>
              <Image source={GIO.wave} style={styles.hero} resizeMode="contain" accessibilityElementsHidden />
              <Text style={styles.hello}>{firstName ? `Hi ${firstName}, I'm Gio.` : "Hi, I'm Gio."}</Text>
              <Text style={styles.lead}>Ask me about guidelines or lender rules.</Text>
              {GIO_STARTERS.map((starter) => (
                <TouchableOpacity
                  key={starter.question}
                  accessibilityRole="button"
                  style={styles.starter}
                  onPress={() => onAsk(starter.question, starter.mode)}
                >
                  <Text style={styles.starterText}>{starter.question}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            messages.map((message) => (
              <View key={message.id} style={[styles.bubble, message.role === 'user' ? styles.mine : styles.theirs]}>
                <Text selectable style={message.role === 'user' ? styles.mineText : styles.theirsText}>{message.content}</Text>
                {message.citations?.map((citation) => (
                  <TouchableOpacity
                    key={citation.id}
                    accessibilityRole={citation.url ? 'link' : 'text'}
                    disabled={!citation.url}
                    style={styles.source}
                    onPress={() => citation.url && void Linking.openURL(citation.url)}
                  >
                    <Ionicons name="document-text-outline" size={13} color="#1D4ED8" />
                    <Text style={[styles.sourceText, !citation.url && styles.sourcePlain]}>{citation.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))
          )}
          {thinking ? (
            <View style={styles.thinking}>
              <Image source={GIO.search} style={styles.thinkingArt} resizeMode="contain" accessibilityElementsHidden />
              <Text style={styles.lead}>Gio is looking that up…</Text>
            </View>
          ) : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask about a loan or guideline…"
              placeholderTextColor="#94A3B8"
              maxLength={MAX_QUESTION_LENGTH}
              multiline
            />
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Send" onPress={send} style={styles.send}>
              <Ionicons name="send" size={20} color={draft.trim() && !thinking ? '#2563EB' : '#94A3B8'} />
            </TouchableOpacity>
          </View>
          <Text style={styles.disclaimer}>Gio is AI and can be wrong. Verify before advising.</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PUBLIC_BRAND.colors.canvas },
  header: { backgroundColor: PUBLIC_BRAND.colors.primary, paddingTop: screenTop(56, 40), paddingBottom: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFFFFF', fontSize: 19, fontWeight: '700' },
  subtitle: { color: '#BFD3FB', fontSize: 12 },
  content: { padding: 14, gap: 10, flexGrow: 1 },
  welcome: { alignItems: 'center', paddingTop: 8 },
  hero: { width: 200, height: 270 },
  hello: { color: '#0F172A', fontSize: 24, fontWeight: '800', marginTop: 12 },
  lead: { color: '#5B6472', fontSize: 14, marginTop: 4, marginBottom: 12 },
  starter: { alignSelf: 'stretch', borderRadius: 14, borderWidth: 1, borderColor: '#BFD3FB', backgroundColor: '#E8F0FE', paddingHorizontal: 14, paddingVertical: 12, marginTop: 8 },
  starterText: { color: '#1D4ED8', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, maxWidth: '88%' },
  mine: { alignSelf: 'flex-end', backgroundColor: '#2563EB' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  mineText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21 },
  theirsText: { color: '#0F172A', fontSize: 15, lineHeight: 21 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  sourceText: { color: '#1D4ED8', fontSize: 12, flexShrink: 1, textDecorationLine: 'underline' },
  sourcePlain: { color: '#475569', textDecorationLine: 'none' },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thinkingArt: { width: 56, height: 68 },
  error: { color: '#B91C1C', fontSize: 13, textAlign: 'center' },
  footer: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 28 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 22, paddingLeft: 14 },
  input: { flex: 1, color: '#0F172A', fontSize: 15, maxHeight: 110, paddingTop: 12, paddingBottom: 12 },
  send: { width: 46, height: 44, alignItems: 'center', justifyContent: 'center' },
  disclaimer: { color: '#64748B', fontSize: 11, textAlign: 'center', marginTop: 6 },
});

import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { callRewriteApi } from '../lib/aiRewriteService';

export type AiTone = 'professional' | 'friendly' | 'concise' | 'detailed' | 'urgent';

type AiRewriteToolbarProps = {
  /** The current text to rewrite */
  text: string;
  /** Called when AI produces a new version of the text */
  onTextRewritten: (newText: string) => void;
  /** The API context string (e.g. 'partner_update', 'custom_sms') */
  context: string;
  /** Whether the user has AI draft access */
  hasAccess: boolean;
};

export type AiRewriteToolbarRef = {
  /** Call when the user manually edits text to clear the "Rewritten by AI" badge */
  resetBadge: () => void;
};

export const AiRewriteToolbar = forwardRef<AiRewriteToolbarRef, AiRewriteToolbarProps>(function AiRewriteToolbar({ text, onTextRewritten, context, hasAccess }, ref) {
  const [aiTone, setAiTone] = useState<AiTone>('friendly');
  const [rewriting, setRewriting] = useState(false);
  const [rewrittenByAi, setRewrittenByAi] = useState(false);
  const [showTonePicker, setShowTonePicker] = useState(false);
  const [refineInput, setRefineInput] = useState('');
  const [refining, setRefining] = useState(false);

  const handleRewrite = async () => {
    if (!text.trim() || text.trim().length < 10) {
      Alert.alert('Too Short', 'Please enter at least 10 characters before rewriting.');
      return;
    }

    setRewriting(true);
    try {
      const result = await callRewriteApi({
        text: text.trim(),
        tone: aiTone,
        context,
      });
      if (result) {
        onTextRewritten(result);
        setRewrittenByAi(true);
        setRefineInput('');
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        Alert.alert('Timeout', 'Request timed out. Please try again.');
      } else {
        Alert.alert('Error', error.message || 'Failed to rewrite text');
      }
    } finally {
      setRewriting(false);
    }
  };

  const handleRefine = async () => {
    if (!refineInput.trim() || !text.trim()) return;

    setRefining(true);
    try {
      const result = await callRewriteApi({
        text: text.trim(),
        tone: aiTone,
        context,
        refinement: refineInput.trim(),
      });
      if (result) {
        onTextRewritten(result);
        setRefineInput('');
        setRewrittenByAi(true);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        Alert.alert('Timeout', 'Request timed out. Please try again.');
      } else {
        Alert.alert('Error', error.message || 'Failed to refine text');
      }
    } finally {
      setRefining(false);
    }
  };

  useImperativeHandle(ref, () => ({
    resetBadge() {
      if (rewrittenByAi) {
        setRewrittenByAi(false);
        setRefineInput('');
      }
    },
  }), [rewrittenByAi]);

  if (!hasAccess) return null;

  return (
    <View>
      {rewrittenByAi && (
        <View style={s.badge}>
          <Ionicons name="sparkles" size={12} color="#7C3AED" />
          <Text style={s.badgeText}>Rewritten by AI</Text>
        </View>
      )}

      <View style={s.container}>
        <View style={s.rewriteRow}>
          <TouchableOpacity
            style={s.toneDropdown}
            onPress={() => setShowTonePicker(!showTonePicker)}
          >
            <Text style={s.toneDropdownText}>
              {aiTone.charAt(0).toUpperCase() + aiTone.slice(1)}
            </Text>
            <Text style={s.toneDropdownArrow}>{showTonePicker ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              s.rewriteButton,
              (rewriting || !text.trim() || text.trim().length < 10) && s.rewriteButtonDisabled,
            ]}
            onPress={handleRewrite}
            disabled={rewriting || !text.trim() || text.trim().length < 10}
          >
            {rewriting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Text style={s.rewriteButtonIcon}>✨</Text>
                <Text style={s.rewriteButtonText}>AI Rewrite</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        {showTonePicker && (
          <View style={s.tonePickerList}>
            {(['professional', 'friendly', 'concise', 'detailed', 'urgent'] as const).map((tone) => (
              <TouchableOpacity
                key={tone}
                style={[s.tonePickerItem, aiTone === tone && s.tonePickerItemActive]}
                onPress={() => {
                  setAiTone(tone);
                  setShowTonePicker(false);
                }}
              >
                <Text style={[s.tonePickerItemText, aiTone === tone && s.tonePickerItemTextActive]}>
                  {tone.charAt(0).toUpperCase() + tone.slice(1)}
                </Text>
                {aiTone === tone && <Text style={s.tonePickerCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {rewrittenByAi && (
        <View style={s.refineContainer}>
          <View style={s.refineRow}>
            <TextInput
              style={s.refineInput}
              placeholder='e.g. "make it more urgent"'
              placeholderTextColor="#A78BFA"
              value={refineInput}
              onChangeText={setRefineInput}
              onSubmitEditing={handleRefine}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[
                s.refineButton,
                (refining || !refineInput.trim()) && s.rewriteButtonDisabled,
              ]}
              onPress={handleRefine}
              disabled={refining || !refineInput.trim()}
            >
              {refining ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={s.rewriteButtonIcon}>💬</Text>
                  <Text style={s.rewriteButtonText}>Refine</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
});

const s = StyleSheet.create({
  container: {
    marginTop: 12,
    marginBottom: 16,
  },
  rewriteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toneDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
  },
  toneDropdownText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7C3AED',
  },
  toneDropdownArrow: {
    fontSize: 8,
    color: '#7C3AED',
  },
  tonePickerList: {
    marginTop: 8,
    backgroundColor: '#F8F5FF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tonePickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tonePickerItemActive: {
    backgroundColor: '#EDE9FE',
  },
  tonePickerItemText: {
    fontSize: 14,
    color: '#4B5563',
  },
  tonePickerItemTextActive: {
    color: '#7C3AED',
    fontWeight: '600',
  },
  tonePickerCheck: {
    fontSize: 14,
    color: '#7C3AED',
    fontWeight: '700',
  },
  rewriteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#7C3AED',
    paddingVertical: 9,
    borderRadius: 20,
  },
  rewriteButtonDisabled: {
    opacity: 0.4,
  },
  rewriteButtonIcon: {
    fontSize: 14,
  },
  rewriteButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
    marginTop: 4,
  },
  badgeText: {
    fontSize: 12,
    color: '#7C3AED',
    fontWeight: '500',
  },
  refineContainer: {
    marginBottom: 12,
  },
  refineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refineInput: {
    flex: 1,
    backgroundColor: '#F5F0FF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#4B5563',
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  refineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
});

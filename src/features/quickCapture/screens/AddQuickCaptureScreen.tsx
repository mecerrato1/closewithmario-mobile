// src/features/quickCapture/screens/AddQuickCaptureScreen.tsx

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createQuickCapture } from '../services/quickCaptureService';
import { useQuickCaptureAttachments } from '../hooks/useQuickCaptureAttachments';
import QuickCaptureAttachmentStrip from '../components/QuickCaptureAttachmentStrip';
import SelectRealtorModal from '../components/SelectRealtorModal';
import type { CreateQuickCapturePayload } from '../types';

interface AddQuickCaptureScreenProps {
  userId: string;
  onBack: () => void;
  onSuccess: () => void;
}

export default function AddQuickCaptureScreen({
  userId,
  onBack,
  onSuccess,
}: AddQuickCaptureScreenProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [realtorId, setRealtorId] = useState<string | null>(null);
  const [realtorName, setRealtorName] = useState('');
  const [showRealtorPicker, setShowRealtorPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    localAttachments,
    uploadedAttachments,
    uploading,
    pickFromCamera,
    pickFromLibrary,
    uploadAll,
    removeLocal,
    removeUploaded,
  } = useQuickCaptureAttachments();

  const formatPhoneDisplay = (value: string): string => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const handleAddPhoto = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) pickFromCamera();
          if (buttonIndex === 2) pickFromLibrary();
        }
      );
    } else {
      Alert.alert('Add Photo', 'Choose an option', [
        { text: 'Take Photo', onPress: pickFromCamera },
        { text: 'Choose from Library', onPress: pickFromLibrary },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [pickFromCamera, pickFromLibrary]);

  const handleSave = async () => {
    if (!firstName.trim()) {
      setError('First name is required');
      return;
    }

    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length > 0 && phoneDigits.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email.trim() && !emailRegex.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: CreateQuickCapturePayload = {
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        phone: phoneDigits || null,
        email: email.trim().toLowerCase() || null,
        realtor_id: realtorId || null,
        notes: notes.trim() || null,
      };

      const { data: capture, error: createError } = await createQuickCapture(payload);

      if (createError || !capture) {
        setError(createError?.message || 'Failed to create quick capture');
        setSaving(false);
        return;
      }

      // Upload attachments if any
      if (localAttachments.length > 0) {
        await uploadAll(capture.id);
      }

      Alert.alert('Saved', 'Quick capture created successfully.');
      onSuccess();
    } catch (e: any) {
      console.error('[AddQuickCapture] save error:', e);
      setError(e?.message || 'Unexpected error');
    } finally {
      setSaving(false);
    }
  };

  const handleRealtorSelect = useCallback(
    (selection: { realtor_id: string; realtor_name: string }) => {
      if (!selection.realtor_id) {
        setRealtorId(null);
        setRealtorName('');
      } else {
        setRealtorId(selection.realtor_id);
        setRealtorName(selection.realtor_name);
      }
      setShowRealtorPicker(false);
    },
    []
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Quick Capture</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.form}
          contentContainerStyle={styles.formContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* First Name */}
          <View style={styles.field}>
            <Text style={styles.label}>
              First Name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="words"
            />
          </View>

          {/* Last Name */}
          <View style={styles.field}>
            <Text style={styles.label}>Last Name</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="words"
            />
          </View>

          {/* Phone */}
          <View style={styles.field}>
            <Text style={styles.label}>Phone</Text>
            <TextInput
              style={styles.input}
              value={formatPhoneDisplay(phone)}
              onChangeText={(text) => setPhone(text.replace(/\D/g, ''))}
              placeholder="(555) 123-4567"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
            />
          </View>

          {/* Email */}
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="email@example.com"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Realtor Link */}
          <View style={styles.field}>
            <Text style={styles.label}>Link Realtor (optional)</Text>
            <TouchableOpacity
              style={styles.pickerRow}
              onPress={() => setShowRealtorPicker(true)}
            >
              <Ionicons
                name={realtorId ? 'person-circle' : 'person-add-outline'}
                size={20}
                color={realtorId ? '#7C3AED' : '#9CA3AF'}
              />
              <Text
                style={[
                  styles.pickerText,
                  realtorId && styles.pickerTextActive,
                ]}
                numberOfLines={1}
              >
                {realtorName || 'Select a realtor...'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Notes */}
          <View style={styles.field}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Quick notes about this lead..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Attachments */}
          <View style={styles.field}>
            <QuickCaptureAttachmentStrip
              uploadedAttachments={uploadedAttachments}
              localAttachments={localAttachments}
              onAddPress={handleAddPhoto}
              onRemoveLocal={removeLocal}
              onRemoveUploaded={removeUploaded}
              editable
            />
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onBack}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.saveBtn,
              (saving || uploading) && styles.saveBtnDisabled,
            ]}
            onPress={handleSave}
            disabled={saving || uploading}
          >
            {saving || uploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            )}
            <Text style={styles.saveText}>
              {saving ? 'Saving...' : uploading ? 'Uploading...' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Realtor Picker Modal */}
      <SelectRealtorModal
        visible={showRealtorPicker}
        userId={userId}
        selectedRealtorId={realtorId}
        onSelect={handleRealtorSelect}
        onClose={() => setShowRealtorPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#7C3AED',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  form: {
    flex: 1,
  },
  formContent: {
    padding: 20,
    paddingBottom: 40,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  required: {
    color: '#EF4444',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  pickerText: {
    flex: 1,
    fontSize: 15,
    color: '#9CA3AF',
  },
  pickerTextActive: {
    color: '#111827',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4B5563',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnDisabled: {
    backgroundColor: '#A78BFA',
    opacity: 0.7,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

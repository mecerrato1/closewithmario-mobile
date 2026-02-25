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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../../lib/supabase';
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
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const scanMessages = [
    'Reading that chicken scratch...',
    'Deciphering ancient handwriting...',
    'Squinting really hard at this...',
    'Teaching AI to read your notes...',
    'Extracting lead intel...',
    'Almost got it, hold tight...',
    'Translating pixels into profits...',
    'Working harder than your last intern...',
  ];

  const {
    localAttachments,
    uploadedAttachments,
    uploading,
    pickFromCamera,
    pickFromLibrary,
    addLocalUri,
    uploadAll,
    removeLocal,
    removeUploaded,
  } = useQuickCaptureAttachments();

  const handleScanImage = useCallback(async () => {
    const pickImage = async (): Promise<string | null> => {
      return new Promise((resolve) => {
        const launchCamera = async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Camera access is required to scan.');
            resolve(null);
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.8,
          });
          resolve(result.canceled ? null : result.assets[0].uri);
        };

        const launchLibrary = async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Photo library access is required to scan.');
            resolve(null);
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
          });
          resolve(result.canceled ? null : result.assets[0].uri);
        };

        if (Platform.OS === 'ios') {
          ActionSheetIOS.showActionSheetWithOptions(
            {
              options: ['Cancel', 'Take Photo', 'Choose from Library'],
              cancelButtonIndex: 0,
            },
            (buttonIndex) => {
              if (buttonIndex === 1) launchCamera();
              else if (buttonIndex === 2) launchLibrary();
              else resolve(null);
            }
          );
        } else {
          Alert.alert('Scan Image', 'Choose an option', [
            { text: 'Take Photo', onPress: () => launchCamera() },
            { text: 'Choose from Library', onPress: () => launchLibrary() },
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          ]);
        }
      });
    };

    const uri = await pickImage();
    if (!uri) return;

    setScanning(true);
    setError(null);
    setScanMessage(scanMessages[Math.floor(Math.random() * scanMessages.length)]);

    const messageInterval = setInterval(() => {
      setScanMessage((prev) => {
        const remaining = scanMessages.filter((m) => m !== prev);
        return remaining[Math.floor(Math.random() * remaining.length)];
      });
    }, 2500);

    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { data, error: fnError } = await supabase.functions.invoke('ocr-extract-lead', {
        body: { image_base64: base64, mime_type: 'image/jpeg' },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      if (data.first_name) setFirstName(data.first_name);
      if (data.last_name) setLastName(data.last_name);
      if (data.email) setEmail(data.email);
      if (data.phone) {
        const digits = data.phone.replace(/\D/g, '').slice(0, 10);
        setPhone(digits);
      }
      if (data.notes) setNotes((prev) => (prev ? `${prev}\n${data.notes}` : data.notes));

      await addLocalUri(uri);

      Alert.alert('Scan Complete', 'Fields have been populated. Please review before saving.');
    } catch (err: any) {
      console.error('[OCR scan] error:', err);
      setError(err?.message || 'Failed to scan image');
    } finally {
      clearInterval(messageInterval);
      setScanning(false);
    }
  }, []);

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
      {/* Scanning Overlay */}
      <Modal visible={scanning} transparent animationType="fade">
        <View style={styles.scanOverlay}>
          <View style={styles.scanCard}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={styles.scanCardTitle}>Scanning Image</Text>
            <Text style={styles.scanCardMessage}>{scanMessage}</Text>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Quick Capture</Text>
        <TouchableOpacity
          onPress={handleScanImage}
          disabled={scanning}
          style={styles.scanBtn}
        >
          {scanning ? (
            <ActivityIndicator size="small" color="#7C3AED" />
          ) : (
            <Ionicons name="camera-outline" size={18} color="#7C3AED" />
          )}
          <Text style={styles.scanBtnText}>
            {scanning ? 'Scanning...' : 'Scan to Fill'}
          </Text>
        </TouchableOpacity>
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
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  scanBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7C3AED',
  },
  scanOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  scanCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  scanCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
  },
  scanCardMessage: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
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

// src/features/quickCapture/screens/QuickCaptureDetailScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Linking,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  updateQuickCapture,
  deleteQuickCapture,
  convertQuickCaptureToLead,
  fetchQuickCapture,
  fetchAttachments,
} from '../services/quickCaptureService';
import { useQuickCaptureAttachments } from '../hooks/useQuickCaptureAttachments';
import QuickCaptureAttachmentStrip from '../components/QuickCaptureAttachmentStrip';
import SelectRealtorModal from '../components/SelectRealtorModal';
import type { QuickCapture, QuickCaptureAttachment } from '../types';

interface QuickCaptureDetailScreenProps {
  captureId: string;
  userId: string;
  onBack: () => void;
  onUpdate: () => void;
  onRealtorPress?: (realtorId: string) => void;
}

export default function QuickCaptureDetailScreen({
  captureId,
  userId,
  onBack,
  onUpdate,
  onRealtorPress,
}: QuickCaptureDetailScreenProps) {
  const [capture, setCapture] = useState<QuickCapture | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [realtorId, setRealtorId] = useState<string | null>(null);
  const [realtorName, setRealtorName] = useState('');
  const [showRealtorPicker, setShowRealtorPicker] = useState(false);

  const {
    localAttachments,
    uploadedAttachments,
    uploading,
    pickFromCamera,
    pickFromLibrary,
    uploadAll,
    removeLocal,
    removeUploaded,
    setInitialAttachments,
  } = useQuickCaptureAttachments();

  // Load capture + attachments
  const loadData = useCallback(async () => {
    setLoading(true);
    const [captureResult, attachResult] = await Promise.all([
      fetchQuickCapture(captureId),
      fetchAttachments(captureId),
    ]);

    if (captureResult.data) {
      const c = captureResult.data;
      setCapture(c);
      setFirstName(c.first_name);
      setLastName(c.last_name || '');
      setPhone(c.phone || '');
      setEmail(c.email || '');
      setNotes(c.notes || '');
      setRealtorId(c.realtor_id);
      setRealtorName(
        c.realtor_first_name || c.realtor_last_name
          ? `${c.realtor_first_name || ''} ${c.realtor_last_name || ''}`.trim()
          : ''
      );
    }

    if (attachResult.data) {
      setInitialAttachments(attachResult.data);
    }

    setLoading(false);
  }, [captureId, setInitialAttachments]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatPhoneDisplay = (value: string): string => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const handleSave = async () => {
    if (!firstName.trim()) {
      Alert.alert('Error', 'First name is required');
      return;
    }

    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length > 0 && phoneDigits.length !== 10) {
      Alert.alert('Error', 'Please enter a valid 10-digit phone number');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email.trim() && !emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setSaving(true);
    try {
      const { error } = await updateQuickCapture(captureId, {
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        phone: phoneDigits || null,
        email: email.trim().toLowerCase() || null,
        notes: notes.trim() || null,
        realtor_id: realtorId || null,
      });

      if (error) {
        Alert.alert('Error', error.message);
        setSaving(false);
        return;
      }

      // Upload any new local attachments
      if (localAttachments.length > 0) {
        await uploadAll(captureId);
      }

      setEditing(false);
      onUpdate();
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!capture) return;
    const newStatus = capture.status === 'archived' ? 'open' : 'archived';
    const label = newStatus === 'archived' ? 'Archive' : 'Unarchive';

    Alert.alert(label, `${label} this quick capture?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: label,
        onPress: async () => {
          const { error } = await updateQuickCapture(captureId, {
            status: newStatus,
          });
          if (error) {
            Alert.alert('Error', error.message);
          } else {
            onUpdate();
            await loadData();
          }
        },
      },
    ]);
  };

  const handleConvertToLead = () => {
    if (!capture) return;
    const fullName = [capture.first_name, capture.last_name].filter(Boolean).join(' ');
    Alert.alert(
      'Convert to Lead',
      `This will create a new lead from "${fullName}" and mark this capture as converted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Convert',
          onPress: async () => {
            const { leadId, error } = await convertQuickCaptureToLead(captureId, userId);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              Alert.alert('Success', 'Lead created successfully!');
              onUpdate();
              await loadData();
            }
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Quick Capture',
      'This will permanently delete this capture and all its attachments. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteQuickCapture(captureId);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              onUpdate();
              onBack();
            }
          },
        },
      ]
    );
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

  const handleCall = () => {
    if (capture?.phone) {
      Linking.openURL(`tel:${capture.phone}`);
    }
  };

  const handleEmail = () => {
    if (capture?.email) {
      Linking.openURL(`mailto:${capture.email}`);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  if (!capture) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorLabel}>Capture not found</Text>
        <TouchableOpacity onPress={onBack} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {[capture.first_name, capture.last_name].filter(Boolean).join(' ')}
        </Text>
        {editing ? (
          <View style={styles.headerBtn} />
        ) : (
          <TouchableOpacity
            onPress={() => setEditing(true)}
            style={styles.headerBtn}
          >
            <Ionicons name="create-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Status badge */}
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  capture.status === 'open'
                    ? '#ECFDF5'
                    : capture.status === 'converted'
                    ? '#F5F3FF'
                    : '#F3F4F6',
              },
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                {
                  color:
                    capture.status === 'open'
                      ? '#059669'
                      : capture.status === 'converted'
                      ? '#7C3AED'
                      : '#6B7280',
                },
              ]}
            >
              {capture.status.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.dateText}>
            Created {new Date(capture.created_at).toLocaleDateString()}
          </Text>
        </View>

        {/* Fields */}
        {editing ? (
          <>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>
                First Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Last Name</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                style={styles.input}
                value={formatPhoneDisplay(phone)}
                onChangeText={(t) => setPhone(t.replace(/\D/g, ''))}
                keyboardType="phone-pad"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Link Realtor</Text>
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
                    realtorId && { color: '#111827', fontWeight: '500' },
                  ]}
                  numberOfLines={1}
                >
                  {realtorName || 'Select a realtor...'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </>
        ) : (
          <>
            {/* Read-only view */}
            <View style={styles.infoSection}>
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={18} color="#7C3AED" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Name</Text>
                  <Text style={styles.infoValue}>
                    {[capture.first_name, capture.last_name].filter(Boolean).join(' ')}
                  </Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={18} color="#7C3AED" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Phone</Text>
                  {capture.phone ? (
                    <TouchableOpacity onPress={handleCall}>
                      <Text style={[styles.infoValue, { color: '#7C3AED' }]}>
                        {formatPhoneDisplay(capture.phone)}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.infoEmpty}>Not provided</Text>
                  )}
                </View>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="mail-outline" size={18} color="#7C3AED" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Email</Text>
                  {capture.email ? (
                    <TouchableOpacity onPress={handleEmail}>
                      <Text style={[styles.infoValue, { color: '#7C3AED' }]}>
                        {capture.email}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.infoEmpty}>Not provided</Text>
                  )}
                </View>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="business-outline" size={18} color="#7C3AED" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Linked Realtor</Text>
                  {realtorName ? (
                    <TouchableOpacity
                      onPress={() =>
                        capture.realtor_id && onRealtorPress?.(capture.realtor_id)
                      }
                      disabled={!onRealtorPress || !capture.realtor_id}
                    >
                      <Text style={[styles.infoValue, onRealtorPress && capture.realtor_id ? { color: '#7C3AED' } : {}]}>
                        {realtorName}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.infoEmpty}>None</Text>
                  )}
                </View>
              </View>
            </View>

            {/* Notes */}
            {capture.notes ? (
              <View style={styles.notesSection}>
                <Text style={styles.sectionLabel}>Notes</Text>
                <Text style={styles.notesText}>{capture.notes}</Text>
              </View>
            ) : null}
          </>
        )}

        {/* Attachments */}
        <View style={styles.attachmentsSection}>
          <QuickCaptureAttachmentStrip
            uploadedAttachments={uploadedAttachments}
            localAttachments={localAttachments}
            onAddPress={handleAddPhoto}
            onRemoveLocal={removeLocal}
            onRemoveUploaded={removeUploaded}
            editable={editing}
          />
        </View>

        {/* Converted banner */}
        {capture.status === 'converted' && (
          <View style={styles.convertedBanner}>
            <Ionicons name="checkmark-circle" size={20} color="#059669" />
            <Text style={styles.convertedBannerText}>Converted to Lead</Text>
          </View>
        )}

        {/* Action buttons (non-edit mode) */}
        {!editing && (
          <View style={styles.actionsWrapper}>
            {capture.status !== 'converted' && (
              <TouchableOpacity
                style={[styles.convertBtn]}
                onPress={handleConvertToLead}
              >
                <Ionicons name="arrow-forward-circle-outline" size={20} color="#FFFFFF" />
                <Text style={styles.convertBtnText}>Convert to Lead</Text>
              </TouchableOpacity>
            )}
            <View style={styles.actionsSection}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => setEditing(true)}
              >
                <Ionicons name="create-outline" size={18} color="#7C3AED" />
                <Text style={styles.actionBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handleArchiveToggle}
              >
                <Ionicons
                  name={
                    capture.status === 'archived'
                      ? 'arrow-undo-outline'
                      : 'archive-outline'
                  }
                  size={18}
                  color="#6B7280"
                />
                <Text style={[styles.actionBtnText, { color: '#6B7280' }]}>
                  {capture.status === 'archived' ? 'Unarchive' : 'Archive'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handleDelete}
              >
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Edit mode footer */}
      {editing && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => {
              setEditing(false);
              // Reset fields to capture values
              if (capture) {
                setFirstName(capture.first_name);
                setLastName(capture.last_name || '');
                setPhone(capture.phone || '');
                setEmail(capture.email || '');
                setNotes(capture.notes || '');
                setRealtorId(capture.realtor_id);
              }
            }}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving || uploading}
          >
            {saving || uploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            )}
            <Text style={styles.saveText}>
              {saving ? 'Saving...' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Realtor picker */}
      <SelectRealtorModal
        visible={showRealtorPicker}
        userId={userId}
        selectedRealtorId={realtorId}
        onSelect={handleRealtorSelect}
        onClose={() => setShowRealtorPicker(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  errorLabel: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 12,
  },
  backLink: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  backLinkText: {
    fontSize: 15,
    color: '#7C3AED',
    fontWeight: '600',
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
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 20,
    paddingBottom: 40,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dateText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
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
  infoSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    color: '#111827',
  },
  infoEmpty: {
    fontSize: 14,
    color: '#D1D5DB',
    fontStyle: 'italic',
  },
  notesSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  notesText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  attachmentsSection: {
    marginBottom: 16,
  },
  convertedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  convertedBannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
  },
  actionsWrapper: {
    gap: 12,
    marginTop: 8,
  },
  actionsSection: {
    flexDirection: 'row',
    gap: 12,
  },
  convertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
  },
  convertBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7C3AED',
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

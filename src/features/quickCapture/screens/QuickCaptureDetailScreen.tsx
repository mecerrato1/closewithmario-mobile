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
  Modal,
  FlatList,
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
import { findMatchingLeads, searchLeads, mergeIntoExistingLead, type MatchedLead } from '../services/leadMatchService';
import LeadMergeView from '../components/LeadMergeView';

const PLUM = '#4C1D95';

interface QuickCaptureDetailScreenProps {
  captureId: string;
  userId: string;
  onBack: () => void;
  onUpdate: () => void;
  onRealtorPress?: (realtorId: string) => void;
  onNavigateToLead?: (leadId: string, source: 'lead' | 'meta') => void;
}

export default function QuickCaptureDetailScreen({
  captureId,
  userId,
  onBack,
  onUpdate,
  onRealtorPress,
  onNavigateToLead,
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
  const [loanType, setLoanType] = useState<'purchase' | 'refinance' | null>(null);

  // Merge flow state
  const [showMatchesModal, setShowMatchesModal] = useState(false);
  const [matchedLeads, setMatchedLeads] = useState<MatchedLead[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchedLead | null>(null);
  const [showMergeView, setShowMergeView] = useState(false);
  const [merging, setMerging] = useState(false);
  // Link to existing lead (manual search)
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MatchedLead[]>([]);
  const [searching, setSearching] = useState(false);

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
      setLoanType(c.loan_type ?? null);
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
        loan_type: loanType,
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

  const handleConvertToLead = async () => {
    if (!capture) return;

    // Check for duplicates first
    setCheckingDuplicates(true);
    const { matches, error: matchError } = await findMatchingLeads(capture);
    setCheckingDuplicates(false);

    if (matchError) {
      console.error('[convert] duplicate check failed:', matchError);
      // Fall through to normal convert if duplicate check fails
    }

    if (matches.length > 0) {
      // Duplicates found — show options
      setMatchedLeads(matches);
      setShowMatchesModal(true);
      return;
    }

    // No duplicates — proceed with normal convert
    confirmCreateNewLead();
  };

  const confirmCreateNewLead = () => {
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

  const handleSelectMatch = (match: MatchedLead) => {
    setSelectedMatch(match);
    setShowMatchesModal(false);
    setShowSearchModal(false);
    setShowMergeView(true);
  };

  const handleMerge = async (fieldsToUpdate: Record<string, any>) => {
    if (!capture || !selectedMatch) return;
    setMerging(true);
    const { error } = await mergeIntoExistingLead(
      captureId,
      selectedMatch.id,
      selectedMatch.source,
      fieldsToUpdate
    );
    setMerging(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setShowMergeView(false);
      setSelectedMatch(null);
      Alert.alert('Success', 'Lead updated and capture marked as converted!');
      onUpdate();
      await loadData();
    }
  };

  const handleSearchLeads = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const { results } = await searchLeads(query.trim());
    setSearchResults(results);
    setSearching(false);
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
        <ActivityIndicator size="large" color={PLUM} />
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
                      ? PLUM
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
              <Text style={styles.fieldLabel}>Loan Type</Text>
              <View style={styles.segmentedRow}>
                {([null, 'purchase', 'refinance'] as const).map((val) => {
                  const label = val === null ? 'Not Set' : val === 'purchase' ? 'Purchase' : 'Refinance';
                  const active = loanType === val;
                  return (
                    <TouchableOpacity
                      key={label}
                      style={[styles.segmentedBtn, active && styles.segmentedBtnActive]}
                      onPress={() => setLoanType(val)}
                    >
                      <Text style={[styles.segmentedText, active && styles.segmentedTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
                  color={realtorId ? PLUM : '#9CA3AF'}
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
                <Ionicons name="person-outline" size={18} color={PLUM} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Name</Text>
                  <Text style={styles.infoValue}>
                    {[capture.first_name, capture.last_name].filter(Boolean).join(' ')}
                  </Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={18} color={PLUM} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Phone</Text>
                  {capture.phone ? (
                    <TouchableOpacity onPress={handleCall}>
                      <Text style={[styles.infoValue, { color: PLUM }]}>
                        {formatPhoneDisplay(capture.phone)}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.infoEmpty}>Not provided</Text>
                  )}
                </View>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="mail-outline" size={18} color={PLUM} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Email</Text>
                  {capture.email ? (
                    <TouchableOpacity onPress={handleEmail}>
                      <Text style={[styles.infoValue, { color: PLUM }]}>
                        {capture.email}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.infoEmpty}>Not provided</Text>
                  )}
                </View>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="home-outline" size={18} color={PLUM} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Loan Type</Text>
                  {capture.loan_type ? (
                    <Text style={styles.infoValue}>
                      {capture.loan_type === 'purchase' ? 'Purchase' : 'Refinance'}
                    </Text>
                  ) : (
                    <Text style={styles.infoEmpty}>Not set</Text>
                  )}
                </View>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="business-outline" size={18} color={PLUM} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Linked Realtor</Text>
                  {realtorName ? (
                    <TouchableOpacity
                      onPress={() =>
                        capture.realtor_id && onRealtorPress?.(capture.realtor_id)
                      }
                      disabled={!onRealtorPress || !capture.realtor_id}
                    >
                      <Text style={[styles.infoValue, onRealtorPress && capture.realtor_id ? { color: PLUM } : {}]}>
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
          <TouchableOpacity
            style={styles.convertedBanner}
            activeOpacity={onNavigateToLead && (capture.converted_lead_id || capture.converted_meta_ad_id) ? 0.7 : 1}
            onPress={() => {
              if (!onNavigateToLead) return;
              if (capture.converted_lead_id) {
                onNavigateToLead(capture.converted_lead_id, 'lead');
              } else if (capture.converted_meta_ad_id) {
                onNavigateToLead(capture.converted_meta_ad_id, 'meta');
              }
            }}
          >
            <Ionicons name="checkmark-circle" size={20} color="#059669" />
            <Text style={[styles.convertedBannerText, { flex: 1 }]}>
              {capture.converted_meta_ad_id ? 'Merged into Meta Ad Lead' : 'Converted to Lead'}
            </Text>
            {(capture.converted_lead_id || capture.converted_meta_ad_id) && onNavigateToLead && (
              <Ionicons name="chevron-forward" size={16} color="#059669" />
            )}
          </TouchableOpacity>
        )}

        {/* Action buttons (non-edit mode) */}
        {!editing && (
          <View style={styles.actionsWrapper}>
            {capture.status !== 'converted' && (
              <>
                <TouchableOpacity
                  style={[styles.convertBtn, checkingDuplicates && { opacity: 0.6 }]}
                  onPress={handleConvertToLead}
                  disabled={checkingDuplicates}
                >
                  {checkingDuplicates ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="arrow-forward-circle-outline" size={20} color="#FFFFFF" />
                  )}
                  <Text style={styles.convertBtnText}>
                    {checkingDuplicates ? 'Checking...' : 'Convert to Lead'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.linkExistingBtn}
                  onPress={() => setShowSearchModal(true)}
                >
                  <Ionicons name="link-outline" size={20} color={PLUM} />
                  <Text style={styles.linkExistingBtnText}>Link to Existing Lead</Text>
                </TouchableOpacity>
              </>
            )}
            <View style={styles.actionsSection}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => setEditing(true)}
              >
                <Ionicons name="create-outline" size={18} color={PLUM} />
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
                setLoanType(capture.loan_type ?? null);
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

      {/* Duplicate matches modal (shown on convert when matches found) */}
      <Modal
        visible={showMatchesModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMatchesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Existing Lead Found</Text>
              <TouchableOpacity onPress={() => setShowMatchesModal(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Would you like to merge into the existing lead listed below?
            </Text>
            <FlatList
              data={matchedLeads}
              keyExtractor={(item) => `${item.source}_${item.id}`}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => {
                const name = [item.first_name, item.last_name].filter(Boolean).join(' ') || 'Unknown';
                const capPhone = capture?.phone ? capture.phone.replace(/\D/g, '').slice(-10) : '';
                const matchPhone = item.phone ? item.phone.replace(/\D/g, '').slice(-10) : '';
                const phoneMismatch = capPhone && matchPhone && capPhone !== matchPhone;
                const emailMismatch = capture?.email && item.email &&
                  capture.email.trim().toLowerCase() !== item.email.trim().toLowerCase();
                const nameMismatch = capture &&
                  ([capture.first_name, capture.last_name].filter(Boolean).join(' ').toLowerCase() !==
                   [item.first_name, item.last_name].filter(Boolean).join(' ').toLowerCase());
                const hasMismatch = phoneMismatch || emailMismatch || nameMismatch;
                return (
                  <TouchableOpacity
                    style={[styles.matchRow, hasMismatch && styles.matchRowWarning]}
                    onPress={() => handleSelectMatch(item)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.matchName}>{name}</Text>
                      <Text style={styles.matchDetail}>
                        {item.source === 'meta' ? 'Meta Ad' : 'Lead'} · {item.matchReason}
                        {item.phone ? ` · ${item.phone}` : ''}
                      </Text>
                      {item.status && (
                        <Text style={styles.matchStatus}>{item.status}</Text>
                      )}
                      {hasMismatch && (
                        <View style={styles.mismatchBadge}>
                          <Ionicons name="warning-outline" size={13} color="#D97706" />
                          <Text style={styles.mismatchText}>
                            {[
                              phoneMismatch && `Phone: ${capture?.phone || '—'} vs ${item.phone || '—'}`,
                              emailMismatch && `Email differs`,
                              nameMismatch && `Name differs`,
                            ].filter(Boolean).join(' · ')}
                            {' — review before merging'}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity
              style={styles.createNewBtn}
              onPress={() => {
                setShowMatchesModal(false);
                confirmCreateNewLead();
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color="#10B981" />
              <Text style={styles.createNewBtnText}>Create New Lead Instead</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Search modal (Link to Existing Lead) */}
      <Modal
        visible={showSearchModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowSearchModal(false);
          setSearchQuery('');
          setSearchResults([]);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Link to Existing Lead</Text>
              <TouchableOpacity onPress={() => {
                setShowSearchModal(false);
                setSearchQuery('');
                setSearchResults([]);
              }}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Search for an existing lead to merge this capture into.
            </Text>
            <View style={styles.searchInputWrapper}>
              <Ionicons name="search" size={18} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name, phone, or email..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={handleSearchLeads}
                autoFocus
              />
              {searching && <ActivityIndicator size="small" color={PLUM} />}
            </View>
            <FlatList
              data={searchResults}
              keyExtractor={(item) => `${item.source}_${item.id}`}
              style={{ maxHeight: 350 }}
              ListEmptyComponent={
                searchQuery.length >= 2 && !searching ? (
                  <Text style={styles.emptySearchText}>No leads found</Text>
                ) : null
              }
              renderItem={({ item }) => {
                const name = [item.first_name, item.last_name].filter(Boolean).join(' ') || 'Unknown';
                return (
                  <TouchableOpacity
                    style={styles.matchRow}
                    onPress={() => handleSelectMatch(item)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.matchName}>{name}</Text>
                      <Text style={styles.matchDetail}>
                        {item.source === 'meta' ? 'Meta Ad' : 'Lead'}
                        {item.phone ? ` · ${item.phone}` : ''}
                        {item.email ? ` · ${item.email}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* Merge view modal */}
      <Modal
        visible={showMergeView}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowMergeView(false);
          setSelectedMatch(null);
        }}
      >
        <View style={styles.modalOverlay}>
          {capture && selectedMatch && (
            <LeadMergeView
              capture={capture}
              existingLead={selectedMatch}
              onMerge={handleMerge}
              onCancel={() => {
                setShowMergeView(false);
                setSelectedMatch(null);
              }}
              merging={merging}
            />
          )}
        </View>
      </Modal>
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
    color: PLUM,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: PLUM,
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
  segmentedRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentedBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  segmentedBtnActive: {
    backgroundColor: PLUM,
    borderColor: PLUM,
  },
  segmentedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  segmentedTextActive: {
    color: '#FFFFFF',
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
    backgroundColor: PLUM,
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
    color: PLUM,
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
    backgroundColor: PLUM,
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
  // Link to Existing Lead button
  linkExistingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: PLUM,
    backgroundColor: '#F5F3FF',
  },
  linkExistingBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: PLUM,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 16,
  },
  // Match row styles
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
    backgroundColor: '#F9FAFB',
  },
  matchName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  matchDetail: {
    fontSize: 12,
    color: '#6B7280',
  },
  matchStatus: {
    fontSize: 11,
    fontWeight: '500',
    color: PLUM,
    marginTop: 2,
  },
  createNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    backgroundColor: '#ECFDF5',
    marginTop: 8,
  },
  createNewBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  // Search modal styles
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: '#F9FAFB',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
  },
  matchRowWarning: {
    borderColor: '#FBBF24',
    backgroundColor: '#FFFBEB',
  },
  mismatchBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginTop: 6,
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  mismatchText: {
    fontSize: 11,
    color: '#92400E',
    flex: 1,
    lineHeight: 15,
  },
  emptySearchText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#9CA3AF',
    paddingVertical: 20,
  },
});

// src/screens/realtors/AddRealtorScreen.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../styles/theme';
import { createRealtorAndAssign, fetchBrokerages } from '../../lib/supabase/realtors';
import { RelationshipStage, STAGE_CONFIG, LanguageCode, LANGUAGE_OPTIONS } from '../../lib/types/realtors';
import { formatPhoneNumber } from '../../lib/textTemplates';

interface AddRealtorScreenProps {
  userId: string;
  onBack: () => void;
  onSuccess: () => void;
}

const STAGES: RelationshipStage[] = ['hot', 'warm', 'cold'];

export default function AddRealtorScreen({ userId, onBack, onSuccess }: AddRealtorScreenProps) {
  const { colors } = useThemeColors();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [brokerage, setBrokerage] = useState('');
  const [notes, setNotes] = useState('');
  const [stage, setStage] = useState<RelationshipStage>('warm');
  const [saving, setSaving] = useState(false);
  
  // New fields
  const [active, setActive] = useState(true);
  const [campaignEligible, setCampaignEligible] = useState(true);
  const [emailOptOut, setEmailOptOut] = useState(false);
  const [primaryLanguage, setPrimaryLanguage] = useState<LanguageCode>('en');
  const [secondaryLanguage, setSecondaryLanguage] = useState<LanguageCode | 'none'>('none');

  // Brokerage autocomplete
  const [allBrokerages, setAllBrokerages] = useState<string[]>([]);
  const [showBrokerageSuggestions, setShowBrokerageSuggestions] = useState(false);

  // Language picker modals
  const [showPrimaryLanguagePicker, setShowPrimaryLanguagePicker] = useState(false);
  const [showSecondaryLanguagePicker, setShowSecondaryLanguagePicker] = useState(false);

  // Fetch brokerages on mount
  useEffect(() => {
    const loadBrokerages = async () => {
      const { data } = await fetchBrokerages();
      if (data) {
        setAllBrokerages(data);
      }
    };
    loadBrokerages();
  }, []);

  // Filter brokerages based on input
  const filteredBrokerages = useMemo(() => {
    if (!brokerage.trim()) return allBrokerages;
    const searchLower = brokerage.toLowerCase();
    return allBrokerages.filter((b) => b.toLowerCase().includes(searchLower));
  }, [brokerage, allBrokerages]);

  // Validation helpers
  const isValidEmail = (emailStr: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(emailStr.trim());
  };

  const isValidPhone = (phoneStr: string) => {
    const digits = phoneStr.replace(/\D/g, '');
    return digits.length === 10;
  };

  // All required fields must be filled
  const isValid = 
    firstName.trim().length > 0 && 
    lastName.trim().length > 0 && 
    email.trim().length > 0 &&
    phone.trim().length > 0 &&
    brokerage.trim().length > 0 &&
    primaryLanguage.length > 0 &&
    isValidEmail(email) &&
    isValidPhone(phone);

  const handleSave = async () => {
    // Check required fields
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim() || !brokerage.trim()) {
      Alert.alert('Missing Fields', 'Please fill in all required fields: First Name, Last Name, Email, Phone, and Brokerage.');
      return;
    }

    // Validate email format
    if (!isValidEmail(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    // Validate phone format (10 digits)
    if (!isValidPhone(phone)) {
      Alert.alert('Invalid Phone', 'Please enter a valid 10-digit phone number.');
      return;
    }

    setSaving(true);
    const { data, error } = await createRealtorAndAssign(userId, {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      phone: phone.replace(/\D/g, '') || undefined, // Strip formatting, save digits only
      brokerage: brokerage.trim() || undefined,
      active,
      campaign_eligible: campaignEligible,
      email_opt_out: emailOptOut,
      preferred_language: primaryLanguage,
      secondary_language: secondaryLanguage === 'none' ? null : secondaryLanguage,
      notes: notes.trim() || undefined,
      relationship_stage: stage,
    });
    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message || 'Failed to create realtor');
    } else {
      onSuccess();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBackground }]}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Realtor</Text>
        <TouchableOpacity
          style={[styles.saveHeaderButton, !isValid && styles.saveHeaderButtonDisabled]}
          onPress={handleSave}
          disabled={!isValid || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveHeaderButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Name Section */}
          <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Contact Information
            </Text>

            <View style={styles.row}>
              <View style={styles.inputHalf}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  First Name <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="John"
                  placeholderTextColor={colors.textSecondary}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Last Name <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="Smith"
                  placeholderTextColor={colors.textSecondary}
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.inputFull}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Email <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="john@example.com"
                placeholderTextColor={colors.textSecondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Text style={[styles.helperText, { color: '#7C3AED' }]}>
                Email is required for realtors
              </Text>
            </View>

            <View style={styles.inputFull}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Phone <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="(555) 123-4567"
                placeholderTextColor={colors.textSecondary}
                value={phone}
                onChangeText={(text) => {
                  // Format phone as user types
                  const digits = text.replace(/\D/g, '');
                  setPhone(formatPhoneNumber(digits) || digits);
                }}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputFull}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Brokerage <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Type to search or enter new..."
                placeholderTextColor={colors.textSecondary}
                value={brokerage}
                onChangeText={(text) => {
                  setBrokerage(text);
                  setShowBrokerageSuggestions(true);
                }}
                onFocus={() => setShowBrokerageSuggestions(true)}
                autoCapitalize="words"
              />
              {/* Brokerage Suggestions Dropdown */}
              {showBrokerageSuggestions && allBrokerages.length > 0 && (
                <View style={[styles.suggestionsContainer, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                  <Text style={[styles.suggestionsLabel, { color: colors.textSecondary }]}>
                    Select existing brokerage:
                  </Text>
                  {filteredBrokerages.slice(0, 10).map((b) => (
                    <TouchableOpacity
                      key={b}
                      style={[styles.suggestionItem, { borderBottomColor: colors.border }]}
                      onPress={() => {
                        setBrokerage(b);
                        setShowBrokerageSuggestions(false);
                      }}
                    >
                      <Text style={[styles.suggestionText, { color: colors.textPrimary }]}>{b}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={styles.dismissSuggestions}
                    onPress={() => setShowBrokerageSuggestions(false)}
                  >
                    <Text style={[styles.dismissText, { color: colors.textSecondary }]}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Settings Section */}
          <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            {/* Active Toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <View style={styles.toggleIconContainer}>
                  <Ionicons name="checkmark-circle" size={20} color={active ? '#10B981' : colors.textSecondary} />
                </View>
                <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>Active</Text>
              </View>
              <Switch
                value={active}
                onValueChange={setActive}
                trackColor={{ false: colors.border, true: '#7C3AED' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Campaign Eligible Toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <View style={styles.toggleIconContainer}>
                  <Ionicons name="mail" size={20} color={campaignEligible ? '#7C3AED' : colors.textSecondary} />
                </View>
                <View style={styles.toggleTextContainer}>
                  <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>Eligible for email campaigns</Text>
                  <Text style={[styles.toggleHelper, { color: colors.textSecondary }]}>
                    When checked, this realtor will receive email campaigns sent to realtors.
                  </Text>
                </View>
              </View>
              <Switch
                value={campaignEligible}
                onValueChange={setCampaignEligible}
                trackColor={{ false: colors.border, true: '#7C3AED' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Email Opt Out Toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <View style={styles.toggleIconContainer}>
                  <Ionicons name="close-circle" size={20} color={emailOptOut ? '#DC2626' : colors.textSecondary} />
                </View>
                <View style={styles.toggleTextContainer}>
                  <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>Unsubscribed from emails</Text>
                  <Text style={[styles.toggleHelper, { color: colors.textSecondary }]}>
                    When checked, this realtor is unsubscribed and will NOT receive email campaigns.
                  </Text>
                </View>
              </View>
              <Switch
                value={emailOptOut}
                onValueChange={setEmailOptOut}
                trackColor={{ false: colors.border, true: '#DC2626' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          {/* Languages Section */}
          <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={styles.languageHeader}>
              <Ionicons name="globe-outline" size={20} color="#7C3AED" />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0, marginLeft: 8 }]}>
                Languages
              </Text>
            </View>
            <Text style={[styles.languageHelper, { color: colors.textSecondary }]}>
              Primary language is English. Select a secondary language if applicable.
            </Text>
            
            <View style={styles.languageRow}>
              <View style={styles.languagePickerContainer}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Primary <Text style={styles.required}>*</Text>
                </Text>
                <TouchableOpacity
                  style={[styles.languageButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                  onPress={() => setShowPrimaryLanguagePicker(true)}
                >
                  <Text style={[styles.languageButtonText, { color: colors.textPrimary }]}>
                    {LANGUAGE_OPTIONS.find(o => o.value === primaryLanguage)?.label || 'English'}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={styles.languagePickerContainer}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Secondary</Text>
                <TouchableOpacity
                  style={[styles.languageButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                  onPress={() => setShowSecondaryLanguagePicker(true)}
                >
                  <Text style={[styles.languageButtonText, { color: colors.textPrimary }]}>
                    {LANGUAGE_OPTIONS.find(o => o.value === secondaryLanguage)?.label || 'None'}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Primary Language Picker Modal */}
          <Modal visible={showPrimaryLanguagePicker} transparent animationType="fade">
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setShowPrimaryLanguagePicker(false)}
            >
              <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Select Primary Language</Text>
                {LANGUAGE_OPTIONS.filter(opt => opt.value !== 'none').map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.modalOption,
                      { borderBottomColor: colors.border },
                      primaryLanguage === opt.value && styles.modalOptionSelected,
                    ]}
                    onPress={() => {
                      setPrimaryLanguage(opt.value as LanguageCode);
                      setShowPrimaryLanguagePicker(false);
                    }}
                  >
                    <Text style={[
                      styles.modalOptionText,
                      { color: primaryLanguage === opt.value ? '#7C3AED' : colors.textPrimary },
                    ]}>
                      {opt.label}
                    </Text>
                    {primaryLanguage === opt.value && (
                      <Ionicons name="checkmark" size={20} color="#7C3AED" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Secondary Language Picker Modal */}
          <Modal visible={showSecondaryLanguagePicker} transparent animationType="fade">
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setShowSecondaryLanguagePicker(false)}
            >
              <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Select Secondary Language</Text>
                {LANGUAGE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.modalOption,
                      { borderBottomColor: colors.border },
                      secondaryLanguage === opt.value && styles.modalOptionSelected,
                    ]}
                    onPress={() => {
                      setSecondaryLanguage(opt.value as LanguageCode | 'none');
                      setShowSecondaryLanguagePicker(false);
                    }}
                  >
                    <Text style={[
                      styles.modalOptionText,
                      { color: secondaryLanguage === opt.value ? '#7C3AED' : colors.textPrimary },
                    ]}>
                      {opt.label}
                    </Text>
                    {secondaryLanguage === opt.value && (
                      <Ionicons name="checkmark" size={20} color="#7C3AED" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Relationship Stage */}
          <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Relationship Stage
            </Text>
            <View style={styles.stageButtons}>
              {STAGES.map((s) => {
                const config = STAGE_CONFIG[s];
                const isSelected = stage === s;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.stageButton,
                      { borderColor: colors.border },
                      isSelected && { backgroundColor: config.bgColor, borderColor: config.color },
                    ]}
                    onPress={() => setStage(s)}
                  >
                    <Text
                      style={[
                        styles.stageButtonText,
                        { color: isSelected ? config.color : colors.textSecondary },
                      ]}
                    >
                      {config.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Notes */}
          <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Notes</Text>
            <TextInput
              style={[
                styles.notesInput,
                { color: colors.textPrimary, borderColor: colors.border },
              ]}
              placeholder="Add any notes about this realtor..."
              placeholderTextColor={colors.textSecondary}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, (!isValid || saving) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!isValid || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Add Realtor</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  saveHeaderButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  saveHeaderButtonDisabled: {
    opacity: 0.5,
  },
  saveHeaderButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  section: {
    margin: 16,
    marginBottom: 0,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  inputHalf: {
    flex: 1,
    marginBottom: 12,
  },
  inputFull: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  required: {
    color: '#DC2626',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  stageButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  stageButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  stageButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: 12,
  },
  toggleIconContainer: {
    width: 24,
    marginRight: 12,
  },
  toggleTextContainer: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  toggleHelper: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  languageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  languageHelper: {
    fontSize: 13,
    marginBottom: 16,
  },
  languageRow: {
    flexDirection: 'row',
    gap: 12,
  },
  languagePickerContainer: {
    flex: 1,
  },
  pickerWrapper: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  // Brokerage suggestions styles
  suggestionsContainer: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
  suggestionsLabel: {
    fontSize: 12,
    marginBottom: 8,
  },
  suggestionItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  suggestionText: {
    fontSize: 15,
  },
  dismissSuggestions: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  dismissText: {
    fontSize: 13,
  },
  // Language button styles
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  languageButtonText: {
    fontSize: 15,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalOptionSelected: {
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
  },
  modalOptionText: {
    fontSize: 16,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    fontSize: 14,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7C3AED',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 32,
  },
});

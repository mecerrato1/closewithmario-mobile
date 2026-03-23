import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
  Alert,
  Image,
  ScrollView,
  ActivityIndicator,
  BackHandler,
  TextInput,
  Switch,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { useThemeColors } from '../styles/theme';
import { supabase } from '../lib/supabase';
import { getUserTeamMemberId, type UserRole } from '../lib/roles';
import {
  requestMediaLibraryPermission,
  pickProfileImage,
  uploadProfilePicture,
  removeCustomProfilePicture,
  getAvatarUrl,
} from '../utils/profilePicture';

const LANGUAGE_MAP: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  ht: 'Creole',
  zh: 'Chinese',
  // Also support full names already in DB
  English: 'English',
  Spanish: 'Spanish',
  Portuguese: 'Portuguese',
  French: 'French',
  Creole: 'Creole',
  Chinese: 'Chinese',
};

const LANGUAGE_CODE_MAP: Record<string, string> = {
  English: 'en',
  Spanish: 'es',
  Portuguese: 'pt',
  French: 'fr',
  Creole: 'ht',
  Chinese: 'zh',
};

const LANGUAGE_OPTIONS = ['None', 'English', 'Spanish', 'Portuguese', 'French', 'Creole', 'Chinese'];

const toLangDisplay = (val: string | null): string => {
  if (!val) return 'None';
  return LANGUAGE_MAP[val] || val;
};

const toLangCode = (display: string): string | null => {
  if (display === 'None') return null;
  return LANGUAGE_CODE_MAP[display] || display;
};

const formatPhoneDisplay = (raw: string | null): string => {
  if (!raw) return '';
  const cleaned = raw.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return raw;
};

const stripPhoneFormatting = (formatted: string): string => {
  return formatted.replace(/\D/g, '');
};

const formatPhoneAsYouType = (text: string): string => {
  const digits = text.replace(/\D/g, '');
  if (digits.length <= 3) return digits.length > 0 ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
};

const isValidEmail = (val: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
};

const isValidPhone = (val: string): boolean => {
  const digits = val.replace(/\D/g, '');
  return digits.length === 10;
};

const FLORIDA_COUNTIES = [
  'Alachua', 'Baker', 'Bay', 'Bradford', 'Brevard', 'Broward', 'Calhoun',
  'Charlotte', 'Citrus', 'Clay', 'Collier', 'Columbia', 'DeSoto', 'Dixie',
  'Duval', 'Escambia', 'Flagler', 'Franklin', 'Gadsden', 'Gilchrist',
  'Glades', 'Gulf', 'Hamilton', 'Hardee', 'Hendry', 'Hernando', 'Highlands',
  'Hillsborough', 'Holmes', 'Indian River', 'Jackson', 'Jefferson', 'Lafayette',
  'Lake', 'Lee', 'Leon', 'Levy', 'Liberty', 'Madison', 'Manatee', 'Marion',
  'Martin', 'Miami-Dade', 'Monroe', 'Nassau', 'Okaloosa', 'Okeechobee',
  'Orange', 'Osceola', 'Palm Beach', 'Pasco', 'Pinellas', 'Polk', 'Putnam',
  'Santa Rosa', 'Sarasota', 'Seminole', 'St. Johns', 'St. Lucie', 'Sumter',
  'Suwannee', 'Taylor', 'Union', 'Volusia', 'Wakulla', 'Walton', 'Washington',
];

type ProfileSettingsScreenProps = {
  session: Session | null;
  onBack: () => void;
  onSignOut: () => void;
  realtorProfilePicUrl?: string | null;
  userRole?: UserRole;
};

export default function ProfileSettingsScreen({ session, onBack, onSignOut, realtorProfilePicUrl, userRole }: ProfileSettingsScreenProps) {
  const { colors } = useThemeColors();
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [realtorId, setRealtorId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [brokerage, setBrokerage] = useState('');
  const [primaryLanguage, setPrimaryLanguage] = useState('English');
  const [secondaryLanguage, setSecondaryLanguage] = useState('None');
  const [leadEligible, setLeadEligible] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showPrimaryLangPicker, setShowPrimaryLangPicker] = useState(false);
  const [showSecondaryLangPicker, setShowSecondaryLangPicker] = useState(false);
  const [countyFilter, setCountyFilter] = useState<string[]>([]);
  const [countyInput, setCountyInput] = useState('');
  const [loId, setLoId] = useState<string | null>(null);
  const [nmlsId, setNmlsId] = useState('');
  const [company, setCompany] = useState('');
  const [companyNmlsId, setCompanyNmlsId] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const avatarUrl = getAvatarUrl(session?.user?.user_metadata, realtorProfilePicUrl);
  const isRealtor = userRole === 'realtor';
  const isLoanOfficer = userRole === 'loan_officer';

  // Fetch realtor profile data
  const fetchRealtorProfile = useCallback(async () => {
    if (!isRealtor || !session?.user?.id) return;
    setLoadingProfile(true);
    try {
      const memberId = await getUserTeamMemberId(session.user.id, 'realtor');
      if (!memberId) return;
      setRealtorId(memberId);

      const { data } = await supabase
        .from('realtors')
        .select('first_name, last_name, email, phone, brokerage, preferred_language, secondary_language, lead_eligible, county_filter')
        .eq('id', memberId)
        .single();

      if (data) {
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
        setEmail(data.email || '');
        setPhone(formatPhoneDisplay(data.phone));
        setBrokerage(data.brokerage || '');
        setPrimaryLanguage(toLangDisplay(data.preferred_language));
        setSecondaryLanguage(toLangDisplay(data.secondary_language));
        setLeadEligible(!!data.lead_eligible);
        setCountyFilter(data.county_filter || []);
      }
    } catch (err) {
      console.error('Error fetching realtor profile:', err);
    } finally {
      setLoadingProfile(false);
    }
  }, [isRealtor, session?.user?.id]);

  useEffect(() => {
    fetchRealtorProfile();
  }, [fetchRealtorProfile]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });

    return () => subscription.remove();
  }, [onBack]);

  const handleSaveRealtorProfile = async () => {
    if (!realtorId) return;
    if (email.trim() && !isValidEmail(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (phone && !isValidPhone(phone)) {
      Alert.alert('Invalid Phone', 'Please enter a valid 10-digit phone number.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('realtors')
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone: stripPhoneFormatting(phone),
          brokerage: brokerage.trim(),
          preferred_language: toLangCode(primaryLanguage),
          secondary_language: toLangCode(secondaryLanguage),
          lead_eligible: leadEligible,
          county_filter: countyFilter.length > 0 ? countyFilter : null,
        })
        .eq('id', realtorId);

      if (error) {
        Alert.alert('Error', 'Failed to save profile. Please try again.');
        console.error('Error saving realtor profile:', error);
      } else {
        setHasChanges(false);
        Alert.alert('Success', 'Profile updated!');
      }
    } catch (err) {
      Alert.alert('Error', 'An unexpected error occurred.');
      console.error('Unexpected error saving realtor profile:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleLeadEligible = async (value: boolean) => {
    setLeadEligible(value);
    const tableId = isRealtor ? realtorId : loId;
    const table = isRealtor ? 'realtors' : 'loan_officers';
    if (!tableId) return;
    try {
      await supabase
        .from(table)
        .update({ lead_eligible: value })
        .eq('id', tableId);
    } catch (err) {
      console.error('Error updating lead_eligible:', err);
    }
  };

  // Fetch LO profile data
  const fetchLOProfile = useCallback(async () => {
    if (!isLoanOfficer || !session?.user?.id) return;
    setLoadingProfile(true);
    try {
      const memberId = await getUserTeamMemberId(session.user.id, 'loan_officer');
      if (!memberId) return;
      setLoId(memberId);

      const { data } = await supabase
        .from('loan_officers')
        .select('first_name, last_name, email, phone, nmls_id, company, company_nmls_id, preferred_language, secondary_language, lead_eligible')
        .eq('id', memberId)
        .single();

      if (data) {
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
        setEmail(data.email || '');
        setPhone(formatPhoneDisplay(data.phone));
        setNmlsId(data.nmls_id || '');
        setCompany(data.company || '');
        setCompanyNmlsId(data.company_nmls_id || '');
        setPrimaryLanguage(toLangDisplay(data.preferred_language));
        setSecondaryLanguage(toLangDisplay(data.secondary_language));
        setLeadEligible(!!data.lead_eligible);
      }
    } catch (err) {
      console.error('Error fetching LO profile:', err);
    } finally {
      setLoadingProfile(false);
    }
  }, [isLoanOfficer, session?.user?.id]);

  useEffect(() => {
    fetchLOProfile();
  }, [fetchLOProfile]);

  const handleSaveLOProfile = async () => {
    if (!loId) return;
    if (email.trim() && !isValidEmail(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (phone && !isValidPhone(phone)) {
      Alert.alert('Invalid Phone', 'Please enter a valid 10-digit phone number.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('loan_officers')
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone: stripPhoneFormatting(phone),
          nmls_id: nmlsId.trim(),
          company: company.trim(),
          company_nmls_id: companyNmlsId.trim(),
          preferred_language: toLangCode(primaryLanguage),
          secondary_language: toLangCode(secondaryLanguage),
          lead_eligible: leadEligible,
        })
        .eq('id', loId);

      if (error) {
        Alert.alert('Error', 'Failed to save profile. Please try again.');
        console.error('Error saving LO profile:', error);
      } else {
        setHasChanges(false);
        Alert.alert('Success', 'Profile updated!');
      }
    } catch (err) {
      Alert.alert('Error', 'An unexpected error occurred.');
      console.error('Unexpected error saving LO profile:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.toUpperCase() !== 'DELETE') {
      Alert.alert('Error', 'Please type DELETE exactly to confirm.');
      return;
    }

    setIsDeletingAccount(true);
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) {
        Alert.alert('Error', 'No active session. Please sign in again.');
        return;
      }

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentSession.access_token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to delete account');
      }

      setShowDeleteModal(false);
      Alert.alert('Account Deleted', 'Your account has been permanently deleted.');
      onSignOut();
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to delete account. Please try again.'
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleUploadProfilePicture = async () => {
    try {
      const hasPermission = await requestMediaLibraryPermission();
      if (!hasPermission) {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to upload a profile picture.',
          [{ text: 'OK' }]
        );
        return;
      }

      const result = await pickProfileImage();
      if (!result || result.canceled) return;

      setUploadingPicture(true);
      const uploadResult = await uploadProfilePicture(
        session?.user?.id || '',
        result.assets[0].uri
      );
      setUploadingPicture(false);

      if (uploadResult.success) {
        Alert.alert('Success', 'Profile picture updated!', [{ text: 'OK' }]);
      } else {
        Alert.alert('Error', uploadResult.error || 'Failed to upload picture', [{ text: 'OK' }]);
      }
    } catch {
      setUploadingPicture(false);
      Alert.alert('Error', 'An unexpected error occurred', [{ text: 'OK' }]);
    }
  };

  const handleRemoveProfilePicture = async () => {
    try {
      Alert.alert(
        'Remove Profile Picture',
        'Are you sure you want to remove your custom profile picture?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              setUploadingPicture(true);
              const result = await removeCustomProfilePicture(session?.user?.id || '');
              setUploadingPicture(false);

              if (result.success) {
                Alert.alert('Success', 'Profile picture removed', [{ text: 'OK' }]);
              } else {
                Alert.alert('Error', result.error || 'Failed to remove picture', [{ text: 'OK' }]);
              }
            },
          },
        ]
      );
    } catch {
      setUploadingPicture(false);
      Alert.alert('Error', 'An unexpected error occurred', [{ text: 'OK' }]);
    }
  };

  return (
    <SafeAreaView style={[localStyles.container, { backgroundColor: colors.background }]}>
      <View style={[localStyles.header, { borderBottomColor: colors.border }]}
      >
        <TouchableOpacity onPress={onBack} style={localStyles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          <Text style={[localStyles.backButtonText, { color: colors.textPrimary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[localStyles.headerTitle, { color: colors.textPrimary }]}>Profile Settings</Text>
        <View style={localStyles.headerRightSpacer} />
      </View>

      <ScrollView contentContainerStyle={localStyles.content}>
        <View style={[localStyles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[localStyles.sectionTitle, { color: colors.textPrimary }]}>Profile Picture</Text>

          <View style={localStyles.avatarRow}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={localStyles.avatar} />
            ) : (
              <View style={[localStyles.avatarPlaceholder, { backgroundColor: colors.border }]}>
                <Text style={[localStyles.avatarPlaceholderText, { color: colors.textPrimary }]}>
                  {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                </Text>
              </View>
            )}

            <View style={localStyles.avatarActions}>
              <TouchableOpacity
                style={[localStyles.primaryButton, { backgroundColor: '#7C3AED' }]}
                onPress={handleUploadProfilePicture}
                disabled={uploadingPicture}
              >
                {uploadingPicture ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={localStyles.primaryButtonText}>Change Picture</Text>
                )}
              </TouchableOpacity>

              {session?.user?.user_metadata?.custom_avatar_url ? (
                <TouchableOpacity
                  style={[localStyles.secondaryButton, { borderColor: colors.border }]}
                  onPress={handleRemoveProfilePicture}
                  disabled={uploadingPicture}
                >
                  <Text style={[localStyles.secondaryButtonText, { color: colors.textPrimary }]}>Remove Custom Picture</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        {/* Realtor Profile Fields */}
        {isRealtor && !loadingProfile && (
          <View style={[localStyles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            {/* Lead Participation */}
            <View style={localStyles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.sectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>Lead Participation</Text>
                <Text style={[localStyles.toggleSubtext, { color: colors.textSecondary }]}>
                  {leadEligible ? 'Receiving leads' : 'Not receiving leads'}
                </Text>
              </View>
              <Switch
                value={leadEligible}
                onValueChange={handleToggleLeadEligible}
                trackColor={{ false: '#D1D5DB', true: '#7C3AED' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Service Counties - only when lead eligible */}
            {leadEligible && (
              <View style={{ marginTop: 12 }}>
                <Text style={[localStyles.fieldLabel, { color: colors.textSecondary, marginTop: 0 }]}>Service Counties</Text>
                {countyFilter.length > 0 && (
                  <View style={localStyles.countyTags}>
                    {countyFilter.map((county) => (
                      <View key={county} style={localStyles.countyTag}>
                        <Text style={localStyles.countyTagText}>{county}</Text>
                        <TouchableOpacity
                          onPress={() => {
                            setCountyFilter(countyFilter.filter(c => c !== county));
                            setHasChanges(true);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={localStyles.countyTagRemove}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                <TextInput
                  style={[localStyles.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                  value={countyInput}
                  onChangeText={setCountyInput}
                  placeholder="Add another county..."
                  placeholderTextColor={colors.textSecondary}
                  returnKeyType="done"
                />
                {countyInput.trim().length > 0 && (
                  <View style={[localStyles.countySuggestions, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    {FLORIDA_COUNTIES
                      .filter(c =>
                        c.toLowerCase().includes(countyInput.trim().toLowerCase()) &&
                        !countyFilter.includes(c)
                      )
                      .slice(0, 6)
                      .map(county => (
                        <TouchableOpacity
                          key={county}
                          style={localStyles.countySuggestionItem}
                          onPress={() => {
                            setCountyFilter([...countyFilter, county]);
                            setCountyInput('');
                            setHasChanges(true);
                          }}
                        >
                          <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{county}</Text>
                        </TouchableOpacity>
                      ))
                    }
                    {FLORIDA_COUNTIES.filter(c =>
                      c.toLowerCase().includes(countyInput.trim().toLowerCase()) &&
                      !countyFilter.includes(c)
                    ).length === 0 && (
                      <View style={localStyles.countySuggestionItem}>
                        <Text style={{ color: colors.textSecondary, fontSize: 14 }}>No matching counties</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            <View style={localStyles.divider} />

            {/* Name Row */}
            <View style={localStyles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>First Name</Text>
                <TextInput
                  style={[localStyles.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                  value={firstName}
                  onChangeText={(t) => { setFirstName(t); setHasChanges(true); }}
                  placeholder="First Name"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>Last Name</Text>
                <TextInput
                  style={[localStyles.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                  value={lastName}
                  onChangeText={(t) => { setLastName(t); setHasChanges(true); }}
                  placeholder="Last Name"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>

            {/* Email */}
            <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>Email</Text>
            <TextInput
              style={[localStyles.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
              value={email}
              onChangeText={(t) => { setEmail(t); setHasChanges(true); }}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {/* Phone / Brokerage Row */}
            <View style={localStyles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>Phone</Text>
                <TextInput
                  style={[localStyles.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                  value={phone}
                  onChangeText={(t) => { setPhone(formatPhoneAsYouType(t)); setHasChanges(true); }}
                  placeholder="(555) 555-5555"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="phone-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>Brokerage</Text>
                <TextInput
                  style={[localStyles.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                  value={brokerage}
                  onChangeText={(t) => { setBrokerage(t); setHasChanges(true); }}
                  placeholder="Brokerage"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>

            {/* Language Row */}
            <View style={localStyles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>Primary Language</Text>
                <TouchableOpacity
                  style={[localStyles.fieldInput, localStyles.dropdownField, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => setShowPrimaryLangPicker(!showPrimaryLangPicker)}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{primaryLanguage}</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
                {showPrimaryLangPicker && (
                  <View style={[localStyles.langPickerDropdown, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    {LANGUAGE_OPTIONS.filter(l => l !== 'None').map(lang => (
                      <TouchableOpacity
                        key={lang}
                        style={[localStyles.langPickerItem, primaryLanguage === lang && { backgroundColor: '#F3F0FF' }]}
                        onPress={() => { setPrimaryLanguage(lang); setShowPrimaryLangPicker(false); setHasChanges(true); }}
                      >
                        <Text style={{ color: primaryLanguage === lang ? '#7C3AED' : colors.textPrimary, fontWeight: primaryLanguage === lang ? '600' : '400' }}>{lang}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>Secondary Language</Text>
                <TouchableOpacity
                  style={[localStyles.fieldInput, localStyles.dropdownField, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => setShowSecondaryLangPicker(!showSecondaryLangPicker)}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{secondaryLanguage}</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
                {showSecondaryLangPicker && (
                  <View style={[localStyles.langPickerDropdown, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    {LANGUAGE_OPTIONS.map(lang => (
                      <TouchableOpacity
                        key={lang}
                        style={[localStyles.langPickerItem, secondaryLanguage === lang && { backgroundColor: '#F3F0FF' }]}
                        onPress={() => { setSecondaryLanguage(lang); setShowSecondaryLangPicker(false); setHasChanges(true); }}
                      >
                        <Text style={{ color: secondaryLanguage === lang ? '#7C3AED' : colors.textPrimary, fontWeight: secondaryLanguage === lang ? '600' : '400' }}>{lang}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* Save Button */}
            {hasChanges && (
              <TouchableOpacity
                style={[localStyles.saveButton, { backgroundColor: '#7C3AED' }]}
                onPress={handleSaveRealtorProfile}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={localStyles.saveButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            )}

            <View style={localStyles.divider} />

            {/* Signed in as */}
            <Text style={[localStyles.signedInText, { color: colors.textSecondary }]}>
              Signed in as:  <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{session?.user?.email}</Text>
            </Text>

            {/* Change Password */}
            <TouchableOpacity onPress={() => {
              Alert.alert(
                'Change Password',
                'A password reset email will be sent to your email address.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Send Reset Email',
                    onPress: async () => {
                      const { error } = await supabase.auth.resetPasswordForEmail(session?.user?.email || '');
                      if (error) {
                        Alert.alert('Error', error.message);
                      } else {
                        Alert.alert('Success', 'Check your email for the password reset link.');
                      }
                    },
                  },
                ]
              );
            }}>
              <Text style={localStyles.changePasswordText}>Change Password</Text>
            </TouchableOpacity>
          </View>
        )}

        {isRealtor && loadingProfile && (
          <View style={[localStyles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border, alignItems: 'center', padding: 24 }]}>
            <ActivityIndicator size="small" color="#7C3AED" />
            <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Loading profile...</Text>
          </View>
        )}

        {/* Loan Officer Profile Fields */}
        {isLoanOfficer && !loadingProfile && (
          <View style={[localStyles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            {/* Lead Participation */}
            <View style={localStyles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.sectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>Lead Participation</Text>
                <Text style={[localStyles.toggleSubtext, { color: colors.textSecondary }]}>
                  {leadEligible ? 'Receiving leads' : 'Not receiving leads'}
                </Text>
              </View>
              <Switch
                value={leadEligible}
                onValueChange={handleToggleLeadEligible}
                trackColor={{ false: '#D1D5DB', true: '#7C3AED' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={localStyles.divider} />

            {/* Name Row */}
            <View style={localStyles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>First Name</Text>
                <TextInput
                  style={[localStyles.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                  value={firstName}
                  onChangeText={(t) => { setFirstName(t); setHasChanges(true); }}
                  placeholder="First Name"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>Last Name</Text>
                <TextInput
                  style={[localStyles.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                  value={lastName}
                  onChangeText={(t) => { setLastName(t); setHasChanges(true); }}
                  placeholder="Last Name"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>

            {/* Email */}
            <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>Email</Text>
            <TextInput
              style={[localStyles.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
              value={email}
              onChangeText={(t) => { setEmail(t); setHasChanges(true); }}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {/* Phone / NMLS ID Row */}
            <View style={localStyles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>Phone</Text>
                <TextInput
                  style={[localStyles.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                  value={phone}
                  onChangeText={(t) => { setPhone(formatPhoneAsYouType(t)); setHasChanges(true); }}
                  placeholder="(555) 555-5555"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="phone-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>NMLS ID</Text>
                <TextInput
                  style={[localStyles.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                  value={nmlsId}
                  onChangeText={(t) => { setNmlsId(t); setHasChanges(true); }}
                  placeholder="NMLS ID"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            {/* Company / Company NMLS Row */}
            <View style={localStyles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>Company</Text>
                <TextInput
                  style={[localStyles.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                  value={company}
                  onChangeText={(t) => { setCompany(t); setHasChanges(true); }}
                  placeholder="Company"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>Company NMLS</Text>
                <TextInput
                  style={[localStyles.fieldInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                  value={companyNmlsId}
                  onChangeText={(t) => { setCompanyNmlsId(t); setHasChanges(true); }}
                  placeholder="Company NMLS"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            {/* Language Row */}
            <View style={localStyles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>Primary Language</Text>
                <TouchableOpacity
                  style={[localStyles.fieldInput, localStyles.dropdownField, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => setShowPrimaryLangPicker(!showPrimaryLangPicker)}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{primaryLanguage}</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
                {showPrimaryLangPicker && (
                  <View style={[localStyles.langPickerDropdown, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    {LANGUAGE_OPTIONS.filter(l => l !== 'None').map(lang => (
                      <TouchableOpacity
                        key={lang}
                        style={[localStyles.langPickerItem, primaryLanguage === lang && { backgroundColor: '#F3F0FF' }]}
                        onPress={() => { setPrimaryLanguage(lang); setShowPrimaryLangPicker(false); setHasChanges(true); }}
                      >
                        <Text style={{ color: primaryLanguage === lang ? '#7C3AED' : colors.textPrimary, fontWeight: primaryLanguage === lang ? '600' : '400' }}>{lang}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>Secondary Language</Text>
                <TouchableOpacity
                  style={[localStyles.fieldInput, localStyles.dropdownField, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => setShowSecondaryLangPicker(!showSecondaryLangPicker)}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{secondaryLanguage}</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
                {showSecondaryLangPicker && (
                  <View style={[localStyles.langPickerDropdown, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    {LANGUAGE_OPTIONS.map(lang => (
                      <TouchableOpacity
                        key={lang}
                        style={[localStyles.langPickerItem, secondaryLanguage === lang && { backgroundColor: '#F3F0FF' }]}
                        onPress={() => { setSecondaryLanguage(lang); setShowSecondaryLangPicker(false); setHasChanges(true); }}
                      >
                        <Text style={{ color: secondaryLanguage === lang ? '#7C3AED' : colors.textPrimary, fontWeight: secondaryLanguage === lang ? '600' : '400' }}>{lang}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* Save Button */}
            {hasChanges && (
              <TouchableOpacity
                style={[localStyles.saveButton, { backgroundColor: '#7C3AED' }]}
                onPress={handleSaveLOProfile}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={localStyles.saveButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            )}

            <View style={localStyles.divider} />

            {/* Signed in as */}
            <Text style={[localStyles.signedInText, { color: colors.textSecondary }]}>
              Signed in as:  <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{session?.user?.email}</Text>
            </Text>

            {/* Change Password */}
            <TouchableOpacity onPress={() => {
              Alert.alert(
                'Change Password',
                'A password reset email will be sent to your email address.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Send Reset Email',
                    onPress: async () => {
                      const { error } = await supabase.auth.resetPasswordForEmail(session?.user?.email || '');
                      if (error) {
                        Alert.alert('Error', error.message);
                      } else {
                        Alert.alert('Success', 'Check your email for the password reset link.');
                      }
                    },
                  },
                ]
              );
            }}>
              <Text style={localStyles.changePasswordText}>Change Password</Text>
            </TouchableOpacity>
          </View>
        )}

        {isLoanOfficer && loadingProfile && (
          <View style={[localStyles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border, alignItems: 'center', padding: 24 }]}>
            <ActivityIndicator size="small" color="#7C3AED" />
            <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Loading profile...</Text>
          </View>
        )}

        <View style={[localStyles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <TouchableOpacity style={localStyles.menuRow} onPress={onSignOut}>
            <View style={localStyles.menuRowLeft}>
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              <Text style={[localStyles.menuRowText, { color: '#EF4444' }]}>Sign Out</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Delete Account */}
        <View style={[localStyles.card, { backgroundColor: colors.cardBackground, borderColor: '#FECACA' }]}>
          <View style={localStyles.dangerHeader}>
            <View style={localStyles.dangerIconCircle}>
              <Ionicons name="warning-outline" size={18} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={localStyles.dangerTitle}>Delete Account</Text>
              <Text style={[localStyles.dangerSubtitle, { color: colors.textSecondary }]}>
                Permanently delete your account and all data
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={localStyles.deleteButton}
            onPress={() => setShowDeleteModal(true)}
          >
            <Ionicons name="trash-outline" size={16} color="#DC2626" />
            <Text style={localStyles.deleteButtonText}>Delete Account</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[localStyles.doneButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
          onPress={onBack}
        >
          <Text style={[localStyles.doneButtonText, { color: colors.textPrimary }]}>Done</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Delete Account Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowDeleteModal(false);
          setDeleteConfirmText('');
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={localStyles.modalOverlay}
        >
          <View style={[localStyles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <View style={localStyles.modalHeader}>
              <Text style={localStyles.modalTitle}>Delete Account</Text>
              <TouchableOpacity onPress={() => {
                setShowDeleteModal(false);
                setDeleteConfirmText('');
              }}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={localStyles.warningBox}>
                <Ionicons name="warning" size={24} color="#DC2626" />
                <Text style={localStyles.warningTitle}>This action is permanent!</Text>
                <Text style={localStyles.warningText}>Deleting your account will:</Text>
                <View style={localStyles.warningList}>
                  <Text style={localStyles.warningItem}>• Remove your profile and login credentials</Text>
                  <Text style={localStyles.warningItem}>• Remove your push notification subscriptions</Text>
                  <Text style={localStyles.warningItem}>• Unlink all leads associated with your account</Text>
                  <Text style={localStyles.warningItem}>• This cannot be undone</Text>
                </View>
              </View>

              <Text style={[localStyles.confirmLabel, { color: colors.textPrimary }]}>
                Type <Text style={localStyles.confirmKeyword}>DELETE</Text> to confirm
              </Text>
              <TextInput
                style={[localStyles.confirmInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                placeholder="Type DELETE"
                placeholderTextColor={colors.textSecondary}
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                autoCapitalize="characters"
                autoCorrect={false}
              />

              <TouchableOpacity
                style={[
                  localStyles.confirmDeleteButton,
                  deleteConfirmText.toUpperCase() !== 'DELETE' && localStyles.confirmDeleteButtonDisabled,
                ]}
                onPress={handleDeleteAccount}
                disabled={deleteConfirmText.toUpperCase() !== 'DELETE' || isDeletingAccount}
              >
                {isDeletingAccount ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="trash" size={18} color="#FFFFFF" />
                    <Text style={localStyles.confirmDeleteButtonText}>Permanently Delete My Account</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[localStyles.cancelButton, { borderColor: colors.border }]}
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
              >
                <Text style={[localStyles.cancelButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    minWidth: 70,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 2,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  headerRightSpacer: {
    minWidth: 70,
    height: 40,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  avatarRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 20,
    fontWeight: '800',
  },
  avatarActions: {
    flex: 1,
    gap: 10,
  },
  primaryButton: {
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryButton: {
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  menuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuRowText: {
    fontSize: 15,
    fontWeight: '700',
  },
  doneButton: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: '800',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  toggleSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 14,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: 8,
  },
  fieldInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    marginBottom: 4,
  },
  dropdownField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  langPickerDropdown: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 2,
    marginBottom: 8,
    overflow: 'hidden',
  },
  langPickerItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  saveButton: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  signedInText: {
    fontSize: 13,
    marginBottom: 8,
  },
  changePasswordText: {
    color: '#7C3AED',
    fontSize: 14,
    fontWeight: '600',
  },
  countyTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  countyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F0FF',
    borderRadius: 16,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 8,
    gap: 4,
  },
  countyTagText: {
    color: '#7C3AED',
    fontSize: 14,
    fontWeight: '600',
  },
  countyTagRemove: {
    color: '#7C3AED',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 2,
  },
  countySuggestions: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 2,
    marginBottom: 4,
    overflow: 'hidden',
  },
  countySuggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  // Delete Account
  dangerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  dangerIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC2626',
  },
  dangerSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#DC2626',
  },
  warningBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    marginBottom: 20,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 8,
    marginBottom: 4,
  },
  warningText: {
    fontSize: 13,
    color: '#991B1B',
    marginBottom: 8,
  },
  warningList: {
    alignSelf: 'stretch',
    gap: 4,
  },
  warningItem: {
    fontSize: 13,
    color: '#991B1B',
  },
  confirmLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  confirmKeyword: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#DC2626',
    fontWeight: '800',
    backgroundColor: '#FEE2E2',
  },
  confirmInput: {
    height: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 16,
  },
  confirmDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    marginBottom: 10,
  },
  confirmDeleteButtonDisabled: {
    opacity: 0.4,
  },
  confirmDeleteButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelButton: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

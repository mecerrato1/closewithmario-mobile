// src/screens/realtors/RealtorDetailScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Linking,
  Alert,
  ActivityIndicator,
  Platform,
  Switch,
  Modal,
  FlatList,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../styles/theme';
import { formatPhoneNumber } from '../../lib/textTemplates';
import {
  AssignedRealtor,
  RelationshipStage,
  RealtorActivity,
  getRealtorFullName,
  getRealtorInitials,
  STAGE_CONFIG,
  LANGUAGE_OPTIONS,
} from '../../lib/types/realtors';
import {
  updateAssignment,
  updateRealtor,
  logRealtorActivity,
  fetchRealtorActivity,
  fetchLeadsByRealtor,
  touchRealtor,
  deleteRealtor,
} from '../../lib/supabase/realtors';
import { LanguageCode } from '../../lib/types/realtors';
import RealtorStageBadge from '../../components/realtors/RealtorStageBadge';
import { saveContact } from '../../utils/vcard';
import { 
  pickProfileImage, 
  requestMediaLibraryPermission, 
  uploadRealtorProfilePicture, 
  removeRealtorProfilePicture 
} from '../../utils/profilePicture';

interface RealtorDetailScreenProps {
  realtor: AssignedRealtor;
  userId: string;
  onBack: () => void;
  onUpdate: () => void;
  onLeadSelect?: (leadId: string, source: 'lead' | 'meta') => void;
}

const STAGES: RelationshipStage[] = ['hot', 'warm', 'cold'];

// Lead status configuration for display
const LEAD_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  new: { label: 'New', color: '#7C3AED', bgColor: '#EDE9FE' },
  contacted: { label: 'Contacted', color: '#3B82F6', bgColor: '#DBEAFE' },
  no_response: { label: 'No Response', color: '#F59E0B', bgColor: '#FEF3C7' },
  qualified: { label: 'Qualified', color: '#10B981', bgColor: '#D1FAE5' },
  unqualified: { label: 'Unqualified', color: '#6B7280', bgColor: '#F3F4F6' },
  nurturing: { label: 'Nurturing', color: '#8B5CF6', bgColor: '#EDE9FE' },
  gathering_docs: { label: 'Gathering Docs', color: '#F97316', bgColor: '#FFEDD5' },
  closed: { label: 'Closed', color: '#059669', bgColor: '#D1FAE5' },
};

const getLeadStatusDisplay = (status: string | null) => {
  if (!status) return { label: 'No Status', color: '#9CA3AF', bgColor: '#F3F4F6' };
  const normalized = status.toLowerCase();
  return LEAD_STATUS_CONFIG[normalized] || { 
    label: status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 
    color: '#6B7280', 
    bgColor: '#F3F4F6' 
  };
};

export default function RealtorDetailScreen({
  realtor,
  userId,
  onBack,
  onUpdate,
  onLeadSelect,
}: RealtorDetailScreenProps) {
  const { colors } = useThemeColors();
  const [stage, setStage] = useState<RelationshipStage>(realtor.relationship_stage);
  const [notes, setNotes] = useState(realtor.assignment_notes || '');
  const [saving, setSaving] = useState(false);
  const [activities, setActivities] = useState<RealtorActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [leads, setLeads] = useState<any[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);

  // Editable realtor settings
  const [active, setActive] = useState(realtor.active);
  const [campaignEligible, setCampaignEligible] = useState(realtor.campaign_eligible);
  const [emailOptOut, setEmailOptOut] = useState(realtor.email_opt_out);
  const [primaryLanguage, setPrimaryLanguage] = useState<LanguageCode>(realtor.preferred_language);
  const [secondaryLanguage, setSecondaryLanguage] = useState<LanguageCode | 'none'>(realtor.secondary_language || 'none');
  
  // Language picker modals
  const [showPrimaryLanguagePicker, setShowPrimaryLanguagePicker] = useState(false);
  const [showSecondaryLanguagePicker, setShowSecondaryLanguagePicker] = useState(false);
  
  // Profile picture state
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(realtor.profile_picture_url);
  const [uploadingPicture, setUploadingPicture] = useState(false);

  const fullName = getRealtorFullName(realtor);
  const initials = getRealtorInitials(realtor);

  // Fetch activity and leads on mount
  useEffect(() => {
    const loadData = async () => {
      // Load activities
      const { data: activityData } = await fetchRealtorActivity(realtor.realtor_id, userId);
      setActivities(activityData || []);
      setLoadingActivities(false);

      // Load leads
      const { data: leadsData } = await fetchLeadsByRealtor(realtor.realtor_id);
      setLeads(leadsData || []);
      setLoadingLeads(false);
    };
    loadData();
  }, [realtor.realtor_id, userId]);

  const handleStageChange = async (newStage: RelationshipStage) => {
    setStage(newStage);
    setSaving(true);
    const { error } = await updateAssignment(realtor.assignment_id, {
      relationship_stage: newStage,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Error', 'Failed to update stage');
      setStage(realtor.relationship_stage);
    } else {
      onUpdate();
    }
  };

  // Handlers for realtor settings
  const handleActiveChange = async (value: boolean) => {
    setActive(value);
    const { error } = await updateRealtor(realtor.realtor_id, { active: value });
    if (error) {
      Alert.alert('Error', 'Failed to update active status');
      setActive(realtor.active);
    } else {
      onUpdate();
    }
  };

  const handleCampaignEligibleChange = async (value: boolean) => {
    setCampaignEligible(value);
    const { error } = await updateRealtor(realtor.realtor_id, { campaign_eligible: value });
    if (error) {
      Alert.alert('Error', 'Failed to update campaign eligibility');
      setCampaignEligible(realtor.campaign_eligible);
    } else {
      onUpdate();
    }
  };

  const handleEmailOptOutChange = async (value: boolean) => {
    setEmailOptOut(value);
    const { error } = await updateRealtor(realtor.realtor_id, { email_opt_out: value });
    if (error) {
      Alert.alert('Error', 'Failed to update email preference');
      setEmailOptOut(realtor.email_opt_out);
    } else {
      onUpdate();
    }
  };

  const handlePrimaryLanguageChange = async (value: LanguageCode) => {
    setPrimaryLanguage(value);
    setShowPrimaryLanguagePicker(false);
    const { error } = await updateRealtor(realtor.realtor_id, { preferred_language: value });
    if (error) {
      Alert.alert('Error', 'Failed to update language');
      setPrimaryLanguage(realtor.preferred_language);
    } else {
      onUpdate();
    }
  };

  const handleSecondaryLanguageChange = async (value: LanguageCode | 'none') => {
    setSecondaryLanguage(value);
    setShowSecondaryLanguagePicker(false);
    const { error } = await updateRealtor(realtor.realtor_id, { 
      secondary_language: value === 'none' ? null : value 
    });
    if (error) {
      Alert.alert('Error', 'Failed to update language');
      setSecondaryLanguage(realtor.secondary_language || 'none');
    } else {
      onUpdate();
    }
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    const { error } = await updateAssignment(realtor.assignment_id, { notes });
    setSaving(false);
    if (error) {
      Alert.alert('Error', 'Failed to save notes');
    } else {
      onUpdate();
    }
  };

  const handleCall = async () => {
    if (realtor.phone) {
      Linking.openURL(`tel:${realtor.phone}`);
      await logRealtorActivity(realtor.realtor_id, userId, 'call');
      await touchRealtor(realtor.assignment_id);
      onUpdate();
    } else {
      Alert.alert('No Phone', 'This realtor has no phone number on file.');
    }
  };

  const handleText = async () => {
    if (realtor.phone) {
      Linking.openURL(`sms:${realtor.phone}`);
      await logRealtorActivity(realtor.realtor_id, userId, 'text');
      await touchRealtor(realtor.assignment_id);
      onUpdate();
    } else {
      Alert.alert('No Phone', 'This realtor has no phone number on file.');
    }
  };

  const handleEmail = async () => {
    if (realtor.email) {
      Linking.openURL(`mailto:${realtor.email}`);
      await logRealtorActivity(realtor.realtor_id, userId, 'email');
      await touchRealtor(realtor.assignment_id);
      onUpdate();
    } else {
      Alert.alert('No Email', 'This realtor has no email on file.');
    }
  };

  const handleSaveContact = async () => {
    if (!realtor.phone && !realtor.email) {
      Alert.alert('Missing Info', 'This realtor has no phone or email to save.');
      return;
    }

    try {
      await saveContact({
        firstName: realtor.first_name,
        lastName: realtor.last_name,
        phone: realtor.phone || undefined,
        email: realtor.email || undefined,
        company: 'Realtor',
        notes: realtor.brokerage ? `Brokerage: ${realtor.brokerage}` : undefined,
      });
    } catch (error) {
      console.error('[Contacts] Failed to save realtor contact:', error);
      Alert.alert('Error', 'Could not save contact. Please try again.');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Realtor',
      `Are you sure you want to delete ${fullName}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            const { error } = await deleteRealtor(realtor.realtor_id, userId);
            setSaving(false);
            if (error) {
              Alert.alert('Error', 'Failed to delete realtor. Please try again.');
            } else {
              onUpdate();
              onBack();
            }
          },
        },
      ]
    );
  };

  // Handle profile picture change
  const handleChangeProfilePicture = async () => {
    Alert.alert(
      'Profile Picture',
      'Choose an option',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Choose from Library',
          onPress: async () => {
            const hasPermission = await requestMediaLibraryPermission();
            if (!hasPermission) {
              Alert.alert('Permission Required', 'Please allow access to your photo library to upload a profile picture.');
              return;
            }
            
            const result = await pickProfileImage();
            if (result && !result.canceled && result.assets[0]) {
              setUploadingPicture(true);
              const uploadResult = await uploadRealtorProfilePicture(realtor.realtor_id, result.assets[0].uri);
              setUploadingPicture(false);
              
              if (uploadResult.success && uploadResult.url) {
                setProfilePictureUrl(uploadResult.url);
                onUpdate();
              } else {
                Alert.alert('Upload Failed', uploadResult.error || 'Failed to upload picture');
              }
            }
          },
        },
        ...(profilePictureUrl ? [{
          text: 'Remove Picture',
          style: 'destructive' as const,
          onPress: async () => {
            setUploadingPicture(true);
            const result = await removeRealtorProfilePicture(realtor.realtor_id, profilePictureUrl);
            setUploadingPicture(false);
            
            if (result.success) {
              setProfilePictureUrl(null);
              onUpdate();
            } else {
              Alert.alert('Error', result.error || 'Failed to remove picture');
            }
          },
        }] : []),
      ]
    );
  };

  const formatActivityDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'call':
        return 'call-outline';
      case 'text':
        return 'chatbubble-outline';
      case 'email':
        return 'mail-outline';
      case 'meeting':
        return 'people-outline';
      case 'note':
      default:
        return 'document-text-outline';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBackground }]}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {fullName}
        </Text>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <TouchableOpacity onPress={handleChangeProfilePicture} disabled={uploadingPicture}>
            {uploadingPicture ? (
              <View style={styles.avatar}>
                <ActivityIndicator size="small" color="#FFFFFF" />
              </View>
            ) : profilePictureUrl ? (
              <Image 
                source={{ uri: profilePictureUrl }} 
                style={styles.avatarImage}
              />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={12} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{fullName}</Text>
          {realtor.brokerage && (
            <Text style={[styles.brokerage, { color: colors.textSecondary }]}>
              {realtor.brokerage}
            </Text>
          )}

          {/* Contact Actions */}
          <View style={styles.contactActions}>
            <TouchableOpacity style={styles.contactButton} onPress={handleCall}>
              <View style={[styles.contactIcon, { backgroundColor: '#10B981' }]}>
                <Ionicons name="call" size={20} color="#FFFFFF" />
              </View>
              <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.contactButton} onPress={handleText}>
              <View style={[styles.contactIcon, { backgroundColor: '#7C3AED' }]}>
                <Ionicons name="chatbubble" size={20} color="#FFFFFF" />
              </View>
              <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Text</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.contactButton} onPress={handleEmail}>
              <View style={[styles.contactIcon, { backgroundColor: '#3B82F6' }]}>
                <Ionicons name="mail" size={20} color="#FFFFFF" />
              </View>
              <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Email</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.contactButton} onPress={handleSaveContact}>
              <View style={[styles.contactIcon, { backgroundColor: '#F59E0B' }]}>
                <Ionicons name="person-add" size={20} color="#FFFFFF" />
              </View>
              <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Save</Text>
            </TouchableOpacity>
          </View>

          {/* Contact Info */}
          <View style={[styles.infoSection, { borderTopColor: colors.border }]}>
            {realtor.phone && (
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.infoText, { color: colors.textPrimary }]}>{formatPhoneNumber(realtor.phone)}</Text>
              </View>
            )}
            {realtor.email && (
              <View style={styles.infoRow}>
                <Ionicons name="mail-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.infoText, { color: colors.textPrimary }]}>{realtor.email}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Settings Section */}
        <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Settings
          </Text>
          
          {/* Active Toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <View style={[styles.toggleIconContainer, { backgroundColor: active ? '#DCFCE7' : '#FEE2E2' }]}>
                <Ionicons name="checkmark-circle" size={20} color={active ? '#10B981' : '#EF4444'} />
              </View>
              <View style={styles.toggleTextContainer}>
                <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>Active</Text>
              </View>
            </View>
            <Switch
              value={active}
              onValueChange={handleActiveChange}
              trackColor={{ false: '#E5E7EB', true: '#C4B5FD' }}
              thumbColor={active ? '#7C3AED' : '#9CA3AF'}
            />
          </View>

          {/* Campaign Eligible Toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <View style={[styles.toggleIconContainer, { backgroundColor: campaignEligible ? '#EDE9FE' : '#F3F4F6' }]}>
                <Ionicons name="megaphone" size={20} color={campaignEligible ? '#7C3AED' : '#9CA3AF'} />
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
              onValueChange={handleCampaignEligibleChange}
              trackColor={{ false: '#E5E7EB', true: '#C4B5FD' }}
              thumbColor={campaignEligible ? '#7C3AED' : '#9CA3AF'}
            />
          </View>

          {/* Email Opt Out Toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <View style={[styles.toggleIconContainer, { backgroundColor: emailOptOut ? '#FEE2E2' : '#F3F4F6' }]}>
                <Ionicons name="close-circle" size={20} color={emailOptOut ? '#EF4444' : '#9CA3AF'} />
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
              onValueChange={handleEmailOptOutChange}
              trackColor={{ false: '#E5E7EB', true: '#FCA5A5' }}
              thumbColor={emailOptOut ? '#EF4444' : '#9CA3AF'}
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
          <Text style={[styles.languageHelperText, { color: colors.textSecondary }]}>
            Select the realtor's preferred languages.
          </Text>
          
          <View style={styles.languagePickerRow}>
            <View style={styles.languagePickerContainer}>
              <Text style={[styles.languagePickerLabel, { color: colors.textSecondary }]}>Primary</Text>
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
              <Text style={[styles.languagePickerLabel, { color: colors.textSecondary }]}>Secondary</Text>
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
              <FlatList
                data={LANGUAGE_OPTIONS.filter(o => o.value !== 'none')}
                keyExtractor={(item) => item.value}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.modalOption,
                      primaryLanguage === item.value && styles.modalOptionSelected,
                    ]}
                    onPress={() => handlePrimaryLanguageChange(item.value as LanguageCode)}
                  >
                    <Text style={[
                      styles.modalOptionText,
                      { color: primaryLanguage === item.value ? '#7C3AED' : colors.textPrimary },
                    ]}>
                      {item.label}
                    </Text>
                    {primaryLanguage === item.value && (
                      <Ionicons name="checkmark" size={20} color="#7C3AED" />
                    )}
                  </TouchableOpacity>
                )}
              />
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
              <FlatList
                data={LANGUAGE_OPTIONS}
                keyExtractor={(item) => item.value}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.modalOption,
                      secondaryLanguage === item.value && styles.modalOptionSelected,
                    ]}
                    onPress={() => handleSecondaryLanguageChange(item.value as LanguageCode | 'none')}
                  >
                    <Text style={[
                      styles.modalOptionText,
                      { color: secondaryLanguage === item.value ? '#7C3AED' : colors.textPrimary },
                    ]}>
                      {item.label}
                    </Text>
                    {secondaryLanguage === item.value && (
                      <Ionicons name="checkmark" size={20} color="#7C3AED" />
                    )}
                  </TouchableOpacity>
                )}
              />
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
                  onPress={() => handleStageChange(s)}
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
            placeholder="Add notes about this realtor..."
            placeholderTextColor={colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSaveNotes}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save Notes</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Activity Timeline */}
        <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Activity Timeline
          </Text>
          {loadingActivities ? (
            <ActivityIndicator size="small" color="#7C3AED" />
          ) : activities.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No activity recorded yet
            </Text>
          ) : (
            activities.slice(0, 10).map((activity) => (
              <View key={activity.id} style={styles.activityItem}>
                <View style={[styles.activityIcon, { backgroundColor: colors.border }]}>
                  <Ionicons
                    name={getActivityIcon(activity.activity_type) as any}
                    size={14}
                    color={colors.textSecondary}
                  />
                </View>
                <View style={styles.activityContent}>
                  <Text style={[styles.activityType, { color: colors.textPrimary }]}>
                    {activity.activity_type.charAt(0).toUpperCase() + activity.activity_type.slice(1)}
                  </Text>
                  <Text style={[styles.activityDate, { color: colors.textSecondary }]}>
                    {formatActivityDate(activity.created_at)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Linked Leads */}
        <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Linked Leads
          </Text>
          {loadingLeads ? (
            <ActivityIndicator size="small" color="#7C3AED" />
          ) : leads.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No leads linked to this realtor yet
            </Text>
          ) : (
            leads.slice(0, 5).map((lead) => (
              <TouchableOpacity 
                key={lead.id} 
                style={styles.leadItem}
                onPress={() => onLeadSelect?.(lead.id, lead.source || 'lead')}
                disabled={!onLeadSelect}
              >
                <View style={styles.leadInfo}>
                  <Text style={[styles.leadName, { color: colors.textPrimary }]}>
                    {lead.first_name} {lead.last_name}
                  </Text>
                  <View style={[
                    styles.leadStatusBadge, 
                    { backgroundColor: getLeadStatusDisplay(lead.status).bgColor }
                  ]}>
                    <Text style={[
                      styles.leadStatusText, 
                      { color: getLeadStatusDisplay(lead.status).color }
                    ]}>
                      {getLeadStatusDisplay(lead.status).label}
                    </Text>
                  </View>
                </View>
                {onLeadSelect && (
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                )}
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Share Tools Placeholder */}
        <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Share Tools
          </Text>
          <View style={styles.comingSoon}>
            <Ionicons name="share-outline" size={24} color={colors.textSecondary} />
            <Text style={[styles.comingSoonText, { color: colors.textSecondary }]}>
              Share Scenario - Coming Soon
            </Text>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  deleteButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  profileCard: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 8,
    right: -4,
    backgroundColor: '#7C3AED',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  brokerage: {
    fontSize: 14,
    marginBottom: 16,
  },
  contactActions: {
    flexDirection: 'row',
    gap: 32,
    marginBottom: 16,
  },
  contactButton: {
    alignItems: 'center',
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  contactLabel: {
    fontSize: 12,
  },
  infoSection: {
    width: '100%',
    borderTopWidth: 1,
    paddingTop: 16,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 14,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  settingsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settingLabel: {
    fontSize: 13,
  },
  languagesRow: {
    flexDirection: 'row',
    gap: 24,
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: 1,
  },
  languageItem: {
    flex: 1,
  },
  languageLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  languageValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  stageButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  stageButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  stageButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    fontSize: 14,
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  activityIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityContent: {
    flex: 1,
  },
  activityType: {
    fontSize: 14,
    fontWeight: '500',
  },
  activityDate: {
    fontSize: 12,
  },
  leadItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  leadInfo: {
    flex: 1,
  },
  leadName: {
    fontSize: 14,
    fontWeight: '500',
  },
  leadStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  leadStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  comingSoon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  comingSoonText: {
    fontSize: 14,
  },
  bottomSpacer: {
    height: 32,
  },
  // Toggle styles
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  toggleIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
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
    marginTop: 2,
  },
  // Language styles
  languageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  languageHelperText: {
    fontSize: 13,
    marginBottom: 12,
  },
  languagePickerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  languagePickerContainer: {
    flex: 1,
  },
  languagePickerLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  languageButtonText: {
    fontSize: 14,
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
    maxHeight: '60%',
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
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  modalOptionSelected: {
    backgroundColor: '#EDE9FE',
  },
  modalOptionText: {
    fontSize: 16,
  },
});

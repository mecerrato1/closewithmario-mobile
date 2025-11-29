import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Linking,
  Modal,
  FlatList,
  Image,
  ActivityIndicator,
  Platform,
  RefreshControl,
  AppState,
  Animated,
  LayoutAnimation,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Session } from '@supabase/supabase-js';
import { Audio, InterruptionModeIOS } from 'expo-av';
import type { Lead, MetaLead, SelectedLeadRef, Activity, LoanOfficer, Realtor } from '../lib/types/leads';
import type { UserRole } from '../lib/roles';
import { supabase } from '../lib/supabase';
import { getUserRole, getUserTeamMemberId, canSeeAllLeads } from '../lib/roles';
import { TEXT_TEMPLATES, fillTemplate, getTemplateText, getTemplateName, type TemplateVariables } from '../lib/textTemplates';
import { STATUSES, STATUS_DISPLAY_MAP, STATUS_COLOR_MAP, getLeadAlert, formatStatus, getTimeAgo } from '../lib/leadsHelpers';
import { scheduleLeadCallback } from '../lib/callbacks';
import DateTimePicker from '@react-native-community/datetimepicker';
import { styles } from '../styles/appStyles';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../styles/theme';

export type LeadDetailViewProps = {
  selected: SelectedLeadRef;
  leads: Lead[];
  metaLeads: MetaLead[];
  onBack: () => void;
  onNavigate: (leadRef: SelectedLeadRef) => void;
  onStatusChange: (
    source: 'lead' | 'meta',
    id: string,
    newStatus: string
  ) => Promise<void>;
  session: Session | null;
  loanOfficers: Array<{ id: string; name: string }>;
  userRole: UserRole;
  onLeadUpdate: (updatedLead: Lead | MetaLead, source: 'lead' | 'meta') => void;
  selectedStatusFilter: string;
  searchQuery: string;
  selectedLOFilter: string | null;
  activeTab: 'leads' | 'meta' | 'all';
};

export function LeadDetailView({
  selected,
  leads,
  metaLeads,
  onBack,
  onNavigate,
  onStatusChange,
  session,
  loanOfficers,
  userRole: propUserRole,
  onLeadUpdate,
  selectedStatusFilter,
  searchQuery,
  selectedLOFilter,
  activeTab,
}: LeadDetailViewProps) {
  const { colors, isDark } = useThemeColors();
  const [taskNote, setTaskNote] = useState('');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivityType, setSelectedActivityType] = useState<'call' | 'text' | 'email' | 'note'>('call');
  const [showQuickPhrases, setShowQuickPhrases] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [savingActivity, setSavingActivity] = useState(false);
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null);
  const [showLOPicker, setShowLOPicker] = useState(false);
  const [updatingLO, setUpdatingLO] = useState(false);
  const [showAdImage, setShowAdImage] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [currentLOInfo, setCurrentLOInfo] = useState<{ firstName: string; lastName: string; phone: string; email: string } | null>(null);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showCallbackModal, setShowCallbackModal] = useState(false);
  const [callbackDate, setCallbackDate] = useState<Date | null>(null);
  const [callbackNote, setCallbackNote] = useState('');
  const [savingCallback, setSavingCallback] = useState(false);
  const [useSpanishTemplates, setUseSpanishTemplates] = useState(false);
  
  // Voice notes state (expo-av)
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [uploadingVoiceNote, setUploadingVoiceNote] = useState(false);
  const [currentSound, setCurrentSound] = useState<Audio.Sound | null>(null);
  const [playingActivityId, setPlayingActivityId] = useState<string | null>(null);
  // Micro animation for "Log Activity" button
  const logButtonScale = useRef(new Animated.Value(1)).current;

  const animateLogButton = () => {
    Animated.sequence([
      Animated.timing(logButtonScale, {
        toValue: 0.96,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(logButtonScale, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();
  };
  
  const quickPhrases = [
    'Left voicemail',
    'Spoke with client',
    'Sent documents',
    'Scheduled follow-up',
    'No answer',
    'Client requested callback',
    'Discussed rates',
    'Pre-approval sent',
  ];
  
  const isMeta = selected.source === 'meta';
  
  // Helper functions to match the same filters as the list view
  const matchesSearch = (lead: Lead | MetaLead) => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').toLowerCase();
    const email = lead.email?.toLowerCase() || '';
    const phone = lead.phone?.toLowerCase() || '';
    
    return fullName.includes(query) || email.includes(query) || phone.includes(query);
  };

  const matchesLOFilter = (lead: Lead | MetaLead) => {
    // Only apply filter for super admins
    if (propUserRole !== 'super_admin') return true;
    
    // If no LO filter selected (null), show all leads
    if (selectedLOFilter === null) return true;
    
    // If "unassigned" filter, show leads without LO
    if (selectedLOFilter === 'unassigned') {
      return !lead.lo_id;
    }
    
    // Otherwise, filter by specific LO ID
    return lead.lo_id === selectedLOFilter;
  };
  
  // Build the navigable list based on active tab
  let navigableList: Array<(Lead | MetaLead) & { source: 'lead' | 'meta' }>;
  
  if (activeTab === 'all') {
    // Combine both lists when on "all" tab
    const filteredMeta = metaLeads
      .filter(lead => {
        const matchesStatus = selectedStatusFilter === 'all' 
          ? lead.status !== 'unqualified' 
          : lead.status === selectedStatusFilter;
        return matchesStatus && matchesSearch(lead) && matchesLOFilter(lead);
      })
      .map(lead => ({ ...lead, source: 'meta' as const }));
    
    const filteredLeads = leads
      .filter(lead => {
        const matchesStatus = selectedStatusFilter === 'all' 
          ? lead.status !== 'unqualified' 
          : lead.status === selectedStatusFilter;
        return matchesStatus && matchesSearch(lead) && matchesLOFilter(lead);
      })
      .map(lead => ({ ...lead, source: 'lead' as const }));
    
    // Combine and sort by created_at (newest first)
    navigableList = [...filteredMeta, ...filteredLeads].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  } else if (activeTab === 'meta') {
    // Only meta leads
    navigableList = metaLeads
      .filter(lead => {
        const matchesStatus = selectedStatusFilter === 'all' 
          ? lead.status !== 'unqualified' 
          : lead.status === selectedStatusFilter;
        return matchesStatus && matchesSearch(lead) && matchesLOFilter(lead);
      })
      .map(lead => ({ ...lead, source: 'meta' as const }));
  } else {
    // Only regular leads
    navigableList = leads
      .filter(lead => {
        const matchesStatus = selectedStatusFilter === 'all' 
          ? lead.status !== 'unqualified' 
          : lead.status === selectedStatusFilter;
        return matchesStatus && matchesSearch(lead) && matchesLOFilter(lead);
      })
      .map(lead => ({ ...lead, source: 'lead' as const }));
  }
  
  const currentIndex = navigableList.findIndex((item) => item.id === selected.id && item.source === selected.source);
  const currentList = isMeta ? metaLeads : leads;
  const record = currentList.find((item) => item.id === selected.id);
  
  // Function to get ad image based on ad name or campaign name
  const getAdImage = () => {
    if (!isMeta || !record) return null;
    
    const adName = (record as MetaLead).ad_name?.toLowerCase() || '';
    const campaignName = (record as MetaLead).campaign_name?.toLowerCase() || '';
    const searchText = `${adName} ${campaignName}`.toLowerCase();
    
    if (searchText.includes('florida renter')) {
      return require('../../assets/Fl_Renter_Ad.png');
    } else if (searchText.includes('hpa')) {
      return require('../../assets/BrowardHPA_Ad.jpg');
    } else if (searchText.includes('condo')) {
      return require('../../assets/Condo_Ad.jpg');
    } else if (searchText.includes('green acres') || searchText.includes('greenacres')) {
      return require('../../assets/Greenacres_ Ad.png');
    }
    
    return null;
  };
  
  const adImage = getAdImage();

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < navigableList.length - 1;

  const handlePrevious = () => {
    if (hasPrevious) {
      const prevLead = navigableList[currentIndex - 1];
      onNavigate({ source: prevLead.source, id: prevLead.id });
    }
  };

  const handleNext = () => {
    if (hasNext) {
      const nextLead = navigableList[currentIndex + 1];
      onNavigate({ source: nextLead.source, id: nextLead.id });
    }
  };

  if (!record) {
    return (
      <View style={styles.container}>
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.detailHeaderTitle}>Lead not found</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContent}>
          <Text>We couldn&apos;t find this lead in memory.</Text>
        </View>
      </View>
    );
  }

  const fullName =
    [record.first_name, record.last_name].filter(Boolean).join(' ') ||
    '(No name)';
  const status = record.status || 'No status';
  const email = record.email || '';
  const phone = record.phone || '';
  const attentionBadge = getLeadAlert(record);
  
  console.log('🔍 LeadDetailView render:', { 
    leadId: record.id, 
    last_contact_date: record.last_contact_date,
    attentionBadge: attentionBadge ? attentionBadge.label : 'none'
  });

  const handleCall = async () => {
    if (!phone) return;
    
    // Log the call activity automatically
    try {
      const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
      const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';
      const leadTableName = isMeta ? 'meta_ads' : 'leads';
      
      const activityData = {
        [foreignKeyColumn]: record.id,
        activity_type: 'call',
        notes: `Called ${phone}`,
        created_by: session?.user?.id || null,
        user_email: session?.user?.email || 'Mobile App User',
      };

      const { error } = await supabase
        .from(tableName)
        .insert([activityData]);

      if (error) {
        console.error('Error logging call activity:', error);
      } else {
        // Update last_contact_date on the lead
        const now = new Date().toISOString();
        await supabase
          .from(leadTableName)
          .update({ last_contact_date: now })
          .eq('id', record.id);
        
        // Update the lead in parent component state
        const updatedLead = { ...record, last_contact_date: now };
        console.log('📞 CALL: Updating lead', { id: updatedLead.id, last_contact_date: now, source: isMeta ? 'meta' : 'lead' });
        onLeadUpdate(updatedLead, isMeta ? 'meta' : 'lead');
        
        // Refresh activities to show the new log
        const { data } = await supabase
          .from(tableName)
          .select('*')
          .eq(foreignKeyColumn, record.id)
          .order('created_at', { ascending: false });
        
        if (data) {
          setActivities(data);
        }
      }
    } catch (e) {
      console.error('Error logging call activity:', e);
    }
    
    // Open phone dialer
    Linking.openURL(`tel:${phone}`);
  };

  const handleText = () => {
    if (!phone) return;
    setShowTemplateModal(true);
  };

  const handleTemplateSelect = async (templateId: string) => {
    const template = TEXT_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    console.log('Current LO Info when creating template:', currentLOInfo);

    const variables: TemplateVariables = {
      fname: record.first_name || 'there',
      loFullname: currentLOInfo 
        ? `${currentLOInfo.firstName} ${currentLOInfo.lastName}`.trim() 
        : 'Mario',
      loFname: currentLOInfo?.firstName || 'Mario',
      loPhone: currentLOInfo?.phone || '[Phone]',
      loEmail: currentLOInfo?.email || '[Email]',
      platform: isMeta ? (record as MetaLead).platform || 'Facebook' : 'our website',
    };

    console.log('Template variables:', variables);

    // Use the correct language template
    const templateText = getTemplateText(template, useSpanishTemplates);
    const messageBody = fillTemplate(templateText, variables);
    console.log('Final message body:', messageBody);
    
    const encodedBody = encodeURIComponent(messageBody);
    
    setShowTemplateModal(false);
    
    // Log the text activity automatically
    try {
      const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
      const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';
      const leadTableName = isMeta ? 'meta_ads' : 'leads';
      
      const activityData = {
        [foreignKeyColumn]: record.id,
        activity_type: 'text',
        notes: `Sent: "${template.name}"\n\n${messageBody}`,
        created_by: session?.user?.id || null,
        user_email: session?.user?.email || 'Mobile App User',
      };

      const { error } = await supabase
        .from(tableName)
        .insert([activityData]);

      if (error) {
        console.error('Error logging text activity:', error);
      } else {
        // Update last_contact_date on the lead
        const now = new Date().toISOString();
        await supabase
          .from(leadTableName)
          .update({ last_contact_date: now })
          .eq('id', record.id);
        
        // Update the lead in parent component state
        const updatedLead = { ...record, last_contact_date: now };
        onLeadUpdate(updatedLead, isMeta ? 'meta' : 'lead');
        
        // Refresh activities to show the new log
        const { data } = await supabase
          .from(tableName)
          .select('*')
          .eq(foreignKeyColumn, record.id)
          .order('created_at', { ascending: false });
        
        if (data) {
          setActivities(data);
        }
      }
    } catch (e) {
      console.error('Error logging text activity:', e);
    }
    
    // Open SMS app with pre-filled message
    Linking.openURL(`sms:${phone}?body=${encodedBody}`);
  };

  const handleEmail = async () => {
    if (!email) return;
    const firstName = record.first_name || 'there';
    const subject = encodeURIComponent('Preapproval follow up');
    const body = encodeURIComponent(
      `Hi ${firstName},\n\nI wanted to follow up regarding your home financing options.`
    );
    
    // Log email activity
    try {
      const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
      const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';
      const leadTableName = isMeta ? 'meta_ads' : 'leads';

      const newActivity = {
        [foreignKeyColumn]: record.id,
        activity_type: 'email',
        notes: `Emailed ${email}`,
        created_by: session?.user?.id || null,
        user_email: session?.user?.email || 'Mobile App User',
      };

      const { data } = await supabase
        .from(tableName)
        .insert([newActivity])
        .select()
        .single();

      if (data) {
        // Update last_contact_date on the lead
        const now = new Date().toISOString();
        await supabase
          .from(leadTableName)
          .update({ last_contact_date: now })
          .eq('id', record.id);
        
        // Update the lead in parent component state
        const updatedLead = { ...record, last_contact_date: now };
        onLeadUpdate(updatedLead, isMeta ? 'meta' : 'lead');
        
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setActivities([data, ...activities]);
      }
    } catch (e) {
      console.error('Error logging email activity:', e);
    }
    
    // Try to open Outlook first, fallback to default mail client
    const outlookUrl = `ms-outlook://compose?to=${email}&subject=${subject}&body=${body}`;
    const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;
    
    try {
      const canOpenOutlook = await Linking.canOpenURL(outlookUrl);
      if (canOpenOutlook) {
        await Linking.openURL(outlookUrl);
      } else {
        // Fallback to default mail client if Outlook not installed
        await Linking.openURL(mailtoUrl);
      }
    } catch (error) {
      console.error('Error opening email client:', error);
      // Final fallback to mailto
      try {
        await Linking.openURL(mailtoUrl);
      } catch (e) {
        console.error('Error opening mailto:', e);
      }
    }
  };

  // Load current loan officer info
  useEffect(() => {
    const loadLOInfo = async () => {
      if (!session?.user?.id || !session?.user?.email) return;
      
      try {
        // Hardcoded contact info for super admins
        const superAdminContacts: Record<string, { firstName: string; lastName: string; phone: string; email: string }> = {
          'mario@closewithmario.com': { firstName: 'Mario', lastName: 'Cerrato', phone: '3052192788', email: 'mcerrato@loandepot.com' },
          'mario@regallending.com': { firstName: 'Mario', lastName: 'Cerrato', phone: '3052192788', email: 'mario@regallending.com' },
        };
        
        const emailLower = session.user.email.toLowerCase();
        
        // Check if this is a super admin with hardcoded contact info
        if (superAdminContacts[emailLower]) {
          console.log('Using hardcoded super admin contact info');
          setCurrentLOInfo(superAdminContacts[emailLower]);
          return;
        }
        
        // First try to get by user_id (for regular loan officers)
        let memberId = await getUserTeamMemberId(session.user.id, 'loan_officer');
        console.log('LO Member ID by user_id:', memberId);
        
        // If no member ID found, try to find by email (for super admins who might be LOs)
        if (!memberId) {
          const { data: loByEmail } = await supabase
            .from('loan_officers')
            .select('id')
            .eq('email', emailLower)
            .eq('active', true)
            .maybeSingle();
          
          memberId = loByEmail?.id || null;
          console.log('LO Member ID by email:', memberId);
        }
        
        if (memberId) {
          const { data, error } = await supabase
            .from('loan_officers')
            .select('first_name, last_name, phone, email')
            .eq('id', memberId)
            .single();
          
          console.log('LO Data fetched:', data);
          console.log('LO Fetch error:', error);
          
          if (data && !error) {
            const loInfo = { 
              firstName: data.first_name, 
              lastName: data.last_name,
              phone: data.phone || '',
              email: data.email || ''
            };
            console.log('Setting LO Info:', loInfo);
            setCurrentLOInfo(loInfo);
          }
        } else {
          console.log('No LO record found for this user');
        }
      } catch (e) {
        console.error('Error loading LO info:', e);
      }
    };

    loadLOInfo();
  }, [session?.user?.id, session?.user?.email]);

  // Load activities from Supabase
  useEffect(() => {
    const loadActivities = async () => {
      if (!record) return;
      
      try {
        setLoadingActivities(true);
        
        // Use correct table based on lead source
        const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
        const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';
        
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .eq(foreignKeyColumn, record.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error loading activities:', error);
        } else {
          setActivities(data || []);
        }
      } catch (e) {
        console.error('Unexpected error loading activities:', e);
      } finally {
        setLoadingActivities(false);
      }
    };

    loadActivities();
  }, [record?.id, isMeta]);

  // Set default callback date when record changes
  useEffect(() => {
    if (record) {
      // Default: 2 hours from now
      const now = new Date();
      const later = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      setCallbackDate(later);
      setCallbackNote(`Call ${fullName}`);
    }
  }, [record?.id, fullName]);

  // Set language preference based on lead's preferred_language
  useEffect(() => {
    if (record && isMeta) {
      const preferredLanguage = (record as MetaLead).preferred_language?.toLowerCase();
      setUseSpanishTemplates(preferredLanguage === 'spanish');
    } else {
      // Default to English for non-meta leads
      setUseSpanishTemplates(false);
    }
  }, [record?.id, isMeta]);

  // Cleanup current sound when component unmounts or sound changes
  useEffect(() => {
    return () => {
      if (currentSound) {
        currentSound.unloadAsync();
      }
    };
  }, [currentSound]);

  // Pre-request microphone permissions on mount
  useEffect(() => {
    const prepareMicPermissions = async () => {
      try {
        const current = await Audio.getPermissionsAsync();

        if (!current.granted) {
          const requested = await Audio.requestPermissionsAsync();

          if (!requested.granted) {
            alert('Please enable microphone access in Settings to record voice notes.');
          }
        }
      } catch (err) {
        console.error('Error preparing microphone permissions', err);
      }
    };

    prepareMicPermissions();
  }, []);

  const startVoiceRecording = async () => {
    console.log('🔴 Button pressed! isRecording:', isRecording, 'appState:', AppState.currentState);

    if (isRecording) {
      return;
    }

    try {
      const { granted } = await Audio.getPermissionsAsync();
      if (!granted) {
        alert('Microphone access is required to record voice notes.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        staysActiveInBackground: false,
      });

      console.log('▶️ Starting recording...');

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
      setIsRecording(true);
    } catch (error: any) {
      console.error('Failed to start recording', error);
      alert(
        `Could not start recording: ${
          error?.message || 'Please make sure the app is open and try again.'
        }`
      );
    }
  };

  const stopRecordingAndSaveVoiceNote = async () => {
    if (!recording || !record) return;

    setIsRecording(false);
    setUploadingVoiceNote(true);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) {
        throw new Error('No recording URI');
      }

      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      const fileExt = 'm4a';
      const fileName = `voice-${record.id}-${Date.now()}.${fileExt}`;
      const filePath = `${record.id}/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('activity-voice-notes')
        .upload(filePath, arrayBuffer, {
          contentType: 'audio/m4a',
        });

      if (uploadError || !uploadData) {
        console.error('Upload error', uploadError);
        throw uploadError || new Error('Upload failed');
      }

      const { data: publicUrlData } = supabase.storage
        .from('activity-voice-notes')
        .getPublicUrl(uploadData.path);

      const audioUrl = publicUrlData?.publicUrl;
      if (!audioUrl) {
        throw new Error('No public URL returned for voice note');
      }

      // Insert activity (note + audio_url)
      const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
      const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';
      const leadTable = isMeta ? 'meta_ads' : 'leads';

      const activityPayload: any = {
        [foreignKeyColumn]: record.id,
        activity_type: 'note',
        notes: taskNote.trim() || 'Voice note',
        created_by: session?.user?.id ?? null,
        user_email: session?.user?.email ?? 'Mobile App User',
        audio_url: audioUrl,
      };

      const { data: inserted, error: insertError } = await supabase
        .from(tableName)
        .insert([activityPayload])
        .select()
        .single();

      if (insertError) {
        console.error('Insert activity error', insertError);
        throw insertError;
      }

      const now = new Date().toISOString();

      const { error: updateLeadError } = await supabase
        .from(leadTable)
        .update({ last_contact_date: now })
        .eq('id', record.id);

      if (updateLeadError) {
        console.error('Update lead last_contact_date error', updateLeadError);
      }

      const updatedLead = { ...record, last_contact_date: now };
      onLeadUpdate(updatedLead, isMeta ? 'meta' : 'lead');

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setActivities((prev) => [inserted, ...prev]);
      setTaskNote('');
    } catch (error) {
      console.error('Error saving voice note', error);
      alert('Failed to save voice note. Please try again.');
    } finally {
      setUploadingVoiceNote(false);
    }
  };

  const handlePlayVoiceNote = async (activity: Activity) => {
    if (!activity.audio_url) return;

    try {
      if (playingActivityId === activity.id && currentSound) {
        await currentSound.stopAsync();
        await currentSound.unloadAsync();
        setCurrentSound(null);
        setPlayingActivityId(null);
        return;
      }

      if (currentSound) {
        await currentSound.stopAsync();
        await currentSound.unloadAsync();
        setCurrentSound(null);
      }

      const { sound } = await Audio.Sound.createAsync({ uri: activity.audio_url });
      setCurrentSound(sound);
      setPlayingActivityId(activity.id);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          sound.unloadAsync();
          setCurrentSound(null);
          setPlayingActivityId(null);
        }
      });

      await sound.playAsync();
    } catch (error) {
      console.error('Error playing voice note', error);
      alert('Could not play voice note.');
      setPlayingActivityId(null);
    }
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleString();
  };

  const handleAddTask = async () => {
    if (!taskNote.trim() || !record) return;
    
    try {
      setSavingActivity(true);
      
      // Use correct table based on lead source
      const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
      const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';
      const leadTableName = isMeta ? 'meta_ads' : 'leads';
      
      const activityData = {
        [foreignKeyColumn]: record.id,
        activity_type: selectedActivityType,
        notes: taskNote.trim(),
        created_by: session?.user?.id || null,
        user_email: session?.user?.email || 'Mobile App User',
      };

      const { data, error } = await supabase
        .from(tableName)
        .insert([activityData])
        .select()
        .single();

      if (error) {
        console.error('Error saving activity:', error);
        alert('Failed to save activity. Please try again.');
      } else {
        // Update last_contact_date on the lead
        const now = new Date().toISOString();
        await supabase
          .from(leadTableName)
          .update({ last_contact_date: now })
          .eq('id', record.id);
        
        // Update the lead in parent component state
        const updatedLead = { ...record, last_contact_date: now };
        onLeadUpdate(updatedLead, isMeta ? 'meta' : 'lead');
        
        setActivities([data, ...activities]);
        setTaskNote('');
      }
    } catch (e) {
      console.error('Unexpected error saving activity:', e);
      alert('Failed to save activity. Please try again.');
    } finally {
      setSavingActivity(false);
    }
  };

  const handleQuickPhrase = (phrase: string) => {
    setTaskNote(phrase);
    setShowQuickPhrases(false);
  };

  type ActivityType = 'call' | 'text' | 'email' | 'note';

  const getActivityIconName = (
    type: ActivityType
  ): React.ComponentProps<typeof Ionicons>['name'] => {
    switch (type) {
      case 'call':
        return 'call-outline';
      case 'text':
        return 'chatbubble-ellipses-outline';
      case 'email':
        return 'mail-outline';
      case 'note':
      default:
        return 'document-text-outline';
    }
  };

  const getActivityLabel = (type: 'call' | 'text' | 'email' | 'note') => {
    switch (type) {
      case 'call': return 'Call';
      case 'text': return 'Text';
      case 'email': return 'Email';
      case 'note': return 'Note';
    }
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (!propUserRole || propUserRole !== 'super_admin') {
      alert('Only super admins can delete activities.');
      return;
    }

    try {
      setDeletingActivityId(activityId);
      
      // Use correct table based on lead source
      const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
      
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', activityId);

      if (error) {
        console.error('Error deleting activity:', error);
        alert('Failed to delete activity. Please try again.');
      } else {
        // Remove from local state
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setActivities(activities.filter(a => a.id !== activityId));
      }
    } catch (e) {
      console.error('Unexpected error deleting activity:', e);
      alert('Failed to delete activity. Please try again.');
    } finally {
      setDeletingActivityId(null);
    }
  };

  const handleUpdateLO = async (newLOId: string | null) => {
    if (!propUserRole || propUserRole !== 'super_admin') {
      alert('Only super admins can change LO assignments.');
      return;
    }

    try {
      setUpdatingLO(true);
      
      // Use correct table based on lead source
      const tableName = isMeta ? 'meta_ads' : 'leads';
      
      const { data, error } = await supabase
        .from(tableName)
        .update({ lo_id: newLOId })
        .eq('id', record.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating LO:', error);
        alert('Failed to update LO assignment. Please try again.');
      } else if (data) {
        // Update parent state
        onLeadUpdate(data, isMeta ? 'meta' : 'lead');
        setShowLOPicker(false);
      }
    } catch (e) {
      console.error('Unexpected error updating LO:', e);
      alert('Failed to update LO assignment. Please try again.');
    } finally {
      setUpdatingLO(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Modern Detail Header with Navigation */}
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.detailHeaderCenter}>
          <Text style={styles.detailHeaderTitle}>Lead Details</Text>
          <Text style={styles.detailHeaderSubtitle}>
            {currentIndex + 1} of {navigableList.length}
          </Text>
        </View>
        <View style={styles.navButtons}>
          <TouchableOpacity 
            onPress={handlePrevious} 
            style={[styles.navButton, !hasPrevious && styles.navButtonDisabled]}
            disabled={!hasPrevious}
          >
            <Text style={[styles.navButtonText, !hasPrevious && styles.navButtonTextDisabled]}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={handleNext} 
            style={[styles.navButton, !hasNext && styles.navButtonDisabled]}
            disabled={!hasNext}
          >
            <Text style={[styles.navButtonText, !hasNext && styles.navButtonTextDisabled]}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sticky Name Bar */}
      <View style={[styles.stickyNameBar, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <View style={styles.stickyNameColumn}>
          <View style={styles.stickyNameRow}>
            <Text style={[styles.stickyName, { color: colors.textPrimary }]} numberOfLines={1}>{fullName}</Text>
            <View style={[
              styles.stickyStatusBadge,
              { backgroundColor: STATUS_COLOR_MAP[status || 'new']?.bg || '#F5F5F5' }
            ]}>
              <Text style={[
                styles.stickyStatusText,
                { color: STATUS_COLOR_MAP[status || 'new']?.text || '#666' }
              ]}>
                {status ? formatStatus(status) : 'N/A'}
              </Text>
            </View>
          </View>
          <Text style={styles.stickyTimestamp}>
            📅 {new Date(record.created_at).toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric',
              year: 'numeric'
            })} • {new Date(record.created_at).toLocaleTimeString('en-US', { 
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32, backgroundColor: colors.background }} showsVerticalScrollIndicator={false}>
        <View style={[styles.detailCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>

          {/* Divider */}
          <View style={styles.sectionDivider} />

          {/* Status Dropdown */}
          {attentionBadge && (
            <View style={styles.attentionBadgeContainer}>
              <View style={[styles.detailAttentionBadge, { backgroundColor: attentionBadge.color }]}>
                <Text style={styles.detailAttentionBadgeText}>⚠️ {attentionBadge.label}</Text>
              </View>
            </View>
          )}
          
          {/* Status and LO Assignment Row (for admins) or Full Width Status (for non-admins) */}
          <View style={propUserRole === 'super_admin' ? styles.statusLORow : { marginTop: 0 }}>
            <TouchableOpacity
              style={[
                styles.statusDropdownButton,
                propUserRole === 'super_admin' && styles.statusDropdownButtonHalf,
                propUserRole !== 'super_admin' && styles.statusDropdownButtonFull
              ]}
              onPress={() => setShowStatusPicker(true)}
            >
              <View style={[
                styles.statusDropdownBadge,
                { backgroundColor: STATUS_COLOR_MAP[status || 'new']?.bg || '#F5F5F5' }
              ]}>
                <Text style={[
                  styles.statusDropdownBadgeText,
                  { color: STATUS_COLOR_MAP[status || 'new']?.text || '#666' }
                ]}>
                  {status ? formatStatus(status) : 'N/A'}
                </Text>
              </View>
              <Text style={styles.statusDropdownArrow}>▼</Text>
            </TouchableOpacity>

            {/* LO Assignment (Super Admin Only - Inline) */}
            {propUserRole === 'super_admin' && (
              <TouchableOpacity
                style={styles.loDropdownButton}
                onPress={() => setShowLOPicker(true)}
                disabled={updatingLO}
              >
                <Text style={styles.loDropdownLabel}>👤 LO:</Text>
                <Text style={styles.loDropdownValue} numberOfLines={1}>
                  {record.lo_id 
                    ? loanOfficers.find(lo => lo.id === record.lo_id)?.name || 'Unknown'
                    : 'Unassigned'
                  }
                </Text>
                <Text style={styles.statusDropdownArrow}>▼</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Status Picker Modal */}
          <Modal
            visible={showStatusPicker}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowStatusPicker(false)}
          >
            <TouchableOpacity 
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setShowStatusPicker(false)}
            >
              <View style={styles.statusPickerContainer}>
                <View style={styles.statusPickerHeader}>
                  <Text style={styles.statusPickerTitle}>Change Status</Text>
                  <TouchableOpacity onPress={() => setShowStatusPicker(false)}>
                    <Text style={styles.statusPickerClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.statusPickerScroll}>
                  {STATUSES.map((s) => {
                    const active = s === status;
                    const colors = STATUS_COLOR_MAP[s] || STATUS_COLOR_MAP['new'];
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[
                          styles.statusPickerOption,
                          active && styles.statusPickerOptionActive,
                        ]}
                        onPress={async () => {
                          setShowStatusPicker(false);
                          await onStatusChange(selected.source, record.id, s);
                        }}
                      >
                        <View style={[styles.statusPickerBadge, { backgroundColor: colors.bg }]}>
                          <Text style={[styles.statusPickerBadgeText, { color: colors.text }]}>
                            {formatStatus(s)}
                          </Text>
                        </View>
                        {active && <Text style={styles.statusPickerCheck}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Divider */}
          <View style={styles.sectionDivider} />

          {/* Contact buttons */}
          <Text style={styles.sectionTitle}>📞 Contact</Text>
          <View style={styles.contactRow}>
            <TouchableOpacity
              style={[
                styles.contactButton,
                !phone && styles.contactButtonDisabled,
              ]}
              onPress={handleCall}
              disabled={!phone}
            >
              <Text style={styles.contactButtonIcon}>☎</Text>
              <Text style={styles.contactButtonText}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.contactButton,
                !phone && styles.contactButtonDisabled,
              ]}
              onPress={handleText}
              disabled={!phone}
            >
              <Text style={styles.contactButtonIcon}>💬</Text>
              <Text style={styles.contactButtonText}>Text</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.contactButton,
                !email && styles.contactButtonDisabled,
              ]}
              onPress={handleEmail}
              disabled={!email}
            >
              <Text style={styles.contactButtonIcon}>✉</Text>
              <Text style={styles.contactButtonText}>Email</Text>
            </TouchableOpacity>
          </View>

          {/* Schedule Callback */}
          <View style={{ marginTop: 12 }}>
            <TouchableOpacity
              style={styles.scheduleCallbackButton}
              onPress={() => setShowCallbackModal(true)}
            >
              <Text style={styles.scheduleCallbackIcon}>⏰</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.scheduleCallbackTitle}>Schedule Callback</Text>
                <Text style={styles.scheduleCallbackSubtitle}>
                  Set a reminder to call {fullName}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.sectionDivider} />

          {/* LO Picker Modal (used by inline LO dropdown) */}
          {propUserRole === 'super_admin' && (
            <Modal
                visible={showLOPicker}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowLOPicker(false)}
              >
                <TouchableOpacity 
                  style={styles.modalOverlay}
                  activeOpacity={1}
                  onPress={() => setShowLOPicker(false)}
                >
                  <View style={styles.statusPickerContainer}>
                    <View style={styles.statusPickerHeader}>
                      <Text style={styles.statusPickerTitle}>Assign Loan Officer</Text>
                      <TouchableOpacity onPress={() => setShowLOPicker(false)}>
                        <Text style={styles.statusPickerClose}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.statusPickerScroll}>
                      <TouchableOpacity
                        style={[
                          styles.statusPickerItem,
                          !record.lo_id && styles.statusPickerItemActive,
                        ]}
                        onPress={() => handleUpdateLO(null)}
                        disabled={updatingLO}
                      >
                        <Text style={[
                          styles.statusPickerItemText,
                          !record.lo_id && styles.statusPickerItemTextActive,
                        ]}>Unassigned</Text>
                        {!record.lo_id && (
                          <Text style={styles.statusPickerCheck}>✓</Text>
                        )}
                      </TouchableOpacity>
                      {loanOfficers.map((lo) => (
                        <TouchableOpacity
                          key={lo.id}
                          style={[
                            styles.statusPickerItem,
                            record.lo_id === lo.id && styles.statusPickerItemActive,
                          ]}
                          onPress={() => handleUpdateLO(lo.id)}
                          disabled={updatingLO}
                        >
                          <Text style={[
                            styles.statusPickerItemText,
                            record.lo_id === lo.id && styles.statusPickerItemTextActive,
                          ]}>{lo.name}</Text>
                          {record.lo_id === lo.id && (
                            <Text style={styles.statusPickerCheck}>✓</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </TouchableOpacity>
              </Modal>
          )}

          {/* Basic fields */}
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>ℹ️ Details</Text>
          <Text style={[styles.detailFieldBlock, { color: colors.textPrimary }]} selectable={true}>
            Email: {email || 'N/A'}{'\n'}
            Phone: {phone || 'N/A'}
          </Text>

          {!isMeta && (
            <>
              {(record as Lead).loan_purpose && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Loan Purpose: {(record as Lead).loan_purpose}
                </Text>
              )}
              {(record as Lead).price != null && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Price: ${(record as Lead).price?.toLocaleString()}
                </Text>
              )}
              {(record as Lead).down_payment != null && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Down Payment: ${(record as Lead).down_payment?.toLocaleString()}
                </Text>
              )}
              {(record as Lead).credit_score != null && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Credit Score: {(record as Lead).credit_score}
                </Text>
              )}
              {(record as Lead).message && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Message: {(record as Lead).message}
                </Text>
              )}
            </>
          )}

          {isMeta && (
            <>
              {(record as MetaLead).platform && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Platform: {(record as MetaLead).platform}
                </Text>
              )}
              {(record as MetaLead).campaign_name && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Campaign: {(record as MetaLead).campaign_name}
                </Text>
              )}
              {(record as MetaLead).ad_name && (
                <>
                  <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                    Ad Name: {(record as MetaLead).ad_name}
                  </Text>
                  {adImage && (
                    <TouchableOpacity 
                      style={styles.viewAdButton}
                      onPress={() => setShowAdImage(true)}
                    >
                      <Text style={styles.viewAdButtonText}>📸 View Ad</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              {(record as MetaLead).subject_address && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Address: {(record as MetaLead).subject_address}
                </Text>
              )}
              {(record as MetaLead).preferred_language && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Language: {(record as MetaLead).preferred_language}
                </Text>
              )}
              {(record as MetaLead).credit_range && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Credit Range: {(record as MetaLead).credit_range}
                </Text>
              )}
              {(record as MetaLead).income_type && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Income Type: {(record as MetaLead).income_type}
                </Text>
              )}
              {(record as MetaLead).purchase_timeline && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Purchase Timeline: {(record as MetaLead).purchase_timeline}
                </Text>
              )}
              {(record as MetaLead).price_range && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Price Range: {(record as MetaLead).price_range}
                </Text>
              )}
              {(record as MetaLead).down_payment_saved && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Down Payment Saved: {(record as MetaLead).down_payment_saved}
                </Text>
              )}
              {(record as MetaLead).has_realtor != null && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Has Realtor: {(record as MetaLead).has_realtor ? 'Yes' : 'No'}
                </Text>
              )}
              {(record as MetaLead).county_interest && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  County Interest: {(record as MetaLead).county_interest}
                </Text>
              )}
              {(record as MetaLead).monthly_income && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Monthly Income: {(record as MetaLead).monthly_income}
                </Text>
              )}
              {((record as MetaLead).meta_ad_notes || (record as MetaLead).additional_notes) && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Notes: {(record as MetaLead).meta_ad_notes || (record as MetaLead).additional_notes}
                </Text>
              )}
            </>
          )}

          {/* Divider */}
          <View style={styles.sectionDivider} />

          {/* Tasks / Logging Section */}
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>✍️ Log Activity</Text>
          
          {/* Activity Type Buttons */}
          <View style={styles.activityTypeRow}>
            <TouchableOpacity
              style={[
                styles.activityTypeButton,
                selectedActivityType === 'call' && styles.activityTypeButtonActive,
              ]}
              onPress={() => setSelectedActivityType('call')}
            >
              <Text style={[
                styles.activityTypeText,
                selectedActivityType === 'call' && styles.activityTypeTextActive,
              ]}>
                <Ionicons
                  name="call-outline"
                  size={14}
                  color={selectedActivityType === 'call' ? '#059669' : '#64748B'}
                />{' '}
                Call
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.activityTypeButton,
                selectedActivityType === 'text' && styles.activityTypeButtonActive,
              ]}
              onPress={() => setSelectedActivityType('text')}
            >
              <Text style={[
                styles.activityTypeText,
                selectedActivityType === 'text' && styles.activityTypeTextActive,
              ]}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={14}
                  color={selectedActivityType === 'text' ? '#059669' : '#64748B'}
                />{' '}
                Text
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.activityTypeButton,
                selectedActivityType === 'email' && styles.activityTypeButtonActive,
              ]}
              onPress={() => setSelectedActivityType('email')}
            >
              <Text style={[
                styles.activityTypeText,
                selectedActivityType === 'email' && styles.activityTypeTextActive,
              ]}>
                <Ionicons
                  name="mail-outline"
                  size={14}
                  color={selectedActivityType === 'email' ? '#059669' : '#64748B'}
                />{' '}
                Email
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.activityTypeButton,
                selectedActivityType === 'note' && styles.activityTypeButtonActive,
              ]}
              onPress={() => setSelectedActivityType('note')}
            >
              <Text style={[
                styles.activityTypeText,
                selectedActivityType === 'note' && styles.activityTypeTextActive,
              ]}>
                <Ionicons
                  name="document-text-outline"
                  size={14}
                  color={selectedActivityType === 'note' ? '#059669' : '#64748B'}
                />{' '}
                Note
              </Text>
            </TouchableOpacity>
          </View>

          {/* Quick Phrases Button */}
          <TouchableOpacity
            style={styles.quickPhrasesButton}
            onPress={() => setShowQuickPhrases(!showQuickPhrases)}
          >
            <Text style={styles.quickPhrasesButtonText}>
              <Ionicons name="list-circle-outline" size={16} color="#0F172A" />{' '}
              Quick Phrases {showQuickPhrases ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>

          {/* Quick Phrases List */}
          {showQuickPhrases && (
            <View style={styles.quickPhrasesList}>
              {quickPhrases.map((phrase, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.quickPhraseItem}
                  onPress={() => handleQuickPhrase(phrase)}
                >
                  <Text style={styles.quickPhraseText}>{phrase}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          {/* Activity Input */}
          <View style={[styles.activityInputCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <TextInput
              style={styles.activityInput}
              placeholder={`Enter ${selectedActivityType} details...`}
              placeholderTextColor="#999"
              value={taskNote}
              onChangeText={setTaskNote}
              multiline
            />
            
            {/* Voice Note Recording Button */}
            <View style={styles.voiceNoteRow}>
              <TouchableOpacity
                style={[
                  styles.voiceNoteRecordButton,
                  isRecording && styles.voiceNoteRecordButtonActive,
                  uploadingVoiceNote && { opacity: 0.6 },
                ]}
                onPress={() => {
                  console.log('🔴 Button pressed! isRecording:', isRecording);
                  if (isRecording) {
                    console.log('⏹️ Stopping recording...');
                    stopRecordingAndSaveVoiceNote();
                  } else {
                    console.log('▶️ Starting recording...');
                    startVoiceRecording();
                  }
                }}
                disabled={uploadingVoiceNote}
              >
                <Text style={styles.voiceNoteRecordButtonText}>
                  {isRecording ? '🛑 Tap to stop' : '🎤 Voice note'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.voiceNoteHint}>
                {isRecording
                  ? 'Recording… tap to finish and log'
                  : 'Optional: log a quick voice note'}
              </Text>
            </View>
            
            <Animated.View style={{ transform: [{ scale: logButtonScale }] }}>
              <TouchableOpacity
                style={[
                  styles.logActivityButton,
                  (!taskNote.trim() || savingActivity) && styles.logActivityButtonDisabled,
                ]}
                onPress={() => {
                  if (!taskNote.trim() || savingActivity) return;
                  animateLogButton();
                  handleAddTask();
                }}
                disabled={!taskNote.trim() || savingActivity}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  {!savingActivity && (
                    <Ionicons
                      name={getActivityIconName(selectedActivityType)}
                      size={16}
                      color="#FFFFFF"
                      style={{ marginRight: 6 }}
                    />
                  )}
                  <Text style={styles.logActivityButtonText}>
                    {savingActivity
                      ? 'Saving...'
                      : `Log ${getActivityLabel(selectedActivityType)}`}
                  </Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Divider */}
          <View style={styles.sectionDivider} />

          {/* Activity History */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Ionicons
              name="time-outline"
              size={16}
              color={colors.textPrimary}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Activity History</Text>
          </View>

          {loadingActivities ? (
            <ActivityIndicator size="small" color="#007aff" style={{ marginTop: 12 }} />
          ) : activities.length > 0 ? (
            <View style={styles.tasksList}>
              {activities.map((activity) => (
                <View key={activity.id} style={[styles.activityHistoryItem, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                  <View style={styles.activityHistoryHeader}>
                    <View style={styles.activityHistoryHeaderLeft}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons
                          name={activity.audio_url ? 'mic-outline' : getActivityIconName(activity.activity_type)}
                          size={14}
                          color={colors.textPrimary}
                          style={{ marginRight: 6 }}
                        />
                        <Text style={styles.activityHistoryType}>
                          {activity.audio_url
                            ? 'Voice note'
                            : getActivityLabel(activity.activity_type)}
                        </Text>
                      </View>
                      <Text style={styles.activityHistoryTimestamp}>
                        {formatTime(activity.created_at)}
                      </Text>
                    </View>
                    {propUserRole === 'super_admin' && (
                      <TouchableOpacity
                        onPress={() => handleDeleteActivity(activity.id)}
                        disabled={deletingActivityId === activity.id}
                        style={styles.deleteActivityButton}
                      >
                        {deletingActivityId === activity.id ? (
                          <ActivityIndicator size="small" color="#DC2626" />
                        ) : (
                          <Ionicons
                            name="trash-outline"
                            size={16}
                            color="#DC2626"
                          />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  {activity.notes ? (
                    <Text style={styles.activityHistoryNote}>{activity.notes}</Text>
                  ) : null}
                  
                  {/* Voice note playback button */}
                  {activity.audio_url && (
                    <TouchableOpacity
                      style={[
                        styles.voiceNoteButton,
                        playingActivityId === activity.id && styles.voiceNoteButtonActive,
                      ]}
                      onPress={() => handlePlayVoiceNote(activity)}
                    >
                      <Text style={styles.voiceNoteButtonText}>
                        {playingActivityId === activity.id ? '▶ Playing…' : '▶ Play voice note'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  
                  {activity.user_email && (
                    <Text style={styles.activityUserEmail}>by {activity.user_email}</Text>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.noTasksText}>No activity logged yet</Text>
          )}
        </View>
      </ScrollView>

      {/* Ad Image Modal */}
      {adImage && (
        <Modal
          visible={showAdImage}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowAdImage(false)}
        >
          <View style={styles.adImageModalOverlay}>
            <TouchableOpacity 
              style={styles.adImageModalClose}
              onPress={() => setShowAdImage(false)}
              activeOpacity={0.9}
            >
              <View style={styles.adImageModalCloseButton}>
                <Text style={styles.adImageModalCloseText}>✕</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.adImageModalContent}>
              <Image 
                source={adImage}
                style={styles.adImageFull}
                resizeMode="contain"
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Text Template Modal */}
      <Modal
        visible={showTemplateModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowTemplateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.templateModalContent}>
            <View style={styles.templateModalHeader}>
              <Text style={styles.templateModalTitle}>
                {useSpanishTemplates ? 'Elegir Plantilla de Texto' : 'Choose a Text Template'}
              </Text>
              <TouchableOpacity 
                onPress={() => setShowTemplateModal(false)}
                style={styles.templateModalClose}
              >
                <Text style={styles.templateModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Language Toggle */}
            <View style={styles.languageToggleContainer}>
              <TouchableOpacity
                style={[
                  styles.languageToggleButton,
                  !useSpanishTemplates && styles.languageToggleButtonActive
                ]}
                onPress={() => setUseSpanishTemplates(false)}
              >
                <Text style={[
                  styles.languageToggleText,
                  !useSpanishTemplates && styles.languageToggleTextActive
                ]}>🇺🇸 English</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.languageToggleButton,
                  useSpanishTemplates && styles.languageToggleButtonActive
                ]}
                onPress={() => setUseSpanishTemplates(true)}
              >
                <Text style={[
                  styles.languageToggleText,
                  useSpanishTemplates && styles.languageToggleTextActive
                ]}>🇪🇸 Español</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.templateList} showsVerticalScrollIndicator={false}>
              {TEXT_TEMPLATES.map((template) => {
                const variables: TemplateVariables = {
                  fname: record.first_name || 'there',
                  loFullname: currentLOInfo 
                    ? `${currentLOInfo.firstName} ${currentLOInfo.lastName}`.trim() 
                    : 'Mario',
                  loFname: currentLOInfo?.firstName || 'Mario',
                  loPhone: currentLOInfo?.phone || '[Phone]',
                  loEmail: currentLOInfo?.email || '[Email]',
                  platform: isMeta ? (record as MetaLead).platform || 'Facebook' : 'our website',
                };
                const templateText = getTemplateText(template, useSpanishTemplates);
                const preview = fillTemplate(templateText, variables);

                return (
                  <TouchableOpacity
                    key={template.id}
                    style={styles.templateItem}
                    onPress={() => handleTemplateSelect(template.id)}
                  >
                    <Text style={styles.templateName}>{getTemplateName(template, useSpanishTemplates)}</Text>
                    <Text style={styles.templatePreview} numberOfLines={8}>
                      {preview}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Callback Reminder Modal */}
      <Modal
        visible={showCallbackModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCallbackModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.callbackModalContent}>
            <View style={styles.templateModalHeader}>
              <Text style={styles.templateModalTitle}>Schedule Callback</Text>
              <TouchableOpacity
                onPress={() => setShowCallbackModal(false)}
                style={styles.templateModalClose}
              >
                <Text style={styles.templateModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.callbackLeadName}>
              Lead: {fullName}
            </Text>

            {callbackDate && (
              <View style={styles.callbackPickerWrapper}>
                <DateTimePicker
                  value={callbackDate}
                  mode="datetime"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_event, date) => {
                    if (date) setCallbackDate(date);
                  }}
                />
              </View>
            )}

            {isMeta && 'platform' in record && 'ad_name' in record && record.platform && record.ad_name && (
              <Text style={styles.callbackMetaInfo}>
                ({record.platform}) {record.ad_name}
              </Text>
            )}

            <TextInput
              style={styles.callbackNoteInput}
              placeholder="Notes (optional)"
              placeholderTextColor="#999"
              value={callbackNote}
              onChangeText={setCallbackNote}
              multiline
            />

            <TouchableOpacity
              style={[
                styles.logActivityButton,
                (!callbackDate || savingCallback) && styles.logActivityButtonDisabled,
              ]}
              disabled={!callbackDate || savingCallback}
              onPress={async () => {
                if (!callbackDate) return;
                try {
                  setSavingCallback(true);
                  await scheduleLeadCallback({
                    leadId: record.id,
                    leadName: fullName,
                    scheduledFor: callbackDate,
                    createdByUserId: session?.user?.id,
                    note: callbackNote,
                    leadSource: isMeta ? 'meta' : 'lead',
                  });

                  // Log callback as a note activity in Activity History
                  try {
                    const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
                    const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';

                    // Format date as MM/DD/YYYY HH:MMam/pm
                    const formattedDate = callbackDate.toLocaleString('en-US', {
                      month: '2-digit',
                      day: '2-digit',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    });

                    const callbackMessage = `Callback scheduled for ${formattedDate}${callbackNote ? ` - ${callbackNote}` : ''}`;

                    const { data: newActivity } = await supabase.from(tableName).insert([
                      {
                        [foreignKeyColumn]: record.id,
                        activity_type: 'note',
                        notes: callbackMessage,
                        created_by: session?.user?.id || null,
                        user_email: session?.user?.email || 'Mobile App User',
                      },
                    ])
                    .select()
                    .single();

                    // Add the new activity to the list immediately
                    if (newActivity) {
                      setActivities([newActivity, ...activities]);
                    }
                  } catch (e) {
                    console.log('Callback activity log failed (non-fatal):', e);
                  }

                  setShowCallbackModal(false);
                } catch (err: any) {
                  console.error('Error scheduling callback:', err);
                  alert(err.message || 'Failed to schedule callback.');
                } finally {
                  setSavingCallback(false);
                }
              }}
            >
              <Text style={styles.logActivityButtonText}>
                {savingCallback ? 'Saving…' : 'Save & Schedule Reminder'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}


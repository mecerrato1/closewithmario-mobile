import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  FlatList,
  Modal,
  RefreshControl,
  Platform,
  KeyboardAvoidingView,
  LayoutAnimation,
  UIManager,
  Animated,
  Alert,
  Image,
  Linking,
} from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { getUserRole, getUserTeamMemberId, canSeeAllLeads, type UserRole } from './src/lib/roles';
import { TEXT_TEMPLATES, fillTemplate, getTemplateText, getTemplateName, type TemplateVariables } from './src/lib/textTemplates';
import type { Lead, MetaLead, SelectedLeadRef, LoanOfficer, Realtor, Activity, AttentionBadge } from './src/lib/types/leads';
import { STATUSES, STATUS_DISPLAY_MAP, STATUS_COLOR_MAP, getLeadAlert, formatStatus, getTimeAgo } from './src/lib/leadsHelpers';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import DateTimePicker from '@react-native-community/datetimepicker';
import { scheduleLeadCallback } from './src/lib/callbacks';
import AuthScreen from './src/screens/AuthScreen';
import { LeadDetailView } from './src/screens/LeadDetailScreen';
import TeamManagementScreen from './src/screens/TeamManagementScreen';
import MortgageCalculatorScreen from './src/screens/MortgageCalculatorScreen';
import { AppLockProvider, useAppLock } from './src/contexts/AppLockContext';
import { useAiLeadAttention } from './src/hooks/useAiLeadAttention';
import LockScreen from './src/screens/LockScreen';
import QuoteOfTheDay from './src/components/dashboard/QuoteOfTheDay';
import { registerForPushNotifications } from './src/lib/notifications';
import { styles } from './src/styles/appStyles';
import { useThemeColors } from './src/styles/theme';
import { 
  requestMediaLibraryPermission, 
  pickProfileImage, 
  uploadProfilePicture, 
  removeCustomProfilePicture,
  getAvatarUrl 
} from './src/utils/profilePicture';

import * as WebBrowser from 'expo-web-browser';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Required for AuthSession to complete on iOS
WebBrowser.maybeCompleteAuthSession();

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,     // show banner/alert
    shouldPlaySound: true,     // play a sound
    shouldSetBadge: false,     // no badge for now
    shouldShowBanner: true,    // show banner on iOS
    shouldShowList: true,      // show in notification list
  }),
});

// ------------ Types and helpers now imported from separate modules ------------
// ------------ AuthScreen now imported from src/screens/AuthScreen.tsx ------------
// ------------ LeadDetailView now imported from src/screens/LeadDetailScreen.tsx ------------
// ------------ TeamManagementScreen now imported from src/screens/TeamManagementScreen.tsx ------------

// ------------ Leads Screen ------------
// ------------ Leads Screen ------------
type LeadsScreenProps = {
  onSignOut: () => void;
  session: Session | null;
  notificationLead?: { id: string; source: 'lead' | 'meta'; openToMessages?: boolean } | null;
  onNotificationHandled?: () => void;
};

function LeadsScreen({ onSignOut, session, notificationLead, onNotificationHandled }: LeadsScreenProps) {
  const { colors, isDark } = useThemeColors();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [metaLeads, setMetaLeads] = useState<MetaLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [selectedLead, setSelectedLead] = useState<SelectedLeadRef | null>(
    null
  );
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<'leads' | 'meta' | 'all'>('all');
  const [showDashboard, setShowDashboard] = useState(true);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [attentionFilter, setAttentionFilter] = useState(false);
  const [unreadFilter, setUnreadFilter] = useState(false);
  const [hasManuallySelectedTab, setHasManuallySelectedTab] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [loanOfficers, setLoanOfficers] = useState<Array<{ id: string; name: string }>>([]);
  const [userRole, setUserRole] = useState<UserRole>('buyer');
  const [searchQuery, setSearchQuery] = useState('');
  const [showTeamManagement, setShowTeamManagement] = useState(false);
  const [showMortgageCalculator, setShowMortgageCalculator] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [teamMemberId, setTeamMemberId] = useState<string | null>(null);
  const [selectedLOFilter, setSelectedLOFilter] = useState<string | null>(null); // null = all LOs
  const [showLOPicker, setShowLOPicker] = useState(false);
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>('all'); // 'all' = all sources
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [leadEligible, setLeadEligible] = useState<boolean>(true);
  const [todayCallbacks, setTodayCallbacks] = useState<any[]>([]);
  const [showCallbackHistory, setShowCallbackHistory] = useState(false);
  const [callbackHistory, setCallbackHistory] = useState<any[]>([]);
  const [unreadMessageCounts, setUnreadMessageCounts] = useState<Record<string, number>>({});
  const [showAiRecommendationModal, setShowAiRecommendationModal] = useState(false);
  const [selectedAiAttention, setSelectedAiAttention] = useState<{ reason: string; suggestedAction: string; badge: string; leadId: string; source: 'lead' | 'meta'; phone: string; firstName: string } | null>(null);
  
  // AI Lead Attention - fetch from cache/API
  const { fetchBatchAttention, getAttention, invalidateAttention, attentionMap } = useAiLeadAttention();
  const [aiDataLoaded, setAiDataLoaded] = useState(0); // Counter to force re-render when AI data loads
  
  // Add Lead Modal state
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [savingNewLead, setSavingNewLead] = useState(false);
  const [addLeadError, setAddLeadError] = useState<string | null>(null);
  const [newLead, setNewLead] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    referral_source: '',
    loan_purpose: 'Home Buying',
    message: '',
  });
  const [showLoanPurposePicker, setShowLoanPurposePicker] = useState(false);
  const LOAN_PURPOSES = ['Home Buying', 'Home Selling', 'Mortgage Refinance', 'Investment Property', 'General Real Estate'];

  // Profile picture upload handlers
  const handleUploadProfilePicture = async () => {
    try {
      setShowProfileMenu(false);
      
      // Request permission
      const hasPermission = await requestMediaLibraryPermission();
      if (!hasPermission) {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to upload a profile picture.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Pick image
      const result = await pickProfileImage();
      if (!result || result.canceled) {
        return;
      }

      setUploadingPicture(true);

      // Upload to Supabase
      const uploadResult = await uploadProfilePicture(
        session?.user?.id || '',
        result.assets[0].uri
      );

      setUploadingPicture(false);

      if (uploadResult.success) {
        Alert.alert('Success', 'Profile picture updated!', [{ text: 'OK' }]);
        // Force a re-render by toggling a state
        setUploadingPicture(false);
        setUploadingPicture(true);
        setUploadingPicture(false);
      } else {
        Alert.alert('Error', uploadResult.error || 'Failed to upload picture', [{ text: 'OK' }]);
      }
    } catch (error) {
      setUploadingPicture(false);
      Alert.alert('Error', 'An unexpected error occurred', [{ text: 'OK' }]);
    }
  };

  const handleRemoveProfilePicture = async () => {
    try {
      setShowProfileMenu(false);
      
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
            }
          }
        ]
      );
    } catch (error) {
      setUploadingPicture(false);
      Alert.alert('Error', 'An unexpected error occurred', [{ text: 'OK' }]);
    }
  };

  // Micro animations for the lead list
  const listOpacity = useRef(new Animated.Value(1)).current;
  const listScale = useRef(new Animated.Value(1)).current;

  // Calculate unique sources for the filter
  const uniqueSources = React.useMemo(() => {
    const sources = new Set<string>();
    
    // Add sources from meta leads (ad_name)
    metaLeads.forEach(l => {
      if (l.ad_name) sources.add(l.ad_name);
      else if (l.campaign_name) sources.add(l.campaign_name);
    });
    
    // Add sources from organic leads (source_detail)
    leads.forEach(l => {
      if (l.source_detail) sources.add(l.source_detail);
    });
    
    return Array.from(sources).sort();
  }, [leads, metaLeads]);

  // Collapsing header animation for leads view
  const scrollY = useRef(new Animated.Value(0)).current;
  const HEADER_EXPANDED_HEIGHT = 310;
  const HEADER_COLLAPSED_HEIGHT = 120;

  const headerHeight = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [HEADER_EXPANDED_HEIGHT, HEADER_COLLAPSED_HEIGHT],
    extrapolate: 'clamp',
  });

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const headerTitleScale = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0.85],
    extrapolate: 'clamp',
  });

  const statsScale = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const statsHeight = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [80, 0], // Animate height to collapse/expand layout
    extrapolate: 'clamp',
  });

  const statsOpacity = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Collapsing header animation for dashboard view
  const dashboardScrollY = useRef(new Animated.Value(0)).current;
  const DASHBOARD_HEADER_EXPANDED = userRole === 'super_admin' ? 440 : 460;
  const DASHBOARD_HEADER_COLLAPSED = 230;
  const HEADER_SCROLL_DISTANCE = DASHBOARD_HEADER_EXPANDED - DASHBOARD_HEADER_COLLAPSED;

  const dashboardHeaderTranslateY = dashboardScrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE],
    outputRange: [0, -HEADER_SCROLL_DISTANCE],
    extrapolate: 'clamp',
  });

  const dashboardUserInfoTranslateY = dashboardScrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE],
    outputRange: [0, HEADER_SCROLL_DISTANCE], // Moves down to counter header moving up
    extrapolate: 'clamp',
  });

  const dashboardContentOpacity = dashboardScrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const dashboardStatsScale = dashboardScrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE],
    outputRange: [1, 0.7],
    extrapolate: 'clamp',
  });

  const dashboardStatsTranslateY = dashboardScrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE],
    outputRange: [0, 20], // Push chips down further to clear taller super admin header content
    extrapolate: 'clamp',
  });

  const triggerListAnimation = () => {
    // Small pulse + LayoutAnimation for item movement
    Animated.parallel([
      Animated.timing(listOpacity, {
        toValue: 0.96,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(listScale, {
          toValue: 0.98,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(listScale, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      // Reset opacity so future animations look consistent
      listOpacity.setValue(1);
    });
  };

  const completeCallback = async (callbackId: string) => {
    try {
      const { error } = await supabase
        .from('lead_callbacks')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', callbackId);

      if (error) throw error;

      // Remove from local state so it disappears from today's list
      setTodayCallbacks(prev => prev.filter(c => c.id !== callbackId));
    } catch (error: any) {
      console.error('Error completing callback:', error);
      Alert.alert('Error', 'Failed to mark callback as done');
    }
  };

  const loadCallbackHistory = async (days: 30 | 45 | 'all' = 30) => {
    if (!session?.user?.id) return;

    try {
      let query = supabase
        .from('lead_callbacks')
        .select('id, scheduled_for, title, notes, lead_id, meta_ad_id, completed_at')
        .eq('created_by', session.user.id);

      if (days !== 'all') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        query = query.gte('completed_at', cutoff.toISOString());
      }

      const { data, error } = await query.order('completed_at', { ascending: false });

      if (error) {
        console.error('Error loading callback history:', error);
      } else {
        setCallbackHistory((data || []).filter(cb => cb.completed_at));
      }
    } catch (error) {
      console.error('Unexpected error loading callback history:', error);
    }
  };

  const animatedListStyle = {
    flex: 1,
    opacity: listOpacity,
    transform: [{ scale: listScale }],
  };

  useEffect(() => {
    const init = async () => {
      if (!session?.user?.id || !session?.user?.email) {
        setErrorMessage('No user session found');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Get user's role using the role system
        const role = await getUserRole(session.user.id, session.user.email);
        console.log('User role:', role);
        setUserRole(role);

        // Fetch team member ID and lead_eligible status for loan officers
        if (role === 'loan_officer') {
          const memberId = await getUserTeamMemberId(session.user.id, 'loan_officer');
          setTeamMemberId(memberId);
          
          if (memberId) {
            const { data: loData } = await supabase
              .from('loan_officers')
              .select('lead_eligible')
              .eq('id', memberId)
              .single();
            
            if (loData) {
              setLeadEligible(loData.lead_eligible ?? true);
            }
          }
        }

        // Fetch loan officers for super admins
        if (role === 'super_admin' || role === 'admin') {
          const { data: losData } = await supabase
            .from('loan_officers')
            .select('id, first_name, last_name')
            .eq('active', true)
            .order('first_name');
          
          if (losData) {
            setLoanOfficers(losData.map(lo => ({
              id: lo.id,
              name: `${lo.first_name} ${lo.last_name}`.trim()
            })));
          }
        }

        // Build queries
        let leadsQuery = supabase
          .from('leads')
          .select(
            'id, created_at, first_name, last_name, email, phone, status, last_contact_date, loan_purpose, price, down_payment, credit_score, message, lo_id, realtor_id, source, source_detail'
          )
          .order('created_at', { ascending: false });

        let metaQuery = supabase
          .from('meta_ads')
          .select(
            'id, created_at, first_name, last_name, email, phone, status, last_contact_date, platform, campaign_name, ad_name, subject_address, preferred_language, credit_range, income_type, purchase_timeline, price_range, down_payment_saved, has_realtor, additional_notes, county_interest, monthly_income, meta_ad_notes, lo_id, realtor_id'
          )
          .order('created_at', { ascending: false });

        // Apply filters based on role
        if (!canSeeAllLeads(role)) {
          // LOs and Realtors only see their assigned leads
          if (role === 'loan_officer') {
            const teamMemberId = await getUserTeamMemberId(session.user.id, 'loan_officer');
            if (teamMemberId) {
              leadsQuery = leadsQuery.eq('lo_id', teamMemberId);
              metaQuery = metaQuery.eq('lo_id', teamMemberId);
            } else {
              // LO not linked to any team member - show no leads
              leadsQuery = leadsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
              metaQuery = metaQuery.eq('id', '00000000-0000-0000-0000-000000000000');
            }
          } else if (role === 'realtor') {
            const teamMemberId = await getUserTeamMemberId(session.user.id, 'realtor');
            if (teamMemberId) {
              leadsQuery = leadsQuery.eq('realtor_id', teamMemberId);
              metaQuery = metaQuery.eq('realtor_id', teamMemberId);
            } else {
              // Realtor not linked to any team member - show no leads
              leadsQuery = leadsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
              metaQuery = metaQuery.eq('id', '00000000-0000-0000-0000-000000000000');
            }
          } else {
            // Buyers and other roles see no leads - use impossible filter
            leadsQuery = leadsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
            metaQuery = metaQuery.eq('id', '00000000-0000-0000-0000-000000000000');
          }
        }
        // Admins and Super Admins see all leads (no filter)

        const { data: leadsData, error: leadsError } = await leadsQuery;
        const { data: metaData, error: metaError } = await metaQuery;

        if (leadsError) {
          console.error('Supabase leads error:', leadsError);
        }

        if (metaError) {
          console.error('Supabase meta_ads error:', metaError);
        }

        const safeLeads = (leadsData || []) as Lead[];
        const safeMeta = (metaData || []) as MetaLead[];

        setLeads(safeLeads);
        setMetaLeads(safeMeta);

        // Fetch AI attention data for all leads
        const allLeadIds = [...safeLeads.map(l => l.id), ...safeMeta.map(l => l.id)];
        if (allLeadIds.length > 0) {
          console.log('[App] Fetching AI attention for', allLeadIds.length, 'leads');
          fetchBatchAttention(allLeadIds)
            .then(() => {
              console.log('[App] AI attention fetch completed successfully');
              // Force re-render after AI data loads
              setAiDataLoaded(prev => prev + 1);
            })
            .catch((err) => {
              console.error('[App] AI attention fetch error:', err);
            });
        }

        setDebugInfo(
          `leads: ${safeLeads.length} · meta: ${safeMeta.length}`
        );

        // Fetch today's callbacks for the current user (only incomplete)
        if (session?.user?.id) {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);

          const { data: callbacksData, error: callbacksError } = await supabase
            .from('lead_callbacks')
            .select('id, scheduled_for, title, notes, lead_id, meta_ad_id, completed_at')
            .gte('scheduled_for', todayStart.toISOString())
            .lte('scheduled_for', todayEnd.toISOString())
            .eq('created_by', session.user.id)
            .is('completed_at', null)
            .order('scheduled_for', { ascending: true });

          if (callbacksError) {
            console.error('Error loading today callbacks:', callbacksError);
          } else {
            setTodayCallbacks(callbacksData || []);
          }
        }

        // Fetch unread message counts for meta leads
        if (safeMeta.length > 0) {
          const leadIds = safeMeta.map(l => l.id);
          const { data: unreadData, error: unreadError } = await supabase
            .from('sms_messages')
            .select('lead_id')
            .in('lead_id', leadIds)
            .eq('direction', 'inbound')
            .is('read_at', null);
          
          console.log('📬 Unread messages query:', { unreadData, unreadError, leadIds: leadIds.length });
          
          if (!unreadError && unreadData) {
            const counts: Record<string, number> = {};
            unreadData.forEach(msg => {
              if (msg.lead_id) {
                counts[msg.lead_id] = (counts[msg.lead_id] || 0) + 1;
              }
            });
            console.log('📬 Unread counts:', counts);
            setUnreadMessageCounts(counts);
          } else if (unreadError) {
            console.error('📬 Unread messages error:', unreadError);
          }
        }

        if (leadsError && metaError) {
          setErrorMessage(
            `Error reading both tables: leads(${leadsError.message}), meta_ads(${metaError.message})`
          );
        }
      } catch (e: any) {
        console.error('Unexpected error:', e);
        setErrorMessage(e?.message || 'Unexpected error');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [session?.user?.id]);

  // Subscribe to loan_officers table changes to update lead_eligible status in real-time
  useEffect(() => {
    if (!session?.user?.id || !teamMemberId || userRole !== 'loan_officer') {
      return;
    }

    console.log('📡 Setting up real-time subscription for loan officer:', teamMemberId);

    // Set up real-time subscription
    const subscription = supabase
      .channel('loan_officer_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'loan_officers',
          filter: `id=eq.${teamMemberId}`,
        },
        (payload) => {
          console.log('🔔 Loan officer updated:', payload);
          if (payload.new && 'lead_eligible' in payload.new) {
            const newStatus = payload.new.lead_eligible;
            console.log('✅ Updating lead_eligible status to:', newStatus);
            setLeadEligible(newStatus);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to loan officer changes');
        }
        // Silently handle errors - polling fallback will keep things working
      });

    // Also poll every 30 seconds as a fallback (in case Realtime isn't enabled)
    const pollInterval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('loan_officers')
          .select('lead_eligible')
          .eq('id', teamMemberId)
          .single();
        
        if (data && data.lead_eligible !== leadEligible) {
          console.log('🔄 Polling detected change in lead_eligible:', data.lead_eligible);
          setLeadEligible(data.lead_eligible);
        }
      } catch (error) {
        console.error('Error polling lead_eligible status:', error);
      }
    }, 30000); // Poll every 30 seconds

    return () => {
      console.log('🔌 Unsubscribing from loan officer changes');
      subscription.unsubscribe();
      clearInterval(pollInterval);
    };
  }, [session?.user?.id, teamMemberId, userRole, leadEligible]);

  // State for opening directly to messages tab (from notification)
  const [openToMessages, setOpenToMessages] = useState(false);

  // Subscribe to new inbound SMS messages to update unread dots in real-time
  useEffect(() => {
    if (metaLeads.length === 0) return;

    const subscription = supabase
      .channel('sms_messages_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sms_messages', filter: 'direction=eq.inbound' },
        (payload) => {
          const newMessage = payload.new as { lead_id: string | null; direction: string; read_at: string | null };
          if (newMessage.lead_id && newMessage.direction === 'inbound' && !newMessage.read_at) {
            console.log('📬 New inbound SMS received for lead:', newMessage.lead_id);
            setUnreadMessageCounts(prev => ({
              ...prev,
              [newMessage.lead_id!]: (prev[newMessage.lead_id!] || 0) + 1
            }));
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [metaLeads.length > 0]);

  // Handle notification tap to navigate to lead
  useEffect(() => {
    if (notificationLead && !loading) {
      console.log('📱 Notification tap received:', notificationLead);
      // Navigate directly to the lead using the source from notification
      setSelectedLead({ source: notificationLead.source, id: notificationLead.id });
      setShowDashboard(false);
      // If notification has openToMessages flag, set it
      if (notificationLead.openToMessages) {
        console.log('📱 Setting openToMessages to true');
        setOpenToMessages(true);
      }
      onNotificationHandled?.();
    }
  }, [notificationLead, loading, onNotificationHandled]);

  // Auto-switch tab based on available leads (only on initial load)
  useEffect(() => {
    if (!loading && !hasManuallySelectedTab) {
      if (metaLeads.length === 0 && leads.length > 0) {
        setActiveTab('leads');
      } else if (metaLeads.length > 0 && leads.length === 0) {
        setActiveTab('meta');
      } else if (metaLeads.length > 0 || leads.length > 0) {
        // Both have leads or only meta has leads, default to 'all'
        setActiveTab('all');
      }
    }
  }, [loading, leads.length, metaLeads.length, hasManuallySelectedTab]);

  // Pull-to-refresh handler
  const onRefresh = async () => {
    setRefreshing(true);
    if (!session?.user?.id || !session?.user?.email) {
      setRefreshing(false);
      return;
    }

    try {
      const userRole = await getUserRole(session.user.id, session.user.email);
      
      // Refresh lead_eligible status for loan officers
      if (userRole === 'loan_officer' && teamMemberId) {
        const { data: loData } = await supabase
          .from('loan_officers')
          .select('lead_eligible')
          .eq('id', teamMemberId)
          .single();
        
        if (loData) {
          console.log('🔄 Pull-to-refresh: Updated lead_eligible to:', loData.lead_eligible);
          setLeadEligible(loData.lead_eligible ?? true);
        }
      }
      
      let leadsQuery = supabase
        .from('leads')
        .select('id, created_at, first_name, last_name, email, phone, status, last_contact_date, loan_purpose, price, down_payment, credit_score, message, lo_id, realtor_id, source, source_detail')
        .order('created_at', { ascending: false });

      let metaQuery = supabase
        .from('meta_ads')
        .select('id, created_at, first_name, last_name, email, phone, status, last_contact_date, platform, campaign_name, ad_name, subject_address, preferred_language, credit_range, income_type, purchase_timeline, price_range, down_payment_saved, has_realtor, additional_notes, county_interest, monthly_income, meta_ad_notes, lo_id, realtor_id')
        .order('created_at', { ascending: false});

      if (!canSeeAllLeads(userRole)) {
        if (userRole === 'loan_officer') {
          const teamMemberId = await getUserTeamMemberId(session.user.id, 'loan_officer');
          if (teamMemberId) {
            leadsQuery = leadsQuery.eq('lo_id', teamMemberId);
            metaQuery = metaQuery.eq('lo_id', teamMemberId);
          }
        } else if (userRole === 'realtor') {
          const teamMemberId = await getUserTeamMemberId(session.user.id, 'realtor');
          if (teamMemberId) {
            leadsQuery = leadsQuery.eq('realtor_id', teamMemberId);
            metaQuery = metaQuery.eq('realtor_id', teamMemberId);
          }
        }
      }

      const { data: leadsData } = await leadsQuery;
      const { data: metaData } = await metaQuery;

      const safeLeads = (leadsData || []) as Lead[];
      const safeMeta = (metaData || []) as MetaLead[];

      setLeads(safeLeads);
      setMetaLeads(safeMeta);
      setDebugInfo(`leads rows: ${safeLeads.length} · meta_ads rows: ${safeMeta.length}`);

      // Refresh unread message counts
      if (safeMeta.length > 0) {
        const leadIds = safeMeta.map(l => l.id);
        const { data: unreadData, error: unreadError } = await supabase
          .from('sms_messages')
          .select('lead_id')
          .in('lead_id', leadIds)
          .eq('direction', 'inbound')
          .is('read_at', null);
        
        if (!unreadError && unreadData) {
          const counts: Record<string, number> = {};
          unreadData.forEach(msg => {
            if (msg.lead_id) {
              counts[msg.lead_id] = (counts[msg.lead_id] || 0) + 1;
            }
          });
          setUnreadMessageCounts(counts);
        }
      }

      // Refresh today's callbacks as well
      if (session?.user?.id) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const { data: callbacksData, error: callbacksError } = await supabase
          .from('lead_callbacks')
          .select('id, scheduled_for, title, notes, lead_id, meta_ad_id')
          .gte('scheduled_for', todayStart.toISOString())
          .lte('scheduled_for', todayEnd.toISOString())
          .eq('created_by', session.user.id)
          .order('scheduled_for', { ascending: true });

        if (callbacksError) {
          console.error('Error refreshing today callbacks:', callbacksError);
        } else {
          setTodayCallbacks(callbacksData || []);
        }
      }
    } catch (e) {
      console.error('Refresh error:', e);
    } finally {
      setRefreshing(false);
    }
  };

  const handleStatusChange = async (
    source: 'lead' | 'meta',
    id: string,
    newStatus: string
  ) => {
    try {
      setStatusUpdating(true);

      // Close detail view BEFORE updating state if the status change would filter out the lead
      // This prevents the "Rendered fewer hooks" crash when the lead gets filtered out
      if (selectedLead?.id === id) {
        // Check if the new status would cause the lead to be filtered out
        const wouldBeFilteredOut = 
          // Case 1: Marking as unqualified when filter is 'all' (unqualified are hidden by default)
          (newStatus === 'unqualified' && selectedStatusFilter === 'all') ||
          // Case 2: Changing FROM unqualified to something else when filter is 'unqualified'
          (selectedStatusFilter === 'unqualified' && newStatus !== 'unqualified') ||
          // Case 3: Changing to a status that doesn't match the current filter (when not 'all')
          (selectedStatusFilter !== 'all' && selectedStatusFilter !== 'unqualified' && newStatus !== selectedStatusFilter);
        
        if (wouldBeFilteredOut) {
          setSelectedLead(null);
          // Wait for React to process the unmount before updating leads state
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      if (source === 'lead') {
        const { error } = await supabase
          .from('leads')
          .update({ status: newStatus })
          .eq('id', id);

        if (error) {
          console.error('Error updating lead status:', error);
          return;
        }

        setLeads((prev) =>
          prev.map((l) =>
            l.id === id ? { ...l, status: newStatus } : l
          )
        );
      } else {
        const { error } = await supabase
          .from('meta_ads')
          .update({ status: newStatus })
          .eq('id', id);

        if (error) {
          console.error('Error updating meta lead status:', error);
          return;
        }

        setMetaLeads((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, status: newStatus } : m
          )
        );
      }
    } finally {
      setStatusUpdating(false);
    }
  };

  // Mark messages as read for a lead
  const markMessagesAsRead = async (leadId: string) => {
    console.log('📬 markMessagesAsRead called for lead:', leadId);
    console.trace('📬 Call stack:');
    const { error } = await supabase
      .from('sms_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('lead_id', leadId)
      .eq('direction', 'inbound')
      .is('read_at', null);
    
    if (!error) {
      console.log('📬 Messages marked as read successfully');
      // Update local state to remove unread count
      setUnreadMessageCounts(prev => {
        const updated = { ...prev };
        delete updated[leadId];
        return updated;
      });
    } else {
      console.error('📬 Error marking messages as read:', error);
    }
  };

  // Format phone number to (555) 123-4567
  const formatPhoneNumber = (phone: string): string => {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Remove leading 1 if present (US country code)
    const number = cleaned.startsWith('1') ? cleaned.slice(1) : cleaned;
    
    // Format as (XXX) XXX-XXXX
    if (number.length === 10) {
      return `(${number.slice(0, 3)}) ${number.slice(3, 6)}-${number.slice(6)}`;
    }
    
    // Return original if not 10 digits
    return phone;
  };

  // Format phone for display as user types (for Add Lead form)
  const formatPhoneDisplay = (value: string): string => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  // Save new lead function
  const saveNewLead = async () => {
    // Validation
    if (!newLead.first_name.trim()) {
      setAddLeadError('First name is required');
      return;
    }
    if (!newLead.last_name.trim()) {
      setAddLeadError('Last name is required');
      return;
    }
    
    const phoneDigits = newLead.phone.replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
      setAddLeadError('Please enter a valid 10-digit phone number');
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newLead.email.trim())) {
      setAddLeadError('Please enter a valid email address');
      return;
    }

    setSavingNewLead(true);
    setAddLeadError(null);

    try {
      // Get the LO's ID from loan_officers table
      let loId: string | null = null;
      
      console.log('🔍 Saving lead - userRole:', userRole, 'teamMemberId:', teamMemberId, 'email:', session?.user?.email);
      
      if (userRole === 'loan_officer' && teamMemberId) {
        loId = teamMemberId;
        console.log('✅ Using teamMemberId as loId:', loId);
      } else if (session?.user?.email) {
        // For super_admin or if teamMemberId not set, try to find by email
        const { data: loData, error: loError } = await supabase
          .from('loan_officers')
          .select('id')
          .eq('email', session.user.email.toLowerCase())
          .eq('active', true)
          .maybeSingle();
        
        console.log('🔍 LO lookup result:', loData, 'error:', loError);
        
        if (loData) {
          loId = loData.id;
        }
      }
      
      console.log('📝 Final loId for insert:', loId);

      const fullName = `${newLead.first_name.trim()} ${newLead.last_name.trim()}`;
      
      const leadData = {
        name: fullName,
        first_name: newLead.first_name.trim(),
        last_name: newLead.last_name.trim(),
        phone: phoneDigits,
        email: newLead.email.trim().toLowerCase(),
        loan_purpose: newLead.loan_purpose,
        source: 'My Lead',
        source_detail: newLead.referral_source.trim() || null,
        lo_id: loId,
        message: newLead.message.trim() || null,
        status: 'new',
      };

      const { data, error } = await supabase
        .from('leads')
        .insert([leadData])
        .select()
        .single();

      if (error) {
        console.error('Error saving lead:', error);
        setAddLeadError(error.message || 'Failed to save lead');
        return;
      }

      if (data) {
        // Add to leads list with animation
        console.log('✅ Lead saved - DB returned source:', data.source);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        // Explicitly set source to 'My Lead' for immediate UI update
        const savedLead: Lead = {
          ...data,
          source: 'My Lead',
          source_detail: newLead.referral_source.trim() || null,
        };
        console.log('✅ Adding to state with source:', savedLead.source);
        setLeads(prev => [savedLead, ...prev]);
        
        // Reset form and close modal
        setNewLead({
          first_name: '',
          last_name: '',
          phone: '',
          email: '',
          referral_source: '',
          loan_purpose: 'Home Buying',
          message: '',
        });
        setShowAddLeadModal(false);
        
        // Show success feedback
        alert('Lead added successfully!');
      }
    } catch (e: any) {
      console.error('Unexpected error saving lead:', e);
      setAddLeadError(e?.message || 'Unexpected error occurred');
    } finally {
      setSavingNewLead(false);
    }
  };

  const deleteMyLead = async (leadId: string) => {
    Alert.alert(
      'Delete Lead',
      'Are you sure you want to delete this lead? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('leads')
                .delete()
                .eq('id', leadId);

              if (error) throw error;

              // Remove from local state
              setLeads(prev => prev.filter(l => l.id !== leadId));
              Alert.alert('Success', 'Lead deleted successfully.');
            } catch (e: any) {
              console.error('Unexpected error deleting lead:', e);
              Alert.alert('Error', 'An unexpected error occurred.');
            }
          },
        },
      ]
    );
  };

  const deleteCallback = async (callbackId: string) => {
    Alert.alert(
      'Delete Callback',
      'Are you sure you want to delete this callback?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('lead_callbacks')
                .delete()
                .eq('id', callbackId);

              if (error) throw error;

              // Remove from local state
              setTodayCallbacks(prev => prev.filter(c => c.id !== callbackId));
            } catch (error: any) {
              console.error('Error deleting callback:', error);
              Alert.alert('Error', 'Failed to delete callback');
            }
          },
        },
      ]
    );
  };

  const refreshTodayCallbacks = async () => {
    if (!session?.user?.id) return;

    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const { data: callbacksData, error: callbacksError } = await supabase
        .from('lead_callbacks')
        .select('id, scheduled_for, title, notes, lead_id, meta_ad_id, completed_at')
        .gte('scheduled_for', todayStart.toISOString())
        .lte('scheduled_for', todayEnd.toISOString())
        .eq('created_by', session.user.id)
        .is('completed_at', null)
        .order('scheduled_for', { ascending: true });

      if (callbacksError) {
        console.error('Error refreshing today callbacks:', callbacksError);
      } else {
        setTodayCallbacks(callbacksData || []);
      }
    } catch (error) {
      console.error('Error in refreshTodayCallbacks:', error);
    }
  };

  // Handle sending AI-suggested text directly from the modal
  const handleAiSuggestedTextFromModal = async () => {
    if (!selectedAiAttention?.phone || !selectedAiAttention?.suggestedAction) return;
    
    const { phone, suggestedAction, leadId, source } = selectedAiAttention;
    
    // Extract the quoted message from the AI suggestion
    const quoteMatch = suggestedAction.match(/['"]([^'"]+)['"]/);
    const aiMessage = quoteMatch ? quoteMatch[1] : suggestedAction.replace(/^Send a text:\s*/i, '').trim();
    
    // Get LO info from session
    const loFullname = session?.user?.user_metadata?.full_name || 'Mario';
    const loPhone = session?.user?.user_metadata?.phone || '[Phone]';
    const loEmail = session?.user?.email || '[Email]';

    // Build the full message with AI suggestion + signature
    const messageBody = `${aiMessage}\n\n- ${loFullname}\n📞 ${loPhone}\n📧 ${loEmail}`;
    
    setShowAiRecommendationModal(false);

    const encodedBody = encodeURIComponent(messageBody);

    // Log the text activity
    try {
      const tableName = source === 'meta' ? 'meta_ad_activities' : 'lead_activities';
      const foreignKeyColumn = source === 'meta' ? 'meta_ad_id' : 'lead_id';
      const leadTableName = source === 'meta' ? 'meta_ads' : 'leads';
      
      const activityData = {
        [foreignKeyColumn]: leadId,
        activity_type: 'text',
        notes: `Sent AI-suggested text:\n\n${messageBody}`,
        created_by: session?.user?.id || null,
        user_email: session?.user?.email || 'Mobile App User',
      };

      const { error } = await supabase
        .from(tableName)
        .insert([activityData]);

      if (!error) {
        // Update last_contact_date on the lead
        const now = new Date().toISOString();
        await supabase
          .from(leadTableName)
          .update({ last_contact_date: now })
          .eq('id', leadId);
        
        // Update local state
        if (source === 'meta') {
          setMetaLeads(prev => prev.map(l => l.id === leadId ? { ...l, last_contact_date: now } : l));
        } else {
          setLeads(prev => prev.map(l => l.id === leadId ? { ...l, last_contact_date: now } : l));
        }
        
        // Invalidate AI attention cache
        invalidateAttention(leadId);
      }
    } catch (e) {
      console.error('Error logging AI text activity:', e);
    }

    // Open SMS app with pre-filled message
    const smsUrl = `sms:${phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodedBody}`;
    try {
      await Linking.openURL(smsUrl);
    } catch (error) {
      console.error('Error opening SMS:', error);
    }
  };

  // Search filter function
  const matchesSearch = (lead: Lead | MetaLead) => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').toLowerCase();
    const email = lead.email?.toLowerCase() || '';
    const phone = lead.phone?.toLowerCase() || '';
    
    return fullName.includes(query) || email.includes(query) || phone.includes(query);
  };

  // LO filter function (for super admins only)
  const matchesLOFilter = (lead: Lead | MetaLead) => {
    // Only apply filter for super admins
    if (userRole !== 'super_admin') return true;
    
    // If no LO filter selected (null), show all leads
    if (selectedLOFilter === null) return true;
    
    // If "unassigned" filter, show leads without LO
    if (selectedLOFilter === 'unassigned') {
      return !lead.lo_id;
    }
    
    // Otherwise, filter by specific LO ID
    return lead.lo_id === selectedLOFilter;
  };

  // Attention filter: when enabled, only show leads with an attention badge
  const matchesAttentionFilter = (lead: Lead | MetaLead) => {
    if (!attentionFilter) return true;
    // Use AI attention if available, fallback to rule-based
    const aiAttention = attentionMap.get(lead.id);
    if (aiAttention) return aiAttention.needsAttention;
    return !!getLeadAlert(lead);
  };

  // Unread messages filter: when enabled, only show leads with unread messages
  const matchesUnreadFilter = (lead: Lead | MetaLead) => {
    if (!unreadFilter) return true;
    return (unreadMessageCounts[lead.id] || 0) > 0;
  };

  // Source filter (for super admins only)
  const matchesSourceFilter = (lead: Lead | MetaLead) => {
    // Only apply filter for super admins
    if (userRole !== 'super_admin') return true;
    
    if (selectedSourceFilter === 'all') return true;
    
    const src = (lead as MetaLead).ad_name || 
                (lead as Lead).source_detail || 
                (lead as MetaLead).campaign_name || 
                (lead as Lead).source;
                
    return src === selectedSourceFilter;
  };

  const renderLeadItem = ({ item }: { item: Lead }) => {
    const fullName =
      [item.first_name, item.last_name].filter(Boolean).join(' ') ||
      '(No name)';
    const status = item.status || 'new';
    const statusDisplay = formatStatus(status);
    const statusColors = STATUS_COLOR_MAP[status] || STATUS_COLOR_MAP['new'];
    const emailOrPhone = item.email || item.phone || 'No contact info';
    // Use AI attention if available, fallback to rule-based
    const aiAttention = attentionMap.get(item.id);
    const alert = aiAttention?.badge 
      ? { label: aiAttention.badge, color: aiAttention.priority <= 2 ? '#EF4444' : aiAttention.priority <= 4 ? '#F59E0B' : '#22C55E' }
      : getLeadAlert(item);
    const borderColor = alert ? alert.color : '#7C3AED';
    const isUnread = !item.last_contact_date && (item.status === 'new' || !item.status);

    // Right-side swipe actions for website leads
    const renderRightActions = () => (
      <View style={styles.swipeActionsContainer}>
        {/* Mark contacted */}
        <TouchableOpacity
          style={[styles.swipeActionButton, styles.swipeActionContacted]}
          onPress={() => handleStatusChange('lead', item.id, 'contacted')}
          activeOpacity={0.8}
        >
          <Text style={styles.swipeActionText}>Contacted</Text>
        </TouchableOpacity>

        {/* Mark unqualified */}
        <TouchableOpacity
          style={[styles.swipeActionButton, styles.swipeActionUnqualified]}
          onPress={() => handleStatusChange('lead', item.id, 'unqualified')}
          activeOpacity={0.8}
        >
          <Text style={styles.swipeActionText}>Unqualified</Text>
        </TouchableOpacity>

        {/* Delete - only for My Lead */}
        {item.source === 'My Lead' && (
          <TouchableOpacity
            style={[styles.swipeActionButton, styles.swipeActionDelete]}
            onPress={() => deleteMyLead(item.id)}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
            <Text style={styles.swipeActionText}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    );

    return (
      <Swipeable
        renderRightActions={renderRightActions}
        overshootRight={false}
      >
        <TouchableOpacity
          style={[
            styles.leadCard,
            {
              borderLeftColor: borderColor,
              backgroundColor: colors.cardBackground,
              borderColor: colors.border,
            },
          ]}
          onPress={() => {
            setOpenToMessages(false);
            setSelectedLead({ source: 'lead', id: item.id });
          }}
          activeOpacity={0.7}
        >
          <View style={styles.leadHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
              <Text style={[styles.leadName, { color: colors.textPrimary }]} numberOfLines={1}>
                {fullName}
              </Text>
              {isUnread && <View style={styles.unreadDot} />}
            </View>
            {item.source === 'My Lead' ? (
              <View style={styles.myLeadBadge}>
                <Ionicons
                  name="person-add-outline"
                  size={12}
                  color="#16A34A"
                />
                <Text style={styles.myLeadBadgeText}>My Lead</Text>
              </View>
            ) : (
              <View style={styles.leadSourceBadge}>
                <Ionicons
                  name="globe-outline"
                  size={12}
                  color="#0F172A"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.leadSourceText}>Web</Text>
              </View>
            )}
          </View>
          {alert && (
            <TouchableOpacity
              style={[styles.attentionBadge, { backgroundColor: alert.color }]}
              onPress={() => {
                if (aiAttention?.reason) {
                  setSelectedAiAttention({
                    reason: aiAttention.reason,
                    suggestedAction: aiAttention.suggestedAction || '',
                    badge: aiAttention.badge,
                    leadId: item.id,
                    source: 'lead',
                    phone: item.phone || '',
                    firstName: item.first_name || 'there',
                  });
                  setShowAiRecommendationModal(true);
                }
              }}
              activeOpacity={aiAttention?.reason ? 0.7 : 1}
            >
              <Ionicons
                name="warning-outline"
                size={12}
                color="#FFF"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.attentionBadgeText}>{alert.label}</Text>
              {aiAttention?.reason && (
                <Ionicons name="information-circle-outline" size={12} color="#FFF" style={{ marginLeft: 4 }} />
              )}
            </TouchableOpacity>
          )}
          <View style={[
            styles.statusBadge,
            { backgroundColor: statusColors.bg, borderColor: statusColors.border }
          ]}>
            <Text style={[styles.statusBadgeText, { color: statusColors.text }]}>
              {statusDisplay}
            </Text>
          </View>
          {item.email && (
            <View style={styles.leadContactRow}>
              <Ionicons
                name="mail-outline"
                size={14}
                color={colors.textSecondary}
                style={styles.leadContactIcon as any}
              />
              <Text style={[styles.leadContact, { color: colors.textSecondary }]} numberOfLines={1}>{item.email}</Text>
            </View>
          )}
          {item.phone && (
            <View style={styles.leadContactRow}>
              <Ionicons
                name="call-outline"
                size={14}
                color={colors.textSecondary}
                style={styles.leadContactIcon as any}
              />
              <Text style={[styles.leadContact, { color: colors.textSecondary }]} numberOfLines={1}>
                {formatPhoneNumber(item.phone)}
              </Text>
            </View>
          )}
          {item.source_detail && (
            <View style={styles.leadContactRow}>
              <Ionicons
                name="megaphone-outline"
                size={14}
                color="#16A34A"
                style={styles.leadContactIcon as any}
              />
              <Text style={[styles.leadContact, { color: '#16A34A' }]} numberOfLines={1}>
                {item.source_detail}
              </Text>
            </View>
          )}
          {userRole === 'super_admin' && item.lo_id && (
            <View style={styles.leadLORow}>
              <Ionicons
                name="person-circle-outline"
                size={14}
                color="#64748B"
                style={styles.leadLOIcon as any}
              />
              <Text style={styles.leadLOText} numberOfLines={1}>
                {loanOfficers.find(lo => lo.id === item.lo_id)?.name || 'Unknown LO'}
              </Text>
            </View>
          )}
          <Text style={styles.leadTimestamp}>
            {new Date(item.created_at).toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </Text>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  const renderMetaLeadItem = ({ item }: { item: MetaLead }) => {
    const fullName =
      [item.first_name, item.last_name].filter(Boolean).join(' ') ||
      '(No name)';
    const status = item.status ? formatStatus(item.status) : 'No status';
    const platform = item.platform || 'Facebook';
    const campaign = item.campaign_name || '';
    // Use AI attention if available, fallback to rule-based
    const aiAttention = attentionMap.get(item.id);
    const alert = aiAttention?.badge 
      ? { label: aiAttention.badge, color: aiAttention.priority <= 2 ? '#EF4444' : aiAttention.priority <= 4 ? '#F59E0B' : '#22C55E' }
      : getLeadAlert(item);
    const borderColor = alert ? alert.color : '#7C3AED';
    const statusColors =
      STATUS_COLOR_MAP[item.status || 'new'] || STATUS_COLOR_MAP['new'];
    const hasUnreadMessages = (unreadMessageCounts[item.id] || 0) > 0;
    const isNewLead = !item.last_contact_date && (item.status === 'new' || !item.status);
    const isUnread = isNewLead || hasUnreadMessages;

    const getPlatformBadge = (platform: string) => {
      const platformLower = platform.toLowerCase();

      let badgeText = 'FB';
      let badgeColor = '#1877F2'; // Facebook blue
      let badgeBg = '#E7F3FF';

      if (platformLower.includes('instagram') || platformLower.includes('ig')) {
        badgeText = 'IG';
        badgeColor = '#E4405F';
        badgeBg = '#FFE8ED';
      } else if (platformLower.includes('facebook') || platformLower.includes('fb')) {
        badgeText = 'FB';
        badgeColor = '#1877F2';
        badgeBg = '#E7F3FF';
      } else if (platformLower.includes('messenger')) {
        badgeText = 'MSG';
        badgeColor = '#0084FF';
        badgeBg = '#E5F2FF';
      } else if (platformLower.includes('whatsapp')) {
        badgeText = 'WA';
        badgeColor = '#25D366';
        badgeBg = '#E8F8EF';
      }

      return (
        <View style={[styles.platformBadge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.platformBadgeText, { color: badgeColor }]}>
            {badgeText}
          </Text>
        </View>
      );
    };

    // Right-side swipe actions for meta leads
    const renderRightActions = () => (
      <View style={styles.swipeActionsContainer}>
        <TouchableOpacity
          style={[styles.swipeActionButton, styles.swipeActionContacted]}
          onPress={() => handleStatusChange('meta', item.id, 'contacted')}
          activeOpacity={0.8}
        >
          <Text style={styles.swipeActionText}>Contacted</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.swipeActionButton, styles.swipeActionUnqualified]}
          onPress={() => handleStatusChange('meta', item.id, 'unqualified')}
          activeOpacity={0.8}
        >
          <Text style={styles.swipeActionText}>Unqualified</Text>
        </TouchableOpacity>
      </View>
    );

    return (
      <Swipeable
        renderRightActions={renderRightActions}
        overshootRight={false}
      >
        <TouchableOpacity
          style={[
            styles.leadCard,
            {
              borderLeftColor: borderColor,
              backgroundColor: colors.cardBackground,
              borderColor: colors.border,
            },
          ]}
          onPress={() => {
            setOpenToMessages(false); // Ensure we don't auto-switch to messages
            setSelectedLead({ source: 'meta', id: item.id });
          }}
          activeOpacity={0.7}
        >
          <View style={styles.leadHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
              <Text style={[styles.leadName, { color: colors.textPrimary }]} numberOfLines={1}>
                {fullName}
              </Text>
              {isUnread && <View style={styles.unreadDot} />}
            </View>
            {getPlatformBadge(platform)}
          </View>
          {alert && (
            <TouchableOpacity
              style={[styles.attentionBadge, { backgroundColor: alert.color }]}
              onPress={() => {
                if (aiAttention?.reason) {
                  setSelectedAiAttention({
                    reason: aiAttention.reason,
                    suggestedAction: aiAttention.suggestedAction || '',
                    badge: aiAttention.badge,
                    leadId: item.id,
                    source: 'meta',
                    phone: item.phone || '',
                    firstName: item.first_name || 'there',
                  });
                  setShowAiRecommendationModal(true);
                }
              }}
              activeOpacity={aiAttention?.reason ? 0.7 : 1}
            >
              <Ionicons
                name="warning-outline"
                size={12}
                color="#FFF"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.attentionBadgeText}>{alert.label}</Text>
              {aiAttention?.reason && (
                <Ionicons name="information-circle-outline" size={12} color="#FFF" style={{ marginLeft: 4 }} />
              )}
            </TouchableOpacity>
          )}
          <View style={[
            styles.statusBadge,
            { backgroundColor: statusColors.bg, borderColor: statusColors.border }
          ]}>
            <Text style={[styles.statusBadgeText, { color: statusColors.text }]}>
              {status}
            </Text>
          </View>
          {campaign ? (
            <View style={styles.campaignRow}>
              <Ionicons
                name="megaphone-outline"
                size={14}
                color={colors.textSecondary}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.leadCampaign, { color: colors.textSecondary }]} numberOfLines={1}>{campaign}</Text>
            </View>
          ) : null}
          {item.email && (
            <View style={styles.leadContactRow}>
              <Ionicons
                name="mail-outline"
                size={14}
                color={colors.textSecondary}
                style={styles.leadContactIcon as any}
              />
              <Text style={[styles.leadContact, { color: colors.textSecondary }]} numberOfLines={1}>{item.email}</Text>
            </View>
          )}
          {item.phone && (
            <View style={styles.leadContactRow}>
              <Ionicons
                name="call-outline"
                size={14}
                color={colors.textSecondary}
                style={styles.leadContactIcon as any}
              />
              <Text style={[styles.leadContact, { color: colors.textSecondary }]} numberOfLines={1}>{formatPhoneNumber(item.phone)}</Text>
            </View>
          )}
          {userRole === 'super_admin' && item.lo_id && (
            <View style={styles.leadLORow}>
              <Ionicons
                name="person-circle-outline"
                size={14}
                color={colors.textSecondary}
                style={styles.leadLOIcon as any}
              />
              <Text style={[styles.leadLOText, { color: colors.textSecondary }]} numberOfLines={1}>
                {loanOfficers.find(lo => lo.id === item.lo_id)?.name || 'Unknown LO'}
              </Text>
            </View>
          )}
          <Text style={[styles.leadTimestamp, { color: colors.textSecondary }]}>
            {new Date(item.created_at).toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </Text>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  // Function to toggle lead_eligible status
  const toggleLeadEligible = async () => {
    if (!teamMemberId) {
      alert('Unable to update: Team member ID not found');
      return;
    }

    try {
      const newStatus = !leadEligible;
      const { error } = await supabase
        .from('loan_officers')
        .update({ lead_eligible: newStatus })
        .eq('id', teamMemberId);

      if (error) throw error;
      
      setLeadEligible(newStatus);
      alert(newStatus 
        ? 'You are now eligible to receive auto-assigned leads' 
        : 'You will no longer receive auto-assigned leads'
      );
    } catch (error: any) {
      console.error('Error toggling lead eligibility:', error);
      alert('Error updating status: ' + error.message);
    }
  };

  // Show Team Management screen for super admins
  if (showTeamManagement) {
    return (
      <TeamManagementScreen
        onBack={() => setShowTeamManagement(false)}
        session={session}
      />
    );
  }

  // Show Mortgage Calculator
  if (showMortgageCalculator) {
    return (
      <MortgageCalculatorScreen
        onClose={() => setShowMortgageCalculator(false)}
      />
    );
  }

  if (selectedLead) {
    // Apply the same filters to leads/metaLeads that are used in the list view
    const filteredLeads = leads.filter(lead => {
      const statusMatch = selectedStatusFilter === 'all' ? lead.status !== 'unqualified' : lead.status === selectedStatusFilter;
      const searchMatch = matchesSearch(lead);
      const loMatch = matchesLOFilter(lead);
      const attentionMatch = matchesAttentionFilter(lead);
      const sourceMatch = matchesSourceFilter(lead);
      return statusMatch && searchMatch && loMatch && attentionMatch && sourceMatch;
    });

    const filteredMetaLeads = metaLeads.filter(lead => {
      const statusMatch = selectedStatusFilter === 'all' ? lead.status !== 'unqualified' : lead.status === selectedStatusFilter;
      const searchMatch = matchesSearch(lead);
      const loMatch = matchesLOFilter(lead);
      const attentionMatch = matchesAttentionFilter(lead);
      const sourceMatch = matchesSourceFilter(lead);
      return statusMatch && searchMatch && loMatch && attentionMatch && sourceMatch;
    });

    return (
      <LeadDetailView
        selected={selectedLead}
        leads={filteredLeads}
        metaLeads={filteredMetaLeads}
        onBack={async () => {
          setSelectedLead(null);
          setOpenToMessages(false); // Reset notification flag
          refreshTodayCallbacks(); // Refresh callbacks when returning to dashboard
          // Refresh unread counts
          if (metaLeads.length > 0) {
            const leadIds = metaLeads.map(l => l.id);
            const { data: unreadData } = await supabase
              .from('sms_messages')
              .select('lead_id')
              .in('lead_id', leadIds)
              .eq('direction', 'inbound')
              .is('read_at', null);
            if (unreadData) {
              const counts: Record<string, number> = {};
              unreadData.forEach(msg => {
                if (msg.lead_id) counts[msg.lead_id] = (counts[msg.lead_id] || 0) + 1;
              });
              setUnreadMessageCounts(counts);
            }
          }
        }}
        onNavigate={(leadRef) => setSelectedLead(leadRef)}
        onStatusChange={handleStatusChange}
        session={session}
        loanOfficers={loanOfficers}
        userRole={userRole}
        selectedStatusFilter={selectedStatusFilter}
        searchQuery={searchQuery}
        selectedLOFilter={selectedLOFilter}
        activeTab={activeTab}
        openToMessages={openToMessages}
        onMessagesOpened={() => setOpenToMessages(false)}
        onMarkMessagesRead={markMessagesAsRead}
        onInvalidateAttention={invalidateAttention}
        aiAttention={attentionMap.get(selectedLead.id) || null}
        onDeleteLead={async (leadId: string) => {
          // Delete from database
          const { error } = await supabase
            .from('leads')
            .delete()
            .eq('id', leadId)
            .eq('source', 'My Lead');
          
          if (error) {
            console.error('Error deleting lead:', error);
            throw error;
          }
          
          // Remove from local state
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setLeads(prev => prev.filter(lead => lead.id !== leadId));
        }}
        onLeadUpdate={(updatedLead, source) => {
          console.log('🔄 onLeadUpdate called:', { source, leadId: updatedLead.id, last_contact_date: updatedLead.last_contact_date });
          if (source === 'lead') {
            setLeads(prevLeads => {
              console.log('📝 Updating leads array, previous count:', prevLeads.length);
              const updated = prevLeads.map(l => {
                if (l.id === updatedLead.id) {
                  console.log('✅ Found matching lead, updating:', l.id);
                  console.log('   Old last_contact_date:', l.last_contact_date);
                  console.log('   New last_contact_date:', updatedLead.last_contact_date);
                  return { ...l, ...updatedLead } as Lead;
                }
                return l;
              });
              return updated;
            });
          } else {
            setMetaLeads(prevMetaLeads => {
              console.log('📝 Updating metaLeads array, previous count:', prevMetaLeads.length);
              const updated = prevMetaLeads.map(l => {
                if (l.id === updatedLead.id) {
                  console.log('✅ Found matching meta lead, updating:', l.id);
                  console.log('   Old last_contact_date:', l.last_contact_date);
                  console.log('   New last_contact_date:', updatedLead.last_contact_date);
                  return { ...l, ...updatedLead } as MetaLead;
                }
                return l;
              });
              return updated;
            });
          }
        }}
      />
    );
  }

  // Dashboard View
  if (showDashboard) {
    // Apply LO filter to dashboard stats
    const filteredLeads = leads.filter(matchesLOFilter);
    const filteredMetaLeads = metaLeads.filter(matchesLOFilter);
    
    // Filter out unqualified leads from default counts
    const activeFilteredLeads = filteredLeads.filter(l => l.status !== 'unqualified');
    const activeFilteredMetaLeads = filteredMetaLeads.filter(l => l.status !== 'unqualified');
    
    const totalLeads = activeFilteredLeads.length + activeFilteredMetaLeads.length;
    const metaLeadsCount = activeFilteredMetaLeads.length;
    const organicLeadsCount = activeFilteredLeads.length;
    const newLeads = [...activeFilteredLeads, ...activeFilteredMetaLeads].filter(l => l.status === 'new').length;
    const qualifiedLeads = [...activeFilteredLeads, ...activeFilteredMetaLeads].filter(l => l.status === 'qualified').length;
    const closedLeads = [...activeFilteredLeads, ...activeFilteredMetaLeads].filter(l => l.status === 'closed').length;
    
    // Separate count for unqualified leads
    const unqualifiedLeads = [...filteredLeads, ...filteredMetaLeads].filter(l => l.status === 'unqualified').length;

    // Leads that currently have an attention badge (AI-powered with fallback)
    const attentionLeadsCount = [...activeFilteredLeads, ...activeFilteredMetaLeads]
      .filter(l => {
        const aiAttention = attentionMap.get(l.id);
        if (aiAttention) return aiAttention.needsAttention;
        return !!getLeadAlert(l);
      })
      .length;
    
    // Get recent leads (last 5) - exclude unqualified
    // Use _tableType to distinguish between leads/meta_ads without overwriting the source field
    const allLeads = [...activeFilteredMetaLeads.map(l => ({ ...l, _tableType: 'meta' as const })), ...activeFilteredLeads.map(l => ({ ...l, _tableType: 'lead' as const }))];
    const recentLeads = allLeads
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    // Get user's first name for greeting
    const userFirstName = session?.user?.user_metadata?.full_name?.split(' ')[0] || 
                          session?.user?.user_metadata?.name?.split(' ')[0] || 
                          'there';

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Profile Menu Modal */}
        <Modal
          visible={showProfileMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowProfileMenu(false)}
        >
          <TouchableOpacity 
            style={styles.profileMenuOverlay}
            activeOpacity={1}
            onPress={() => setShowProfileMenu(false)}
          >
            <View style={[styles.profileMenuContent, { backgroundColor: colors.cardBackground }]}>
              <TouchableOpacity
                style={styles.profileMenuItem}
                onPress={() => {
                  setShowProfileMenu(false);
                  setShowMortgageCalculator(true);
                }}
              >
                <View style={styles.profileMenuIconContainer}>
                  <Ionicons name="calculator" size={20} color="#7C3AED" />
                </View>
                <Text style={[styles.profileMenuText, { color: colors.textPrimary }]}>Payment Calculator</Text>
              </TouchableOpacity>
              
              {userRole === 'super_admin' && (
                <TouchableOpacity
                  style={styles.profileMenuItem}
                  onPress={() => {
                    setShowProfileMenu(false);
                    setShowTeamManagement(true);
                  }}
                >
                  <View style={styles.profileMenuIconContainer}>
                    <Ionicons name="people" size={20} color="#7C3AED" />
                  </View>
                  <Text style={[styles.profileMenuText, { color: colors.textPrimary }]}>Team Management</Text>
                </TouchableOpacity>
              )}
              
              <View style={[styles.profileMenuDivider, { backgroundColor: colors.border }]} />
              
              <TouchableOpacity
                style={styles.profileMenuItem}
                onPress={handleUploadProfilePicture}
                disabled={uploadingPicture}
              >
                <View style={styles.profileMenuIconContainer}>
                  <Ionicons name="camera" size={20} color={colors.textPrimary} />
                </View>
                <Text style={[styles.profileMenuText, { color: colors.textPrimary }]}>
                  {uploadingPicture ? 'Uploading...' : 'Change Profile Picture'}
                </Text>
              </TouchableOpacity>
              
              {session?.user?.user_metadata?.custom_avatar_url && (
                <TouchableOpacity
                  style={styles.profileMenuItem}
                  onPress={handleRemoveProfilePicture}
                  disabled={uploadingPicture}
                >
                  <View style={styles.profileMenuIconContainer}>
                    <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
                  </View>
                  <Text style={[styles.profileMenuText, { color: colors.textSecondary }]}>Remove Custom Picture</Text>
                </TouchableOpacity>
              )}
              
              <View style={[styles.profileMenuDivider, { backgroundColor: colors.border }]} />
              
              <TouchableOpacity
                style={styles.profileMenuItem}
                onPress={() => {
                  setShowProfileMenu(false);
                  onSignOut();
                }}
              >
                <View style={styles.profileMenuIconContainer}>
                  <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                </View>
                <Text style={[styles.profileMenuText, { color: '#EF4444' }]}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Purple Gradient Header - Fixed height, moves up with scroll */}
        <Animated.View style={[
          styles.newDashboardHeader, 
          { 
            backgroundColor: colors.headerBackground,
            height: DASHBOARD_HEADER_EXPANDED,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            overflow: 'hidden',
            transform: [{ translateY: dashboardHeaderTranslateY }],
          }
        ]}>
          {/* User Info Row - Counter-translates to appear fixed */}
          <Animated.View style={{ transform: [{ translateY: dashboardUserInfoTranslateY }] }}>
            <View style={styles.newHeaderTop}>
              <View style={styles.newUserInfo}>
                <View style={styles.newUserDetails}>
                  <Text style={styles.newUserTitle}>Dashboard</Text>
                  <Text style={styles.newUserEmail} numberOfLines={1}>
                    {session?.user?.email || ''}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {/* Notification Bell */}
                <TouchableOpacity 
                  onPress={() => {
                    setShowDashboard(false);
                    setSelectedStatusFilter('all');
                    setActiveTab('meta'); // Unread messages are only for meta leads
                    setUnreadFilter(true);
                  }}
                  style={{ position: 'relative' }}
                >
                  <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
                  {Object.values(unreadMessageCounts).reduce((a, b) => a + b, 0) > 0 && (
                    <View style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      backgroundColor: '#EF4444',
                      borderRadius: 10,
                      minWidth: 18,
                      height: 18,
                      justifyContent: 'center',
                      alignItems: 'center',
                      paddingHorizontal: 4,
                    }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                        {Object.values(unreadMessageCounts).reduce((a, b) => a + b, 0) > 99 
                          ? '99+' 
                          : Object.values(unreadMessageCounts).reduce((a, b) => a + b, 0)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                {/* Profile Button */}
                <TouchableOpacity 
                  onPress={() => setShowProfileMenu(true)}
                  style={styles.profileButton}
                >
                  {getAvatarUrl(session?.user?.user_metadata) ? (
                    <Image 
                      source={{ uri: getAvatarUrl(session?.user?.user_metadata) || '' }}
                      style={styles.profileButtonAvatar}
                    />
                  ) : (
                    <View style={styles.profileButtonPlaceholder}>
                      <Text style={styles.profileButtonText}>
                        {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>

          {/* Greeting and Quote - Fades out */}
          <Animated.View style={{ 
            opacity: dashboardContentOpacity,
          }}>
            <Text style={styles.newGreeting}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {userFirstName}!</Text>
            <Text style={styles.newSubGreeting}>Here's your lead overview</Text>

            {/* Quote of the Day */}
            <QuoteOfTheDay userKey={session?.user?.email} />
          </Animated.View>

          {/* Stats Grid in Header - Moves up and scales */}
          <Animated.View style={[
            styles.newHeaderStatsRow, 
            { 
              gap: 8,
              transform: [
                { scale: dashboardStatsScale },
                { translateY: dashboardStatsTranslateY }
              ],
            }
          ]}>
              <TouchableOpacity 
                style={[styles.newHeaderStatCard, { flex: 1 }]}
                onPress={() => {
                  triggerListAnimation();
                  setAttentionFilter(false);
                  setUnreadFilter(false);
                  setActiveTab('meta');
                  setSelectedStatusFilter('all');
                  setSelectedSourceFilter('all');
                  setSelectedLOFilter(null);
                  setShowDashboard(false);
                }}
              >
                <Text style={styles.newHeaderStatNumber}>{metaLeadsCount}</Text>
                <Text style={styles.newHeaderStatLabel}>Meta Ads</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.newHeaderStatCard, { flex: 1 }]}
                onPress={() => {
                  triggerListAnimation();
                  setAttentionFilter(false);
                  setUnreadFilter(false);
                  setActiveTab('leads');
                  setSelectedStatusFilter('all');
                  setSelectedSourceFilter('all');
                  setSelectedLOFilter(null);
                  setShowDashboard(false);
                }}
              >
                <Text style={styles.newHeaderStatNumber}>{organicLeadsCount}</Text>
                <Text style={styles.newHeaderStatLabel}>My Leads</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.newHeaderStatCard, { flex: 1 }]}
                onPress={() => {
                  triggerListAnimation();
                  setAttentionFilter(false);
                  setUnreadFilter(false);
                  setActiveTab('all');
                  setSelectedStatusFilter('all');
                  setSelectedSourceFilter('all');
                  setSelectedLOFilter(null);
                  setShowDashboard(false);
                }}
              >
                <Text style={styles.newHeaderStatNumber}>{totalLeads}</Text>
                <Text style={styles.newHeaderStatLabel}>Total</Text>
              </TouchableOpacity>
          </Animated.View>
        </Animated.View>

        <Animated.ScrollView 
          contentContainerStyle={[
            styles.newDashboardContent,
            { paddingTop: DASHBOARD_HEADER_EXPANDED } // Push content down to clear header
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              progressViewOffset={DASHBOARD_HEADER_EXPANDED} // Ensure spinner shows below header
            />
          }
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: dashboardScrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={1} // Maximize smoothness
        >
          {/* Callback History View */}
          {showCallbackHistory && (
            <View style={[styles.recentLeadsSection, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Callback History</Text>
                </View>
                <TouchableOpacity onPress={() => setShowCallbackHistory(false)}>
                  <Text style={{ color: '#6366F1', fontWeight: '600' }}>Back to Today</Text>
                </TouchableOpacity>
              </View>
              {callbackHistory.length === 0 ? (
                <Text style={styles.dashboardEmptyText}>No completed callbacks yet.</Text>
              ) : (
                callbackHistory.map((cb) => {
                  const when = cb.scheduled_for ? new Date(cb.scheduled_for) : null;
                  const completed = cb.completed_at ? new Date(cb.completed_at) : null;
                  const timeStr = when
                    ? when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    : '';
                  const completedStr = completed
                    ? completed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    : '';

                  let name = cb.title || 'Lead';
                  if (cb.lead_id) {
                    const lead = leads.find(l => l.id === cb.lead_id);
                    if (lead) {
                      name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || name;
                    }
                  } else if (cb.meta_ad_id) {
                    const meta = metaLeads.find(m => m.id === cb.meta_ad_id);
                    if (meta) {
                      name = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || name;
                    }
                  }

                  return (
                    <TouchableOpacity
                      key={cb.id}
                      style={[styles.newLeadCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                      onPress={() => {
                        if (cb.lead_id || cb.meta_ad_id) {
                          setShowDashboard(false);
                          setSelectedLead({
                            source: cb.meta_ad_id ? 'meta' : 'lead',
                            id: cb.meta_ad_id || cb.lead_id,
                          });
                        }
                      }}
                    >
                      <View style={styles.newLeadHeader}>
                        <View style={styles.newLeadLeft}>
                          <Text style={[styles.newLeadName, { color: colors.textPrimary }]}>{name}</Text>
                          <Text style={[styles.newLeadSource, { color: colors.textSecondary }]} numberOfLines={1}>
                            Scheduled: {timeStr || 'N/A'}
                          </Text>
                          <Text style={[styles.newLeadTime, { color: colors.textSecondary }]}>Done: {completedStr || 'N/A'}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {/* Today's Callbacks Section (always show header, even if empty) */}
          {!showCallbackHistory && (
            <View style={[styles.recentLeadsSection, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{
                    width: 32,
                    height: 32,
                    backgroundColor: '#E5E7EB', // neutral gray instead of red
                    borderRadius: 6,
                    justifyContent: 'center',
                    alignItems: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    elevation: 1,
                  }}>
                    <Ionicons name="calendar-outline" size={18} color="#4B5563" />
                  </View>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Today's Call Schedule</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert(
                      'Callback History',
                      'How far back would you like to see?',
                      [
                        {
                          text: '30 days',
                          onPress: () => {
                            setShowCallbackHistory(true);
                            loadCallbackHistory(30);
                          },
                        },
                        {
                          text: '45 days',
                          onPress: () => {
                            setShowCallbackHistory(true);
                            loadCallbackHistory(45);
                          },
                        },
                        {
                          text: 'All time',
                          onPress: () => {
                            setShowCallbackHistory(true);
                            loadCallbackHistory('all');
                          },
                        },
                        { text: 'Cancel', style: 'cancel' },
                      ]
                    );
                  }}
                >
                  <Text style={{ color: '#6366F1', fontWeight: '600' }}>View history</Text>
                </TouchableOpacity>
              </View>
              {todayCallbacks.length === 0 && (
                <Text style={styles.dashboardEmptyText}>No callbacks scheduled for today.</Text>
              )}

              {todayCallbacks.length > 0 && todayCallbacks.map((cb) => {
                const when = cb.scheduled_for ? new Date(cb.scheduled_for) : null;
                const timeStr = when
                  ? when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                  : '';

                // Resolve lead name directly here (no helper)
                let name = cb.title || 'Lead';
                if (cb.lead_id) {
                  const lead = leads.find(l => l.id === cb.lead_id);
                  if (lead) {
                    name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || name;
                  }
                } else if (cb.meta_ad_id) {
                  const meta = metaLeads.find(m => m.id === cb.meta_ad_id);
                  if (meta) {
                    name = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || name;
                  }
                }

                // Swipe actions for callbacks: Done (non-destructive) + Delete
                const renderRightActions = () => (
                  <View style={styles.swipeActionsContainer}>
                    <TouchableOpacity
                      style={[styles.swipeActionButton, styles.swipeActionContacted]}
                      onPress={() => completeCallback(cb.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="checkmark-done-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.swipeActionText}>Done</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.swipeActionButton, styles.swipeActionDelete]}
                      onPress={() => deleteCallback(cb.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.swipeActionText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                );

                return (
                  <Swipeable
                    key={cb.id}
                    renderRightActions={renderRightActions}
                    overshootRight={false}
                  >
                    <TouchableOpacity
                      style={styles.newLeadCard}
                      onPress={() => {
                        if (cb.lead_id || cb.meta_ad_id) {
                          setShowDashboard(false);
                          setSelectedLead({
                            source: cb.meta_ad_id ? 'meta' : 'lead',
                            id: cb.meta_ad_id || cb.lead_id,
                          });
                        }
                      }}
                    >
                      <View style={styles.newLeadHeader}>
                        <Text style={styles.newLeadName}>{name}</Text>
                        {timeStr ? (
                          <Text style={styles.newLeadTime}>{timeStr}</Text>
                        ) : null}
                      </View>
                      {cb.notes ? (
                        <Text style={styles.newLeadMessage} numberOfLines={2}>
                          {cb.notes}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  </Swipeable>
                );
              })}
            </View>
          )}

          {/* Performance Section */}
          <View style={[styles.performanceSection, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>📈 Performance</Text>
            </View>
            <View style={styles.performanceGrid}>
              <TouchableOpacity 
                style={[styles.performanceCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                onPress={() => {
                  setAttentionFilter(false);
                  setUnreadFilter(false);
                  setActiveTab('all');
                  setSelectedStatusFilter('new');
                  setSelectedSourceFilter('all');
                  setSelectedLOFilter(null);
                  setShowDashboard(false);
                }}
              >
                <Text style={[styles.perfNumber, { color: colors.textPrimary }]}>✨ {newLeads}</Text>
                <Text style={[styles.perfLabel, { color: colors.textSecondary }]}>New Leads</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.performanceCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                onPress={() => {
                  setAttentionFilter(false);
                  setUnreadFilter(false);
                  setActiveTab('all');
                  setSelectedStatusFilter('qualified');
                  setSelectedSourceFilter('all');
                  setSelectedLOFilter(null);
                  setShowDashboard(false);
                }}
              >
                <Text style={[styles.perfNumber, { color: colors.textPrimary }]}>🎯 {qualifiedLeads}</Text>
                <Text style={[styles.perfLabel, { color: colors.textSecondary }]}>Qualified</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.performanceCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                onPress={() => {
                  setAttentionFilter(false);
                  setUnreadFilter(false);
                  setActiveTab('all');
                  setSelectedStatusFilter('closed');
                  setSelectedSourceFilter('all');
                  setSelectedLOFilter(null);
                  setShowDashboard(false);
                }}
              >
                <Text style={[styles.perfNumber, { color: colors.textPrimary }]}>🎉 {closedLeads}</Text>
                <Text style={[styles.perfLabel, { color: colors.textSecondary }]}>Closed</Text>
              </TouchableOpacity>
              {/* Needs Attention card: leads with an attention badge */}
              <TouchableOpacity 
                style={[styles.performanceCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                onPress={() => {
                  triggerListAnimation();
                  setAttentionFilter(true);
                  setUnreadFilter(false);
                  setActiveTab('all');
                  setSelectedStatusFilter('all');
                  setSelectedSourceFilter('all');
                  setSelectedLOFilter(null);
                  setShowDashboard(false);
                }}
              >
                <Text style={[styles.perfNumber, { color: colors.textPrimary }]}>⚠️ {attentionLeadsCount}</Text>
                <Text style={[styles.perfLabel, { color: colors.textSecondary }]}>Needs Attention</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Lead Assignment Settings (Loan Officers Only) */}
          {userRole === 'loan_officer' && (
            <View style={styles.quickStatsCard}>
              <Text style={styles.quickStatsTitle}>⚙️ Lead Assignment</Text>
              <View style={styles.leadEligibleContainer}>
                <View style={styles.leadEligibleInfo}>
                  <Text style={styles.statsLabel}>Receive Auto-Assigned Leads</Text>
                  <Text style={styles.statsValue}>{leadEligible ? 'Enabled' : 'Disabled'}</Text>
                </View>
                <TouchableOpacity
                  style={styles.leadEligibleToggle}
                  onPress={toggleLeadEligible}
                >
                  <View style={[
                    styles.toggleSwitch,
                    leadEligible && styles.toggleSwitchActive
                  ]}>
                    <View style={[
                      styles.toggleThumb,
                      leadEligible && styles.toggleThumbActive
                    ]} />
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Recent Leads Section */}
          <View style={[styles.recentLeadsSection, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🕒 Recent Leads</Text>
            </View>
            {recentLeads.length > 0 ? (
              recentLeads.map((lead) => {
                const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || '(No name)';
                const timeAgo = getTimeAgo(new Date(lead.created_at));
                const isNew = lead.status === 'new';
                const isQualified = lead.status === 'qualified';
                const isMeta = lead._tableType === 'meta';
                const sourceDisplay = isMeta 
                  ? `Facebook${(lead as MetaLead & { _tableType: string }).campaign_name ? ' • ' + (lead as MetaLead & { _tableType: string }).campaign_name : ''}`
                  : 'Website Contact';
                
                return (
                  <TouchableOpacity
                    key={`${lead._tableType}-${lead.id}`}
                    style={[
                      styles.newLeadCard,
                      { backgroundColor: colors.cardBackground, borderColor: colors.border },
                      isNew && styles.newLeadCardNew,
                      isQualified && styles.newLeadCardQualified
                    ]}
                    onPress={() => {
                      setShowDashboard(false);
                      setOpenToMessages(false);
                      setSelectedLead({ source: lead._tableType, id: lead.id });
                    }}
                  >
                    <View style={styles.newLeadHeader}>
                      <View style={styles.newLeadLeft}>
                        <Text style={[styles.newLeadName, { color: colors.textPrimary }]}>{fullName}</Text>
                        <Text style={[styles.newLeadSource, { color: colors.textSecondary }]} numberOfLines={1}>{sourceDisplay}</Text>
                        <Text style={[styles.newLeadTime, { color: colors.textSecondary }]}>{timeAgo}</Text>
                      </View>
                      <View style={styles.newLeadBadges}>
                        {isNew && (
                          <View style={styles.statusBadgeNew}>
                            <Text style={styles.statusBadgeNewText}>New</Text>
                          </View>
                        )}
                        {isQualified && (
                          <View style={styles.statusBadgeQualified}>
                            <Text style={styles.statusBadgeQualifiedText}>Qualified</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={styles.newLeadDetails}>
                      <Text style={styles.newLeadDetail} numberOfLines={1}>
                        {lead.email || lead.phone || 'No contact'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text style={styles.dashboardEmptyText}>No recent leads</Text>
            )}
          </View>
        </Animated.ScrollView>
      </View>
    );
  }

  const hasLeads = leads.length > 0;
  const hasMetaLeads = metaLeads.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Profile Menu Modal */}
      <Modal
        visible={showProfileMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProfileMenu(false)}
      >
        <TouchableOpacity 
          style={styles.profileMenuOverlay}
          activeOpacity={1}
          onPress={() => setShowProfileMenu(false)}
        >
          <View style={[styles.profileMenuContent, { backgroundColor: colors.cardBackground }]}>
            <TouchableOpacity
              style={styles.profileMenuItem}
              onPress={() => {
                setShowProfileMenu(false);
                setShowMortgageCalculator(true);
              }}
            >
              <View style={styles.profileMenuIconContainer}>
                <Ionicons name="calculator" size={20} color="#7C3AED" />
              </View>
              <Text style={[styles.profileMenuText, { color: colors.textPrimary }]}>Payment Calculator</Text>
            </TouchableOpacity>
            
            {userRole === 'super_admin' && (
              <TouchableOpacity
                style={styles.profileMenuItem}
                onPress={() => {
                  setShowProfileMenu(false);
                  setShowTeamManagement(true);
                }}
              >
                <View style={styles.profileMenuIconContainer}>
                  <Ionicons name="people" size={20} color="#7C3AED" />
                </View>
                <Text style={[styles.profileMenuText, { color: colors.textPrimary }]}>Team Management</Text>
              </TouchableOpacity>
            )}
            
            <View style={[styles.profileMenuDivider, { backgroundColor: colors.border }]} />
            
            <TouchableOpacity
              style={styles.profileMenuItem}
              onPress={handleUploadProfilePicture}
              disabled={uploadingPicture}
            >
              <View style={styles.profileMenuIconContainer}>
                <Ionicons name="camera" size={20} color={colors.textPrimary} />
              </View>
              <Text style={[styles.profileMenuText, { color: colors.textPrimary }]}>
                {uploadingPicture ? 'Uploading...' : 'Change Profile Picture'}
              </Text>
            </TouchableOpacity>
            
            {session?.user?.user_metadata?.custom_avatar_url && (
              <TouchableOpacity
                style={styles.profileMenuItem}
                onPress={handleRemoveProfilePicture}
                disabled={uploadingPicture}
              >
                <View style={styles.profileMenuIconContainer}>
                  <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
                </View>
                <Text style={[styles.profileMenuText, { color: colors.textSecondary }]}>Remove Custom Picture</Text>
              </TouchableOpacity>
            )}
            
            <View style={[styles.profileMenuDivider, { backgroundColor: colors.border }]} />
            
            <TouchableOpacity
              style={styles.profileMenuItem}
              onPress={() => {
                setShowProfileMenu(false);
                onSignOut();
              }}
            >
              <View style={styles.profileMenuIconContainer}>
                <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              </View>
              <Text style={[styles.profileMenuText, { color: '#EF4444' }]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modern Purple Header with Stats and Search - Animated Collapsing */}
      <Animated.View style={[
        styles.leadsHeaderContainer, 
        { 
          backgroundColor: colors.headerBackground,
          height: headerHeight,
        }
      ]}>
        <Animated.View style={[
          styles.headerContent,
          { transform: [{ scale: headerTitleScale }] }
        ]}>
          <TouchableOpacity 
            onPress={() => {
              setShowDashboard(true);
              setSelectedLOFilter(null);
              setSelectedStatusFilter('all');
              setSelectedSourceFilter('all');
              setAttentionFilter(false);
              setUnreadFilter(false);
              setSearchQuery('');
            }} 
            style={styles.homeButton}
          >
            <Text style={styles.homeButtonText}>← Home</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Close With Mario</Text>
            <Text style={styles.headerSubtitle}>Lead Management</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {/* Notification Bell */}
            <TouchableOpacity 
              onPress={() => {
                setSelectedStatusFilter('all');
                setActiveTab('meta'); // Unread messages are only for meta leads
                setUnreadFilter(true);
              }}
              style={{ position: 'relative' }}
            >
              <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
              {Object.values(unreadMessageCounts).reduce((a, b) => a + b, 0) > 0 && (
                <View style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  backgroundColor: '#EF4444',
                  borderRadius: 10,
                  minWidth: 18,
                  height: 18,
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingHorizontal: 4,
                }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                    {Object.values(unreadMessageCounts).reduce((a, b) => a + b, 0) > 99 
                      ? '99+' 
                      : Object.values(unreadMessageCounts).reduce((a, b) => a + b, 0)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            {/* Profile Button */}
            <TouchableOpacity 
              onPress={() => setShowProfileMenu(true)}
              style={styles.profileButton}
            >
              {getAvatarUrl(session?.user?.user_metadata) ? (
                <Image 
                  source={{ uri: getAvatarUrl(session?.user?.user_metadata) || '' }}
                  style={styles.profileButtonAvatar}
                />
              ) : (
                <View style={styles.profileButtonPlaceholder}>
                  <Text style={styles.profileButtonText}>
                    {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Stats Row inside Purple Header - Fades out when scrolling */}
        <Animated.View style={[
          styles.statsRow, 
          { 
            height: statsHeight,
            opacity: statsOpacity,
            overflow: 'hidden', // Ensure content doesn't overflow when height shrinks
          }
        ]}>
        <TouchableOpacity 
          style={[
            styles.statCard,
            activeTab === 'meta' && styles.statCardActive,
          ]}
          onPress={() => {
            triggerListAnimation();
            setActiveTab('meta');
            setHasManuallySelectedTab(true);
          }}
        >
          <Text style={[
            styles.statNumber,
            activeTab === 'meta' && styles.statNumberActive,
          ]}>
            {selectedStatusFilter === 'all' 
              ? metaLeads.filter(l => matchesLOFilter(l) && matchesAttentionFilter(l) && matchesSourceFilter(l) && l.status !== 'unqualified').length 
              : metaLeads.filter(l => l.status === selectedStatusFilter && matchesLOFilter(l) && matchesAttentionFilter(l) && matchesSourceFilter(l)).length
            }
          </Text>
          <Text style={[
            styles.statLabel,
            activeTab === 'meta' && styles.statLabelActive,
          ]}>Meta Ads</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[
            styles.statCard,
            activeTab === 'leads' && styles.statCardActive,
          ]}
          onPress={() => {
            triggerListAnimation();
            setActiveTab('leads');
            setHasManuallySelectedTab(true);
          }}
        >
          <Text style={[
            styles.statNumber,
            activeTab === 'leads' && styles.statNumberActive,
          ]}>
            {selectedStatusFilter === 'all' 
              ? leads.filter(l => matchesLOFilter(l) && matchesAttentionFilter(l) && matchesSourceFilter(l) && l.status !== 'unqualified').length 
              : leads.filter(l => l.status === selectedStatusFilter && matchesLOFilter(l) && matchesAttentionFilter(l) && matchesSourceFilter(l)).length
            }
          </Text>
          <Text style={[
            styles.statLabel,
            activeTab === 'leads' && styles.statLabelActive,
          ]}>My Leads</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[
            styles.statCard,
            activeTab === 'all' && styles.statCardActive,
          ]}
          onPress={() => {
            triggerListAnimation();
            setActiveTab('all');
            setHasManuallySelectedTab(true);
          }}
        >
          <Text style={[
            styles.statNumber,
            activeTab === 'all' && styles.statNumberActive,
          ]}>
            {selectedStatusFilter === 'all' 
              ? metaLeads.filter(l => matchesLOFilter(l) && matchesAttentionFilter(l) && matchesSourceFilter(l) && l.status !== 'unqualified').length + leads.filter(l => matchesLOFilter(l) && matchesAttentionFilter(l) && matchesSourceFilter(l) && l.status !== 'unqualified').length 
              : [...metaLeads, ...leads].filter(l => l.status === selectedStatusFilter && matchesLOFilter(l) && matchesAttentionFilter(l) && matchesSourceFilter(l)).length
            }
          </Text>
          <Text style={[
            styles.statLabel,
            activeTab === 'all' && styles.statLabelActive,
          ]}>Total</Text>
        </TouchableOpacity>
      </Animated.View>

        {/* Search Bar inside Purple Header - Fades out when scrolling */}
        <Animated.View style={[styles.leadsSearchContainer, { opacity: headerOpacity }]}>
          <Text style={styles.leadsSearchIcon}>🔍</Text>
          <TextInput
            style={styles.leadsSearchInput}
            placeholder="Search leads..."
            placeholderTextColor="rgba(255,255,255,0.7)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => {
              // Dismiss keyboard when done button is pressed
              if (Platform.OS === 'ios' || Platform.OS === 'android') {
                // Keyboard will dismiss automatically on submit
              }
            }}
            blurOnSubmit={true}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity 
              onPress={() => setSearchQuery('')}
              style={styles.searchClearButton}
            >
              <Text style={styles.searchClearText}>✕</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </Animated.View>

      {loading && (
        <View style={styles.centerContent}>
          <ActivityIndicator />
          <Text style={styles.subtitle}>Loading data from Supabase…</Text>
        </View>
      )}

      {!loading && errorMessage && (
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Error: {errorMessage}</Text>
        </View>
      )}

      {!loading && !errorMessage && !hasLeads && !hasMetaLeads && (
        <View style={styles.centerContent}>
          <Text style={styles.subtitle}>
            No rows found in "leads" or "meta_ads".
          </Text>
        </View>
      )}

      {!loading && !errorMessage && (hasLeads || hasMetaLeads) && (
        <>
          {/* Unread Filter Active Indicator */}
          {unreadFilter && (
            <View style={{ 
              backgroundColor: '#FFFFFF', 
              marginHorizontal: 16, 
              marginTop: 8,
              marginBottom: 8, 
              borderRadius: 12,
              padding: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.1,
              shadowRadius: 2,
              elevation: 2,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ 
                  backgroundColor: '#EF4444', 
                  width: 28, 
                  height: 28, 
                  borderRadius: 14, 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  marginRight: 10,
                }}>
                  <Ionicons name="notifications" size={16} color="#FFFFFF" />
                </View>
                <Text style={{ color: '#1F2937', fontWeight: '600', fontSize: 14 }}>
                  Showing Unread Messages
                </Text>
              </View>
              <TouchableOpacity onPress={() => setUnreadFilter(false)}>
                <Ionicons name="close-circle" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          )}

          {/* No Unread Messages State */}
          {unreadFilter && Object.values(unreadMessageCounts).reduce((a, b) => a + b, 0) === 0 && (
            <View style={{ 
              alignItems: 'center', 
              paddingVertical: 40,
              paddingHorizontal: 20,
            }}>
              <Ionicons name="checkmark-circle" size={64} color="#10B981" />
              <Text style={{ 
                fontSize: 18, 
                fontWeight: '600', 
                color: '#1F2937', 
                marginTop: 16,
                textAlign: 'center',
              }}>
                All caught up!
              </Text>
              <Text style={{ 
                fontSize: 14, 
                color: '#6B7280', 
                marginTop: 8,
                textAlign: 'center',
              }}>
                You have no unread messages
              </Text>
              <TouchableOpacity 
                onPress={() => setUnreadFilter(false)}
                style={{
                  marginTop: 20,
                  backgroundColor: '#7C3AED',
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 20,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>View All Leads</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Filter Buttons Row */}
          <View style={[styles.filterButtonContainer, { flexWrap: 'wrap' }]}>
            {/* Status Filter */}
            <TouchableOpacity
              style={[
                styles.filterButton, 
                userRole === 'super_admin' ? { width: '100%', marginBottom: 4 } : { flex: 1 }
              ]}
              onPress={() => setShowStatusPicker(true)}
            >
              <Text style={styles.filterButtonLabel}>Status:</Text>
              <Text style={styles.filterButtonValue}>
                {selectedStatusFilter === 'all' 
                  ? `All (${[...leads, ...metaLeads].filter(l => matchesLOFilter(l) && l.status !== 'unqualified').length})` 
                  : `${formatStatus(selectedStatusFilter)} (${[...leads, ...metaLeads].filter(l => l.status === selectedStatusFilter && matchesLOFilter(l)).length})`
                }
              </Text>
              <Text style={styles.filterButtonIcon}>▼</Text>
            </TouchableOpacity>

            {/* LO Filter (Super Admin Only) */}
            {userRole === 'super_admin' && (
              <>
                <TouchableOpacity
                  style={[styles.filterButton, styles.filterButtonHalf]}
                  onPress={() => setShowLOPicker(true)}
                >
                  <Text style={styles.filterButtonLabel}>LO:</Text>
                  <Text style={styles.filterButtonValue}>
                    {selectedLOFilter === null 
                      ? 'All LOs' 
                      : selectedLOFilter === 'unassigned'
                      ? 'Unassigned'
                      : loanOfficers.find(lo => lo.id === selectedLOFilter)?.name || 'Unknown'
                    }
                  </Text>
                  <Text style={styles.filterButtonIcon}>▼</Text>
                </TouchableOpacity>

                {/* Source Filter (Super Admin Only) */}
                <TouchableOpacity
                  style={[styles.filterButton, styles.filterButtonHalf]}
                  onPress={() => setShowSourcePicker(true)}
                >
                  <Text style={styles.filterButtonLabel}>Source:</Text>
                  <Text style={styles.filterButtonValue} numberOfLines={1}>
                    {selectedSourceFilter === 'all' 
                      ? 'All Sources' 
                      : selectedSourceFilter.length > 15 
                        ? selectedSourceFilter.substring(0, 12) + '...' 
                        : selectedSourceFilter
                    }
                  </Text>
                  <Text style={styles.filterButtonIcon}>▼</Text>
                </TouchableOpacity>
              </>
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
                  <Text style={styles.statusPickerTitle}>Filter by Status</Text>
                  <TouchableOpacity onPress={() => setShowStatusPicker(false)}>
                    <Text style={styles.statusPickerClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.statusPickerScroll}>
                  <TouchableOpacity
                    style={[
                      styles.statusPickerItem,
                      selectedStatusFilter === 'all' && styles.statusPickerItemActive,
                    ]}
                    onPress={() => {
                      triggerListAnimation();
                      setAttentionFilter(false);
                      setSelectedStatusFilter('all');
                      setActiveTab('all');
                      setShowStatusPicker(false);
                    }}
                  >
                    <View style={styles.statusPickerItemLeft}>
                      <Text style={[
                        styles.statusPickerItemText,
                        selectedStatusFilter === 'all' && styles.statusPickerItemTextActive,
                      ]}>All Statuses</Text>
                      <Text style={[
                        styles.statusPickerItemCount,
                        selectedStatusFilter === 'all' && styles.statusPickerItemCountActive,
                      ]}>({[...leads, ...metaLeads].filter(l => matchesLOFilter(l) && l.status !== 'unqualified').length})</Text>
                    </View>
                    {selectedStatusFilter === 'all' && (
                      <Text style={styles.statusPickerCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                  {STATUSES.map((status) => {
                    const count = [...leads, ...metaLeads].filter(l => l.status === status && matchesLOFilter(l)).length;
                    return (
                      <TouchableOpacity
                        key={status}
                        style={[
                          styles.statusPickerItem,
                          selectedStatusFilter === status && styles.statusPickerItemActive,
                        ]}
                        onPress={() => {
                          triggerListAnimation();
                          setAttentionFilter(false);
                          setSelectedStatusFilter(status);
                          setActiveTab('all');
                          setShowStatusPicker(false);
                        }}
                      >
                        <View style={styles.statusPickerItemLeft}>
                          <Text style={[
                            styles.statusPickerItemText,
                            selectedStatusFilter === status && styles.statusPickerItemTextActive,
                          ]}>{formatStatus(status)}</Text>
                          <Text style={[
                            styles.statusPickerItemCount,
                            selectedStatusFilter === status && styles.statusPickerItemCountActive,
                          ]}>({count})</Text>
                        </View>
                        {selectedStatusFilter === status && (
                          <Text style={styles.statusPickerCheck}>✓</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </Modal>

          {/* LO Picker Modal (Super Admin Only) */}
          {userRole === 'super_admin' && (
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
                  <Text style={styles.statusPickerTitle}>Filter by Loan Officer</Text>
                  <ScrollView style={styles.statusPickerScroll}>
                    {/* All LOs Option */}
                    <TouchableOpacity
                      style={[
                        styles.statusPickerItem,
                        selectedLOFilter === null && styles.statusPickerItemActive,
                      ]}
                      onPress={() => {
                        triggerListAnimation();
                        setSelectedLOFilter(null);
                        setShowLOPicker(false);
                      }}
                    >
                      <View style={styles.statusPickerItemLeft}>
                        <Text style={[
                          styles.statusPickerItemText,
                          selectedLOFilter === null && styles.statusPickerItemTextActive,
                        ]}>All Loan Officers</Text>
                        <Text style={[
                          styles.statusPickerItemCount,
                          selectedLOFilter === null && styles.statusPickerItemCountActive,
                        ]}>({
                          [...metaLeads, ...leads].filter(l => {
                             const statusMatch = selectedStatusFilter === 'all' ? l.status !== 'unqualified' : l.status === selectedStatusFilter;
                             const sourceMatch = matchesSourceFilter(l);
                             return statusMatch && sourceMatch;
                          }).length
                        })</Text>
                      </View>
                      {selectedLOFilter === null && (
                        <Text style={styles.statusPickerCheck}>✓</Text>
                      )}
                    </TouchableOpacity>

                    {/* Unassigned Option */}
                    <TouchableOpacity
                      style={[
                        styles.statusPickerItem,
                        selectedLOFilter === 'unassigned' && styles.statusPickerItemActive,
                      ]}
                      onPress={() => {
                        triggerListAnimation();
                        setSelectedLOFilter('unassigned');
                        setShowLOPicker(false);
                      }}
                    >
                      <View style={styles.statusPickerItemLeft}>
                        <Text style={[
                          styles.statusPickerItemText,
                          selectedLOFilter === 'unassigned' && styles.statusPickerItemTextActive,
                        ]}>Unassigned</Text>
                        <Text style={[
                          styles.statusPickerItemCount,
                          selectedLOFilter === 'unassigned' && styles.statusPickerItemCountActive,
                        ]}>({
                          [...metaLeads, ...leads].filter(l => {
                             const statusMatch = selectedStatusFilter === 'all' ? l.status !== 'unqualified' : l.status === selectedStatusFilter;
                             const sourceMatch = matchesSourceFilter(l);
                             return statusMatch && sourceMatch && !l.lo_id;
                          }).length
                        })</Text>
                      </View>
                      {selectedLOFilter === 'unassigned' && (
                        <Text style={styles.statusPickerCheck}>✓</Text>
                      )}
                    </TouchableOpacity>

                    {/* Individual LOs */}
                    {loanOfficers.map((lo) => {
                      const count = [...metaLeads, ...leads].filter(l => {
                         const statusMatch = selectedStatusFilter === 'all' ? l.status !== 'unqualified' : l.status === selectedStatusFilter;
                         const sourceMatch = matchesSourceFilter(l);
                         return statusMatch && sourceMatch && l.lo_id === lo.id;
                      }).length;

                      return (
                        <TouchableOpacity
                          key={lo.id}
                          style={[
                            styles.statusPickerItem,
                            selectedLOFilter === lo.id && styles.statusPickerItemActive,
                          ]}
                          onPress={() => {
                            triggerListAnimation();
                            setSelectedLOFilter(lo.id);
                            setShowLOPicker(false);
                          }}
                        >
                          <View style={styles.statusPickerItemLeft}>
                            <Text style={[
                              styles.statusPickerItemText,
                              selectedLOFilter === lo.id && styles.statusPickerItemTextActive,
                            ]}>{lo.name}</Text>
                            <Text style={[
                              styles.statusPickerItemCount,
                              selectedLOFilter === lo.id && styles.statusPickerItemCountActive,
                            ]}>({count})</Text>
                          </View>
                          {selectedLOFilter === lo.id && (
                            <Text style={styles.statusPickerCheck}>✓</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </TouchableOpacity>
            </Modal>
          )}

          {/* Source Picker Modal (Super Admin Only) */}
          {userRole === 'super_admin' && (
            <Modal
              visible={showSourcePicker}
              transparent={true}
              animationType="fade"
              onRequestClose={() => setShowSourcePicker(false)}
            >
              <TouchableOpacity 
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={() => setShowSourcePicker(false)}
              >
                <View style={styles.statusPickerContainer}>
                  <Text style={styles.statusPickerTitle}>Filter by Source</Text>
                  <ScrollView style={styles.statusPickerScroll}>
                    {/* All Sources Option */}
                    <TouchableOpacity
                      style={[
                        styles.statusPickerItem,
                        selectedSourceFilter === 'all' && styles.statusPickerItemActive,
                      ]}
                      onPress={() => {
                        triggerListAnimation();
                        setSelectedSourceFilter('all');
                        setShowSourcePicker(false);
                      }}
                    >
                      <View style={styles.statusPickerItemLeft}>
                        <Text style={[
                          styles.statusPickerItemText,
                          selectedSourceFilter === 'all' && styles.statusPickerItemTextActive,
                        ]}>All Sources</Text>
                        <Text style={[
                          styles.statusPickerItemCount,
                          selectedSourceFilter === 'all' && styles.statusPickerItemCountActive,
                        ]}>({metaLeads.length + leads.length})</Text>
                      </View>
                      {selectedSourceFilter === 'all' && (
                        <Text style={styles.statusPickerCheck}>✓</Text>
                      )}
                    </TouchableOpacity>

                    {/* Individual Sources */}
                    {uniqueSources.map((source) => {
                      // Calculate count for this source
                      const count = [...metaLeads, ...leads].filter(l => {
                         // Check if lead matches current status and LO filters
                         const statusMatch = selectedStatusFilter === 'all' ? l.status !== 'unqualified' : l.status === selectedStatusFilter;
                         const loMatch = matchesLOFilter(l);
                         
                         if (!statusMatch || !loMatch) return false;

                         const src = (l as MetaLead).ad_name || 
                                     (l as Lead).source_detail || 
                                     (l as MetaLead).campaign_name || 
                                     (l as Lead).source;
                         return src === source;
                      }).length;
                      
                      return (
                        <TouchableOpacity
                          key={source}
                          style={[
                            styles.statusPickerItem,
                            selectedSourceFilter === source && styles.statusPickerItemActive,
                          ]}
                          onPress={() => {
                            triggerListAnimation();
                            setSelectedSourceFilter(source);
                            setShowSourcePicker(false);

                            // Auto-switch tab based on source type
                            const hasMeta = metaLeads.some(l => (l.ad_name || l.campaign_name) === source);
                            const hasOrganic = leads.some(l => (l.source_detail || l.source) === source);

                            if (hasMeta && !hasOrganic) {
                              setActiveTab('meta');
                            } else if (!hasMeta && hasOrganic) {
                              setActiveTab('leads');
                            }
                          }}
                        >
                          <View style={styles.statusPickerItemLeft}>
                            <Text style={[
                              styles.statusPickerItemText,
                              selectedSourceFilter === source && styles.statusPickerItemTextActive,
                            ]} numberOfLines={1}>{source}</Text>
                            <Text style={[
                              styles.statusPickerItemCount,
                              selectedSourceFilter === source && styles.statusPickerItemCountActive,
                            ]}>({count})</Text>
                          </View>
                          {selectedSourceFilter === source && (
                            <Text style={styles.statusPickerCheck}>✓</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </TouchableOpacity>
            </Modal>
          )}
        </>
      )}

      {/* Lead Content - FlatLists for each tab */}
      {activeTab === 'leads' && hasLeads && (
        <Animated.View style={animatedListStyle}>
          <Animated.FlatList
            data={leads.filter(lead => {
              const statusMatch = selectedStatusFilter === 'all' ? lead.status !== 'unqualified' : lead.status === selectedStatusFilter;
              const searchMatch = matchesSearch(lead);
              const loMatch = matchesLOFilter(lead);
              const attentionMatch = matchesAttentionFilter(lead);
              const sourceMatch = matchesSourceFilter(lead);
              
              console.log('📋 Leads tab filter', {
                leadId: lead.id,
                leadName: `${lead.first_name} ${lead.last_name}`,
                statusMatch,
                searchMatch,
                loMatch,
                attentionMatch,
                sourceMatch,
                selectedStatusFilter,
                attentionFilter,
                selectedSourceFilter,
              });
              
              return statusMatch && searchMatch && loMatch && attentionMatch && sourceMatch;
            })}
            renderItem={renderLeadItem}
            keyExtractor={(item) => item.id}
            extraData={aiDataLoaded}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            showsVerticalScrollIndicator={false}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: false }
            )}
            scrollEventThrottle={16}
          />
        </Animated.View>
      )}

      {activeTab === 'meta' && hasMetaLeads && (
        <Animated.View style={animatedListStyle}>
          <Animated.FlatList
            data={metaLeads.filter(lead => {
              const statusMatch = selectedStatusFilter === 'all' ? lead.status !== 'unqualified' : lead.status === selectedStatusFilter;
              const searchMatch = matchesSearch(lead);
              const loMatch = matchesLOFilter(lead);
              const attentionMatch = matchesAttentionFilter(lead);
              const sourceMatch = matchesSourceFilter(lead);
              const unreadMatch = matchesUnreadFilter(lead);
              
              console.log('📋 Meta tab filter', {
                leadId: lead.id,
                leadName: `${lead.first_name} ${lead.last_name}`,
                statusMatch,
                searchMatch,
                loMatch,
                attentionMatch,
                sourceMatch,
                unreadMatch,
                selectedStatusFilter,
                attentionFilter,
                selectedSourceFilter,
                unreadFilter,
              });
              
              return statusMatch && searchMatch && loMatch && attentionMatch && sourceMatch && unreadMatch;
            })}
            renderItem={renderMetaLeadItem}
            keyExtractor={(item) => item.id}
            extraData={aiDataLoaded}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            showsVerticalScrollIndicator={false}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: false }
            )}
            scrollEventThrottle={16}
          />
        </Animated.View>
      )}

      {activeTab === 'all' && (hasLeads || hasMetaLeads) && (
        <Animated.View style={animatedListStyle}>
          <Animated.FlatList
            data={(() => {
              const metaArr = metaLeads.filter(lead => {
                const statusMatch = selectedStatusFilter === 'all' ? lead.status !== 'unqualified' : lead.status === selectedStatusFilter;
                const searchMatch = matchesSearch(lead);
                const loMatch = matchesLOFilter(lead);
                const attentionMatch = matchesAttentionFilter(lead);
                const sourceMatch = matchesSourceFilter(lead);
                return statusMatch && searchMatch && loMatch && attentionMatch && sourceMatch;
              }).map(lead => ({ ...lead, _tableType: 'meta' as const }));
              
              const leadsArr = leads.filter(lead => {
                const statusMatch = selectedStatusFilter === 'all' ? lead.status !== 'unqualified' : lead.status === selectedStatusFilter;
                const searchMatch = matchesSearch(lead);
                const loMatch = matchesLOFilter(lead);
                const attentionMatch = matchesAttentionFilter(lead);
                const sourceMatch = matchesSourceFilter(lead);
                return statusMatch && searchMatch && loMatch && attentionMatch && sourceMatch;
              }).map(lead => ({ ...lead, _tableType: 'lead' as const }));
              
              const combined = [...metaArr, ...leadsArr].sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              );
              
              console.log('📋 All tab data', {
                totalMeta: metaLeads.length,
                totalLeads: leads.length,
                afterFilters: combined.length,
                selectedStatusFilter,
                attentionFilter,
                activeTab,
              });
              
              return combined;
            })()}
            renderItem={({ item }) => {
              if (item._tableType === 'meta') {
                return renderMetaLeadItem({ item });
              }
              return renderLeadItem({ item });
            }}
            keyExtractor={(item) => `${item._tableType}-${item.id}`}
            extraData={aiDataLoaded}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            showsVerticalScrollIndicator={false}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: false }
            )}
            scrollEventThrottle={16}
          />
        </Animated.View>
      )}

      {/* FAB - Add Lead Button (for LOs and Super Admins) */}
      {(userRole === 'loan_officer' || userRole === 'super_admin') && !showDashboard && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            setAddLeadError(null);
            setShowAddLeadModal(true);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Add Lead Modal */}
      <Modal
        visible={showAddLeadModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAddLeadModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.addLeadModalOverlay}
        >
          <TouchableOpacity 
            style={{ flex: 1 }} 
            activeOpacity={1} 
            onPress={() => setShowAddLeadModal(false)}
          />
          <View style={styles.addLeadModalContainer}>
            {/* Header */}
            <View style={styles.addLeadModalHeader}>
              <Text style={styles.addLeadModalTitle}>➕ Add My Lead</Text>
              <TouchableOpacity 
                style={styles.addLeadCloseButton}
                onPress={() => {
                  setShowAddLeadModal(false);
                  setAddLeadError(null);
                }}
              >
                <Text style={styles.addLeadCloseText}>×</Text>
              </TouchableOpacity>
            </View>

            {/* Form */}
            <ScrollView style={styles.addLeadForm} showsVerticalScrollIndicator={false}>
              {addLeadError && (
                <View style={styles.addLeadError}>
                  <Text style={styles.addLeadErrorText}>{addLeadError}</Text>
                </View>
              )}

              {/* Name Row */}
              <View style={[styles.addLeadRow, { marginBottom: 16 }]}>
                <View style={styles.addLeadFieldHalf}>
                  <Text style={styles.addLeadLabel}>
                    First Name <Text style={styles.addLeadRequired}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.addLeadInput}
                    value={newLead.first_name}
                    onChangeText={(text) => setNewLead(prev => ({ ...prev, first_name: text }))}
                    placeholder="John"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="words"
                  />
                </View>
                <View style={styles.addLeadFieldHalf}>
                  <Text style={styles.addLeadLabel}>
                    Last Name <Text style={styles.addLeadRequired}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.addLeadInput}
                    value={newLead.last_name}
                    onChangeText={(text) => setNewLead(prev => ({ ...prev, last_name: text }))}
                    placeholder="Doe"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="words"
                  />
                </View>
              </View>

              {/* Phone */}
              <View style={styles.addLeadField}>
                <Text style={styles.addLeadLabel}>
                  Phone <Text style={styles.addLeadRequired}>*</Text>
                </Text>
                <TextInput
                  style={styles.addLeadInput}
                  value={newLead.phone}
                  onChangeText={(text) => setNewLead(prev => ({ ...prev, phone: formatPhoneDisplay(text) }))}
                  placeholder="(555) 123-4567"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  maxLength={14}
                />
              </View>

              {/* Email */}
              <View style={styles.addLeadField}>
                <Text style={styles.addLeadLabel}>
                  Email <Text style={styles.addLeadRequired}>*</Text>
                </Text>
                <TextInput
                  style={styles.addLeadInput}
                  value={newLead.email}
                  onChangeText={(text) => setNewLead(prev => ({ ...prev, email: text }))}
                  placeholder="john@example.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Referral Source */}
              <View style={styles.addLeadField}>
                <Text style={styles.addLeadLabel}>Referral Source</Text>
                <TextInput
                  style={styles.addLeadInput}
                  value={newLead.referral_source}
                  onChangeText={(text) => setNewLead(prev => ({ ...prev, referral_source: text }))}
                  placeholder="Friend, Zillow, Open House, etc."
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              {/* Loan Purpose */}
              <View style={styles.addLeadField}>
                <Text style={styles.addLeadLabel}>Loan Purpose</Text>
                <TouchableOpacity
                  style={styles.addLeadPickerContainer}
                  onPress={() => setShowLoanPurposePicker(!showLoanPurposePicker)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 }}>
                    <Text style={{ fontSize: 15, color: '#111827' }}>{newLead.loan_purpose}</Text>
                    <Ionicons name={showLoanPurposePicker ? "chevron-up" : "chevron-down"} size={20} color="#6B7280" />
                  </View>
                </TouchableOpacity>
                {showLoanPurposePicker && (
                  <View style={{ backgroundColor: '#F9FAFB', borderRadius: 8, marginTop: 4, borderWidth: 1, borderColor: '#E5E7EB' }}>
                    {LOAN_PURPOSES.map((purpose) => (
                      <TouchableOpacity
                        key={purpose}
                        style={{
                          padding: 12,
                          borderBottomWidth: purpose !== LOAN_PURPOSES[LOAN_PURPOSES.length - 1] ? 1 : 0,
                          borderBottomColor: '#E5E7EB',
                          backgroundColor: newLead.loan_purpose === purpose ? '#EDE9FE' : 'transparent',
                        }}
                        onPress={() => {
                          setNewLead(prev => ({ ...prev, loan_purpose: purpose }));
                          setShowLoanPurposePicker(false);
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ 
                            fontSize: 15, 
                            color: newLead.loan_purpose === purpose ? '#7C3AED' : '#374151',
                            fontWeight: newLead.loan_purpose === purpose ? '600' : '400',
                          }}>{purpose}</Text>
                          {newLead.loan_purpose === purpose && (
                            <Ionicons name="checkmark" size={18} color="#7C3AED" />
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Notes */}
              <View style={styles.addLeadField}>
                <Text style={styles.addLeadLabel}>Notes</Text>
                <TextInput
                  style={[styles.addLeadInput, styles.addLeadTextArea]}
                  value={newLead.message}
                  onChangeText={(text) => setNewLead(prev => ({ ...prev, message: text }))}
                  placeholder="Any additional notes about this lead..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Info Box */}
              <View style={styles.addLeadInfoBox}>
                <Text style={styles.addLeadInfoText}>
                  <Text style={{ fontWeight: '700' }}>Source:</Text> My Lead
                </Text>
                <Text style={styles.addLeadInfoSubtext}>
                  This lead will be assigned to you and visible only to you.
                </Text>
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={styles.addLeadFooter}>
              <TouchableOpacity
                style={styles.addLeadCancelButton}
                onPress={() => {
                  setShowAddLeadModal(false);
                  setAddLeadError(null);
                }}
              >
                <Text style={styles.addLeadCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.addLeadSaveButton,
                  savingNewLead && styles.addLeadSaveButtonDisabled
                ]}
                onPress={saveNewLead}
                disabled={savingNewLead}
              >
                {savingNewLead ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="save-outline" size={18} color="#FFFFFF" />
                )}
                <Text style={styles.addLeadSaveText}>
                  {savingNewLead ? 'Saving...' : 'Save Lead'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* AI Recommendation Modal */}
      <Modal
        visible={showAiRecommendationModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAiRecommendationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={StyleSheet.absoluteFill} 
            activeOpacity={1} 
            onPress={() => setShowAiRecommendationModal(false)} 
          />
          <View style={aiRecommendationStyles.container}>
            <View style={aiRecommendationStyles.header}>
              <Text style={aiRecommendationStyles.title}>Why this needs attention</Text>
              <TouchableOpacity
                onPress={() => setShowAiRecommendationModal(false)}
                style={aiRecommendationStyles.closeIcon}
              >
                <Ionicons name="close" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            
            <Text style={aiRecommendationStyles.reason}>
              {selectedAiAttention?.reason || 'No additional details available.'}
            </Text>
            
            {selectedAiAttention?.suggestedAction && (
              <View style={aiRecommendationStyles.suggestionContainer}>
                <Text style={aiRecommendationStyles.suggestionIcon}>💡</Text>
                <View style={{ flex: 1 }}>
                  <Text style={aiRecommendationStyles.suggestionText}>
                    {selectedAiAttention.suggestedAction}
                  </Text>
                  {selectedAiAttention.suggestedAction.toLowerCase().includes('send a text') && selectedAiAttention.phone && (
                    <Text style={aiRecommendationStyles.tapHint}>
                      👆 Tap button below to send
                    </Text>
                  )}
                </View>
              </View>
            )}
            
            {selectedAiAttention?.suggestedAction?.toLowerCase().includes('send a text') && selectedAiAttention?.phone ? (
              <TouchableOpacity
                style={aiRecommendationStyles.sendTextButton}
                onPress={handleAiSuggestedTextFromModal}
              >
                <Ionicons name="chatbubble-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={aiRecommendationStyles.closeButtonText}>Send This Text</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={aiRecommendationStyles.closeButton}
                onPress={() => setShowAiRecommendationModal(false)}
              >
                <Text style={aiRecommendationStyles.closeButtonText}>Got it</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

// Styles for AI Recommendation Modal
const aiRecommendationStyles = StyleSheet.create({
  container: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 24,
    maxWidth: 400,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeIcon: {
    padding: 4,
  },
  reason: {
    fontSize: 15,
    color: '#CBD5E1',
    lineHeight: 22,
    marginBottom: 16,
  },
  suggestionContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  suggestionIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  suggestionText: {
    fontSize: 14,
    color: '#10B981',
    flex: 1,
    lineHeight: 20,
    fontWeight: '500',
  },
  tapHint: {
    fontSize: 12,
    color: '#6EE7B7',
    marginTop: 8,
    fontWeight: '600',
  },
  sendTextButton: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  closeButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

// Root app that knows about session + lock state
function RootApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [notificationLead, setNotificationLead] = useState<{ id: string; source: 'lead' | 'meta'; openToMessages?: boolean } | null>(null);
  const { isLocked } = useAppLock();

  // Check for existing Supabase session on mount
  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { session: existingSession },
      } = await supabase.auth.getSession();

      setSession(existingSession);
      setCheckingSession(false);

      // Register for push notifications if user is logged in
      console.log('📱 [Auth] Session check - user id:', existingSession?.user?.id || 'none');
      if (existingSession?.user?.id) {
        registerForPushNotifications(existingSession.user.id);
      }

      // Listen for auth changes
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, newSession) => {
        setSession(newSession);
        // Register for push notifications when user signs in
        if (newSession?.user?.id) {
          console.log('📱 [Auth] Auth state changed - registering for notifications');
          registerForPushNotifications(newSession.user.id);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    };

    initAuth();
  }, []);

  // Listen for notification taps
  useEffect(() => {
    const subscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const leadId = response.notification.request.content.data?.lead_id;
        const leadSource =
          response.notification.request.content.data?.lead_source;

        if (
          leadId &&
          typeof leadId === 'string' &&
          leadSource &&
          (leadSource === 'lead' || leadSource === 'meta')
        ) {
          // Open to messages tab for SMS notifications
          setNotificationLead({ id: leadId, source: leadSource, openToMessages: true });
        }
      });

    return () => subscription.remove();
  }, []);

  if (checkingSession) {
    return (
      <View style={styles.centerContent}>
        <ActivityIndicator />
        <Text style={styles.subtitle}>Checking session…</Text>
      </View>
    );
  }

  // No Supabase session → show login
  if (!session) {
    return <AuthScreen onAuth={(sess) => setSession(sess)} />;
  }

  // Have session but app is locked → show Face ID lock screen
  if (isLocked) {
    return (
      <>
        <LockScreen />
        <StatusBar style="auto" />
      </>
    );
  }

  // Have session and app is unlocked → show main Leads screen
  return (
    <>
      <LeadsScreen
        onSignOut={async () => {
          await supabase.auth.signOut();
          setSession(null);
        }}
        session={session}
        notificationLead={notificationLead}
        onNotificationHandled={() => setNotificationLead(null)}
      />
      <StatusBar style="auto" />
    </>
  );
}

// Wrap everything in AppLockProvider so lock state is available globally
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppLockProvider>
        <RootApp />
      </AppLockProvider>
    </GestureHandlerRootView>
  );
}

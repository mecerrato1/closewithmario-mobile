import { StatusBar } from 'expo-status-bar';
import { senderNames } from './src/features/leads/senderName';
import { LatestLeadRow } from './src/features/dashboard/LatestLeadRow';
import { LeadListRow } from './src/features/leads/LeadListRow';
import { dayLabel, nextStep, timeLabel } from './src/features/leads/leadRowPresentation';
import { CallQueueRow } from './src/features/today/CallQueueRow';
import { TodayCallsScreen } from './src/features/today/TodayCallsScreen';
import { useCallQueue } from './src/features/today/useCallQueue';
import { GioScreen } from './src/features/gio/GioScreen';
import { useGio } from './src/features/gio/useGio';
import type { CallQueueFilter, CallQueueItem } from './src/features/today/callQueue';
import { leadSourceLine } from './src/features/dashboard/leadSummary';
import { isTextSuggestion, readableStatuses, suggestedMessage } from './src/features/leads/followUpText';
import { fetchSenderContact } from './src/lib/senderContact';
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
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
import {
  clearRoleCaches,
  getUserCrmLeadScope,
  getUserRole,
  getUserTeamMemberId,
  canManageTeam,
  canViewAdsLibrary,
  type UserCrmLeadScope,
  type UserRole,
} from './src/lib/roles';
import { TEXT_TEMPLATES, fillTemplate, getTemplateText, getTemplateName, type TemplateVariables } from './src/lib/textTemplates';
import type { Lead, MetaLead, SelectedLeadRef, LoanOfficer, Realtor, Activity, AttentionBadge } from './src/lib/types/leads';
import { STATUSES, STATUS_DISPLAY_MAP, STATUS_COLOR_MAP, getLeadAlert, formatStatus, getLeadLastTouchedValue, getTimeAgo, sortLeadsByLastTouchedDesc } from './src/lib/leadsHelpers';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import DateTimePicker from '@react-native-community/datetimepicker';
import { scheduleLeadCallback } from './src/lib/callbacks';
import AuthScreen from './src/screens/AuthScreen';
import { LeadDetailView } from './src/screens/LeadDetailScreen';
import TeamManagementScreen from './src/screens/TeamManagementScreen';
import AdsLibraryScreen from './src/screens/AdsLibraryScreen';
import MortgageCalculatorScreen from './src/screens/MortgageCalculatorScreen';
import ProfileSettingsScreen from './src/screens/ProfileSettingsScreen';
import { AppLockProvider, useAppLock } from './src/contexts/AppLockContext';
import { useAiLeadAttention } from './src/hooks/useAiLeadAttention';
import LockScreen from './src/screens/LockScreen';
import {
  cancelAllScheduledReminders,
  deactivateThisDevicePush,
  registerForPushNotifications,
} from './src/lib/notifications';
import { runSignOut } from './src/features/session/signOutCleanup';
import { styles } from './src/styles/appStyles';
import { useThemeColors } from './src/styles/theme';
import { PUBLIC_BRAND } from './src/brand/brands';
import { getAvatarUrl } from './src/utils/profilePicture';
import AuthenticatedRoot from './src/screens/AuthenticatedRoot';
import MfaGate from './src/screens/MfaGate';

import * as WebBrowser from 'expo-web-browser';
import QuickCaptureTab from './src/features/quickCapture/QuickCaptureTab';
import { usePaginatedLeads } from './src/features/leads/usePaginatedLeads';
import { useLeadTabCounts } from './src/features/leads/useLeadTabCounts';
import {
  getCrmLeadSourceKey,
  toMobileLead,
  toCrmLeadSummary,
  type CrmLeadListQuery,
} from './src/features/leads/crmLeadApi';
import {
  DASHBOARD_LEAD_FILTERS,
  getLeadTabCount,
  getSourceOptionCount,
  getStatusOptionCount,
  shouldOpenNotificationLead,
  type LeadCountContext,
} from './src/features/leads/leadListPresentation';
import { queryIncompleteTodayCallbacks } from './src/features/leads/todayCallbacksQuery';

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
  notificationLead?: { id: string; source: 'lead' | 'meta'; openTab?: 'messages' | 'dm' } | null;
  onNotificationHandled?: () => void;
  defaultToMyLeads?: boolean;
  skipDashboard?: boolean;
  /** Increases each time the Leads tab is pressed. */
  leadsTabPresses?: number;
  onNavigateToCapture?: (captureId: string) => void;
};

function normalizeNotificationLeadSource(source: unknown): 'lead' | 'meta' | null {
  if (source === 'meta') return 'meta';
  if (source === 'lead' || source === 'organic') return 'lead';
  return null;
}

function resolveNotificationOpenTab(
  data: Record<string, unknown> | undefined,
  title: string | null | undefined
) {
  const openTab = typeof data?.openTab === 'string' ? data.openTab.toLowerCase() : '';
  if (openTab === 'messages' || openTab === 'sms') return 'messages' as const;
  if (openTab === 'dm') return 'dm' as const;

  const channel = typeof data?.channel === 'string' ? data.channel.toLowerCase() : '';
  if (channel === 'messenger' || channel === 'instagram') return 'dm' as const;
  if (channel === 'sms') return 'messages' as const;

  if (data?.openToMessages === true || data?.open_to_messages === true) {
    return 'messages' as const;
  }

  const type = typeof data?.type === 'string' ? data.type.toLowerCase() : '';
  if (type === 'sms' || type === 'sms_message' || type === 'inbound_sms') {
    return 'messages' as const;
  }

  const titleText = title?.toLowerCase() || '';
  if (titleText.includes('new messenger message')) return 'dm' as const;
  if (titleText.includes('new message from')) return 'messages' as const;

  return undefined;
}

function LeadsScreen({ onSignOut, session, notificationLead, onNotificationHandled, defaultToMyLeads, skipDashboard, leadsTabPresses = 0, onNavigateToCapture }: LeadsScreenProps) {
  const { colors, isDark } = useThemeColors();
  const brand = PUBLIC_BRAND;
  const [initializing, setInitializing] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [roleReady, setRoleReady] = useState(false);
  const [initializationAttempt, setInitializationAttempt] = useState(0);
  const [selectedLead, setSelectedLead] = useState<SelectedLeadRef | null>(
    null
  );
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<'leads' | 'meta' | 'all'>('all');
  const [showDashboard, setShowDashboard] = useState(true);
  const [pendingLeadAction, setPendingLeadAction] = useState<'call' | 'text' | null>(null);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [attentionFilter, setAttentionFilter] = useState(false);
  const [unreadFilter, setUnreadFilter] = useState(false);
  const [trackedFilter, setTrackedFilter] = useState(false);
  const [hasManuallySelectedTab, setHasManuallySelectedTab] = useState(false);
  const hasAutoSelectedTabRef = useRef(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showLeadSearch, setShowLeadSearch] = useState(false);
  const [showLeadFilters, setShowLeadFilters] = useState(false);
  const [loanOfficers, setLoanOfficers] = useState<Array<{ id: string; name: string }>>([]);
  const [userRole, setUserRole] = useState<UserRole>('buyer');
  const [searchQuery, setSearchQuery] = useState('');
  const [showTeamManagement, setShowTeamManagement] = useState(false);
  const [showAdsLibrary, setShowAdsLibrary] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [teamMemberId, setTeamMemberId] = useState<string | null>(null);
  const [crmLeadScope, setCrmLeadScope] = useState<UserCrmLeadScope>('all');
  const [selectedLOFilter, setSelectedLOFilter] = useState<string | null>(null); // null = all LOs
  const [showLOPicker, setShowLOPicker] = useState(false);
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>('all'); // 'all' = all sources
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [todayCallbacks, setTodayCallbacks] = useState<any[]>([]);
  const [showCallbackHistory, setShowCallbackHistory] = useState(false);
  const [callbackHistory, setCallbackHistory] = useState<any[]>([]);
  const [showAiRecommendationModal, setShowAiRecommendationModal] = useState(false);
  const [selectedAiAttention, setSelectedAiAttention] = useState<{ reason: string; suggestedAction: string; badge: string; leadId: string; source: 'lead' | 'meta'; phone: string; firstName: string } | null>(null);
  const [realtorProfilePicUrl, setRealtorProfilePicUrl] = useState<string | null>(null);
  
  // AI Lead Attention - fetch from cache/API
  const { invalidateAttention, attentionMap } = useAiLeadAttention();
  
  // Quick Capture state
  const [showQuickCaptures, setShowQuickCaptures] = useState(false);
  const [quickCaptureStartOnAdd, setQuickCaptureStartOnAdd] = useState(false);
  const [showFabActionSheet, setShowFabActionSheet] = useState(false);
  // Add Lead Modal state
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [returnToDashboardAfterAddLead, setReturnToDashboardAfterAddLead] = useState(false);
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

  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const leadListQuery = useMemo<CrmLeadListQuery>(() => {
    return {
      scope: crmLeadScope,
      limit: 50,
      search: debouncedSearch.length >= 2 ? debouncedSearch : '',
      status: selectedStatusFilter || 'all',
      platform:
        activeTab === 'leads' ? 'organic' : activeTab === 'meta' ? 'meta' : 'all',
      ownerLoId:
        selectedLOFilter || null,
      sourceKey:
        userRole === 'super_admin' && selectedSourceFilter !== 'all'
          ? selectedSourceFilter
          : undefined,
      excludeUnqualified: selectedStatusFilter === 'all',
      needsAttention: attentionFilter,
      unreadOnly: unreadFilter,
      trackedOnly: trackedFilter,
      importSource: 'all',
      sort: 'last_contact',
      direction: 'desc',
    };
  }, [
    activeTab,
    attentionFilter,
    debouncedSearch,
    selectedLOFilter,
    selectedSourceFilter,
    selectedStatusFilter,
    trackedFilter,
    unreadFilter,
    crmLeadScope,
  ]);

  const leadDirectory = usePaginatedLeads(
    leadListQuery,
    roleReady && userRole !== 'buyer'
  );
  const otherTabCounts = useLeadTabCounts(
    leadListQuery,
    activeTab,
    leadDirectory.totalCount,
    roleReady && userRole !== 'buyer' && !leadDirectory.loading
  );
  const {
    loadMore: loadMoreDirectoryLeads,
    refresh: refreshLeadDirectory,
    removeItem: removeDirectoryLead,
    retry: retryLeadDirectory,
    updateItem: updateLeadDirectoryItem,
    upsertItem: upsertLeadDirectoryItem,
  } = leadDirectory;
  const leads = useMemo(
    () =>
      leadDirectory.items
        .filter((lead) => lead.source === 'organic')
        .map((lead) => toMobileLead(lead) as Lead),
    [leadDirectory.items]
  );
  const metaLeads = useMemo(
    () =>
      leadDirectory.items
        .filter((lead) => lead.source === 'meta')
        .map((lead) => toMobileLead(lead) as MetaLead),
    [leadDirectory.items]
  );
  const unreadConversationCount =
    leadDirectory.facets?.unreadSms
    ?? leadDirectory.items.filter(
      (lead) => (Number(lead.unread_sms_count) || 0) > 0
    ).length;
  const leadDirectoryItemsRef = useRef(leadDirectory.items);
  leadDirectoryItemsRef.current = leadDirectory.items;
  const loading = initializing || leadDirectory.loading;
  const refreshing = leadDirectory.refreshing;
  const errorMessage = initialError || leadDirectory.error;
  const debugInfo = `loaded: ${leadDirectory.items.length} · total: ${leadDirectory.totalCount}`;

  const updateDirectoryLead = useCallback(
    (source: 'lead' | 'meta', id: string, patch: Record<string, unknown>) => {
      updateLeadDirectoryItem(source === 'lead' ? 'organic' : 'meta', id, patch);
    },
    [updateLeadDirectoryItem]
  );

  const upsertDirectoryLead = useCallback(
    (source: 'lead' | 'meta', record: Lead | MetaLead) => {
      upsertLeadDirectoryItem(toCrmLeadSummary(source, record));
    },
    [upsertLeadDirectoryItem]
  );

  // Micro animations for the lead list
  const listOpacity = useRef(new Animated.Value(1)).current;

  // Calculate unique sources for the filter
  const uniqueSources = React.useMemo(() => {
    const sources = new Set<string>(
      [
        ...Object.keys(leadDirectory.facets?.metaSourceKeys || {}),
        ...Object.keys(leadDirectory.facets?.organicSourceKeys || {}),
        ...Object.keys(leadDirectory.facets?.ads || {}),
        ...Object.keys(leadDirectory.facets?.sourceDetails || {}),
      ]
    );
    
    metaLeads.forEach(l => {
      sources.add(getCrmLeadSourceKey(l, 'meta'));
    });
    
    leads.forEach(l => {
      sources.add(getCrmLeadSourceKey(l, 'organic'));
    });
    
    return Array.from(sources).sort();
  }, [
    leadDirectory.facets?.ads,
    leadDirectory.facets?.metaSourceKeys,
    leadDirectory.facets?.organicSourceKeys,
    leadDirectory.facets?.sourceDetails,
    leads,
    metaLeads,
  ]);

  // Collapsing header animation for dashboard view
  // The dashboard list starts at the top every time it comes back on screen, so its
  // header needs a fresh value too. Reusing the old one left the header collapsed with a
  // gap above the content.
  // Today is the website's call list. Realtors and buyers have no list there.
  const [showTodayCalls, setShowTodayCalls] = useState(false);
  const [todayBucket, setTodayBucket] = useState<CallQueueFilter>('all');
  const usesCallQueue = roleReady && userRole !== 'buyer' && userRole !== 'realtor';
  const callQueueScope = userRole === 'super_admin' ? 'all' : 'mine';
  const callQueueLoanOfficer = userRole === 'super_admin' ? selectedLOFilter : null;
  const todayCalls = useCallQueue({
    enabled: usesCallQueue,
    scope: callQueueScope,
    loanOfficerId: callQueueLoanOfficer,
    pageSize: 3,
  });
  const gio = useGio(session?.user?.id, session?.user?.email, usesCallQueue);
  const [showGio, setShowGio] = useState(false);
  const openCallQueueItem = (item: CallQueueItem, action?: 'call' | 'text') =>
    openLeadFromSelection(
      { source: item.leadSource === 'meta' ? 'meta' : 'lead', id: item.leadId },
      { action }
    );

  const dashboardOnScreen =
    showDashboard && !showTodayCalls && !selectedLead && !showTeamManagement && !showAdsLibrary &&
    !showProfileSettings && !showQuickCaptures;
  const dashboardScrollY = useMemo(() => new Animated.Value(0), [dashboardOnScreen]);
  const DASHBOARD_HEADER_EXPANDED = Platform.OS === 'ios' ? 192 : 180;
  const DASHBOARD_HEADER_COLLAPSED = Platform.OS === 'ios' ? 110 : 98;
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

  const dashboardSlimOpacity = dashboardScrollY.interpolate({
    inputRange: [28, HEADER_SCROLL_DISTANCE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const dashboardContentOpacity = dashboardScrollY.interpolate({
    inputRange: [0, 36],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // A brief fade as the list changes. It no longer shrinks the list: the list can be
  // swapped out mid-animation, which left it stuck narrower than the screen.
  const triggerListAnimation = () => {
    Animated.timing(listOpacity, {
      toValue: 0.96,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
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
  };

  useEffect(() => {
    const init = async () => {
      if (!session?.user?.id || !session?.user?.email) {
        setInitialError('No user session found');
        setInitializing(false);
        return;
      }

      try {
        setInitializing(true);
        setInitialError(null);
        setRoleReady(false);

        // Get user's role using the role system
        const role = await getUserRole(session.user.id, session.user.email);
        const scope = await getUserCrmLeadScope(
          session.user.id,
          session.user.email,
          role
        );
        console.log('User role:', role);
        setUserRole(role);
        setCrmLeadScope(scope);
        setRoleReady(true);

        if (role === 'loan_officer') {
          const memberId = await getUserTeamMemberId(session.user.id, 'loan_officer');
          setTeamMemberId(memberId);
        }

        // Fetch realtor profile picture for realtor users
        if (role === 'realtor') {
          const realtorMemberId = await getUserTeamMemberId(session.user.id, 'realtor');
          if (realtorMemberId) {
            const { data: realtorPicData } = await supabase
              .from('realtors')
              .select('profile_picture_url')
              .eq('id', realtorMemberId)
              .single();
            
            if (realtorPicData?.profile_picture_url) {
              setRealtorProfilePicUrl(realtorPicData.profile_picture_url);
            }
          }
        }

        // Fetch loan officers for super admins and realtors
        if (role === 'super_admin' || role === 'admin' || role === 'realtor') {
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

        // Fetch today's callbacks for the current user (only incomplete)
        if (session?.user?.id) {
          const { data: callbacksData, error: callbacksError } =
            await queryIncompleteTodayCallbacks(supabase, session.user.id);

          if (callbacksError) {
            console.error('Error loading today callbacks:', callbacksError);
          } else {
            setTodayCallbacks(callbacksData || []);
          }
        }

      } catch (e: any) {
        console.error('Unexpected error:', e);
        setInitialError(e?.message || 'Unexpected error');
      } finally {
        setInitializing(false);
      }
    };

    init();
  }, [initializationAttempt, session?.user?.id]);

  // State for opening directly to a specific lead tab from notifications
  const [notificationTargetTab, setNotificationTargetTab] = useState<'messages' | 'dm' | null>(null);
  const [notificationTargetLead, setNotificationTargetLead] = useState<SelectedLeadRef | null>(null);

  const openLeadFromSelection = (leadRef: SelectedLeadRef, options?: { hideDashboard?: boolean; action?: 'call' | 'text' }) => {
    setPendingLeadAction(options?.action ?? null);
    if (options?.hideDashboard) {
      setShowDashboard(false);
    }

    const shouldPreserveNotificationTarget =
      notificationTargetTab &&
      notificationTargetLead?.id === leadRef.id &&
      notificationTargetLead?.source === leadRef.source;

    if (!shouldPreserveNotificationTarget) {
      setNotificationTargetTab(null);
      setNotificationTargetLead(null);
    }

    setSelectedLead(leadRef);
  };

  // Subscribe to new SMS messages to refresh attention, while only inbound
  // unread messages update the unread counters.
  useEffect(() => {
    if (!roleReady || userRole === 'buyer') return;

    const subscription = supabase
      .channel('sms_messages_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sms_messages' },
        (payload) => {
          const newMessage = payload.new as { lead_id: string | null; direction: string; read_at: string | null };
          if (newMessage.lead_id) {
            invalidateAttention(newMessage.lead_id);
          }

          if (newMessage.lead_id && newMessage.direction === 'inbound' && !newMessage.read_at) {
            console.log('📬 New inbound SMS received for lead:', newMessage.lead_id);
            const current = leadDirectoryItemsRef.current.find(
              (lead) => lead.id === newMessage.lead_id
            );
            if (current) {
              updateLeadDirectoryItem(current.source, current.id, {
                unread_sms_count: (Number(current.unread_sms_count) || 0) + 1,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [
    invalidateAttention,
    roleReady,
    updateLeadDirectoryItem,
    userRole,
  ]);

  // Handle notification tap to navigate to lead
  useEffect(() => {
    if (notificationLead && shouldOpenNotificationLead(notificationLead, roleReady)) {
      console.log('📱 Notification tap received:', notificationLead);
      // Navigate directly to the lead using the source from notification
      setSelectedLead({ source: notificationLead.source, id: notificationLead.id });
      setShowDashboard(false);
      setNotificationTargetTab(notificationLead.openTab || null);
      setNotificationTargetLead({ source: notificationLead.source, id: notificationLead.id });
      onNotificationHandled?.();
    }
  }, [notificationLead, onNotificationHandled, roleReady]);

  // Skip dashboard when user clicks Leads tab (not on initial login)
  useEffect(() => {
    if (skipDashboard) {
      setShowDashboard(false);
    }
  }, [skipDashboard]);

  // Leaving a lead, by its close button or the Leads tab.
  const closeSelectedLead = () => {
    setSelectedLead(null);
    setNotificationTargetTab(null); // Reset notification target
    setNotificationTargetLead(null);
    setPendingLeadAction(null);
    refreshTodayCallbacks(); // Refresh callbacks when returning to dashboard
    void todayCalls.refresh();
    void refreshLeadDirectory();
  };

  const seenLeadsTabPresses = useRef(leadsTabPresses);
  useEffect(() => {
    if (leadsTabPresses === seenLeadsTabPresses.current) return;
    seenLeadsTabPresses.current = leadsTabPresses;
    if (selectedLead) closeSelectedLead();
    setShowTodayCalls(false);
    setShowDashboard(false);
  }, [leadsTabPresses]);

  // Auto-switch tab based on available leads (only on initial load)
  // If defaultToMyLeads is true, prefer 'leads' tab (My Leads / Website leads)
  useEffect(() => {
    if (
      !loading
      && !leadDirectory.searching
      && leadDirectory.facets
      && !hasManuallySelectedTab
      && !hasAutoSelectedTabRef.current
    ) {
      hasAutoSelectedTabRef.current = true;
      const organicCount = leadDirectory.facets?.organic ?? leads.length;
      const metaCount = leadDirectory.facets?.meta ?? metaLeads.length;
      if (defaultToMyLeads) {
        // Default to My Leads (website/organic leads) when coming from bottom tab
        setActiveTab('leads');
      } else if (metaCount === 0 && organicCount > 0) {
        setActiveTab('leads');
      } else if (metaCount > 0 && organicCount === 0) {
        setActiveTab('meta');
      } else if (metaCount > 0 || organicCount > 0) {
        // Both have leads or only meta has leads, default to 'all'
        setActiveTab('all');
      }
    }
  }, [
    defaultToMyLeads,
    hasManuallySelectedTab,
    leadDirectory.facets,
    leadDirectory.searching,
    leads.length,
    loading,
    metaLeads.length,
  ]);

  // Pull-to-refresh handler
  const onRefresh = async () => {
    if (!session?.user?.id || !session?.user?.email) {
      return;
    }

    try {
      const currentRole = await getUserRole(session.user.id, session.user.email);
      const currentScope = await getUserCrmLeadScope(
        session.user.id,
        session.user.email,
        currentRole
      );
      const scopeChanged = currentScope !== crmLeadScope;
      if (scopeChanged) {
        setCrmLeadScope(currentScope);
      }

      // Refresh today's callbacks as well
      const callbacksPromise = queryIncompleteTodayCallbacks(
        supabase,
        session.user.id
      );

      const [, callbacksResult] = await Promise.all([
        scopeChanged ? Promise.resolve() : refreshLeadDirectory(),
        callbacksPromise,
      ]);
      if (callbacksResult.error) {
        console.error('Error refreshing today callbacks:', callbacksResult.error);
      } else {
        setTodayCallbacks(callbacksResult.data || []);
      }
    } catch (e) {
      console.error('Refresh error:', e);
    }
  };

  const handleStatusChange = async (
    source: 'lead' | 'meta',
    id: string,
    newStatus: string,
    options?: { preserveSelectedLead?: boolean }
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
        
        if (wouldBeFilteredOut && !options?.preserveSelectedLead) {
          setSelectedLead(null);
          // Wait for React to process the unmount before updating leads state
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // Determine auto-tracking changes based on new status
      const shouldAutoTrack = newStatus === 'gathering_docs' || newStatus === 'qualified';
      const shouldAutoUntrack = newStatus === 'closed' || newStatus === 'unqualified';
      const getAutoTrackingReason = (status: string) => {
        if (status === 'gathering_docs') return 'auto_docs_requested';
        if (status === 'qualified') return 'auto_qualified';
        return null;
      };

      if (source === 'lead') {
        const currentLead = leads.find(l => l.id === id);
        const currentIsTracked = currentLead?.is_tracked || false;
        const currentReason = currentLead?.tracking_reason || null;

        // Build update object
        const updateData: any = { status: newStatus };
        
        // Auto-track if moving to gathering_docs or qualified
        if (shouldAutoTrack && !currentIsTracked) {
          updateData.is_tracked = true;
          updateData.tracking_reason = getAutoTrackingReason(newStatus);
        }
        // Auto-untrack if moving to closed/unqualified (only if auto-tracked, not manual)
        else if (shouldAutoUntrack && currentIsTracked && currentReason !== 'manual') {
          updateData.is_tracked = false;
          updateData.tracking_reason = null;
        }

        const { error } = await supabase
          .from('leads')
          .update(updateData)
          .eq('id', id);

        if (error) {
          console.error('Error updating lead status:', error);
          return;
        }

        updateDirectoryLead('lead', id, updateData);
        // Invalidate AI attention cache after status change
        invalidateAttention(id);
      } else {
        const currentLead = metaLeads.find(l => l.id === id);
        const currentIsTracked = currentLead?.is_tracked || false;
        const currentReason = currentLead?.tracking_reason || null;

        // Build update object
        const updateData: any = { status: newStatus };
        
        // Auto-track if moving to gathering_docs or qualified
        if (shouldAutoTrack && !currentIsTracked) {
          updateData.is_tracked = true;
          updateData.tracking_reason = getAutoTrackingReason(newStatus);
        }
        // Auto-untrack if moving to closed/unqualified (only if auto-tracked, not manual)
        else if (shouldAutoUntrack && currentIsTracked && currentReason !== 'manual') {
          updateData.is_tracked = false;
          updateData.tracking_reason = null;
        }

        const { error } = await supabase
          .from('meta_ads')
          .update(updateData)
          .eq('id', id);

        if (error) {
          console.error('Error updating meta lead status:', error);
          return;
        }

        updateDirectoryLead('meta', id, updateData);
        // Invalidate AI attention cache after status change
        invalidateAttention(id);
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
      const current = leadDirectory.items.find((lead) => lead.id === leadId);
      if (current) {
        updateLeadDirectoryItem(current.source, leadId, { unread_sms_count: 0 });
      }
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

  const openAddLeadModal = ({ fromDashboard = false }: { fromDashboard?: boolean } = {}) => {
    setAddLeadError(null);
    setReturnToDashboardAfterAddLead(fromDashboard);
    if (fromDashboard) {
      setShowDashboard(false);
    }
    setShowAddLeadModal(true);
  };

  const returnToLeadDashboard = () => {
    setActiveTab(DASHBOARD_LEAD_FILTERS.activeTab);
    setHasManuallySelectedTab(true);
    setSelectedLOFilter(DASHBOARD_LEAD_FILTERS.ownerLoId);
    setSelectedStatusFilter(DASHBOARD_LEAD_FILTERS.status);
    setSelectedSourceFilter(DASHBOARD_LEAD_FILTERS.source);
    setAttentionFilter(DASHBOARD_LEAD_FILTERS.needsAttention);
    setUnreadFilter(DASHBOARD_LEAD_FILTERS.unreadOnly);
    setTrackedFilter(DASHBOARD_LEAD_FILTERS.trackedOnly);
    setSearchQuery(DASHBOARD_LEAD_FILTERS.search);
    setShowLeadSearch(false);
    setShowLeadFilters(false);
    setShowDashboard(true);
  };

  const closeAddLeadModal = () => {
    setShowAddLeadModal(false);
    setAddLeadError(null);

    if (returnToDashboardAfterAddLead) {
      returnToLeadDashboard();
      setReturnToDashboardAfterAddLead(false);
    }
  };

  const openLeadListWorkspace = () => {
    triggerListAnimation();
    setShowDashboard(false);
  };

  const handleSelectLeadListTab = (tab: 'leads' | 'meta' | 'all') => {
    triggerListAnimation();
    setActiveTab(tab);
    setHasManuallySelectedTab(true);
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
        upsertDirectoryLead('lead', savedLead);
        
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
        closeAddLeadModal();
        
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
              removeDirectoryLead('organic', leadId);
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
      const { data: callbacksData, error: callbacksError } =
        await queryIncompleteTodayCallbacks(supabase, session.user.id);

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
    const aiMessage = suggestedMessage(suggestedAction);
    
    // Sign with the sender's own record, as the lead screen does.
    const contact =
      session?.user?.id && session.user.email
        ? await fetchSenderContact(session.user.id, session.user.email)
        : null;
    const { loFullname } = senderNames(contact, session?.user?.user_metadata?.full_name);
    const loPhone = contact?.phone || session?.user?.user_metadata?.phone || '[Phone]';
    const loEmail = contact?.email || session?.user?.email || '[Email]';

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
          updateDirectoryLead('meta', leadId, { last_contact_date: now });
        } else {
          updateDirectoryLead('lead', leadId, { last_contact_date: now });
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
    return lead.needs_attention === true;
  };

  // Tracked filter: when enabled, only show tracked leads
  const matchesTrackedFilter = (lead: Lead | MetaLead) => {
    if (!trackedFilter) return true;
    return lead.is_tracked === true;
  };

  // Unread messages filter: when enabled, only show leads with unread messages
  const matchesUnreadFilter = (lead: Lead | MetaLead) => {
    if (!unreadFilter) return true;
    return (Number(lead.unread_sms_count) || 0) > 0;
  };

  // Source filter (for super admins only)
  const matchesSourceFilter = (
    lead: Lead | MetaLead,
    source: 'organic' | 'meta'
  ) => {
    // Only apply filter for super admins
    if (userRole !== 'super_admin') return true;
    
    if (selectedSourceFilter === 'all') return true;

    return getCrmLeadSourceKey(lead, source) === selectedSourceFilter;
  };

  const matchesLeadListBase = (
    lead: Lead | MetaLead,
    source: 'organic' | 'meta'
  ) => {
    const statusMatch = selectedStatusFilter === 'all' ? lead.status !== 'unqualified' : lead.status === selectedStatusFilter;
    const loMatch = matchesLOFilter(lead);
    const attentionMatch = matchesAttentionFilter(lead);
    const sourceMatch = matchesSourceFilter(lead, source);
    const trackedMatch = matchesTrackedFilter(lead);
    const unreadMatch = matchesUnreadFilter(lead);

    return statusMatch
      && loMatch
      && attentionMatch
      && sourceMatch
      && trackedMatch
      && unreadMatch;
  };

  const matchesMetaLeadList = (lead: MetaLead) => {
    return matchesLeadListBase(lead, 'meta');
  };

  const getScenarioViewingLabel = (lead: Lead | MetaLead) => {
    const buyerActive = lead.has_active_borrower_scenario === true;
    const partnerActive = lead.has_active_realtor_scenario === true;
    if (buyerActive && partnerActive) return 'Buyer + partner scenarios active';
    if (buyerActive) return 'Buyer scenario active';
    if (partnerActive) return 'Partner scenario active';
    return null;
  };

  const getLeadAttention = (lead: Lead | MetaLead) =>
    attentionMap.get(lead.id)
    || (lead.attention_badge || lead.needs_attention
      ? {
          leadId: lead.id,
          needsAttention: lead.needs_attention === true,
          priority: Number(lead.attention_priority) || 5,
          badge: lead.attention_badge || '',
          reason: lead.attention_reason || '',
          suggestedAction: lead.attention_suggested_action || '',
          fromCache: true,
          loading: false,
        }
      : null);

  const renderLeadRow = (
    item: Lead | MetaLead,
    source: 'lead' | 'meta',
    previous: Lead | MetaLead | undefined
  ) => {
    const status = item.status || 'new';
    const attention = getLeadAttention(item);
    const step = nextStep({
      status,
      unreadCount: Number(item.unread_sms_count) || 0,
      attention,
      ruleLabel: getLeadAlert(item)?.label ?? null,
    });
    const touched = getLeadLastTouchedValue(item);
    const day = dayLabel(touched);
    const isMyLead = source === 'lead' && (item as Lead).source === 'My Lead';
    const meta = item as MetaLead;
    const notes: string[] = [];
    if (userRole === 'super_admin' && item.lo_id) {
      notes.push(loanOfficers.find((lo) => lo.id === item.lo_id)?.name || 'Unknown LO');
    }
    const scenario = getScenarioViewingLabel(item);
    if (scenario) notes.push(scenario);

    return (
      <View>
        {!previous || dayLabel(getLeadLastTouchedValue(previous)) !== day ? (
          <Text style={styles.leadDayLabel}>{day}</Text>
        ) : null}
        <LeadListRow
          name={[item.first_name, item.last_name].filter(Boolean).join(' ') || '(No name)'}
          status={status}
          source={
            isMyLead
              ? 'My lead'
              : leadSourceLine({ isMeta: source === 'meta', platform: meta.platform, campaignName: meta.campaign_name })
          }
          time={timeLabel(touched)}
          step={step}
          tracked={item.is_tracked === true}
          hasPhone={Boolean(item.phone)}
          notes={notes}
          onOpen={() => openLeadFromSelection({ source, id: item.id })}
          onCall={() => openLeadFromSelection({ source, id: item.id }, { action: 'call' })}
          onText={() => openLeadFromSelection({ source, id: item.id }, { action: 'text' })}
          onContacted={() => handleStatusChange(source, item.id, 'contacted')}
          onUnqualified={() => handleStatusChange(source, item.id, 'unqualified')}
          onDelete={isMyLead ? () => deleteMyLead(item.id) : undefined}
        />
      </View>
    );
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

  if (showAdsLibrary) {
    return (
      <AdsLibraryScreen
        session={session}
        userRole={userRole}
        onBack={() => setShowAdsLibrary(false)}
      />
    );
  }


  if (showProfileSettings) {
    return (
      <ProfileSettingsScreen
        session={session}
        onBack={() => setShowProfileSettings(false)}
        onSignOut={onSignOut}
        realtorProfilePicUrl={realtorProfilePicUrl}
        userRole={userRole}
      />
    );
  }

  // Quick Captures View
  if (showQuickCaptures) {
    return (
      <QuickCaptureTab
        userId={session?.user?.id || ''}
        onBack={() => {
          setShowQuickCaptures(false);
          setQuickCaptureStartOnAdd(false);
        }}
        startOnAdd={quickCaptureStartOnAdd}
      />
    );
  }

  if (selectedLead) {
    // Apply the same filters to leads/metaLeads that are used in the list view
    let filteredLeads = leads.filter(lead =>
      matchesLeadListBase(lead, 'organic')
    );

    let filteredMetaLeads = metaLeads.filter(matchesMetaLeadList);

    // Keep the currently selected lead available in detail view even if a state update
    // (e.g. logging a call + invalidating attention) causes it to fall out of filters.
    if (selectedLead.source === 'lead') {
      const selectedRecord = leads.find(l => l.id === selectedLead.id);
      if (selectedRecord && !filteredLeads.some(l => l.id === selectedLead.id)) {
        filteredLeads = [selectedRecord, ...filteredLeads];
      }
    } else {
      const selectedRecord = metaLeads.find(l => l.id === selectedLead.id);
      if (selectedRecord && !filteredMetaLeads.some(l => l.id === selectedLead.id)) {
        filteredMetaLeads = [selectedRecord, ...filteredMetaLeads];
      }
    }

    return (
      <LeadDetailView
        selected={selectedLead}
        leads={filteredLeads}
        metaLeads={filteredMetaLeads}
        onBack={closeSelectedLead}
        onNavigate={(leadRef) => openLeadFromSelection(leadRef)}
        onStatusChange={handleStatusChange}
        session={session}
        loanOfficers={loanOfficers}
        userRole={userRole}
        selectedStatusFilter={selectedStatusFilter}
        searchQuery={searchQuery}
        selectedLOFilter={selectedLOFilter}
        activeTab={activeTab}
        initialAction={pendingLeadAction}
        onInitialActionHandled={() => setPendingLeadAction(null)}
        initialDetailTab={notificationTargetTab}
        onInitialDetailTabHandled={() => {
          setNotificationTargetTab(null);
          setNotificationTargetLead(null);
        }}
        onMarkMessagesRead={markMessagesAsRead}
        onInvalidateAttention={invalidateAttention}
        aiAttention={
          getLeadAttention(
            (selectedLead.source === 'lead'
              ? leads.find((lead) => lead.id === selectedLead.id)
              : metaLeads.find((lead) => lead.id === selectedLead.id))
              ?? ({ id: selectedLead.id } as Lead)
          )
        }
        onNavigateToCapture={onNavigateToCapture}
        onDeleteLead={async (leadId: string) => {
          // Clear any quick_captures referencing this lead before deleting
          await supabase
            .from('quick_captures')
            .update({ converted_lead_id: null, status: 'open' })
            .eq('converted_lead_id', leadId);

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
          removeDirectoryLead('organic', leadId);
        }}
        onLeadUpdate={(updatedLead, source) => {
          console.log('🔄 onLeadUpdate called:', { source, leadId: updatedLead.id, last_contact_date: updatedLead.last_contact_date });
          updateDirectoryLead(
            source,
            updatedLead.id,
            toCrmLeadSummary(source, updatedLead)
          );
        }}
      />
    );
  }

  if (showTodayCalls) {
    return (
      <TodayCallsScreen
        scope={callQueueScope}
        loanOfficerId={callQueueLoanOfficer}
        bucket={todayBucket}
        onBucketChange={setTodayBucket}
        onBack={() => {
          setShowTodayCalls(false);
          void todayCalls.refresh();
        }}
        onOpen={openCallQueueItem}
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
    
    const facets = leadDirectory.facets;
    const totalLeads = facets
      ? Math.max(0, facets.total - (facets.statuses.unqualified || 0))
      : activeFilteredLeads.length + activeFilteredMetaLeads.length;
    const metaLeadsCount = facets?.meta ?? activeFilteredMetaLeads.length;
    const organicLeadsCount = facets?.organic ?? activeFilteredLeads.length;
    const newLeads =
      facets?.statuses.new
      ?? [...activeFilteredLeads, ...activeFilteredMetaLeads].filter(l => l.status === 'new').length;
    const qualifiedLeads =
      facets?.statuses.qualified
      ?? [...activeFilteredLeads, ...activeFilteredMetaLeads].filter(l => l.status === 'qualified').length;
    const closedLeads =
      facets?.statuses.closed
      ?? [...activeFilteredLeads, ...activeFilteredMetaLeads].filter(l => l.status === 'closed').length;
    
    // Separate count for unqualified leads
    const unqualifiedLeads =
      facets?.statuses.unqualified
      ?? [...filteredLeads, ...filteredMetaLeads].filter(l => l.status === 'unqualified').length;
    const unreadMessagesCount =
      unreadConversationCount;
    const trackedLeadsCount =
      facets?.tracked
      ?? [...leads, ...metaLeads].filter(l => l.is_tracked).length;
    const callbacksDueToday = todayCallbacks.length;

    // Leads that currently have an attention badge (AI-powered with fallback)
    const attentionLeadsCount =
      facets?.needsAttention
      ?? [...activeFilteredLeads, ...activeFilteredMetaLeads]
        .filter((lead) => getLeadAttention(lead)?.needsAttention || !!getLeadAlert(lead))
        .length;
    
    // Get recent leads (last 5) - exclude unqualified
    // Use _tableType to distinguish between leads/meta_ads without overwriting the source field
    const allLeads = [...activeFilteredMetaLeads.map(l => ({ ...l, _tableType: 'meta' as const })), ...activeFilteredLeads.map(l => ({ ...l, _tableType: 'lead' as const }))];
    const recentLeads = allLeads
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    // Before the first response the counts are unknown, not zero.
    const countsPlaceholder = leadDirectory.facets
      ? null
      : leadDirectory.error ? '—' : '…';

    // Get user's first name for greeting
    const userFirstName = session?.user?.user_metadata?.full_name?.split(' ')[0] || 
                          session?.user?.user_metadata?.name?.split(' ')[0] || 
                          'there';
    const heroBadgeText =
      callbacksDueToday > 0 && unreadMessagesCount > 0
        ? `${unreadMessagesCount} unread conversations to review`
        : null;

    const openDashboardList = ({
      tab = 'all',
      status = 'all',
      attention = false,
      unread = false,
      tracked = false,
    }: {
      tab?: 'leads' | 'meta' | 'all';
      status?: string;
      attention?: boolean;
      unread?: boolean;
      tracked?: boolean;
    }) => {
      triggerListAnimation();
      setAttentionFilter(attention);
      setUnreadFilter(unread);
      setTrackedFilter(tracked);
      setActiveTab(tab);
      setSelectedStatusFilter(status);
      setSelectedSourceFilter('all');
      setSelectedLOFilter(null);
      setShowDashboard(false);
    };

    const primaryHeroCard: {
      key: string;
      icon: keyof typeof Ionicons.glyphMap;
      value: number;
      label: string;
      tone: any;
      onPress?: () => void;
    } =
      callbacksDueToday > 0
        ? {
            key: 'callbacks',
            icon: 'calendar-clear-outline' as const,
            value: callbacksDueToday,
            label: 'Due Today',
            tone: styles.dashboardHeroCardBlue,
          }
        : unreadMessagesCount > 0
          ? {
              key: 'unread',
              icon: 'chatbubble-ellipses-outline' as const,
              value: unreadMessagesCount,
              label: 'Unread',
              tone: styles.dashboardHeroCardBlue,
              onPress: () => openDashboardList({ tab: 'all', unread: true }),
            }
          : {
              key: 'new',
              icon: 'flash-outline' as const,
              value: newLeads,
              label: 'New Leads',
              tone: styles.dashboardHeroCardBlue,
              onPress: () => openDashboardList({ tab: 'all', status: 'new' }),
            };

    const heroFocusCards: Array<{
      key: string;
      icon: keyof typeof Ionicons.glyphMap;
      value: number;
      label: string;
      tone: any;
      onPress?: () => void;
    }> = [
      primaryHeroCard,
      {
        key: 'attention',
        icon: 'alert-circle-outline' as const,
        value: attentionLeadsCount,
        label: 'Needs Attention',
        tone: styles.dashboardHeroCardAmber,
        onPress: () => openDashboardList({ tab: 'all', attention: true }),
      },
    ];

    const snapshotCards = [
      {
        key: 'new',
        icon: 'flash-outline' as const,
        value: newLeads,
        label: 'New Leads',
        tone: styles.dashboardSnapshotIconBlue,
        onPress: () => openDashboardList({ tab: 'all', status: 'new' }),
      },
      {
        key: 'qualified',
        icon: 'checkmark-circle-outline' as const,
        value: qualifiedLeads,
        label: 'Qualified',
        tone: styles.dashboardSnapshotIconGreen,
        onPress: () => openDashboardList({ tab: 'all', status: 'qualified' }),
      },
      {
        key: 'attention',
        icon: 'alert-circle-outline' as const,
        value: attentionLeadsCount,
        label: 'Needs Attention',
        tone: styles.dashboardSnapshotIconAmber,
        onPress: () => openDashboardList({ tab: 'all', attention: true }),
      },
      {
        key: 'tracked',
        icon: 'bookmark-outline' as const,
        value: trackedLeadsCount,
        label: 'Tracked',
        tone: styles.dashboardSnapshotIconIndigo,
        onPress: () => openDashboardList({ tab: 'all', tracked: true }),
      },
      {
        key: 'closed',
        icon: 'trophy-outline' as const,
        value: closedLeads,
        label: 'Closed',
        tone: styles.dashboardSnapshotIconPink,
        onPress: () => openDashboardList({ tab: 'all', status: 'closed' }),
      },
      {
        key: 'unqualified',
        icon: 'remove-circle-outline' as const,
        value: unqualifiedLeads,
        label: 'Unqualified',
        tone: styles.dashboardSnapshotIconMuted,
        onPress: () => openDashboardList({ tab: 'all', status: 'unqualified' }),
      },
    ];

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Profile Menu Modal */}
        <Modal
          visible={showProfileMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowProfileMenu(false)}
        >
          <TouchableOpacity accessibilityRole="button" 
            style={styles.profileMenuOverlay}
            activeOpacity={1}
            onPress={() => setShowProfileMenu(false)}
          >
            <View style={[styles.profileMenuContent, { backgroundColor: colors.cardBackground }]}>
              {(canManageTeam(userRole) || canViewAdsLibrary(userRole)) && (
                <>
                  {canManageTeam(userRole) && (
                    <TouchableOpacity accessibilityRole="button"
                      style={styles.profileMenuItem}
                      onPress={() => {
                        setShowProfileMenu(false);
                        setShowTeamManagement(true);
                      }}
                    >
                      <View style={styles.profileMenuIconContainer}>
                        <Ionicons name="people" size={20} color={brand.colors.accent} />
                      </View>
                      <Text style={[styles.profileMenuText, { color: colors.textPrimary }]}>Team Management</Text>
                    </TouchableOpacity>
                  )}
                  {canViewAdsLibrary(userRole) && (
                    <TouchableOpacity accessibilityRole="button"
                      style={styles.profileMenuItem}
                      onPress={() => {
                        setShowProfileMenu(false);
                        setShowAdsLibrary(true);
                      }}
                    >
                      <View style={styles.profileMenuIconContainer}>
                        <Ionicons name="images-outline" size={20} color={brand.colors.accent} />
                      </View>
                      <Text style={[styles.profileMenuText, { color: colors.textPrimary }]}>Ads Library</Text>
                    </TouchableOpacity>
                  )}
                  <View style={[styles.profileMenuDivider, { backgroundColor: colors.border }]} />
                </>
              )}

            {gio.available ? (
              <TouchableOpacity accessibilityRole="button"
                style={styles.profileMenuItem}
                onPress={() => {
                  setShowProfileMenu(false);
                  setShowGio(true);
                }}
              >
                <View style={styles.profileMenuIconContainer}>
                  <Ionicons name="chatbubble-ellipses-outline" size={20} color={brand.colors.accent} />
                </View>
                <Text style={[styles.profileMenuText, { color: colors.textPrimary }]}>Ask Gio</Text>
              </TouchableOpacity>
            ) : null}

              <TouchableOpacity accessibilityRole="button"
                style={styles.profileMenuItem}
                onPress={() => {
                  setShowProfileMenu(false);
                  setShowProfileSettings(true);
                }}
              >
                <View style={styles.profileMenuIconContainer}>
                  <Ionicons name="person-circle-outline" size={20} color={colors.textPrimary} />
                </View>
                <Text style={[styles.profileMenuText, { color: colors.textPrimary }]}>Profile Settings</Text>
              </TouchableOpacity>
              
              <View style={[styles.profileMenuDivider, { backgroundColor: colors.border }]} />
              
              <TouchableOpacity accessibilityRole="button"
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

        {/* Compact header: the greeting row collapses into a slim bar on scroll */}
        <Animated.View style={[
          styles.newDashboardHeader,
          {
            backgroundColor: brand.colors.primary,
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
          <StatusBar style="light" />
          <Animated.View style={[styles.dashTopRow, { transform: [{ translateY: dashboardUserInfoTranslateY }] }]}>
            <View style={{ flex: 1, height: 60, justifyContent: 'center' }}>
              <Animated.View style={{ opacity: dashboardContentOpacity }}>
                <Text style={styles.dashLabel}>DASHBOARD</Text>
                <Text style={styles.dashGreeting} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {userFirstName}
                </Text>
                <Text style={styles.dashDate}>
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </Text>
              </Animated.View>
              <Animated.View pointerEvents="none" style={[styles.dashSlim, { opacity: dashboardSlimOpacity }]}>
                <Text style={styles.dashSlimTitle}>Dashboard</Text>
                {heroFocusCards.map((card) => (
                  <View key={card.key} style={[styles.dashSlimChip, card.tone]}>
                    <Text style={styles.dashSlimChipText}>
                      {countsPlaceholder ?? card.value} {card.key === 'attention' ? 'due' : card.label.replace(' Leads', '').toLowerCase()}
                    </Text>
                  </View>
                ))}
              </Animated.View>
            </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {/* Notification Bell */}
                <TouchableOpacity accessibilityRole="button"
                  onPress={() => {
                    setShowDashboard(false);
                    setSelectedStatusFilter('all');
                    setActiveTab('all');
                    setUnreadFilter(true);
                  }}
                  accessibilityLabel={unreadConversationCount > 0 ? `Unread messages, ${unreadConversationCount}` : 'Unread messages'}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ position: 'relative' }}
                >
                  <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
                  {unreadConversationCount > 0 && (
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
                        {unreadConversationCount > 99
                          ? '99+' 
                          : unreadConversationCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                {/* Profile Button */}
                <TouchableOpacity accessibilityRole="button" 
                  onPress={() => setShowProfileMenu(true)}
                  accessibilityLabel="Profile and settings"
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  style={styles.profileButton}
                >
                  {getAvatarUrl(session?.user?.user_metadata, realtorProfilePicUrl) ? (
                    <Image 
                      source={{ uri: getAvatarUrl(session?.user?.user_metadata, realtorProfilePicUrl) || '' }}
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

          <Animated.View style={[styles.dashChipRow, { opacity: dashboardContentOpacity }]}>
            {heroFocusCards.map((card) => (
              <TouchableOpacity accessibilityRole="button"
                key={card.key}
                style={[styles.dashChip, card.tone]}
                onPress={card.onPress}
                disabled={!card.onPress}
                activeOpacity={0.85}
              >
                <Text style={styles.dashChipValue}>{countsPlaceholder ?? card.value}</Text>
                <Text style={styles.dashChipLabel} numberOfLines={1}>{card.label}</Text>
              </TouchableOpacity>
            ))}
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
              onRefresh={() => {
                void onRefresh();
                void todayCalls.refresh();
              }}
              progressViewOffset={DASHBOARD_HEADER_EXPANDED} // Ensure spinner shows below header
            />
          }
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: dashboardScrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={1} // Maximize smoothness
        >
          <View style={styles.dashSectionHeader}>
            <Text style={[styles.dashSectionTitle, { color: colors.textPrimary }]}>
              {showCallbackHistory ? 'Callback history' : 'Today'}
              {!showCallbackHistory && todayCalls.page ? ` · ${todayCalls.page.allTotal} to call` : ''}
            </Text>
            <TouchableOpacity accessibilityRole="button"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => {
                if (showCallbackHistory) {
                  setShowCallbackHistory(false);
                  return;
                }
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
              <Text style={styles.dashSectionLink}>{showCallbackHistory ? 'Back to today' : 'History'}</Text>
            </TouchableOpacity>
          </View>

          {showCallbackHistory ? (
            <View style={styles.dashList}>
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
                    <TouchableOpacity accessibilityRole="button"
                      key={cb.id}
                      style={[styles.newLeadCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                      onPress={() => {
                        if (cb.lead_id || cb.meta_ad_id) {
                          openLeadFromSelection(
                            {
                              source: cb.meta_ad_id ? 'meta' : 'lead',
                              id: cb.meta_ad_id || cb.lead_id,
                            },
                            { hideDashboard: true }
                          );
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
          ) : (
            <>
              {usesCallQueue ? (
                <View style={styles.dashCard}>
                  {!todayCalls.page ? (
                    todayCalls.error ? (
                      <TouchableOpacity accessibilityRole="button" style={styles.dashEmptyRow} onPress={() => void todayCalls.refresh()}>
                        <Text style={styles.dashEmptyText}>Couldn't load today's calls. Tap to retry.</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.dashEmptyRow}>
                        <Text style={styles.dashEmptyText}>Loading today's calls…</Text>
                      </View>
                    )
                  ) : todayCalls.page.items.length === 0 ? (
                    <View style={styles.dashEmptyRow}>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#047857" />
                      <Text style={styles.dashEmptyText}>You're caught up for today</Text>
                    </View>
                  ) : (
                    <>
                      {todayCalls.page.items.map((item, index) => (
                        <CallQueueRow
                          key={`${item.leadSource}-${item.leadId}`}
                          item={item}
                          first={index === 0}
                          onOpen={() => openCallQueueItem(item)}
                          onCall={() => openCallQueueItem(item, 'call')}
                          onText={() => openCallQueueItem(item, 'text')}
                        />
                      ))}
                      <TouchableOpacity accessibilityRole="button" style={styles.dashSeeAll} onPress={() => setShowTodayCalls(true)}>
                        <Text style={styles.dashSectionLink}>See all {todayCalls.page.allTotal}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              ) : todayCallbacks.length === 0 ? (
                <View style={[styles.dashCard, styles.dashEmptyRow]}>
                  <Ionicons name="calendar-outline" size={18} color="#1D4ED8" />
                  <Text style={styles.dashEmptyText}>No callbacks scheduled today</Text>
                </View>
              ) : null}

              {/* Your own callbacks keep their swipe actions: Done and Delete. */}
              {todayCallbacks.length > 0 ? (
                <View style={styles.dashList}>
                  {usesCallQueue ? <Text style={styles.dashSubheading}>Your callbacks today · swipe to finish</Text> : null}
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
                    <TouchableOpacity accessibilityRole="button"
                      style={[styles.swipeActionButton, styles.swipeActionContacted]}
                      onPress={() => completeCallback(cb.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="checkmark-done-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.swipeActionText}>Done</Text>
                    </TouchableOpacity>
                    <TouchableOpacity accessibilityRole="button"
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
                    <TouchableOpacity accessibilityRole="button"
                      style={styles.newLeadCard}
                      onPress={() => {
                        if (cb.lead_id || cb.meta_ad_id) {
                          openLeadFromSelection(
                            {
                              source: cb.meta_ad_id ? 'meta' : 'lead',
                              id: cb.meta_ad_id || cb.lead_id,
                            },
                            { hideDashboard: true }
                          );
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
              ) : null}
            </>
          )}

          <View style={styles.dashSectionHeader}>
            <Text style={[styles.dashSectionTitle, { color: colors.textPrimary }]}>Latest leads</Text>
            <TouchableOpacity accessibilityRole="button"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={openLeadListWorkspace}
            >
              <Text style={styles.dashSectionLink}>See all</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.dashCard}>
            {recentLeads.length === 0 ? (
              <Text style={[styles.dashEmptyText, { padding: 14 }]}>
                {countsPlaceholder ? 'Loading leads…' : 'No recent leads'}
              </Text>
            ) : (
              recentLeads.map((lead, index) => {
                const isMeta = lead._tableType === 'meta';
                const meta = lead as unknown as MetaLead;
                return (
                  <LatestLeadRow
                    key={`${lead._tableType}-${lead.id}`}
                    first={index === 0}
                    name={[lead.first_name, lead.last_name].filter(Boolean).join(' ') || '(No name)'}
                    status={lead.status || 'new'}
                    detail={`${leadSourceLine({ isMeta, platform: meta.platform, campaignName: meta.campaign_name })} · ${getTimeAgo(new Date(lead.created_at))}`}
                    hasPhone={Boolean(lead.phone)}
                    onOpen={() => openLeadFromSelection({ source: lead._tableType, id: lead.id }, { hideDashboard: true })}
                    onCall={() => openLeadFromSelection({ source: lead._tableType, id: lead.id }, { hideDashboard: true, action: 'call' })}
                    onText={() => openLeadFromSelection({ source: lead._tableType, id: lead.id }, { hideDashboard: true, action: 'text' })}
                  />
                );
              })
            )}
          </View>

          <View style={styles.dashActionRow}>
            <TouchableOpacity accessibilityRole="button"
              style={[styles.dashCard, styles.dashAction]}
              onPress={() => openAddLeadModal({ fromDashboard: true })}
              activeOpacity={0.8}
            >
              <Ionicons name="person-add-outline" size={18} color="#047857" />
              <Text style={styles.dashActionText}>Add lead</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button"
              style={[styles.dashCard, styles.dashAction]}
              onPress={() => {
                setQuickCaptureStartOnAdd(true);
                setShowQuickCaptures(true);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="camera-outline" size={18} color={brand.colors.accent} />
              <Text style={styles.dashActionText}>Quick capture</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dashSectionHeader}>
            <Text style={[styles.dashSectionTitle, { color: colors.textPrimary }]}>Pipeline</Text>
          </View>
          <View style={[styles.dashCard, { flexDirection: 'row' }]}>
            {snapshotCards
              .filter((card) => !heroFocusCards.some((hero) => hero.key === card.key))
              .map((card) => (
                <TouchableOpacity accessibilityRole="button"
                  key={card.key}
                  style={styles.dashStat}
                  onPress={card.onPress}
                >
                  <Text style={styles.dashStatValue}>{countsPlaceholder ?? card.value}</Text>
                  <Text style={styles.dashStatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {card.label.replace(' Leads', '')}
                  </Text>
                </TouchableOpacity>
              ))}
          </View>
        </Animated.ScrollView>
        <GioScreen
          visible={showGio}
          firstName={userFirstName === 'there' ? null : userFirstName}
          messages={gio.messages}
          thinking={gio.thinking}
          error={gio.error}
          onAsk={(question, mode) => void gio.ask(question, mode)}
          onClose={() => setShowGio(false)}
        />
      </View>
    );
  }

  const hasLeads = (leadDirectory.facets?.organic ?? 0) > 0 || leads.length > 0;
  const hasMetaLeads = (leadDirectory.facets?.meta ?? 0) > 0 || metaLeads.length > 0;
  const filteredWebsiteLeads = sortLeadsByLastTouchedDesc(
    leads.filter((lead) => matchesLeadListBase(lead, 'organic'))
  );
  const filteredMetaListLeads = sortLeadsByLastTouchedDesc(
    metaLeads.filter(matchesMetaLeadList)
  );
  const allVisibleLeads = sortLeadsByLastTouchedDesc([
    ...filteredMetaListLeads.map((lead) => ({ ...lead, _tableType: 'meta' as const })),
    ...filteredWebsiteLeads.map((lead) => ({ ...lead, _tableType: 'lead' as const })),
  ]);
  const totalVisibleLeadCount = leadDirectory.totalCount;
  const leadCountContext: LeadCountContext = {
    activeTab,
    selectedStatus: selectedStatusFilter,
    selectedSource: selectedSourceFilter,
    selectedOwnerLoId: selectedLOFilter,
    needsAttention: attentionFilter,
    unreadOnly: unreadFilter,
    trackedOnly: trackedFilter,
    totalCount: totalVisibleLeadCount,
    facets: leadDirectory.facets,
  };
  const showListControls = !initializing && roleReady && userRole !== 'buyer';
  const searchOpen = showLeadSearch || searchQuery.length > 0;
  const activeFilters: Array<{ key: string; label: string; clear: () => void }> = [];
  if (selectedStatusFilter !== 'all') {
    activeFilters.push({ key: 'status', label: formatStatus(selectedStatusFilter), clear: () => setSelectedStatusFilter('all') });
  }
  if (attentionFilter) {
    activeFilters.push({ key: 'attention', label: 'Needs attention', clear: () => setAttentionFilter(false) });
  }
  if (trackedFilter) {
    activeFilters.push({ key: 'tracked', label: 'Tracked', clear: () => setTrackedFilter(false) });
  }
  if (unreadFilter) {
    activeFilters.push({ key: 'unread', label: 'Unread', clear: () => setUnreadFilter(false) });
  }
  if (userRole === 'super_admin' && selectedLOFilter !== null) {
    activeFilters.push({
      key: 'lo',
      label: selectedLOFilter === 'unassigned'
        ? 'Unassigned'
        : loanOfficers.find((lo) => lo.id === selectedLOFilter)?.name || 'Loan officer',
      clear: () => setSelectedLOFilter(null),
    });
  }
  if (userRole === 'super_admin' && selectedSourceFilter !== 'all') {
    activeFilters.push({ key: 'source', label: selectedSourceFilter, clear: () => setSelectedSourceFilter('all') });
  }
  const allStatusesCount = getStatusOptionCount('all', leadCountContext);
  const allSourcesCount = getSourceOptionCount('all', leadCountContext);
  const renderLeadListFooter = () => {
    if (leadDirectory.loadingMore) {
      return <ActivityIndicator style={{ padding: 20 }} />;
    }
    if (leadDirectory.error && leadDirectory.items.length > 0) {
      return (
        <TouchableOpacity accessibilityRole="button"
          style={{ alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 14 }}
          onPress={() => void retryLeadDirectory()}
        >
          <Text style={{ color: brand.colors.accentStrong, fontWeight: '700' }}>
            Could not update leads. Retry
          </Text>
        </TouchableOpacity>
      );
    }
    return null;
  };
  const renderLeadListEmpty = () => leadDirectory.searching ? null : (
    <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingVertical: 48 }}>
      <Ionicons name="search-outline" size={36} color="#94A3B8" />
      <Text style={{ marginTop: 10, color: '#64748B', textAlign: 'center' }}>
        No leads match the current search and filters.
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.leadsTopBar, { backgroundColor: brand.colors.primary }]}>
        <StatusBar style="light" />
        <View style={styles.leadsTopRow}>
          <TouchableOpacity accessibilityRole="button"
            onPress={returnToLeadDashboard}
            accessibilityLabel="Back to dashboard"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.leadsTopTitle}>Leads</Text>
          {showListControls && (
            <>
              <TouchableOpacity accessibilityRole="button"
                accessibilityLabel={searchOpen ? 'Close search' : 'Search leads'}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                onPress={() => {
                  if (searchOpen) setSearchQuery('');
                  setShowLeadSearch(!searchOpen);
                }}
              >
                <Ionicons name={searchOpen ? 'close' : 'search-outline'} size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button"
                accessibilityLabel={activeFilters.length ? `Filters, ${activeFilters.length} on` : 'Filters'}
                accessibilityState={{ expanded: showLeadFilters }}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                onPress={() => setShowLeadFilters((current) => !current)}
              >
                <Ionicons name="options-outline" size={24} color={showLeadFilters ? '#93C5FD' : '#FFFFFF'} />
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity accessibilityRole="button"
            onPress={() => {
              setSelectedStatusFilter('all');
              setActiveTab('all');
              setUnreadFilter(true);
            }}
            accessibilityLabel={unreadConversationCount > 0 ? `Unread messages, ${unreadConversationCount}` : 'Unread messages'}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 10 }}
          >
            <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
            {unreadConversationCount > 0 && (
              <View style={styles.leadsBellBadge}>
                <Text style={styles.leadsBellBadgeText}>
                  {unreadConversationCount > 99 ? '99+' : unreadConversationCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {showListControls && searchOpen && (
          <View style={styles.leadsSearchField}>
            <Ionicons name="search-outline" size={17} color="#94A3B8" />
            <TextInput
              style={styles.leadsSearchInput}
              placeholder="Search leads (2+ characters)"
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={(text) => {
                // Keep the current tab if typing starts before the first page loads.
                hasAutoSelectedTabRef.current = true;
                setShowLeadSearch(true);
                setSearchQuery(text);
              }}
              autoFocus={searchQuery.length === 0}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              blurOnSubmit
            />
            {leadDirectory.searching && (
              <ActivityIndicator size="small" color="#93C5FD" accessibilityLabel="Searching leads" />
            )}
          </View>
        )}
        {showListControls && searchQuery.trim().length === 1 && (
          <Text style={styles.leadsSearchHint}>Enter at least 2 characters to search.</Text>
        )}

        {showListControls && (
          <View style={styles.leadsTabs}>
            {[
              { key: 'all' as const, label: 'All' },
              { key: 'leads' as const, label: 'My leads' },
              { key: 'meta' as const, label: 'Meta' },
            ].map((tab) => {
              const isActive = activeTab === tab.key;
              const count = getLeadTabCount(tab.key, leadCountContext) ?? otherTabCounts[tab.key];
              return (
                <TouchableOpacity accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  key={tab.key}
                  style={[styles.leadsTab, isActive && styles.leadsTabActive]}
                  onPress={() => handleSelectLeadListTab(tab.key)}
                >
                  <Text style={[styles.leadsTabText, isActive && styles.leadsTabTextActive]}>
                    {tab.label} {count ?? '…'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {showListControls && (
        <>
          {showLeadFilters ? (
            <View style={styles.listUtilityPanel}>
            <View style={styles.listPrimaryFilterRow}>
              <TouchableOpacity accessibilityRole="button"
                style={[styles.filterButton, styles.listStatusButton]}
                onPress={() => setShowStatusPicker(true)}
              >
                <Text style={styles.filterButtonLabel}>Status</Text>
                <Text style={styles.filterButtonValue}>
                  {selectedStatusFilter === 'all'
                    ? `All (${totalVisibleLeadCount})`
                    : `${formatStatus(selectedStatusFilter)} (${totalVisibleLeadCount})`
                  }
                </Text>
                <Text style={styles.filterButtonIcon}>▼</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.listQuickFilterRow}>
              <TouchableOpacity accessibilityRole="button"
                style={[styles.quickFilterChip, attentionFilter && styles.quickFilterChipActive]}
                onPress={() => setAttentionFilter((current) => !current)}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={14}
                  color={attentionFilter ? '#FFFFFF' : brand.colors.accent}
                />
                <Text style={[styles.quickFilterChipText, attentionFilter && styles.quickFilterChipTextActive]}>
                  Needs Attention
                </Text>
              </TouchableOpacity>

              <TouchableOpacity accessibilityRole="button"
                style={[styles.quickFilterChip, trackedFilter && styles.quickFilterChipActive]}
                onPress={() => setTrackedFilter((current) => !current)}
              >
                <Ionicons
                  name="bookmark-outline"
                  size={14}
                  color={trackedFilter ? '#FFFFFF' : brand.colors.accent}
                />
                <Text style={[styles.quickFilterChipText, trackedFilter && styles.quickFilterChipTextActive]}>
                  Tracked
                </Text>
              </TouchableOpacity>

              <TouchableOpacity accessibilityRole="button"
                style={[styles.quickFilterChip, unreadFilter && styles.quickFilterChipActive]}
                onPress={() => {
                  const nextUnreadFilter = !unreadFilter;
                  setUnreadFilter(nextUnreadFilter);
                  if (nextUnreadFilter) {
                    handleSelectLeadListTab('all');
                  }
                }}
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={14}
                  color={unreadFilter ? '#FFFFFF' : brand.colors.accent}
                />
                <Text style={[styles.quickFilterChipText, unreadFilter && styles.quickFilterChipTextActive]}>
                  Unread
                </Text>
              </TouchableOpacity>
            </View>

            {userRole === 'super_admin' && (
              <View style={styles.listSecondaryFilterRow}>
                <TouchableOpacity accessibilityRole="button"
                  style={[styles.filterButton, styles.filterButtonHalf, styles.listSecondaryFilterButton]}
                  onPress={() => setShowLOPicker(true)}
                >
                  <Text style={styles.filterButtonLabel}>LO</Text>
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

                <TouchableOpacity accessibilityRole="button"
                  style={[styles.filterButton, styles.filterButtonHalf, styles.listSecondaryFilterButton]}
                  onPress={() => setShowSourcePicker(true)}
                >
                  <Text style={styles.filterButtonLabel}>Source</Text>
                  <Text style={styles.filterButtonValue} numberOfLines={1}>
                    {selectedSourceFilter === 'all'
                      ? 'All Sources'
                      : selectedSourceFilter.length > 15
                      ? `${selectedSourceFilter.substring(0, 12)}...`
                      : selectedSourceFilter
                    }
                  </Text>
                  <Text style={styles.filterButtonIcon}>▼</Text>
                </TouchableOpacity>
              </View>
            )}
            </View>
          ) : activeFilters.length > 0 ? (
            <View style={styles.leadsFilterChips}>
              {activeFilters.map((filter) => (
                <TouchableOpacity accessibilityRole="button"
                  key={filter.key}
                  accessibilityLabel={`Remove filter ${filter.label}`}
                  style={styles.leadsFilterChip}
                  onPress={() => {
                    triggerListAnimation();
                    filter.clear();
                  }}
                >
                  <Text style={styles.leadsFilterChipText} numberOfLines={1}>{filter.label}</Text>
                  <Ionicons name="close" size={14} color="#1D4ED8" />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {/* No Unread Messages State */}
          {unreadFilter && unreadConversationCount === 0 && (
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
              <TouchableOpacity accessibilityRole="button" 
                onPress={() => setUnreadFilter(false)}
                style={{
                  marginTop: 20,
                  backgroundColor: brand.colors.accentStrong,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 20,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>View All Leads</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Status Picker Modal */}
          <Modal
            visible={showStatusPicker}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowStatusPicker(false)}
          >
            <TouchableOpacity accessibilityRole="button" 
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setShowStatusPicker(false)}
            >
              <View style={styles.statusPickerContainer}>
                <View style={styles.statusPickerHeader}>
                  <Text style={styles.statusPickerTitle}>Filter by Status</Text>
                  <TouchableOpacity accessibilityRole="button" onPress={() => setShowStatusPicker(false)}>
                    <Text style={styles.statusPickerClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.statusPickerScroll}>
                  <TouchableOpacity accessibilityRole="button"
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
                      {allStatusesCount !== null && (
                        <Text style={[
                          styles.statusPickerItemCount,
                          selectedStatusFilter === 'all' && styles.statusPickerItemCountActive,
                        ]}>({allStatusesCount})</Text>
                      )}
                    </View>
                    {selectedStatusFilter === 'all' && (
                      <Text style={styles.statusPickerCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                  {STATUSES.map((status) => {
                    const count = getStatusOptionCount(
                      status,
                      leadCountContext
                    );
                    return (
                      <TouchableOpacity accessibilityRole="button"
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
                          {count !== null && (
                            <Text style={[
                              styles.statusPickerItemCount,
                              selectedStatusFilter === status && styles.statusPickerItemCountActive,
                            ]}>({count})</Text>
                          )}
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
              <TouchableOpacity accessibilityRole="button" 
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={() => setShowLOPicker(false)}
              >
                <View style={styles.statusPickerContainer}>
                  <Text style={styles.statusPickerTitle}>Filter by Loan Officer</Text>
                  <ScrollView style={styles.statusPickerScroll}>
                    {/* All LOs Option */}
                    <TouchableOpacity accessibilityRole="button"
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
                        {leadDirectory.facets && (
                          <Text style={[
                            styles.statusPickerItemCount,
                            selectedLOFilter === null && styles.statusPickerItemCountActive,
                          ]}>({leadDirectory.facets.ownerTotal})</Text>
                        )}
                      </View>
                      {selectedLOFilter === null && (
                        <Text style={styles.statusPickerCheck}>✓</Text>
                      )}
                    </TouchableOpacity>

                    {/* Unassigned Option */}
                    <TouchableOpacity accessibilityRole="button"
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
                        {leadDirectory.facets && (
                          <Text style={[
                            styles.statusPickerItemCount,
                            selectedLOFilter === 'unassigned' && styles.statusPickerItemCountActive,
                          ]}>({leadDirectory.facets.unassignedOwner})</Text>
                        )}
                      </View>
                      {selectedLOFilter === 'unassigned' && (
                        <Text style={styles.statusPickerCheck}>✓</Text>
                      )}
                    </TouchableOpacity>

                    {/* Individual LOs */}
                    {loanOfficers.map((lo) => {
                      const count = leadDirectory.facets
                        ? leadDirectory.facets.loanOfficers[lo.id] ?? 0
                        : null;

                      return (
                        <TouchableOpacity accessibilityRole="button"
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
                            {count !== null && (
                              <Text style={[
                                styles.statusPickerItemCount,
                                selectedLOFilter === lo.id && styles.statusPickerItemCountActive,
                              ]}>({count})</Text>
                            )}
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
              <TouchableOpacity accessibilityRole="button" 
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={() => setShowSourcePicker(false)}
              >
                <View style={styles.statusPickerContainer}>
                  <Text style={styles.statusPickerTitle}>Filter by Source</Text>
                  <ScrollView style={styles.statusPickerScroll}>
                    {/* All Sources Option */}
                    <TouchableOpacity accessibilityRole="button"
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
                        {allSourcesCount !== null && (
                          <Text style={[
                            styles.statusPickerItemCount,
                            selectedSourceFilter === 'all' && styles.statusPickerItemCountActive,
                          ]}>({allSourcesCount})</Text>
                        )}
                      </View>
                      {selectedSourceFilter === 'all' && (
                        <Text style={styles.statusPickerCheck}>✓</Text>
                      )}
                    </TouchableOpacity>

                    {/* Individual Sources */}
                    {uniqueSources.map((source) => {
                      const loadedMetaCount = metaLeads.filter(
                        (lead) =>
                          getCrmLeadSourceKey(lead, 'meta') === source
                      ).length;
                      const loadedOrganicCount = leads.filter(
                        (lead) =>
                          getCrmLeadSourceKey(lead, 'organic') === source
                      ).length;
                      const metaFacetCount =
                        leadDirectory.facets?.metaSourceKeys[source]
                        ?? leadDirectory.facets?.ads[source];
                      const organicFacetCount =
                        leadDirectory.facets?.organicSourceKeys[source]
                        ?? leadDirectory.facets?.sourceDetails[source];
                      const count = getSourceOptionCount(
                        source,
                        leadCountContext
                      );
                      
                      return (
                        <TouchableOpacity accessibilityRole="button"
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
                            const hasMeta =
                              (metaFacetCount ?? 0) > 0 || loadedMetaCount > 0;
                            const hasOrganic =
                              (organicFacetCount ?? 0) > 0
                              || loadedOrganicCount > 0;

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
                            {count !== null && (
                              <Text style={[
                                styles.statusPickerItemCount,
                                selectedSourceFilter === source && styles.statusPickerItemCountActive,
                              ]}>({count})</Text>
                            )}
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

      {loading && (
        <View style={styles.centerContent}>
          <ActivityIndicator />
          <Text style={styles.subtitle}>Loading leads…</Text>
        </View>
      )}

      {!loading && errorMessage && leadDirectory.items.length === 0 && (
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Error: {errorMessage}</Text>
          <TouchableOpacity accessibilityRole="button"
            style={{ marginTop: 14, borderRadius: 10, backgroundColor: brand.colors.accentStrong, paddingHorizontal: 18, paddingVertical: 10 }}
            onPress={() => {
              if (initialError) {
                setInitializationAttempt((attempt) => attempt + 1);
              } else {
                void retryLeadDirectory();
              }
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Lead Content - FlatLists for each tab */}
      {!loading
        && (leadDirectory.items.length > 0 || !errorMessage)
        && roleReady
        && userRole !== 'buyer'
        && activeTab === 'leads' && (
        <Animated.View style={animatedListStyle}>
          <Animated.FlatList
            data={filteredWebsiteLeads}
            renderItem={({ item, index }) => renderLeadRow(item, 'lead', filteredWebsiteLeads[index - 1])}
            keyExtractor={(item) => item.id}
            extraData={attentionMap}
            ListEmptyComponent={renderLeadListEmpty}
            contentContainerStyle={styles.leadListContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onEndReached={() => void loadMoreDirectoryLeads()}
            onEndReachedThreshold={0.4}
            ListFooterComponent={renderLeadListFooter}
          />
        </Animated.View>
      )}

      {!loading
        && (leadDirectory.items.length > 0 || !errorMessage)
        && roleReady
        && userRole !== 'buyer'
        && activeTab === 'meta' && (
        <Animated.View style={animatedListStyle}>
          <Animated.FlatList
            data={filteredMetaListLeads}
            renderItem={({ item, index }) => renderLeadRow(item, 'meta', filteredMetaListLeads[index - 1])}
            keyExtractor={(item) => item.id}
            extraData={attentionMap}
            ListEmptyComponent={renderLeadListEmpty}
            contentContainerStyle={styles.leadListContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onEndReached={() => void loadMoreDirectoryLeads()}
            onEndReachedThreshold={0.4}
            ListFooterComponent={renderLeadListFooter}
          />
        </Animated.View>
      )}

      {!loading
        && (leadDirectory.items.length > 0 || !errorMessage)
        && roleReady
        && userRole !== 'buyer'
        && activeTab === 'all' && (
        <Animated.View style={animatedListStyle}>
          <Animated.FlatList
            data={allVisibleLeads}
            renderItem={({ item, index }) =>
              renderLeadRow(item, item._tableType, allVisibleLeads[index - 1])
            }
            keyExtractor={(item) => `${item._tableType}-${item.id}`}
            extraData={attentionMap}
            ListEmptyComponent={renderLeadListEmpty}
            contentContainerStyle={styles.leadListContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onEndReached={() => void loadMoreDirectoryLeads()}
            onEndReachedThreshold={0.4}
            ListFooterComponent={renderLeadListFooter}
          />
        </Animated.View>
      )}

      {/* FAB - Quick Actions (for LOs and Super Admins) */}
      {(userRole === 'loan_officer' || userRole === 'super_admin') && !showDashboard && (
        <TouchableOpacity accessibilityRole="button"
          style={styles.fab}
          onPress={() => setShowFabActionSheet(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* FAB ActionSheet Modal */}
      <Modal
        visible={showFabActionSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFabActionSheet(false)}
      >
        <TouchableOpacity accessibilityRole="button"
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setShowFabActionSheet(false)}
        >
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 16, paddingTop: 12 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 16 }} />
            <TouchableOpacity accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14 }}
              onPress={() => {
                setShowFabActionSheet(false);
                setQuickCaptureStartOnAdd(true);
                setShowQuickCaptures(true);
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: brand.colors.tint, justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="camera-outline" size={20} color={brand.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>Quick Capture</Text>
                <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Photo + name for fast lead capture</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14 }}
              onPress={() => {
                setShowFabActionSheet(false);
                openAddLeadModal();
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="person-add-outline" size={20} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>Add My Lead</Text>
                <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Full lead with all details</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Lead Modal */}
      <Modal
        visible={showAddLeadModal}
        transparent={true}
        animationType="slide"
        onRequestClose={closeAddLeadModal}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.addLeadModalOverlay}
        >
          <TouchableOpacity accessibilityRole="button" 
            style={{ flex: 1 }} 
            activeOpacity={1} 
            onPress={closeAddLeadModal}
          />
          <View style={styles.addLeadModalContainer}>
            {/* Header */}
            <View style={styles.addLeadModalHeader}>
              <Text style={styles.addLeadModalTitle}>➕ Add My Lead</Text>
              <TouchableOpacity accessibilityRole="button" 
                style={styles.addLeadCloseButton}
                onPress={closeAddLeadModal}
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
                <TouchableOpacity accessibilityRole="button"
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
                      <TouchableOpacity accessibilityRole="button"
                        key={purpose}
                        style={{
                          padding: 12,
                          borderBottomWidth: purpose !== LOAN_PURPOSES[LOAN_PURPOSES.length - 1] ? 1 : 0,
                          borderBottomColor: '#E5E7EB',
                          backgroundColor: newLead.loan_purpose === purpose ? brand.colors.tint : 'transparent',
                        }}
                        onPress={() => {
                          setNewLead(prev => ({ ...prev, loan_purpose: purpose }));
                          setShowLoanPurposePicker(false);
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ 
                            fontSize: 15, 
                            color: newLead.loan_purpose === purpose ? brand.colors.accentStrong : '#374151',
                            fontWeight: newLead.loan_purpose === purpose ? '600' : '400',
                          }}>{purpose}</Text>
                          {newLead.loan_purpose === purpose && (
                            <Ionicons name="checkmark" size={18} color={brand.colors.accent} />
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
              <TouchableOpacity accessibilityRole="button"
                style={styles.addLeadCancelButton}
                onPress={closeAddLeadModal}
              >
                <Text style={styles.addLeadCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button"
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
          <TouchableOpacity accessibilityRole="button" 
            style={StyleSheet.absoluteFill} 
            activeOpacity={1} 
            onPress={() => setShowAiRecommendationModal(false)} 
          />
          <View style={aiRecommendationStyles.container}>
            <View style={aiRecommendationStyles.header}>
              <Text style={aiRecommendationStyles.title}>Why this needs attention</Text>
              <TouchableOpacity accessibilityRole="button"
                onPress={() => setShowAiRecommendationModal(false)}
                style={aiRecommendationStyles.closeIcon}
              >
                <Ionicons name="close" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            
            <Text style={aiRecommendationStyles.reason}>
              {readableStatuses(selectedAiAttention?.reason || 'No additional details available.')}
            </Text>
            
            {selectedAiAttention?.suggestedAction && (
              <View style={aiRecommendationStyles.suggestionContainer}>
                <Text style={aiRecommendationStyles.suggestionIcon}>💡</Text>
                <View style={{ flex: 1 }}>
                  <Text style={aiRecommendationStyles.suggestionText}>
                    {selectedAiAttention.suggestedAction}
                  </Text>
                  {isTextSuggestion(selectedAiAttention.suggestedAction) && selectedAiAttention.phone && (
                    <Text style={aiRecommendationStyles.tapHint}>
                      👆 Tap button below to send
                    </Text>
                  )}
                </View>
              </View>
            )}
            
            {isTextSuggestion(selectedAiAttention?.suggestedAction) && selectedAiAttention?.phone ? (
              <TouchableOpacity accessibilityRole="button"
                style={aiRecommendationStyles.sendTextButton}
                onPress={handleAiSuggestedTextFromModal}
              >
                <Ionicons name="chatbubble-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={aiRecommendationStyles.closeButtonText}>Send This Text</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity accessibilityRole="button"
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
    backgroundColor: '#2563EB',
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
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [notificationLead, setNotificationLead] = useState<{ id: string; source: 'lead' | 'meta'; openTab?: 'messages' | 'dm' } | null>(null);
  const { isLocked } = useAppLock();
  const lastHandledNotificationIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  // Single entry point for session changes. When the signed-in user changes or
  // ends, everything scoped to the previous account is dropped.
  const adoptSession = useCallback((nextSession: Session | null) => {
    const previousUserId = currentUserIdRef.current;
    const nextUserId = nextSession?.user?.id ?? null;
    if (previousUserId !== nextUserId) {
      clearRoleCaches();
      if (previousUserId !== null) {
        setNotificationLead(null);
        lastHandledNotificationIdRef.current = null;
      }
      currentUserIdRef.current = nextUserId;
    }
    setSession(nextSession);
  }, []);

  // Restore the session on launch and follow auth changes.
  useEffect(() => {
    let cancelled = false;
    setCheckingSession(true);
    setSessionCheckFailed(false);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (cancelled) return;
      adoptSession(newSession);
      // Token refreshes and the initial event must not re-register the device.
      if (event === 'SIGNED_IN' && newSession?.user?.id) {
        registerForPushNotifications(newSession.user.id);
      }
    });

    (async () => {
      try {
        const {
          data: { session: existingSession },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        adoptSession(existingSession);
        if (existingSession?.user?.id) {
          registerForPushNotifications(existingSession.user.id);
        }
      } catch {
        if (!cancelled) setSessionCheckFailed(true);
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [adoptSession, sessionAttempt]);

  const handleSignOut = useCallback(async () => {
    const userId = session?.user?.id;
    const { failedSteps } = await runSignOut({
      deactivatePushToken: async () => {
        if (userId) await deactivateThisDevicePush(userId);
      },
      cancelScheduledNotifications: cancelAllScheduledReminders,
      signOut: () => supabase.auth.signOut(),
      clearAccountCaches: clearRoleCaches,
    });
    if (failedSteps.length > 0) {
      console.warn('Sign-out cleanup incomplete:', failedSteps.join(', '));
    }
    adoptSession(null);
  }, [session?.user?.id, adoptSession]);

  // Listen for notification taps, including the initial launch from a push.
  useEffect(() => {
    const handleNotificationResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;

      const requestId = response.notification.request.identifier;
      if (requestId && lastHandledNotificationIdRef.current === requestId) {
        return;
      }

      const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
      const leadId = data.lead_id;
      const leadSource = normalizeNotificationLeadSource(data.lead_source);
      const openTab = resolveNotificationOpenTab(data, response.notification.request.content.title);

      if (
        leadId &&
        typeof leadId === 'string' &&
        leadSource
      ) {
        if (requestId) {
          lastHandledNotificationIdRef.current = requestId;
        }

        setNotificationLead({
          id: leadId,
          source: leadSource,
          ...(openTab ? { openTab } : {}),
        });
      }
    };

    Notifications.getLastNotificationResponseAsync()
      .then(handleNotificationResponse)
      .catch((error) => {
        console.error('📱 Failed to read last notification response:', error);
      });

    const subscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        handleNotificationResponse(response);
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

  if (sessionCheckFailed) {
    return (
      <View style={styles.centerContent}>
        <Text style={styles.subtitle}>
          We couldn't check your session. Check your connection and try again.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          style={{ marginTop: 14, borderRadius: 10, backgroundColor: '#0F172A', paddingHorizontal: 18, paddingVertical: 12 }}
          onPress={() => setSessionAttempt((attempt) => attempt + 1)}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // No Supabase session → show login
  if (!session) {
    return <AuthScreen onAuth={(sess) => adoptSession(sess)} />;
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

  // Have session and app is unlocked → show main app with bottom tabs
  return (
    <>
      <MfaGate session={session} onSignOut={handleSignOut}>
        <AuthenticatedRoot
          session={session}
          onSignOut={handleSignOut}
          notificationLead={notificationLead}
          onNotificationHandled={() => setNotificationLead(null)}
          LeadsScreenComponent={LeadsScreen}
        />
      </MfaGate>
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

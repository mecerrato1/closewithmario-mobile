import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
  Image,
  RefreshControl,
  Modal,
  LayoutAnimation,
  UIManager,
  Animated,
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
import { AppLockProvider, useAppLock } from './src/contexts/AppLockContext';
import LockScreen from './src/screens/LockScreen';
import { styles } from './src/styles/appStyles';
import { useThemeColors } from './src/styles/theme';

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
  notificationLead?: { id: string; source: 'lead' | 'meta' } | null;
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
  const [hasManuallySelectedTab, setHasManuallySelectedTab] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [loanOfficers, setLoanOfficers] = useState<Array<{ id: string; name: string }>>([]);
  const [userRole, setUserRole] = useState<UserRole>('buyer');
  const [searchQuery, setSearchQuery] = useState('');
  const [showTeamManagement, setShowTeamManagement] = useState(false);
  const [teamMemberId, setTeamMemberId] = useState<string | null>(null);
  const [selectedLOFilter, setSelectedLOFilter] = useState<string | null>(null); // null = all LOs
  const [showLOPicker, setShowLOPicker] = useState(false);
  const [leadEligible, setLeadEligible] = useState<boolean>(true);

  // Micro animations for the lead list
  const listOpacity = useRef(new Animated.Value(1)).current;
  const listScale = useRef(new Animated.Value(1)).current;

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

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
            'id, created_at, first_name, last_name, email, phone, status, last_contact_date, loan_purpose, price, down_payment, credit_score, message, lo_id, realtor_id'
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
            }
          } else if (role === 'realtor') {
            const teamMemberId = await getUserTeamMemberId(session.user.id, 'realtor');
            if (teamMemberId) {
              leadsQuery = leadsQuery.eq('realtor_id', teamMemberId);
              metaQuery = metaQuery.eq('realtor_id', teamMemberId);
            }
          }
          // Buyers see no leads (could show their own submitted leads in future)
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

        setDebugInfo(
          `leads rows: ${safeLeads.length} · meta_ads rows: ${safeMeta.length}`
        );

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
        console.log('📡 Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to loan officer changes');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to loan officer changes');
        }
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

  // Handle notification tap to navigate to lead
  useEffect(() => {
    if (notificationLead && !loading) {
      // Navigate directly to the lead using the source from notification
      setSelectedLead({ source: notificationLead.source, id: notificationLead.id });
      setShowDashboard(false);
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
        .select('id, created_at, first_name, last_name, email, phone, status, last_contact_date, loan_purpose, price, down_payment, credit_score, message, lo_id, realtor_id')
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

      setLeads((leadsData || []) as Lead[]);
      setMetaLeads((metaData || []) as MetaLead[]);
      setDebugInfo(`leads rows: ${(leadsData || []).length} · meta_ads rows: ${(metaData || []).length}`);
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

  const renderLeadItem = ({ item }: { item: Lead }) => {
    const fullName =
      [item.first_name, item.last_name].filter(Boolean).join(' ') ||
      '(No name)';
    const status = item.status || 'new';
    const statusDisplay = formatStatus(status);
    const statusColors = STATUS_COLOR_MAP[status] || STATUS_COLOR_MAP['new'];
    const emailOrPhone = item.email || item.phone || 'No contact info';
    const alert = getLeadAlert(item);
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
          onPress={() =>
            setSelectedLead({ source: 'lead', id: item.id })
          }
          activeOpacity={0.7}
        >
          <View style={styles.leadHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
              <Text style={[styles.leadName, { color: colors.textPrimary }]} numberOfLines={1}>
                {fullName}
              </Text>
              {isUnread && <View style={styles.unreadDot} />}
            </View>
            <View style={styles.leadSourceBadge}>
              <Ionicons
                name="globe-outline"
                size={12}
                color="#0F172A"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.leadSourceText}>Web</Text>
            </View>
          </View>
          {alert && (
            <View style={[styles.attentionBadge, { backgroundColor: alert.color }]}>
              <Ionicons
                name="warning-outline"
                size={12}
                color="#FFF"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.attentionBadgeText}>{alert.label}</Text>
            </View>
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
    const alert = getLeadAlert(item);
    const borderColor = alert ? alert.color : '#7C3AED';
    const statusColors =
      STATUS_COLOR_MAP[item.status || 'new'] || STATUS_COLOR_MAP['new'];
    const isUnread = !item.last_contact_date && (item.status === 'new' || !item.status);

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
          onPress={() =>
            setSelectedLead({ source: 'meta', id: item.id })
          }
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
            <View style={[styles.attentionBadge, { backgroundColor: alert.color }]}>
              <Ionicons
                name="warning-outline"
                size={12}
                color="#FFF"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.attentionBadgeText}>{alert.label}</Text>
            </View>
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

  if (selectedLead) {
    return (
      <LeadDetailView
        selected={selectedLead}
        leads={leads}
        metaLeads={metaLeads}
        onBack={() => setSelectedLead(null)}
        onNavigate={(leadRef) => setSelectedLead(leadRef)}
        onStatusChange={handleStatusChange}
        session={session}
        loanOfficers={loanOfficers}
        userRole={userRole}
        selectedStatusFilter={selectedStatusFilter}
        searchQuery={searchQuery}
        selectedLOFilter={selectedLOFilter}
        activeTab={activeTab}
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
    
    // Get recent leads (last 5) - exclude unqualified
    const allLeads = [...activeFilteredMetaLeads.map(l => ({ ...l, source: 'meta' as const })), ...activeFilteredLeads.map(l => ({ ...l, source: 'lead' as const }))];
    const recentLeads = allLeads
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    // Get user's first name for greeting
    const userFirstName = session?.user?.user_metadata?.full_name?.split(' ')[0] || 
                          session?.user?.user_metadata?.name?.split(' ')[0] || 
                          'there';

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Purple Gradient Header */}
        <View style={[styles.newDashboardHeader, { backgroundColor: colors.headerBackground }]}>
          {/* User Info Row */}
          <View style={styles.newHeaderTop}>
            <View style={styles.newUserInfo}>
              {session?.user?.user_metadata?.avatar_url ? (
                <Image 
                  source={{ uri: session.user.user_metadata.avatar_url }}
                  style={styles.newAvatar}
                />
              ) : (
                <View style={styles.newAvatarPlaceholder}>
                  <Text style={styles.newAvatarText}>
                    {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                  </Text>
                </View>
              )}
              <View style={styles.newUserDetails}>
                <Text style={styles.newUserTitle}>Dashboard</Text>
                <Text style={styles.newUserEmail} numberOfLines={1}>
                  {session?.user?.email || ''}
                </Text>
              </View>
            </View>
            <View style={styles.headerButtons}>
              {userRole === 'super_admin' && (
                <TouchableOpacity 
                  onPress={() => setShowTeamManagement(true)} 
                  style={styles.newHeaderButton}
                >
                  <Text style={styles.newHeaderButtonText}>👥</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onSignOut} style={styles.newSignOutButton}>
                <Text style={styles.newSignOutText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Greeting */}
          <Text style={styles.newGreeting}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {userFirstName}!</Text>
          <Text style={styles.newSubGreeting}>Here's your lead overview</Text>

          {/* Stats Grid in Header */}
          <View style={styles.newHeaderStatsGrid}>
            <View style={styles.newHeaderStatsRow}>
              <TouchableOpacity 
                style={styles.newHeaderStatCard}
                onPress={() => {
                  triggerListAnimation();
                  setActiveTab('meta');
                  setSelectedStatusFilter('all');
                  setShowDashboard(false);
                }}
              >
                <Text style={styles.newHeaderStatNumber}>{metaLeadsCount}</Text>
                <Text style={styles.newHeaderStatLabel}>Meta Ads</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.newHeaderStatCard}
                onPress={() => {
                  triggerListAnimation();
                  setActiveTab('leads');
                  setSelectedStatusFilter('all');
                  setShowDashboard(false);
                }}
              >
                <Text style={styles.newHeaderStatNumber}>{organicLeadsCount}</Text>
                <Text style={styles.newHeaderStatLabel}>Organic</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity 
              style={styles.newHeaderStatCardLarge}
              onPress={() => {
                triggerListAnimation();
                setActiveTab('all');
                setSelectedStatusFilter('all');
                setShowDashboard(false);
              }}
            >
              <Text style={styles.newHeaderStatNumberLarge}>{totalLeads}</Text>
              <Text style={styles.newHeaderStatLabelLarge}>Total Leads</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView 
          contentContainerStyle={styles.newDashboardContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* View All Leads Button */}
          <TouchableOpacity
            style={styles.newViewAllButton}
            onPress={() => {
              triggerListAnimation();
              setActiveTab('all');
              setSelectedStatusFilter('all');
              setShowDashboard(false);
            }}
          >
            <Text style={styles.newViewAllText}>📊 View All Leads</Text>
          </TouchableOpacity>

          {/* Performance Section */}
          <View style={[styles.performanceSection, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>📈 Performance</Text>
            </View>
            <View style={styles.performanceGrid}>
              <TouchableOpacity 
                style={[styles.performanceCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                onPress={() => {
                  setActiveTab('all');
                  setSelectedStatusFilter('new');
                  setShowDashboard(false);
                }}
              >
                <Text style={[styles.perfNumber, { color: colors.textPrimary }]}>{newLeads}</Text>
                <Text style={[styles.perfLabel, { color: colors.textSecondary }]}>New Leads</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.performanceCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                onPress={() => {
                  setActiveTab('all');
                  setSelectedStatusFilter('qualified');
                  setShowDashboard(false);
                }}
              >
                <Text style={[styles.perfNumber, { color: colors.textPrimary }]}>{qualifiedLeads}</Text>
                <Text style={[styles.perfLabel, { color: colors.textSecondary }]}>Qualified</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.performanceCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                onPress={() => {
                  setActiveTab('all');
                  setSelectedStatusFilter('closed');
                  setShowDashboard(false);
                }}
              >
                <Text style={[styles.perfNumber, { color: colors.textPrimary }]}>{closedLeads}</Text>
                <Text style={[styles.perfLabel, { color: colors.textSecondary }]}>Closed</Text>
              </TouchableOpacity>
              <View style={[styles.performanceCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                <Text style={[styles.perfNumber, { color: colors.textPrimary }]}>
                  {totalLeads > 0 ? Math.round((closedLeads / totalLeads) * 100) : 0}%
                </Text>
                <Text style={[styles.perfLabel, { color: colors.textSecondary }]}>Conversion</Text>
              </View>
              <TouchableOpacity 
                style={[styles.performanceCard, styles.performanceCardUnqualified]}
                onPress={() => {
                  setActiveTab('all');
                  setSelectedStatusFilter('unqualified');
                  setShowDashboard(false);
                }}
              >
                <Text style={[styles.perfNumber, styles.perfNumberUnqualified]}>{unqualifiedLeads}</Text>
                <Text style={[styles.perfLabel, styles.perfLabelUnqualified]}>Unqualified</Text>
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
                const source = lead.source === 'meta' 
                  ? `Facebook${(lead as MetaLead).campaign_name ? ' • ' + (lead as MetaLead).campaign_name : ''}`
                  : 'Website Contact';
                
                return (
                  <TouchableOpacity
                    key={`${lead.source}-${lead.id}`}
                    style={[
                      styles.newLeadCard,
                      { backgroundColor: colors.cardBackground, borderColor: colors.border },
                      isNew && styles.newLeadCardNew,
                      isQualified && styles.newLeadCardQualified
                    ]}
                    onPress={() => {
                      setShowDashboard(false);
                      setSelectedLead({ source: lead.source, id: lead.id });
                    }}
                  >
                    <View style={styles.newLeadHeader}>
                      <View style={styles.newLeadLeft}>
                        <Text style={[styles.newLeadName, { color: colors.textPrimary }]}>{fullName}</Text>
                        <Text style={[styles.newLeadSource, { color: colors.textSecondary }]} numberOfLines={1}>{source}</Text>
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
        </ScrollView>
      </View>
    );
  }

  const hasLeads = leads.length > 0;
  const hasMetaLeads = metaLeads.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Modern Purple Header with Stats and Search */}
      <View style={[styles.leadsHeaderContainer, { backgroundColor: colors.headerBackground }]}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => setShowDashboard(true)} style={styles.homeButton}>
            <Text style={styles.homeButtonText}>← Home</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Close With Mario</Text>
            <Text style={styles.headerSubtitle}>Lead Management</Text>
          </View>
          <TouchableOpacity onPress={onSignOut} style={styles.signOutButton}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row inside Purple Header */}
        <View style={styles.statsRow}>
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
              ? metaLeads.filter(l => matchesLOFilter(l) && l.status !== 'unqualified').length 
              : metaLeads.filter(l => l.status === selectedStatusFilter && matchesLOFilter(l)).length
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
              ? leads.filter(l => matchesLOFilter(l) && l.status !== 'unqualified').length 
              : leads.filter(l => l.status === selectedStatusFilter && matchesLOFilter(l)).length
            }
          </Text>
          <Text style={[
            styles.statLabel,
            activeTab === 'leads' && styles.statLabelActive,
          ]}>Organic</Text>
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
              ? metaLeads.filter(l => matchesLOFilter(l) && l.status !== 'unqualified').length + leads.filter(l => matchesLOFilter(l) && l.status !== 'unqualified').length 
              : [...metaLeads, ...leads].filter(l => l.status === selectedStatusFilter && matchesLOFilter(l)).length
            }
          </Text>
          <Text style={[
            styles.statLabel,
            activeTab === 'all' && styles.statLabelActive,
          ]}>Total</Text>
        </TouchableOpacity>
      </View>

        {/* Search Bar inside Purple Header */}
        <View style={styles.leadsSearchContainer}>
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
        </View>
      </View>

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
          {/* Filter Buttons Row */}
          <View style={styles.filterButtonContainer}>
            {/* Status Filter */}
            <TouchableOpacity
              style={[styles.filterButton, userRole === 'super_admin' && styles.filterButtonHalf]}
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
                      </View>
                      {selectedLOFilter === 'unassigned' && (
                        <Text style={styles.statusPickerCheck}>✓</Text>
                      )}
                    </TouchableOpacity>

                    {/* Individual LOs */}
                    {loanOfficers.map((lo) => (
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
                        </View>
                        {selectedLOFilter === lo.id && (
                          <Text style={styles.statusPickerCheck}>✓</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </TouchableOpacity>
            </Modal>
          )}

          {/* Lead Content */}
          {activeTab === 'leads' && hasLeads && (
            <Animated.View style={animatedListStyle}>
              <FlatList
                data={leads.filter(lead => 
                  (selectedStatusFilter === 'all' ? lead.status !== 'unqualified' : lead.status === selectedStatusFilter) &&
                  matchesSearch(lead) &&
                  matchesLOFilter(lead)
                )}
                keyExtractor={(item) => item.id}
                renderItem={renderLeadItem}
                contentContainerStyle={styles.listContent}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                showsVerticalScrollIndicator={false}
              />
            </Animated.View>
          )}

          {activeTab === 'meta' && hasMetaLeads && (
            <Animated.View style={animatedListStyle}>
              <FlatList
                data={metaLeads.filter(lead => 
                  (selectedStatusFilter === 'all' ? lead.status !== 'unqualified' : lead.status === selectedStatusFilter) &&
                  matchesSearch(lead) &&
                  matchesLOFilter(lead)
                )}
                keyExtractor={(item) => item.id}
                renderItem={renderMetaLeadItem}
                contentContainerStyle={styles.listContent}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                showsVerticalScrollIndicator={false}
              />
            </Animated.View>
          )}

          {activeTab === 'all' && (hasLeads || hasMetaLeads) && (
            <Animated.View style={animatedListStyle}>
              <FlatList
                data={[
                  ...metaLeads.filter(lead => 
                    (selectedStatusFilter === 'all' ? lead.status !== 'unqualified' : lead.status === selectedStatusFilter) &&
                    matchesSearch(lead) &&
                    matchesLOFilter(lead)
                  ).map(lead => ({ ...lead, source: 'meta' as const })),
                  ...leads.filter(lead => 
                    (selectedStatusFilter === 'all' ? lead.status !== 'unqualified' : lead.status === selectedStatusFilter) &&
                    matchesSearch(lead) &&
                    matchesLOFilter(lead)
                  ).map(lead => ({ ...lead, source: 'lead' as const })),
                ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())}
                keyExtractor={(item) => `${item.source}-${item.id}`}
                renderItem={({ item }) => 
                  item.source === 'meta' ? renderMetaLeadItem({ item }) : renderLeadItem({ item })
                }
                contentContainerStyle={styles.listContent}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                showsVerticalScrollIndicator={false}
              />
            </Animated.View>
          )}
        </>
      )}
    </View>
  );
}

// Root app that knows about session + lock state
function RootApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [notificationLead, setNotificationLead] = useState<{ id: string; source: 'lead' | 'meta' } | null>(null);
  const { isLocked } = useAppLock();

  // Check for existing Supabase session on mount
  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { session: existingSession },
      } = await supabase.auth.getSession();

      setSession(existingSession);
      setCheckingSession(false);

      // Listen for auth changes
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, newSession) => {
        setSession(newSession);
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
          setNotificationLead({ id: leadId, source: leadSource });
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

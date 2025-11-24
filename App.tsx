import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { getUserRole, getUserTeamMemberId, canSeeAllLeads, type UserRole } from './src/lib/roles';
import { TEXT_TEMPLATES, fillTemplate, type TemplateVariables } from './src/lib/textTemplates';
import Constants from 'expo-constants';

import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { makeRedirectUri } from 'expo-auth-session';

// Required for AuthSession to complete on iOS
WebBrowser.maybeCompleteAuthSession();

// This must match:
// - app.json: "scheme": "com.closewithmario.mobile"
// - Supabase URL config: com.closewithmario.mobile://auth/callback
const redirectTo = makeRedirectUri({
  scheme: 'com.closewithmario.mobile',
  path: 'auth/callback',
});
console.log("REDIRECT URI:", redirectTo);

// ------------ Types ------------
type Lead = {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  last_contact_date?: string | null;
  lo_id?: string | null;
  realtor_id?: string | null;
  loan_purpose?: string | null;
  price?: number | null;
  down_payment?: number | null;
  credit_score?: number | null;
  message?: string | null;
};

type MetaLead = {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  last_contact_date?: string | null;
  lo_id?: string | null;
  realtor_id?: string | null;
  platform: string | null;
  campaign_name: string | null;
  ad_name?: string | null;
  subject_address?: string | null;
  preferred_language?: string | null;
  credit_range?: string | null;
  income_type?: string | null;
  purchase_timeline?: string | null;
  price_range?: string | null;
  down_payment_saved?: string | null;
  has_realtor?: boolean | null;
  additional_notes?: string | null;
  county_interest?: string | null;
  monthly_income?: string | null;
  meta_ad_notes?: string | null;
};

type SelectedLeadRef =
  | { source: 'lead'; id: string }
  | { source: 'meta'; id: string };

type LoanOfficer = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  lead_eligible: boolean;
  created_at: string;
};

type Realtor = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
};

// Status values must match database check constraint exactly
const STATUSES = [
  'new',
  'contacted',
  'gathering_docs',
  'qualified',
  'nurturing',
  'closed',
  'unqualified',
  'no_response',
];

// Map status to display names matching website
const STATUS_DISPLAY_MAP: Record<string, string> = {
  'new': 'New',
  'contacted': 'Contacted',
  'gathering_docs': 'Docs Requested',
  'qualified': 'Qualified',
  'nurturing': 'Nurturing',
  'closed': 'Closed',
  'unqualified': 'Unqualified',
  'no_response': 'No Response',
};

// Attention badge logic (matches web implementation)
type AttentionBadge = {
  type: 'new' | 'stale' | 'no_activity';
  label: string;
  color: string;
} | null;

function getLeadAlert(lead: { status: string | null; created_at: string; last_contact_date?: string | null }): AttentionBadge {
  const status = lead.status || 'new';
  const createdAt = new Date(lead.created_at);
  const now = new Date();
  const hoursSinceCreated = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
  
  // New leads (>24h old, not contacted)
  if (status === 'new' && hoursSinceCreated > 24) {
    return { type: 'new', label: 'New >24h', color: '#EF4444' }; // Red
  }
  
  // No activity for 2+ days (contacted/qualified/nurturing)
  if (['contacted', 'qualified', 'nurturing'].includes(status)) {
    const lastContact = lead.last_contact_date ? new Date(lead.last_contact_date) : createdAt;
    const daysSinceContact = (now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceContact >= 2) {
      return { type: 'no_activity', label: 'No Activity 2+ days', color: '#F59E0B' }; // Orange
    }
  }
  
  // Stale leads (>3 days old, gathering_docs/no_response)
  if (['gathering_docs', 'no_response'].includes(status)) {
    const daysSinceCreated = hoursSinceCreated / 24;
    if (daysSinceCreated > 3) {
      return { type: 'stale', label: 'Stale >3 days', color: '#F59E0B' }; // Orange
    }
  }
  
  return null;
}

// Map status to colors for visual distinction
const STATUS_COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  'new': { bg: '#E3F2FD', text: '#1976D2', border: '#90CAF9' },
  'contacted': { bg: '#FFF3E0', text: '#F57C00', border: '#FFB74D' },
  'gathering_docs': { bg: '#F3E5F5', text: '#7B1FA2', border: '#CE93D8' },
  'qualified': { bg: '#D1FAE5', text: '#059669', border: '#10B981' },
  'nurturing': { bg: '#FFF9C4', text: '#F9A825', border: '#FFF59D' },
  'closed': { bg: '#D1FAE5', text: '#047857', border: '#10B981' },
  'unqualified': { bg: '#FFEBEE', text: '#C62828', border: '#EF5350' },
  'no_response': { bg: '#F5F5F5', text: '#616161', border: '#BDBDBD' },
};

// Helper to format status for display using the map
const formatStatus = (status: string): string => {
  return STATUS_DISPLAY_MAP[status] || status;
};

// Helper to get time ago
const getTimeAgo = (date: Date): string => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ------------ Auth Screen ------------
type AuthScreenProps = {
  onAuth: (session: Session) => void;
};

function AuthScreen({ onAuth }: AuthScreenProps) {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleEmailPasswordAuth = async () => {
    setAuthError(null);
    setAuthLoading(true);

    try {
      if (mode === 'signIn') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setAuthError(error.message);
        } else if (data.session) {
          onAuth(data.session);
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          setAuthError(error.message);
        } else if (data.session) {
          onAuth(data.session);
        } else {
          setAuthError(
            'Sign up successful. If email confirmation is required, confirm then sign in.'
          );
          setMode('signIn');
        }
      }
    } catch (e: any) {
      setAuthError(e?.message || 'Unexpected error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setAuthLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        console.log('Supabase OAuth error:', error.message);
        setAuthError(error.message);
        return;
      }

      const authUrl = data?.url;
      if (!authUrl) {
        console.log('No auth URL returned from Supabase.');
        setAuthError('Failed to start Google login.');
        return;
      }

      console.log('Opening Google auth session:', authUrl);

      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        redirectTo
      );

      console.log('AuthSession result:', result);

      if (result.type !== 'success' || !result.url) {
        setAuthError('Google sign-in did not complete. Please try again.');
        return;
      }

      // Parse tokens from URL fragment (implicit flow)
      const url = result.url;
      const params = new URLSearchParams(url.split('#')[1]);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (!accessToken || !refreshToken) {
        console.log('No tokens found in redirect URL');
        setAuthError('Failed to get authentication tokens.');
        return;
      }

      // Set the session using the tokens
      const { data: sessionData, error: sessionError } =
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

      if (sessionError) {
        console.log('Set session error:', sessionError);
        setAuthError(sessionError.message);
        return;
      }

      console.log('Supabase session set successfully:', sessionData);

      if (sessionData.session) {
        onAuth(sessionData.session);
      } else {
        setAuthError('Google sign-in did not complete.');
      }
    } catch (err: any) {
      console.error('Google OAuth error:', err);
      setAuthError(err?.message || 'Unexpected error.');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.authContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView 
        contentContainerStyle={styles.authScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo Section */}
        <View style={styles.authHeader}>
          <View style={styles.logoContainer}>
            <Image
              source={require('./assets/CWMLogo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.authTitle}>Close With Mario</Text>
          <Text style={styles.authSubtitle}>
            {mode === 'signIn' ? 'Welcome back! Sign in to continue' : 'Create your account'}
          </Text>
        </View>

        {/* Form Card */}
        <View style={styles.authCard}>
          <TextInput
            style={styles.authInput}
            placeholder="Email address"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <TextInput
            style={styles.authInput}
            placeholder="Password"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
          />

          {authError && (
            <View style={styles.authErrorContainer}>
              <Text style={styles.authErrorText}>⚠️ {authError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.authPrimaryButton, authLoading && styles.authButtonDisabled]}
            onPress={handleEmailPasswordAuth}
            disabled={authLoading}
            activeOpacity={0.8}
          >
            <Text style={styles.authPrimaryButtonText}>
              {authLoading
                ? 'Please wait...'
                : mode === 'signIn'
                ? 'Sign In'
                : 'Create Account'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
            style={styles.authSwitchButton}
          >
            <Text style={styles.authSwitchText}>
              {mode === 'signIn'
                ? "Don't have an account? "
                : 'Already have an account? '}
              <Text style={styles.authSwitchTextBold}>
                {mode === 'signIn' ? 'Sign up' : 'Sign in'}
              </Text>
            </Text>
          </TouchableOpacity>

          <View style={styles.authDivider}>
            <View style={styles.authDividerLine} />
            <Text style={styles.authDividerText}>OR</Text>
            <View style={styles.authDividerLine} />
          </View>

          <TouchableOpacity
            style={[styles.authGoogleButton, authLoading && styles.authButtonDisabled]}
            onPress={handleGoogleSignIn}
            disabled={authLoading}
            activeOpacity={0.8}
          >
            <Text style={styles.authGoogleIcon}>G</Text>
            <Text style={styles.authGoogleButtonText}>Continue with Google</Text>
          </TouchableOpacity>

          <Text style={styles.authHint}>
            💡 Google login requires a development or standalone build
          </Text>
        </View>

        {/* Version Number */}
        <Text style={styles.versionText}>
          v{Constants.expoConfig?.version} (Build {Constants.expoConfig?.ios?.buildNumber})
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ------------ Lead Detail View ------------
type LeadDetailViewProps = {
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
};

type Activity = {
  id: string;
  lead_id?: string;
  meta_ad_id?: string;
  activity_type: 'call' | 'text' | 'email' | 'note';
  notes: string;
  created_at: string;
  created_by?: string;
  user_email?: string;
};

function LeadDetailView({
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
}: LeadDetailViewProps) {
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
  const [currentLOInfo, setCurrentLOInfo] = useState<{ firstName: string; lastName: string } | null>(null);
  
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
  const currentList = isMeta ? metaLeads : leads;
  const currentIndex = currentList.findIndex((item) => item.id === selected.id);
  const record = currentList[currentIndex];
  
  // Function to get ad image based on ad name or campaign name
  const getAdImage = () => {
    if (!isMeta || !record) return null;
    
    const adName = (record as MetaLead).ad_name?.toLowerCase() || '';
    const campaignName = (record as MetaLead).campaign_name?.toLowerCase() || '';
    const searchText = `${adName} ${campaignName}`.toLowerCase();
    
    if (searchText.includes('hpa')) {
      return require('./assets/BrowardHPA _Ad.jpg');
    } else if (searchText.includes('condo')) {
      return require('./assets/Condo_Ad.jpg');
    } else if (searchText.includes('green acres') || searchText.includes('greenacres')) {
      return require('./assets/Greenacres_ Ad.png');
    }
    
    return null;
  };
  
  const adImage = getAdImage();

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < currentList.length - 1;

  const handlePrevious = () => {
    if (hasPrevious) {
      const prevLead = currentList[currentIndex - 1];
      onNavigate({ source: selected.source, id: prevLead.id });
    }
  };

  const handleNext = () => {
    if (hasNext) {
      const nextLead = currentList[currentIndex + 1];
      onNavigate({ source: selected.source, id: nextLead.id });
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

  const handleCall = () => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  const handleText = () => {
    if (!phone) return;
    setShowTemplateModal(true);
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = TEXT_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    const variables: TemplateVariables = {
      fname: record.first_name || 'there',
      loFullname: currentLOInfo 
        ? `${currentLOInfo.firstName} ${currentLOInfo.lastName}`.trim() 
        : 'Mario',
      platform: isMeta ? (record as MetaLead).platform || 'Facebook' : 'our website',
    };

    const messageBody = fillTemplate(template.template, variables);
    const encodedBody = encodeURIComponent(messageBody);
    
    setShowTemplateModal(false);
    Linking.openURL(`sms:${phone}?body=${encodedBody}`);
  };

  const handleEmail = () => {
    if (!email) return;
    const subject = encodeURIComponent('Mortgage follow-up');
    const body = encodeURIComponent(
      `Hi ${fullName || ''},\n\nI wanted to follow up regarding your home financing options.\n\nBest regards,\nMario`
    );
    Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`);
  };

  // Load current loan officer info
  useEffect(() => {
    const loadLOInfo = async () => {
      if (!session?.user?.id) return;
      
      try {
        const memberId = await getUserTeamMemberId(session.user.id, 'loan_officer');
        if (memberId) {
          const { data, error } = await supabase
            .from('loan_officers')
            .select('first_name, last_name')
            .eq('id', memberId)
            .single();
          
          if (data && !error) {
            setCurrentLOInfo({ firstName: data.first_name, lastName: data.last_name });
          }
        }
      } catch (e) {
        console.error('Error loading LO info:', e);
      }
    };

    loadLOInfo();
  }, [session?.user?.id]);

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

  const handleAddTask = async () => {
    if (!taskNote.trim() || !record) return;
    
    try {
      setSavingActivity(true);
      
      // Use correct table based on lead source
      const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
      const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';
      
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

  const getActivityIcon = (type: 'call' | 'text' | 'email' | 'note') => {
    switch (type) {
      case 'call': return '📞';
      case 'text': return '💬';
      case 'email': return '📧';
      case 'note': return '📝';
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
    <View style={styles.container}>
      {/* Modern Detail Header with Navigation */}
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.detailHeaderCenter}>
          <Text style={styles.detailHeaderTitle}>Lead Details</Text>
          <Text style={styles.detailHeaderSubtitle}>
            {currentIndex + 1} of {currentList.length}
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
      <View style={styles.stickyNameBar}>
        <View style={styles.stickyNameColumn}>
          <Text style={styles.stickyName} numberOfLines={1}>{fullName}</Text>
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

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View style={styles.detailCard}>

          {/* Divider */}
          <View style={styles.sectionDivider} />

          {/* Status buttons */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>🏷️ Status</Text>
            <View style={styles.statusBadgeContainer}>
              {attentionBadge && (
                <View style={[styles.detailAttentionBadge, { backgroundColor: attentionBadge.color }]}>
                  <Text style={styles.detailAttentionBadgeText}>⚠️ {attentionBadge.label}</Text>
                </View>
              )}
              <View style={[
                styles.currentStatusBadge,
                { backgroundColor: STATUS_COLOR_MAP[status || 'new']?.bg || '#F5F5F5' }
              ]}>
                <Text style={[
                  styles.currentStatusText,
                  { color: STATUS_COLOR_MAP[status || 'new']?.text || '#666' }
                ]}>
                  {status ? formatStatus(status) : 'N/A'}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.statusRow}>
            {STATUSES.map((s) => {
              const active = s === status;
              return (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.statusChip,
                    active && styles.statusChipActive,
                  ]}
                  onPress={() =>
                    onStatusChange(selected.source, record.id, s)
                  }
                >
                  <Text
                    style={[
                      styles.statusChipText,
                      active && styles.statusChipTextActive,
                    ]}
                  >
                    {formatStatus(s)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

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

          {/* Divider */}
          <View style={styles.sectionDivider} />

          {/* LO Assignment (Super Admin Only) */}
          {propUserRole === 'super_admin' && (
            <>
              <Text style={styles.sectionTitle}>👤 Assignment</Text>
              <View style={styles.loAssignmentRow}>
                <Text style={styles.loAssignmentLabel}>Loan Officer:</Text>
                <TouchableOpacity
                  style={styles.loAssignmentButton}
                  onPress={() => setShowLOPicker(true)}
                  disabled={updatingLO}
                >
                  <Text style={styles.loAssignmentValue}>
                    {record.lo_id 
                      ? loanOfficers.find(lo => lo.id === record.lo_id)?.name || 'Unknown'
                      : 'Unassigned'
                    }
                  </Text>
                  <Text style={styles.loAssignmentIcon}>▼</Text>
                </TouchableOpacity>
              </View>

              {/* LO Picker Modal */}
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

              {/* Divider */}
              <View style={styles.sectionDivider} />
            </>
          )}

          {/* Basic fields */}
          <Text style={styles.sectionTitle}>ℹ️ Details</Text>
          <Text style={styles.detailFieldBlock} selectable={true}>
            Email: {email || 'N/A'}{'\n'}
            Phone: {phone || 'N/A'}
          </Text>

          {!isMeta && (
            <>
              {(record as Lead).loan_purpose && (
                <Text style={styles.detailField} selectable={true}>
                  Loan Purpose: {(record as Lead).loan_purpose}
                </Text>
              )}
              {(record as Lead).price != null && (
                <Text style={styles.detailField} selectable={true}>
                  Price: ${(record as Lead).price?.toLocaleString()}
                </Text>
              )}
              {(record as Lead).down_payment != null && (
                <Text style={styles.detailField} selectable={true}>
                  Down Payment: ${(record as Lead).down_payment?.toLocaleString()}
                </Text>
              )}
              {(record as Lead).credit_score != null && (
                <Text style={styles.detailField} selectable={true}>
                  Credit Score: {(record as Lead).credit_score}
                </Text>
              )}
              {(record as Lead).message && (
                <Text style={styles.detailField} selectable={true}>
                  Message: {(record as Lead).message}
                </Text>
              )}
            </>
          )}

          {isMeta && (
            <>
              {(record as MetaLead).platform && (
                <Text style={styles.detailField} selectable={true}>
                  Platform: {(record as MetaLead).platform}
                </Text>
              )}
              {(record as MetaLead).campaign_name && (
                <Text style={styles.detailField} selectable={true}>
                  Campaign: {(record as MetaLead).campaign_name}
                </Text>
              )}
              {(record as MetaLead).ad_name && (
                <>
                  <Text style={styles.detailField} selectable={true}>
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
                <Text style={styles.detailField} selectable={true}>
                  Address: {(record as MetaLead).subject_address}
                </Text>
              )}
              {(record as MetaLead).preferred_language && (
                <Text style={styles.detailField} selectable={true}>
                  Language: {(record as MetaLead).preferred_language}
                </Text>
              )}
              {(record as MetaLead).credit_range && (
                <Text style={styles.detailField} selectable={true}>
                  Credit Range: {(record as MetaLead).credit_range}
                </Text>
              )}
              {(record as MetaLead).income_type && (
                <Text style={styles.detailField} selectable={true}>
                  Income Type: {(record as MetaLead).income_type}
                </Text>
              )}
              {(record as MetaLead).purchase_timeline && (
                <Text style={styles.detailField} selectable={true}>
                  Purchase Timeline: {(record as MetaLead).purchase_timeline}
                </Text>
              )}
              {(record as MetaLead).price_range && (
                <Text style={styles.detailField} selectable={true}>
                  Price Range: {(record as MetaLead).price_range}
                </Text>
              )}
              {(record as MetaLead).down_payment_saved && (
                <Text style={styles.detailField} selectable={true}>
                  Down Payment Saved: {(record as MetaLead).down_payment_saved}
                </Text>
              )}
              {(record as MetaLead).has_realtor != null && (
                <Text style={styles.detailField} selectable={true}>
                  Has Realtor: {(record as MetaLead).has_realtor ? 'Yes' : 'No'}
                </Text>
              )}
              {(record as MetaLead).county_interest && (
                <Text style={styles.detailField} selectable={true}>
                  County Interest: {(record as MetaLead).county_interest}
                </Text>
              )}
              {(record as MetaLead).monthly_income && (
                <Text style={styles.detailField} selectable={true}>
                  Monthly Income: {(record as MetaLead).monthly_income}
                </Text>
              )}
              {((record as MetaLead).meta_ad_notes || (record as MetaLead).additional_notes) && (
                <Text style={styles.detailField} selectable={true}>
                  Notes: {(record as MetaLead).meta_ad_notes || (record as MetaLead).additional_notes}
                </Text>
              )}
            </>
          )}

          {/* Divider */}
          <View style={styles.sectionDivider} />

          {/* Tasks / Logging Section */}
          <Text style={styles.sectionTitle}>✍️ Log Activity</Text>
          
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
                📞 Call
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
                💬 Text
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
                📧 Email
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
                📝 Note
              </Text>
            </TouchableOpacity>
          </View>

          {/* Quick Phrases Button */}
          <TouchableOpacity
            style={styles.quickPhrasesButton}
            onPress={() => setShowQuickPhrases(!showQuickPhrases)}
          >
            <Text style={styles.quickPhrasesButtonText}>
              📋 Quick Phrases {showQuickPhrases ? '▲' : '▼'}
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
          <View style={styles.activityInputCard}>
            <TextInput
              style={styles.activityInput}
              placeholder={`Enter ${selectedActivityType} details...`}
              placeholderTextColor="#999"
              value={taskNote}
              onChangeText={setTaskNote}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.logActivityButton,
                (!taskNote.trim() || savingActivity) && styles.logActivityButtonDisabled,
              ]}
              onPress={handleAddTask}
              disabled={!taskNote.trim() || savingActivity}
            >
              <Text style={styles.logActivityButtonText}>
                {savingActivity 
                  ? 'Saving...' 
                  : `Log ${getActivityIcon(selectedActivityType)} ${getActivityLabel(selectedActivityType)}`
                }
              </Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.sectionDivider} />

          {/* Activity History */}
          <Text style={styles.sectionTitle}>📋 Activity History</Text>

          {loadingActivities ? (
            <ActivityIndicator size="small" color="#007aff" style={{ marginTop: 12 }} />
          ) : activities.length > 0 ? (
            <View style={styles.tasksList}>
              {activities.map((activity) => (
                <View key={activity.id} style={styles.activityHistoryItem}>
                  <View style={styles.activityHistoryHeader}>
                    <View style={styles.activityHistoryHeaderLeft}>
                      <Text style={styles.activityHistoryType}>
                        {getActivityIcon(activity.activity_type)} {getActivityLabel(activity.activity_type)}
                      </Text>
                      <Text style={styles.activityHistoryTimestamp}>
                        {new Date(activity.created_at).toLocaleString()}
                      </Text>
                    </View>
                    {propUserRole === 'super_admin' && (
                      <TouchableOpacity
                        onPress={() => handleDeleteActivity(activity.id)}
                        disabled={deletingActivityId === activity.id}
                        style={styles.deleteActivityButton}
                      >
                        <Text style={styles.deleteActivityButtonText}>
                          {deletingActivityId === activity.id ? '⏳' : '🗑️'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.activityHistoryNote}>{activity.notes}</Text>
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
              <Text style={styles.templateModalTitle}>Choose a Text Template</Text>
              <TouchableOpacity 
                onPress={() => setShowTemplateModal(false)}
                style={styles.templateModalClose}
              >
                <Text style={styles.templateModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.templateList} showsVerticalScrollIndicator={false}>
              {TEXT_TEMPLATES.map((template) => {
                const variables: TemplateVariables = {
                  fname: record.first_name || 'there',
                  loFullname: currentLOInfo 
                    ? `${currentLOInfo.firstName} ${currentLOInfo.lastName}`.trim() 
                    : 'Mario',
                  platform: isMeta ? (record as MetaLead).platform || 'Facebook' : 'our website',
                };
                const preview = fillTemplate(template.template, variables);

                return (
                  <TouchableOpacity
                    key={template.id}
                    style={styles.templateItem}
                    onPress={() => handleTemplateSelect(template.id)}
                  >
                    <Text style={styles.templateName}>{template.name}</Text>
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
    </View>
  );
}

// ------------ Team Management Screen ------------
type TeamManagementScreenProps = {
  onBack: () => void;
  session: Session | null;
};

function TeamManagementScreen({ onBack, session }: TeamManagementScreenProps) {
  const [activeTab, setActiveTab] = useState<'loan_officers' | 'realtors'>('loan_officers');
  const [loanOfficers, setLoanOfficers] = useState<LoanOfficer[]>([]);
  const [realtors, setRealtors] = useState<Realtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(false);
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingMember, setEditingMember] = useState<LoanOfficer | Realtor | null>(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    active: true,
    lead_eligible: true,
  });
  const [saving, setSaving] = useState(false);

  // Fetch team members and auto-assign state
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch loan officers
      const { data: loData, error: loError } = await supabase
        .from('loan_officers')
        .select('*')
        .order('created_at', { ascending: false });

      if (loError) throw loError;
      setLoanOfficers(loData || []);

      // Fetch realtors
      const { data: realtorData, error: realtorError } = await supabase
        .from('realtors')
        .select('*')
        .order('created_at', { ascending: false });

      if (realtorError) throw realtorError;
      setRealtors(realtorData || []);

      // Fetch auto-assign state
      const { data: assignData, error: assignError } = await supabase
        .from('lead_assignment_state')
        .select('auto_assign_enabled')
        .limit(1)
        .maybeSingle();

      if (assignError) throw assignError;
      setAutoAssignEnabled(assignData?.auto_assign_enabled ?? false);
    } catch (error: any) {
      console.error('Error fetching team data:', error);
      alert('Error loading team data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleAutoAssign = async (enabled: boolean) => {
    try {
      const { data: rows, error: fetchError } = await supabase
        .from('lead_assignment_state')
        .select('id')
        .limit(1);

      if (fetchError) throw fetchError;

      if (!rows || rows.length === 0) {
        alert('Auto-assign state not initialized. Please contact support.');
        return;
      }

      const { error: updateError } = await supabase
        .from('lead_assignment_state')
        .update({
          auto_assign_enabled: enabled,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rows[0].id);

      if (updateError) throw updateError;
      setAutoAssignEnabled(enabled);
    } catch (error: any) {
      console.error('Error toggling auto-assign:', error);
      alert('Error updating auto-assign: ' + error.message);
    }
  };

  const openAddModal = () => {
    setEditingMember(null);
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      active: true,
      lead_eligible: true,
    });
    setShowAddEditModal(true);
  };

  const openEditModal = (member: LoanOfficer | Realtor) => {
    setEditingMember(member);
    setFormData({
      first_name: member.first_name,
      last_name: member.last_name,
      email: member.email || '',
      phone: member.phone || '',
      active: member.active,
      lead_eligible: 'lead_eligible' in member ? member.lead_eligible : true,
    });
    setShowAddEditModal(true);
  };

  const handleSave = async () => {
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      alert('First name and last name are required');
      return;
    }

    setSaving(true);
    try {
      const table = activeTab === 'loan_officers' ? 'loan_officers' : 'realtors';
      const dataToSave: any = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        active: formData.active,
      };

      // Only add lead_eligible for loan officers
      if (activeTab === 'loan_officers') {
        dataToSave.lead_eligible = formData.lead_eligible;
      }

      if (editingMember) {
        // Update existing member
        const { error } = await supabase
          .from(table)
          .update(dataToSave)
          .eq('id', editingMember.id);

        if (error) throw error;
      } else {
        // Insert new member
        const { error } = await supabase.from(table).insert([dataToSave]);

        if (error) throw error;
      }

      setShowAddEditModal(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving team member:', error);
      alert('Error saving: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (member: LoanOfficer | Realtor) => {
    if (!confirm(`Delete ${member.first_name} ${member.last_name}?`)) return;

    try {
      const table = activeTab === 'loan_officers' ? 'loan_officers' : 'realtors';
      const { error } = await supabase.from(table).delete().eq('id', member.id);

      if (error) throw error;
      fetchData();
    } catch (error: any) {
      console.error('Error deleting team member:', error);
      alert('Error deleting: ' + error.message);
    }
  };

  const filteredLoanOfficers = loanOfficers.filter((lo) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const fullName = `${lo.first_name} ${lo.last_name}`.toLowerCase();
    const email = lo.email?.toLowerCase() || '';
    return fullName.includes(query) || email.includes(query);
  });

  const filteredRealtors = realtors.filter((r) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const fullName = `${r.first_name} ${r.last_name}`.toLowerCase();
    const email = r.email?.toLowerCase() || '';
    return fullName.includes(query) || email.includes(query);
  });

  const currentList = activeTab === 'loan_officers' ? filteredLoanOfficers : filteredRealtors;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Header */}
      <View style={styles.dashboardHeader}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={onBack} style={styles.teamBackButton}>
            <Text style={styles.teamBackButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.dashboardTitle}>Team Management</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator />
          <Text style={styles.subtitle}>Loading team data...</Text>
        </View>
      ) : (
        <>
          {/* Auto-assign toggle (only for loan officers tab) */}
          {activeTab === 'loan_officers' && (
            <View style={styles.autoAssignContainer}>
              <TouchableOpacity
                style={styles.autoAssignToggle}
                onPress={() => toggleAutoAssign(!autoAssignEnabled)}
              >
                <View style={[
                  styles.toggleSwitch,
                  autoAssignEnabled && styles.toggleSwitchActive
                ]}>
                  <View style={[
                    styles.toggleThumb,
                    autoAssignEnabled && styles.toggleThumbActive
                  ]} />
                </View>
                <Text style={styles.autoAssignLabel}>
                  Auto-assign Meta leads (round robin)
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Tabs */}
          <View style={styles.teamTabBar}>
            <TouchableOpacity
              style={[
                styles.teamTab,
                activeTab === 'loan_officers' && styles.teamTabActive,
              ]}
              onPress={() => setActiveTab('loan_officers')}
            >
              <Text style={[
                styles.teamTabText,
                activeTab === 'loan_officers' && styles.teamTabTextActive,
              ]}>
                👔 Loan Officers ({loanOfficers.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.teamTab,
                activeTab === 'realtors' && styles.teamTabActive,
              ]}
              onPress={() => setActiveTab('realtors')}
            >
              <Text style={[
                styles.teamTabText,
                activeTab === 'realtors' && styles.teamTabTextActive,
              ]}>
                🏠 Realtors ({realtors.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search and Add Button */}
          <View style={styles.teamActionsRow}>
            <View style={styles.teamSearchContainer}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.teamSearchInput}
                placeholder="Search by name or email..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
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
            <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {/* Team Member List */}
          <FlatList
            data={currentList}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.teamMemberCard}
                onPress={() => openEditModal(item)}
              >
                <View style={styles.teamMemberHeader}>
                  <Text style={styles.teamMemberName}>
                    {item.first_name} {item.last_name}
                  </Text>
                  <View style={[
                    styles.teamMemberStatusBadge,
                    item.active ? styles.teamMemberStatusActive : styles.teamMemberStatusInactive
                  ]}>
                    <Text style={[
                      styles.teamMemberStatusText,
                      item.active ? styles.teamMemberStatusTextActive : styles.teamMemberStatusTextInactive
                    ]}>
                      {item.active ? '✓ Active' : '○ Inactive'}
                    </Text>
                  </View>
                </View>
                {item.email && (
                  <Text style={styles.teamMemberDetail}>📧 {item.email}</Text>
                )}
                {item.phone && (
                  <Text style={styles.teamMemberDetail}>📱 {item.phone}</Text>
                )}
                {activeTab === 'loan_officers' && 'lead_eligible' in item && (
                  <View style={styles.teamMemberEligible}>
                    <Text style={[
                      styles.teamMemberEligibleText,
                      item.lead_eligible ? styles.teamMemberEligibleYes : styles.teamMemberEligibleNo
                    ]}>
                      {item.lead_eligible ? '✓ Lead Eligible' : '✕ Not Eligible'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.teamListContent}
            showsVerticalScrollIndicator={false}
          />

          {/* Add/Edit Modal */}
          <Modal
            visible={showAddEditModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowAddEditModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.teamModalContent}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.teamModalTitle}>
                    {editingMember ? 'Edit' : 'Add'} {activeTab === 'loan_officers' ? 'Loan Officer' : 'Realtor'}
                  </Text>

                  <Text style={styles.teamInputLabel}>First Name *</Text>
                  <TextInput
                    style={styles.teamInput}
                    value={formData.first_name}
                    onChangeText={(text) => setFormData({ ...formData, first_name: text })}
                    placeholder="Enter first name"
                    placeholderTextColor="#94A3B8"
                  />

                  <Text style={styles.teamInputLabel}>Last Name *</Text>
                  <TextInput
                    style={styles.teamInput}
                    value={formData.last_name}
                    onChangeText={(text) => setFormData({ ...formData, last_name: text })}
                    placeholder="Enter last name"
                    placeholderTextColor="#94A3B8"
                  />

                  <Text style={styles.teamInputLabel}>Email</Text>
                  <TextInput
                    style={styles.teamInput}
                    value={formData.email}
                    onChangeText={(text) => setFormData({ ...formData, email: text })}
                    placeholder="Enter email"
                    placeholderTextColor="#94A3B8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />

                  <Text style={styles.teamInputLabel}>Phone</Text>
                  <TextInput
                    style={styles.teamInput}
                    value={formData.phone}
                    onChangeText={(text) => setFormData({ ...formData, phone: text })}
                    placeholder="Enter phone"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                  />

                  <TouchableOpacity
                    style={styles.teamCheckboxRow}
                    onPress={() => setFormData({ ...formData, active: !formData.active })}
                  >
                    <View style={[
                      styles.teamCheckbox,
                      formData.active && styles.teamCheckboxChecked
                    ]}>
                      {formData.active && <Text style={styles.teamCheckboxCheck}>✓</Text>}
                    </View>
                    <Text style={styles.teamCheckboxLabel}>Active</Text>
                  </TouchableOpacity>

                  {activeTab === 'loan_officers' && (
                    <TouchableOpacity
                      style={styles.teamCheckboxRow}
                      onPress={() => setFormData({ ...formData, lead_eligible: !formData.lead_eligible })}
                    >
                      <View style={[
                        styles.teamCheckbox,
                        formData.lead_eligible && styles.teamCheckboxChecked
                      ]}>
                        {formData.lead_eligible && <Text style={styles.teamCheckboxCheck}>✓</Text>}
                      </View>
                      <Text style={styles.teamCheckboxLabel}>Eligible for auto-assigned leads</Text>
                    </TouchableOpacity>
                  )}

                  <View style={styles.teamModalButtons}>
                    {editingMember && (
                      <TouchableOpacity
                        style={styles.teamDeleteButton}
                        onPress={() => {
                          setShowAddEditModal(false);
                          handleDelete(editingMember);
                        }}
                      >
                        <Text style={styles.teamDeleteButtonText}>Delete</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.teamCancelButton}
                      onPress={() => setShowAddEditModal(false)}
                    >
                      <Text style={styles.teamCancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.teamSaveButton, saving && styles.teamSaveButtonDisabled]}
                      onPress={handleSave}
                      disabled={saving}
                    >
                      <Text style={styles.teamSaveButtonText}>
                        {saving ? 'Saving...' : editingMember ? 'Update' : 'Add'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
}

// ------------ Leads Screen ------------
type LeadsScreenProps = {
  onSignOut: () => void;
  session: Session | null;
};

function LeadsScreen({ onSignOut, session }: LeadsScreenProps) {
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
  const [leadEligible, setLeadEligible] = useState<boolean>(true);

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

    return (
      <TouchableOpacity
        style={[styles.leadCard, { borderLeftColor: borderColor }]}
        onPress={() =>
          setSelectedLead({ source: 'lead', id: item.id })
        }
        activeOpacity={0.7}
      >
        <View style={styles.leadHeader}>
          <Text style={styles.leadName}>{fullName}</Text>
          <View style={styles.leadSourceBadge}>
            <Text style={styles.leadSourceText}>🌐 Web</Text>
          </View>
        </View>
        {alert && (
          <View style={[styles.attentionBadge, { backgroundColor: alert.color }]}>
            <Text style={styles.attentionBadgeText}>⚠️ {alert.label}</Text>
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
            <Text style={styles.leadContactIcon}>📧</Text>
            <Text style={styles.leadContact} numberOfLines={1}>{item.email}</Text>
          </View>
        )}
        {item.phone && (
          <View style={styles.leadContactRow}>
            <Text style={styles.leadContactIcon}>📞</Text>
            <Text style={styles.leadContact} numberOfLines={1}>{formatPhoneNumber(item.phone)}</Text>
          </View>
        )}
        {userRole === 'super_admin' && item.lo_id && (
          <View style={styles.leadLORow}>
            <Text style={styles.leadLOIcon}>👤</Text>
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
    );
  };

  const renderMetaLeadItem = ({ item }: { item: MetaLead }) => {
    const fullName =
      [item.first_name, item.last_name].filter(Boolean).join(' ') ||
      '(No name)';
    const status = item.status ? formatStatus(item.status) : 'No status';
    const emailOrPhone = item.email || item.phone || 'No contact info';
    const platform = item.platform || 'Facebook';
    const campaign = item.campaign_name || '';
    const alert = getLeadAlert(item);
    const borderColor = alert ? alert.color : '#7C3AED';

    // Get platform badge component
    const getPlatformBadge = (platform: string) => {
      const platformLower = platform.toLowerCase();
      
      let badgeText = 'FB';
      let badgeColor = '#1877F2'; // Facebook blue
      let badgeBg = '#E7F3FF';
      
      // Check for Instagram (ig, instagram, etc.)
      if (platformLower.includes('instagram') || platformLower.includes('ig')) {
        badgeText = 'IG';
        badgeColor = '#E4405F'; // Instagram pink
        badgeBg = '#FFE8ED';
      }
      // Check for Facebook (fb, facebook, etc.)
      else if (platformLower.includes('facebook') || platformLower.includes('fb')) {
        badgeText = 'FB';
        badgeColor = '#1877F2';
        badgeBg = '#E7F3FF';
      }
      // Check for Messenger
      else if (platformLower.includes('messenger')) {
        badgeText = 'MSG';
        badgeColor = '#0084FF';
        badgeBg = '#E5F2FF';
      }
      // Check for WhatsApp
      else if (platformLower.includes('whatsapp')) {
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

    const statusColors = STATUS_COLOR_MAP[item.status || 'new'] || STATUS_COLOR_MAP['new'];

    return (
      <TouchableOpacity
        style={[styles.leadCard, { borderLeftColor: borderColor }]}
        onPress={() =>
          setSelectedLead({ source: 'meta', id: item.id })
        }
        activeOpacity={0.7}
      >
        <View style={styles.leadHeader}>
          <Text style={styles.leadName}>{fullName}</Text>
          {getPlatformBadge(platform)}
        </View>
        {alert && (
          <View style={[styles.attentionBadge, { backgroundColor: alert.color }]}>
            <Text style={styles.attentionBadgeText}>⚠️ {alert.label}</Text>
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
            <Text style={styles.campaignIcon}>📢</Text>
            <Text style={styles.leadCampaign} numberOfLines={1}>{campaign}</Text>
          </View>
        ) : null}
        {item.email && (
          <View style={styles.leadContactRow}>
            <Text style={styles.leadContactIcon}>📧</Text>
            <Text style={styles.leadContact} numberOfLines={1}>{item.email}</Text>
          </View>
        )}
        {item.phone && (
          <View style={styles.leadContactRow}>
            <Text style={styles.leadContactIcon}>📞</Text>
            <Text style={styles.leadContact} numberOfLines={1}>{formatPhoneNumber(item.phone)}</Text>
          </View>
        )}
        {userRole === 'super_admin' && item.lo_id && (
          <View style={styles.leadLORow}>
            <Text style={styles.leadLOIcon}>👤</Text>
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
        onLeadUpdate={(updatedLead, source) => {
          if (source === 'lead') {
            setLeads(leads.map(l => l.id === updatedLead.id ? updatedLead as Lead : l));
          } else {
            setMetaLeads(metaLeads.map(l => l.id === updatedLead.id ? updatedLead as MetaLead : l));
          }
        }}
      />
    );
  }

  // Dashboard View
  if (showDashboard) {
    const totalLeads = leads.length + metaLeads.length;
    const metaLeadsCount = metaLeads.length;
    const organicLeadsCount = leads.length;
    const newLeads = [...leads, ...metaLeads].filter(l => l.status === 'new').length;
    const qualifiedLeads = [...leads, ...metaLeads].filter(l => l.status === 'qualified').length;
    const closedLeads = [...leads, ...metaLeads].filter(l => l.status === 'closed').length;
    
    // Get recent leads (last 5)
    const allLeads = [...metaLeads.map(l => ({ ...l, source: 'meta' as const })), ...leads.map(l => ({ ...l, source: 'lead' as const }))];
    const recentLeads = allLeads
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    // Get user's first name for greeting
    const userFirstName = session?.user?.user_metadata?.full_name?.split(' ')[0] || 
                          session?.user?.user_metadata?.name?.split(' ')[0] || 
                          'there';

    return (
      <View style={styles.container}>
        {/* Purple Gradient Header */}
        <View style={styles.newDashboardHeader}>
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
        >
          {/* View All Leads Button */}
          <TouchableOpacity
            style={styles.newViewAllButton}
            onPress={() => {
              setActiveTab('all');
              setSelectedStatusFilter('all');
              setShowDashboard(false);
            }}
          >
            <Text style={styles.newViewAllText}>📊 View All Leads</Text>
          </TouchableOpacity>

          {/* Performance Section */}
          <View style={styles.performanceSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>📈 Performance</Text>
            </View>
            <View style={styles.performanceGrid}>
              <TouchableOpacity 
                style={styles.performanceCard}
                onPress={() => {
                  setActiveTab('all');
                  setSelectedStatusFilter('new');
                  setShowDashboard(false);
                }}
              >
                <Text style={styles.perfNumber}>{newLeads}</Text>
                <Text style={styles.perfLabel}>New Leads</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.performanceCard}
                onPress={() => {
                  setActiveTab('all');
                  setSelectedStatusFilter('qualified');
                  setShowDashboard(false);
                }}
              >
                <Text style={styles.perfNumber}>{qualifiedLeads}</Text>
                <Text style={styles.perfLabel}>Qualified</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.performanceCard}
                onPress={() => {
                  setActiveTab('all');
                  setSelectedStatusFilter('closed');
                  setShowDashboard(false);
                }}
              >
                <Text style={styles.perfNumber}>{closedLeads}</Text>
                <Text style={styles.perfLabel}>Closed</Text>
              </TouchableOpacity>
              <View style={styles.performanceCard}>
                <Text style={styles.perfNumber}>
                  {totalLeads > 0 ? Math.round((closedLeads / totalLeads) * 100) : 0}%
                </Text>
                <Text style={styles.perfLabel}>Conversion</Text>
              </View>
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
          <View style={styles.recentLeadsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🕒 Recent Leads</Text>
            </View>
            {recentLeads.length > 0 ? (
              recentLeads.map((lead) => {
                const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || '(No name)';
                const timeAgo = getTimeAgo(new Date(lead.created_at));
                const isNew = lead.status === 'new';
                const isQualified = lead.status === 'qualified';
                const source = lead.source === 'meta' 
                  ? `📱 Facebook${(lead as MetaLead).campaign_name ? ' • ' + (lead as MetaLead).campaign_name : ''}`
                  : '🌐 Website Contact';
                
                return (
                  <TouchableOpacity
                    key={`${lead.source}-${lead.id}`}
                    style={[
                      styles.newLeadCard,
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
                        <Text style={styles.newLeadName}>{fullName}</Text>
                        <Text style={styles.newLeadSource} numberOfLines={1}>{source}</Text>
                        <Text style={styles.newLeadTime}>{timeAgo}</Text>
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

  const onRefresh = async () => {
    setRefreshing(true);
    if (!session?.user?.id || !session?.user?.email) {
      setRefreshing(false);
      return;
    }

    try {
      const userRole = await getUserRole(session.user.id, session.user.email);
      
      let leadsQuery = supabase
        .from('leads')
        .select('id, created_at, first_name, last_name, email, phone, status, last_contact_date, loan_purpose, price, down_payment, credit_score, message, lo_id, realtor_id')
        .order('created_at', { ascending: false });

      let metaQuery = supabase
        .from('meta_ads')
        .select('id, created_at, first_name, last_name, email, phone, status, last_contact_date, platform, campaign_name, ad_name, subject_address, preferred_language, credit_range, income_type, purchase_timeline, price_range, down_payment_saved, has_realtor, additional_notes, county_interest, monthly_income, meta_ad_notes, lo_id, realtor_id')
        .order('created_at', { ascending: false });

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

  return (
    <View style={styles.container}>
      {/* Modern Purple Header with Stats and Search */}
      <View style={styles.leadsHeaderContainer}>
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
            setActiveTab('meta');
            setHasManuallySelectedTab(true);
          }}
        >
          <Text style={[
            styles.statNumber,
            activeTab === 'meta' && styles.statNumberActive,
          ]}>
            {selectedStatusFilter === 'all' 
              ? metaLeads.length 
              : metaLeads.filter(l => l.status === selectedStatusFilter).length
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
            setActiveTab('leads');
            setHasManuallySelectedTab(true);
          }}
        >
          <Text style={[
            styles.statNumber,
            activeTab === 'leads' && styles.statNumberActive,
          ]}>
            {selectedStatusFilter === 'all' 
              ? leads.length 
              : leads.filter(l => l.status === selectedStatusFilter).length
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
            setActiveTab('all');
            setHasManuallySelectedTab(true);
          }}
        >
          <Text style={[
            styles.statNumber,
            activeTab === 'all' && styles.statNumberActive,
          ]}>
            {selectedStatusFilter === 'all' 
              ? metaLeads.length + leads.length 
              : [...metaLeads, ...leads].filter(l => l.status === selectedStatusFilter).length
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
          {/* Status Filter Button */}
          <View style={styles.filterButtonContainer}>
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => setShowStatusPicker(true)}
            >
              <Text style={styles.filterButtonLabel}>Status:</Text>
              <Text style={styles.filterButtonValue}>
                {selectedStatusFilter === 'all' 
                  ? `All Statuses (${[...leads, ...metaLeads].length})` 
                  : `${formatStatus(selectedStatusFilter)} (${[...leads, ...metaLeads].filter(l => l.status === selectedStatusFilter).length})`
                }
              </Text>
              <Text style={styles.filterButtonIcon}>▼</Text>
            </TouchableOpacity>
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
                      ]}>({[...leads, ...metaLeads].length})</Text>
                    </View>
                    {selectedStatusFilter === 'all' && (
                      <Text style={styles.statusPickerCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                  {STATUSES.map((status) => {
                    const count = [...leads, ...metaLeads].filter(l => l.status === status).length;
                    return (
                      <TouchableOpacity
                        key={status}
                        style={[
                          styles.statusPickerItem,
                          selectedStatusFilter === status && styles.statusPickerItemActive,
                        ]}
                        onPress={() => {
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

          {/* Lead Content */}
          {activeTab === 'leads' && hasLeads && (
            <FlatList
              data={leads.filter(lead => 
                (selectedStatusFilter === 'all' || lead.status === selectedStatusFilter) &&
                matchesSearch(lead)
              )}
              keyExtractor={(item) => item.id}
              renderItem={renderLeadItem}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              showsVerticalScrollIndicator={false}
            />
          )}

          {activeTab === 'meta' && hasMetaLeads && (
            <FlatList
              data={metaLeads.filter(lead => 
                (selectedStatusFilter === 'all' || lead.status === selectedStatusFilter) &&
                matchesSearch(lead)
              )}
              keyExtractor={(item) => item.id}
              renderItem={renderMetaLeadItem}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              showsVerticalScrollIndicator={false}
            />
          )}

          {activeTab === 'all' && (hasLeads || hasMetaLeads) && (
            <FlatList
              data={[
                ...metaLeads.filter(lead => 
                  (selectedStatusFilter === 'all' || lead.status === selectedStatusFilter) &&
                  matchesSearch(lead)
                ).map(lead => ({ ...lead, source: 'meta' as const })),
                ...leads.filter(lead => 
                  (selectedStatusFilter === 'all' || lead.status === selectedStatusFilter) &&
                  matchesSearch(lead)
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
          )}
        </>
      )}
    </View>
  );
}

// ------------ Root App ------------
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session ?? null);
      setCheckingSession(false);

      supabase.auth.onAuthStateChange((_event, newSession) => {
        setSession(newSession ?? null);
      });
    };

    initAuth();
  }, []);

  if (checkingSession) {
    return (
      <View style={styles.centerContent}>
        <ActivityIndicator />
        <Text style={styles.subtitle}>Checking session…</Text>
      </View>
    );
  }

  if (!session) {
    return <AuthScreen onAuth={(sess) => setSession(sess)} />;
  }

  return (
    <>
      <LeadsScreen
        onSignOut={async () => {
          await supabase.auth.signOut();
          setSession(null);
        }}
        session={session}
      />
      <StatusBar style="auto" />
    </>
  );
}

// ------------ Styles ------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  authScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
  },
  authHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: '#FFFFFF',
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  logo: {
    width: 100,
    height: 100,
  },
  authTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  authSubtitle: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },
  authCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  authInput: {
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: '#F8FAFC',
    color: '#1E293B',
    fontWeight: '500',
  },
  authErrorContainer: {
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
  },
  authErrorText: {
    fontSize: 13,
    color: '#991B1B',
    fontWeight: '600',
  },
  authPrimaryButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  authPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  authButtonDisabled: {
    opacity: 0.6,
  },
  authSwitchButton: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 8,
  },
  authSwitchText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  authSwitchTextBold: {
    color: '#7C3AED',
    fontWeight: '700',
  },
  authDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  authDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  authDividerText: {
    marginHorizontal: 16,
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  authGoogleButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  authGoogleIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4285F4',
    marginRight: 12,
  },
  authGoogleButtonText: {
    color: '#1E293B',
    fontSize: 15,
    fontWeight: '600',
  },
  authHint: {
    fontSize: 12,
    marginTop: 16,
    textAlign: 'center',
    color: '#64748B',
    lineHeight: 18,
    fontWeight: '500',
  },
  versionText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 16,
    fontWeight: '500',
  },
  headerContainer: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: '#7C3AED',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
  },
  userInfoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 8,
    maxWidth: '90%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  userInfoIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  userAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  userInfoText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
    flex: 1,
  },
  homeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  homeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#E9D5FF',
    marginTop: 2,
  },
  signOutButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  signOutText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  statCardActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statNumberActive: {
    color: '#7C3AED',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  statLabelActive: {
    color: '#7C3AED',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 16,
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'center',
    color: '#666',
  },
  debugText: {
    fontSize: 11,
    textAlign: 'center',
    color: '#94A3B8',
    marginBottom: 8,
    fontWeight: '500',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
    color: 'red',
    textAlign: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  leadCard: {
    padding: 18,
    marginBottom: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#7C3AED',
  },
  leadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  leadName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
    letterSpacing: 0.2,
  },
  leadSourceBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  leadSourceText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E40AF',
  },
  platformBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  platformBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  attentionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 8,
  },
  attentionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  campaignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  campaignIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  leadCampaign: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '600',
    flex: 1,
  },
  leadContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  leadContactIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  leadContact: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
    flex: 1,
  },
  leadLORow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  leadLOIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  leadLOText: {
    fontSize: 13,
    color: '#7C3AED',
    fontWeight: '600',
    flex: 1,
  },
  leadTimestamp: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  primaryButton: {
    backgroundColor: '#007aff',
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 20,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchModeText: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 14,
    color: '#007aff',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  googleButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  googleButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  googleHint: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
    color: '#777',
  },
  // Dashboard Styles
  dashboardContent: {
    paddingBottom: 32,
  },
  dashboardStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  dashboardStatCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderTopWidth: 3,
    borderTopColor: '#10B981',
  },
  dashboardStatNumber: {
    fontSize: 36,
    fontWeight: '800',
    color: '#10B981',
    marginBottom: 4,
  },
  dashboardStatLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  dashboardCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  dashboardCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
  },
  dashboardGuideStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  dashboardGuideNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#7C3AED',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
    marginRight: 12,
  },
  dashboardGuideText: {
    flex: 1,
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
  },
  dashboardRecentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dashboardRecentInfo: {
    flex: 1,
  },
  dashboardRecentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  dashboardRecentTime: {
    fontSize: 13,
    color: '#64748B',
  },
  dashboardRecentArrow: {
    fontSize: 24,
    color: '#CBD5E1',
    fontWeight: '300',
  },
  dashboardEmptyText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 14,
    paddingVertical: 20,
  },
  leadEligibleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leadEligibleInfo: {
    flex: 1,
    marginRight: 16,
  },
  leadEligibleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 6,
  },
  leadEligibleDescription: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  leadEligibleToggle: {
    padding: 4,
  },
  dashboardViewAllButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 16,
    marginHorizontal: 16,
    marginTop: 24,
    alignItems: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  dashboardViewAllText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#7C3AED',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  backButtonText: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  detailHeaderCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  detailHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  detailHeaderSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#93C5FD',
    marginTop: 2,
  },
  navButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  navButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  navButtonText: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  navButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.3)',
  },
  stickyNameBar: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 70,
  },
  stickyNameColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  stickyName: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  stickyTimestamp: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.1,
  },
  detailCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  detailNameRow: {
    marginBottom: 8,
  },
  detailName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: 0.3,
  },
  detailMeta: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  loAssignmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  loAssignmentLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  loAssignmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 150,
  },
  loAssignmentValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
  loAssignmentIcon: {
    fontSize: 10,
    color: '#64748B',
    marginLeft: 8,
  },
  statusBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  detailAttentionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  detailAttentionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  currentStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  currentStatusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  infoGrid: {
    gap: 8,
  },
  detailField: {
    fontSize: 14,
    marginTop: 8,
    color: '#475569',
    lineHeight: 20,
  },
  detailFieldBlock: {
    fontSize: 14,
    marginTop: 8,
    color: '#475569',
    lineHeight: 20,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    marginRight: 6,
    marginBottom: 6,
  },
  statusChipActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  statusChipText: {
    fontSize: 12,
    color: '#333',
  },
  statusChipTextActive: {
    color: '#fff',
  },
  contactRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 10,
  },
  contactButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  contactButtonDisabled: {
    backgroundColor: '#CBD5E1',
    shadowOpacity: 0,
  },
  contactButtonIcon: {
    fontSize: 18,
    marginBottom: 4,
    color: '#FFFFFF',
  },
  contactButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 6,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: '#7C3AED',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  filterButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  filterButtonLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    marginRight: 8,
  },
  filterButtonValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  filterButtonIcon: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  statusPickerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  statusPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  statusPickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  statusPickerClose: {
    fontSize: 24,
    color: '#64748B',
    fontWeight: '300',
  },
  statusPickerScroll: {
    maxHeight: 400,
  },
  statusPickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  statusPickerItemActive: {
    backgroundColor: '#F8F4FF',
  },
  statusPickerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPickerItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1E293B',
  },
  statusPickerItemTextActive: {
    color: '#7C3AED',
    fontWeight: '700',
  },
  statusPickerItemCount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  statusPickerItemCountActive: {
    color: '#A78BFA',
  },
  statusPickerCheck: {
    fontSize: 18,
    color: '#7C3AED',
    fontWeight: '700',
  },
  activityTypeRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  activityTypeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  activityTypeButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  activityTypeText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  activityTypeTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  quickPhrasesButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  quickPhrasesButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  quickPhrasesList: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  quickPhraseItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  quickPhraseText: {
    fontSize: 14,
    color: '#333',
  },
  activityInputCard: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  activityInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#333',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  logActivityButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 12,
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  logActivityButtonDisabled: {
    backgroundColor: '#ccc',
    shadowOpacity: 0,
  },
  logActivityButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  tasksList: {
    marginTop: 12,
  },
  activityHistoryItem: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  activityHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  activityHistoryHeaderLeft: {
    flex: 1,
  },
  activityHistoryType: {
    fontSize: 14,
    color: '#007aff',
    fontWeight: '600',
  },
  activityHistoryTimestamp: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  deleteActivityButton: {
    padding: 8,
    marginLeft: 8,
  },
  deleteActivityButtonText: {
    fontSize: 18,
  },
  activityHistoryNote: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  activityUserEmail: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
    fontStyle: 'italic',
  },
  noTasksText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  viewAdButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  viewAdButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  adImageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adImageModalClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  adImageModalCloseButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adImageModalCloseText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
  },
  adImageModalContent: {
    width: '90%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adImageFull: {
    width: '100%',
    height: '100%',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1E293B',
    paddingVertical: 12,
  },
  searchClearButton: {
    padding: 4,
  },
  searchClearText: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: '600',
  },
  // Team Management styles
  teamBackButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  teamBackButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  dashboardHeader: {
    backgroundColor: '#1E293B',
    paddingTop: Constants.statusBarHeight + 10,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  dashboardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  dashboardSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
  },
  autoAssignContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  autoAssignToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#CBD5E1',
    padding: 2,
    marginRight: 12,
  },
  toggleSwitchActive: {
    backgroundColor: '#7C3AED',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: {
    transform: [{ translateX: 22 }],
  },
  autoAssignLabel: {
    fontSize: 15,
    color: '#1E293B',
    fontWeight: '500',
  },
  teamTabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
  },
  teamTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  teamTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  teamTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  teamTabTextActive: {
    color: '#7C3AED',
  },
  teamActionsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  teamSearchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  teamSearchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1E293B',
    paddingVertical: 10,
  },
  addButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  teamListContent: {
    padding: 16,
    paddingTop: 0,
  },
  teamMemberCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  teamMemberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamMemberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
  teamMemberStatusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  teamMemberStatusActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  teamMemberStatusInactive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  teamMemberStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  teamMemberStatusTextActive: {
    color: '#16A34A',
  },
  teamMemberStatusTextInactive: {
    color: '#DC2626',
  },
  teamMemberDetail: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
  },
  teamMemberEligible: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  teamMemberEligibleText: {
    fontSize: 13,
    fontWeight: '500',
  },
  teamMemberEligibleYes: {
    color: '#16A34A',
  },
  teamMemberEligibleNo: {
    color: '#94A3B8',
  },
  teamModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    maxHeight: '80%',
    width: '90%',
  },
  teamModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 20,
  },
  teamInputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
    marginTop: 12,
  },
  teamInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1E293B',
  },
  teamCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  teamCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamCheckboxChecked: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  teamCheckboxCheck: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  teamCheckboxLabel: {
    fontSize: 15,
    color: '#475569',
    flex: 1,
  },
  teamModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 24,
    gap: 8,
  },
  teamDeleteButton: {
    backgroundColor: '#DC2626',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginRight: 'auto',
  },
  teamDeleteButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  teamCancelButton: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  teamCancelButtonText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '600',
  },
  teamSaveButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  teamSaveButtonDisabled: {
    opacity: 0.5,
  },
  teamSaveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamManagementButton: {
    backgroundColor: '#7C3AED',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamManagementButtonText: {
    fontSize: 18,
  },
  // New Dashboard Styles
  newDashboardHeader: {
    backgroundColor: '#7C3AED',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  newHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  newUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  newAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  newAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  newUserDetails: {
    flex: 1,
  },
  newUserTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  newUserEmail: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  newHeaderButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  newHeaderButtonText: {
    fontSize: 18,
  },
  newSignOutButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  newSignOutText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  newGreeting: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  newSubGreeting: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 20,
  },
  newHeaderStatsGrid: {
    gap: 12,
  },
  newHeaderStatsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  newHeaderStatCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  newHeaderStatNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  newHeaderStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  newHeaderStatCardLarge: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  newHeaderStatNumberLarge: {
    fontSize: 28,
    fontWeight: '700',
    color: '#7C3AED',
    marginBottom: 4,
  },
  newHeaderStatLabelLarge: {
    fontSize: 12,
    color: '#7C3AED',
    fontWeight: '500',
    opacity: 0.8,
  },
  newDashboardContent: {
    paddingBottom: 24,
    backgroundColor: '#F8FAFC',
  },
  newViewAllButton: {
    backgroundColor: '#7C3AED',
    marginHorizontal: 20,
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  newViewAllText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  performanceSection: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  performanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  performanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    width: '48%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  perfNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  perfLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  quickStatsCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  quickStatsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
  },
  statsLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  statsValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  recentLeadsSection: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  newLeadCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#E5E7EB',
  },
  newLeadCardNew: {
    borderLeftColor: '#3B82F6',
  },
  newLeadCardQualified: {
    borderLeftColor: '#10B981',
  },
  newLeadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  newLeadLeft: {
    flex: 1,
  },
  newLeadName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  newLeadSource: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  newLeadTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  newLeadBadges: {
    gap: 6,
    alignItems: 'flex-end',
  },
  statusBadgeNew: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeNewText: {
    color: '#1D4ED8',
    fontSize: 10,
    fontWeight: '600',
  },
  statusBadgeQualified: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeQualifiedText: {
    color: '#059669',
    fontSize: 10,
    fontWeight: '600',
  },
  newLeadDetails: {
    flexDirection: 'row',
    gap: 16,
  },
  newLeadDetail: {
    fontSize: 12,
    color: '#6B7280',
  },
  // Leads Header Styles
  leadsHeaderContainer: {
    backgroundColor: '#7C3AED',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  leadsSearchContainer: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: 16,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  leadsSearchIcon: {
    fontSize: 18,
    marginRight: 8,
    color: '#FFFFFF',
  },
  leadsSearchInput: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
    padding: 0,
  },
  // Template Modal Styles
  templateModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxHeight: '80%',
  },
  templateModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  templateModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
  },
  templateModalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  templateModalCloseText: {
    fontSize: 20,
    color: '#64748B',
    fontWeight: '600',
  },
  templateList: {
    maxHeight: 500,
  },
  templateItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  templateName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7C3AED',
    marginBottom: 8,
  },
  templatePreview: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
});

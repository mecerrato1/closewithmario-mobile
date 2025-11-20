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
} from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { getUserRole, getUserTeamMemberId, canSeeAllLeads, type UserRole } from './src/lib/roles';

import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { makeRedirectUri } from 'expo-auth-session';

// Required for AuthSession to complete on iOS
WebBrowser.maybeCompleteAuthSession();

// This must match:
// - app.json: "scheme": "closewithmario"
// - Supabase URL config: closewithmario://auth-callback
const redirectTo = makeRedirectUri({
  scheme: 'closewithmario',
  path: 'auth-callback',
});

// ------------ Types ------------
type Lead = {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
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
  platform: string | null;
  campaign_name: string | null;
  subject_address?: string | null;
  preferred_language?: string | null;
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
        },
      });

      if (error) {
        setAuthError(error.message);
        setAuthLoading(false);
        return;
      }

      const authUrl = data?.url;
      if (!authUrl) {
        setAuthError('No auth URL returned from Supabase.');
        setAuthLoading(false);
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);

      if (result.type === 'success') {
        console.log('Google sign-in completed.');
      } else if (result.type === 'cancel') {
        setAuthError('Google sign-in cancelled.');
      } else if (result.type === 'dismiss') {
        setAuthError('Google sign-in dismissed.');
      } else {
        setAuthError('Google sign-in was not completed.');
      }
    } catch (e: any) {
      console.error('Google sign-in error:', e);
      setAuthError(e?.message || 'Unexpected error during Google sign-in.');
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
}: LeadDetailViewProps) {
  const [taskNote, setTaskNote] = useState('');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivityType, setSelectedActivityType] = useState<'call' | 'text' | 'email' | 'note'>('call');
  const [showQuickPhrases, setShowQuickPhrases] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [savingActivity, setSavingActivity] = useState(false);
  
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

  const handleCall = () => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  const handleText = () => {
    if (!phone) return;
    Linking.openURL(`sms:${phone}`);
  };

  const handleEmail = () => {
    if (!email) return;
    const subject = encodeURIComponent('Mortgage follow-up');
    const body = encodeURIComponent(
      `Hi ${fullName || ''},\n\nI wanted to follow up regarding your home financing options.\n\nBest regards,\nMario`
    );
    Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`);
  };

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

          {/* Basic fields */}
          <Text style={styles.sectionTitle}>ℹ️ Basic Info</Text>
          <View style={styles.infoGrid}>
          <Text style={styles.detailField}>Email: {email || 'N/A'}</Text>
          <Text style={styles.detailField}>Phone: {phone || 'N/A'}</Text>

          {!isMeta && (
            <>
              <Text style={styles.detailField}>
                Loan Purpose:{' '}
                {(record as Lead).loan_purpose || 'N/A'}
              </Text>
              <Text style={styles.detailField}>
                Price: {(record as Lead).price ?? 'N/A'}
              </Text>
              <Text style={styles.detailField}>
                Down Payment: {(record as Lead).down_payment ?? 'N/A'}
              </Text>
              <Text style={styles.detailField}>
                Credit Score: {(record as Lead).credit_score ?? 'N/A'}
              </Text>
              <Text style={styles.detailField}>
                Message:{' '}
                {(record as Lead).message || 'N/A'}
              </Text>
            </>
          )}

          {isMeta && (
            <>
              <Text style={styles.detailField}>
                Platform:{' '}
                {(record as MetaLead).platform || 'Meta'}
              </Text>
              <Text style={styles.detailField}>
                Campaign:{' '}
                {(record as MetaLead).campaign_name || 'N/A'}
              </Text>
              <Text style={styles.detailField}>
                Address:{' '}
                {(record as MetaLead).subject_address || 'N/A'}
              </Text>
              <Text style={styles.detailField}>
                Language:{' '}
                {(record as MetaLead).preferred_language || 'N/A'}
              </Text>
              <Text style={styles.detailField}>
                Income Type:{' '}
                {(record as MetaLead).income_type || 'N/A'}
              </Text>
              <Text style={styles.detailField}>
                Purchase Timeline:{' '}
                {(record as MetaLead).purchase_timeline || 'N/A'}
              </Text>
              <Text style={styles.detailField}>
                Price Range:{' '}
                {(record as MetaLead).price_range || 'N/A'}
              </Text>
              <Text style={styles.detailField}>
                Down Payment Saved:{' '}
                {(record as MetaLead).down_payment_saved || 'N/A'}
              </Text>
              <Text style={styles.detailField}>
                Has Realtor:{' '}
                {(record as MetaLead).has_realtor === true
                  ? 'Yes'
                  : (record as MetaLead).has_realtor === false
                  ? 'No'
                  : 'N/A'}
              </Text>
              <Text style={styles.detailField}>
                County Interest:{' '}
                {(record as MetaLead).county_interest || 'N/A'}
              </Text>
              <Text style={styles.detailField}>
                Monthly Income:{' '}
                {(record as MetaLead).monthly_income || 'N/A'}
              </Text>
              <Text style={styles.detailField}>
                Notes:{' '}
                {(record as MetaLead).meta_ad_notes ||
                  (record as MetaLead).additional_notes ||
                  'N/A'}
              </Text>
            </>
          )}
          </View>

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
                    <Text style={styles.activityHistoryType}>
                      {getActivityIcon(activity.activity_type)} {getActivityLabel(activity.activity_type)}
                    </Text>
                    <Text style={styles.activityHistoryTimestamp}>
                      {new Date(activity.created_at).toLocaleString()}
                    </Text>
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
  const [activeTab, setActiveTab] = useState<'leads' | 'meta'>('meta');
  const [showDashboard, setShowDashboard] = useState(true);

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
        const userRole = await getUserRole(session.user.id, session.user.email);
        console.log('User role:', userRole);

        // Build queries
        let leadsQuery = supabase
          .from('leads')
          .select(
            'id, created_at, first_name, last_name, email, phone, status, loan_purpose, price, down_payment, credit_score, message, lo_id, realtor_id'
          )
          .order('created_at', { ascending: false })
          .limit(50);

        let metaQuery = supabase
          .from('meta_ads')
          .select(
            'id, created_at, first_name, last_name, email, phone, status, platform, campaign_name, subject_address, preferred_language, income_type, purchase_timeline, price_range, down_payment_saved, has_realtor, additional_notes, county_interest, monthly_income, meta_ad_notes, lo_id, realtor_id'
          )
          .order('created_at', { ascending: false })
          .limit(50);

        // Apply filters based on role
        if (!canSeeAllLeads(userRole)) {
          // LOs and Realtors only see their assigned leads
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

  // Auto-switch to leads tab if no meta leads
  useEffect(() => {
    if (!loading && metaLeads.length === 0 && leads.length > 0) {
      setActiveTab('leads');
    }
  }, [loading, leads.length, metaLeads.length]);

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

  const renderLeadItem = ({ item }: { item: Lead }) => {
    const fullName =
      [item.first_name, item.last_name].filter(Boolean).join(' ') ||
      '(No name)';
    const status = item.status || 'new';
    const statusDisplay = formatStatus(status);
    const statusColors = STATUS_COLOR_MAP[status] || STATUS_COLOR_MAP['new'];
    const emailOrPhone = item.email || item.phone || 'No contact info';

    return (
      <TouchableOpacity
        style={styles.leadCard}
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
        <View style={[
          styles.statusBadge,
          { backgroundColor: statusColors.bg, borderColor: statusColors.border }
        ]}>
          <Text style={[styles.statusBadgeText, { color: statusColors.text }]}>
            {statusDisplay}
          </Text>
        </View>
        <View style={styles.leadContactRow}>
          <Text style={styles.leadContactIcon}>📧</Text>
          <Text style={styles.leadContact} numberOfLines={1}>{emailOrPhone}</Text>
        </View>
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
        style={styles.leadCard}
        onPress={() =>
          setSelectedLead({ source: 'meta', id: item.id })
        }
        activeOpacity={0.7}
      >
        <View style={styles.leadHeader}>
          <Text style={styles.leadName}>{fullName}</Text>
          {getPlatformBadge(platform)}
        </View>
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
        <View style={styles.leadContactRow}>
          <Text style={styles.leadContactIcon}>📧</Text>
          <Text style={styles.leadContact} numberOfLines={1}>{emailOrPhone}</Text>
        </View>
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
      />
    );
  }

  // Dashboard View
  if (showDashboard) {
    const totalLeads = leads.length + metaLeads.length;
    const newLeads = [...leads, ...metaLeads].filter(l => l.status === 'new').length;
    const qualifiedLeads = [...leads, ...metaLeads].filter(l => l.status === 'qualified').length;
    const closedLeads = [...leads, ...metaLeads].filter(l => l.status === 'closed').length;
    
    // Get recent leads (last 5)
    const allLeads = [...metaLeads.map(l => ({ ...l, source: 'meta' as const })), ...leads.map(l => ({ ...l, source: 'lead' as const }))];
    const recentLeads = allLeads
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    return (
      <View style={styles.container}>
        {/* Dashboard Header */}
        <View style={styles.headerContainer}>
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.headerTitle}>Dashboard</Text>
              <Text style={styles.headerSubtitle}>Lead Overview</Text>
            </View>
            <TouchableOpacity onPress={onSignOut} style={styles.signOutButton}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView 
          contentContainerStyle={styles.dashboardContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Stats Grid */}
          <View style={styles.dashboardStatsGrid}>
            <View style={styles.dashboardStatCard}>
              <Text style={styles.dashboardStatNumber}>{totalLeads}</Text>
              <Text style={styles.dashboardStatLabel}>Total Leads</Text>
            </View>
            <View style={styles.dashboardStatCard}>
              <Text style={styles.dashboardStatNumber}>{newLeads}</Text>
              <Text style={styles.dashboardStatLabel}>New</Text>
            </View>
            <View style={styles.dashboardStatCard}>
              <Text style={styles.dashboardStatNumber}>{qualifiedLeads}</Text>
              <Text style={styles.dashboardStatLabel}>Qualified</Text>
            </View>
            <View style={styles.dashboardStatCard}>
              <Text style={styles.dashboardStatNumber}>{closedLeads}</Text>
              <Text style={styles.dashboardStatLabel}>Closed</Text>
            </View>
          </View>

          {/* View All Leads Button */}
          <TouchableOpacity
            style={styles.dashboardViewAllButton}
            onPress={() => setShowDashboard(false)}
          >
            <Text style={styles.dashboardViewAllText}>View All Leads</Text>
          </TouchableOpacity>

          {/* Quick Guide Card */}
          <View style={styles.dashboardCard}>
            <Text style={styles.dashboardCardTitle}>📋 How to Disposition Leads</Text>
            <View style={styles.dashboardGuideStep}>
              <Text style={styles.dashboardGuideNumber}>1</Text>
              <Text style={styles.dashboardGuideText}>Tap on any lead to view details</Text>
            </View>
            <View style={styles.dashboardGuideStep}>
              <Text style={styles.dashboardGuideNumber}>2</Text>
              <Text style={styles.dashboardGuideText}>Review contact info and lead source</Text>
            </View>
            <View style={styles.dashboardGuideStep}>
              <Text style={styles.dashboardGuideNumber}>3</Text>
              <Text style={styles.dashboardGuideText}>Select a status: New → Contacted → Qualified → Closed</Text>
            </View>
            <View style={styles.dashboardGuideStep}>
              <Text style={styles.dashboardGuideNumber}>4</Text>
              <Text style={styles.dashboardGuideText}>Log activities (calls, texts, emails, notes)</Text>
            </View>
          </View>

          {/* Recent Activity */}
          <View style={styles.dashboardCard}>
            <Text style={styles.dashboardCardTitle}>🕒 Recent Leads</Text>
            {recentLeads.length > 0 ? (
              recentLeads.map((lead) => {
                const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || '(No name)';
                const timeAgo = getTimeAgo(new Date(lead.created_at));
                return (
                  <TouchableOpacity
                    key={`${lead.source}-${lead.id}`}
                    style={styles.dashboardRecentItem}
                    onPress={() => {
                      setShowDashboard(false);
                      setSelectedLead({ source: lead.source, id: lead.id });
                    }}
                  >
                    <View style={styles.dashboardRecentInfo}>
                      <Text style={styles.dashboardRecentName}>{fullName}</Text>
                      <Text style={styles.dashboardRecentTime}>{timeAgo}</Text>
                    </View>
                    <Text style={styles.dashboardRecentArrow}>›</Text>
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
        .select('id, created_at, first_name, last_name, email, phone, status, loan_purpose, price, down_payment, credit_score, message, lo_id, realtor_id')
        .order('created_at', { ascending: false })
        .limit(50);

      let metaQuery = supabase
        .from('meta_ads')
        .select('id, created_at, first_name, last_name, email, phone, status, platform, campaign_name, subject_address, preferred_language, income_type, purchase_timeline, price_range, down_payment_saved, has_realtor, additional_notes, county_interest, monthly_income, meta_ad_notes, lo_id, realtor_id')
        .order('created_at', { ascending: false })
        .limit(50);

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
      {/* Modern Header */}
      <View style={styles.headerContainer}>
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
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{metaLeads.length}</Text>
          <Text style={styles.statLabel}>Meta Ads</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{leads.length}</Text>
          <Text style={styles.statLabel}>Organic</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{metaLeads.length + leads.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
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
          {/* Tab Bar */}
          <View style={styles.tabBar}>
            {hasMetaLeads && (
              <TouchableOpacity
                style={[
                  styles.tab,
                  activeTab === 'meta' && styles.tabActive,
                ]}
                onPress={() => setActiveTab('meta')}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === 'meta' && styles.tabTextActive,
                  ]}
                >
                  Meta Ads ({metaLeads.length})
                </Text>
              </TouchableOpacity>
            )}
            {hasLeads && (
              <TouchableOpacity
                style={[
                  styles.tab,
                  activeTab === 'leads' && styles.tabActive,
                ]}
                onPress={() => setActiveTab('leads')}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === 'leads' && styles.tabTextActive,
                  ]}
                >
                  Organic ({leads.length})
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Tab Content */}
          {activeTab === 'leads' && hasLeads && (
            <FlatList
              data={leads}
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
              data={metaLeads}
              keyExtractor={(item) => item.id}
              renderItem={renderMetaLeadItem}
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
  homeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  homeButtonText: {
    fontSize: 15,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderTopWidth: 3,
    borderTopColor: '#10B981',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#10B981',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 4,
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
    letterSpacing: 0.2,
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
    alignItems: 'center',
    marginBottom: 8,
  },
  activityHistoryType: {
    fontSize: 14,
    color: '#007aff',
    fontWeight: '600',
  },
  activityHistoryTimestamp: {
    fontSize: 12,
    color: '#888',
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
});

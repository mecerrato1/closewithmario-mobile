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
} from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';

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

// Helper to format status for display using the map
const formatStatus = (status: string): string => {
  return STATUS_DISPLAY_MAP[status] || status;
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
      <View style={styles.logoContainer}>
        <Image
          source={require('./assets/CWMLogo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <Text style={styles.title}>CloseWithMario Mobile</Text>
      <Text style={styles.subtitle}>
        {mode === 'signIn' ? 'Sign in to continue' : 'Create an account'}
      </Text>

      <View style={styles.formContainer}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#999"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#999"
          secureTextEntry
          autoCapitalize="none"
          value={password}
          onChangeText={setPassword}
        />

        {authError && <Text style={styles.errorText}>{authError}</Text>}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleEmailPasswordAuth}
          disabled={authLoading}
        >
          <Text style={styles.primaryButtonText}>
            {authLoading
              ? 'Please wait...'
              : mode === 'signIn'
              ? 'Sign In'
              : 'Sign Up'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() =>
            setMode(mode === 'signIn' ? 'signUp' : 'signIn')
          }
        >
          <Text style={styles.switchModeText}>
            {mode === 'signIn'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </Text>
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleGoogleSignIn}
          disabled={authLoading}
        >
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </TouchableOpacity>

        <Text style={styles.googleHint}>
          Google login requires a dev / standalone build (not Expo Go).
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

// ------------ Lead Detail View ------------
type LeadDetailViewProps = {
  selected: SelectedLeadRef;
  leads: Lead[];
  metaLeads: MetaLead[];
  onBack: () => void;
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
  const record = isMeta
    ? metaLeads.find((m) => m.id === selected.id)
    : leads.find((l) => l.id === selected.id);

  if (!record) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.signOutText}>{'< Leads'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Lead not found</Text>
          <View style={{ width: 60 }} />
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
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.signOutText}>{'< Leads'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Lead Details</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.detailCard}>
          <Text style={styles.detailName}>{fullName}</Text>
          <Text style={styles.detailMeta}>
            Source: {isMeta ? 'Meta Ad' : 'Website / CTA'}
          </Text>
          <Text style={styles.detailMeta}>
            Created: {new Date(record.created_at).toLocaleString()}
          </Text>

          {/* Status buttons */}
          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
            Status: {status ? formatStatus(status) : 'N/A'}
          </Text>
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

          {/* Contact buttons */}
          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
            Contact
          </Text>
          <View style={styles.contactRow}>
            <TouchableOpacity
              style={[
                styles.contactButton,
                !phone && styles.contactButtonDisabled,
              ]}
              onPress={handleCall}
              disabled={!phone}
            >
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
              <Text style={styles.contactButtonText}>Email</Text>
            </TouchableOpacity>
          </View>

          {/* Basic fields */}
          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
            Basic Info
          </Text>
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

          {/* Tasks / Logging Section */}
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
            Log Activity
          </Text>
          
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

          {/* Activity History */}
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
            Activity History
          </Text>

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [selectedLead, setSelectedLead] = useState<SelectedLeadRef | null>(
    null
  );
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<'leads' | 'meta'>('meta');

  useEffect(() => {
    const init = async () => {
      try {
        const { data: leadsData, error: leadsError } = await supabase
          .from('leads')
          .select(
            'id, created_at, first_name, last_name, email, phone, status, loan_purpose, price, down_payment, credit_score, message'
          )
          .order('created_at', { ascending: false })
          .limit(50);

        if (leadsError) {
          console.error('Supabase leads error:', leadsError);
        }

        const { data: metaData, error: metaError } = await supabase
          .from('meta_ads')
          .select(
            'id, created_at, first_name, last_name, email, phone, status, platform, campaign_name, subject_address, preferred_language, income_type, purchase_timeline, price_range, down_payment_saved, has_realtor, additional_notes, county_interest, monthly_income, meta_ad_notes'
          )
          .order('created_at', { ascending: false })
          .limit(50);

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
  }, []);

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
    const status = item.status ? formatStatus(item.status) : 'No status';
    const emailOrPhone = item.email || item.phone || 'No contact info';

    return (
      <TouchableOpacity
        style={styles.leadCard}
        onPress={() =>
          setSelectedLead({ source: 'lead', id: item.id })
        }
      >
        <Text style={styles.leadName}>{fullName}</Text>
        <Text style={styles.leadStatus}>{status}</Text>
        <Text style={styles.leadContact}>📧 {emailOrPhone}</Text>
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

    // Get platform icon component
    const getPlatformIcon = (platform: string) => {
      const platformLower = platform.toLowerCase();
      
      // Check for Facebook (fb, facebook, etc.)
      if (platformLower.includes('facebook') || platformLower.includes('fb')) {
        return (
          <Image
            source={require('./assets/fb.png')}
            style={styles.platformIcon}
            resizeMode="contain"
          />
        );
      }
      
      // Check for Instagram (ig, instagram, etc.)
      if (platformLower.includes('instagram') || platformLower.includes('ig')) {
        return (
          <Image
            source={require('./assets/IG.png')}
            style={styles.platformIcon}
            resizeMode="contain"
          />
        );
      }
      
      if (platformLower.includes('messenger')) {
        return <Text style={styles.platformEmoji}>💬</Text>;
      }
      if (platformLower.includes('whatsapp')) {
        return <Text style={styles.platformEmoji}>💚</Text>;
      }
      
      // Default to Facebook icon if platform is not recognized
      return (
        <Image
          source={require('./assets/fb.png')}
          style={styles.platformIcon}
          resizeMode="contain"
        />
      );
    };

    return (
      <TouchableOpacity
        style={styles.leadCard}
        onPress={() =>
          setSelectedLead({ source: 'meta', id: item.id })
        }
      >
        <View style={styles.leadHeader}>
          <Text style={styles.leadName}>{fullName}</Text>
          {getPlatformIcon(platform)}
        </View>
        <Text style={styles.leadStatus}>{status}</Text>
        {campaign ? (
          <Text style={styles.leadCampaign}>📢 {campaign}</Text>
        ) : null}
        <Text style={styles.leadContact}>📧 {emailOrPhone}</Text>
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
        onStatusChange={handleStatusChange}
        session={session}
      />
    );
  }

  const hasLeads = leads.length > 0;
  const hasMetaLeads = metaLeads.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>CloseWithMario Mobile</Text>
        <TouchableOpacity onPress={onSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.debugText}>
        {debugInfo}
        {statusUpdating ? ' · Updating status…' : ''}
      </Text>

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
            />
          )}

          {activeTab === 'meta' && hasMetaLeads && (
            <FlatList
              data={metaLeads}
              keyExtractor={(item) => item.id}
              renderItem={renderMetaLeadItem}
              contentContainerStyle={styles.listContent}
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
    backgroundColor: '#f8f9fa',
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 120,
    height: 120,
  },
  formContainer: {
    width: '100%',
    marginTop: 8,
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
  signOutText: {
    fontSize: 14,
    color: '#007aff',
  },
  debugText: {
    fontSize: 12,
    textAlign: 'center',
    color: '#888',
    marginBottom: 12,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  listContent: {
    paddingBottom: 24,
  },
  leadCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 0,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  leadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  leadName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
  },
  platformIcon: {
    width: 28,
    height: 28,
  },
  platformEmoji: {
    fontSize: 24,
  },
  leadStatus: {
    fontSize: 13,
    marginTop: 2,
    color: '#666',
    fontWeight: '500',
  },
  leadCampaign: {
    fontSize: 13,
    marginTop: 4,
    color: '#007aff',
    fontWeight: '500',
  },
  leadContact: {
    fontSize: 14,
    marginTop: 6,
    color: '#333',
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
  detailCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fafafa',
  },
  detailName: {
    fontSize: 20,
    fontWeight: '700',
  },
  detailMeta: {
    fontSize: 13,
    color: '#777',
    marginTop: 4,
  },
  detailField: {
    fontSize: 14,
    marginTop: 6,
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
    backgroundColor: '#007aff',
    borderColor: '#007aff',
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
    gap: 8,
  },
  contactButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#007aff',
    alignItems: 'center',
  },
  contactButtonDisabled: {
    backgroundColor: '#ccc',
  },
  contactButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: '#007aff',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#fff',
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
    borderRadius: 8,
    backgroundColor: '#e8e8e8',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  activityTypeButtonActive: {
    backgroundColor: '#007aff',
    borderColor: '#007aff',
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
    backgroundColor: '#007aff',
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  logActivityButtonDisabled: {
    backgroundColor: '#ccc',
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

// src/screens/AuthenticatedRoot.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Session } from '@supabase/supabase-js';
import BottomTabs, { TabKey } from '../components/navigation/BottomTabs';
import QuickCaptureTab from '../features/quickCapture/QuickCaptureTab';
import RealtorsTabScreen from './tabs/RealtorsTabScreen';
import LoanOfficersTabScreen from './tabs/LoanOfficersTabScreen';
import CalculatorTabScreen from './tabs/CalculatorTabScreen';
import MessagesTabScreen from './tabs/MessagesTabScreen';
import { getUserRole, type UserRole } from '../lib/roles';
import { ACCOUNT_LOOKUP_ERROR_MESSAGE } from '../features/session/lookup';
import { useSuperAdminMode } from '../features/session/useSuperAdminMode';

interface AuthenticatedRootProps {
  session: Session;
  onSignOut: () => void;
  notificationLead?: { id: string; source: 'lead' | 'meta'; openTab?: 'messages' | 'dm' } | null;
  onNotificationHandled?: () => void;
  LeadsScreenComponent: React.ComponentType<{
    onSignOut: () => void;
    session: Session | null;
    notificationLead?: { id: string; source: 'lead' | 'meta'; openTab?: 'messages' | 'dm' } | null;
    onNotificationHandled?: () => void;
    defaultToMyLeads?: boolean;
    leadsTabPresses?: number;
    skipDashboard?: boolean;
    onNavigateToCapture?: (captureId: string) => void;
  }>;
}

// State for navigating to a specific lead from other tabs
type PendingLeadNavigation = { id: string; source: 'lead' | 'meta' } | null;
// State for navigating to a specific quick capture from other tabs
type PendingCaptureNavigation = string | null;

export default function AuthenticatedRoot({
  session,
  onSignOut,
  notificationLead,
  onNotificationHandled,
  LeadsScreenComponent,
}: AuthenticatedRootProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('leads');
  const [pendingLeadNav, setPendingLeadNav] = useState<PendingLeadNavigation>(null);
  const [pendingCaptureId, setPendingCaptureId] = useState<PendingCaptureNavigation>(null);
  const [hasClickedLeadsTab, setHasClickedLeadsTab] = useState(false);
  const [leadsTabPresses, setLeadsTabPresses] = useState(0);
  // Stays null until the server has confirmed it for this account. A failed
  // lookup is never turned into a default role; private content waits.
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [roleFailed, setRoleFailed] = useState(false);
  const [roleAttempt, setRoleAttempt] = useState(0);
  const superAdminMode = useSuperAdminMode(session?.user?.email);

  useEffect(() => {
    // Reset first so nothing from a previous account can render for this one.
    setUserRole(null);
    setRoleFailed(false);

    const userId = session?.user?.id;
    const email = session?.user?.email;
    if (!userId || !email) {
      setRoleFailed(true);
      return;
    }

    const controller = new AbortController();
    getUserRole(userId, email)
      .then((role) => {
        if (!controller.signal.aborted) setUserRole(role);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRoleFailed(true);
      });

    return () => controller.abort();
  }, [session?.user?.id, session?.user?.email, roleAttempt]);

  useEffect(() => {
    if (notificationLead) {
      setActiveTab('leads');
    }
  }, [notificationLead]);

  if (userRole === null) {
    return (
      <View style={styles.gate}>
        {roleFailed ? (
          <>
            <Text style={styles.gateTitle}>Couldn't load your workspace</Text>
            <Text style={styles.gateBody}>{ACCOUNT_LOOKUP_ERROR_MESSAGE}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.gatePrimary}
              onPress={() => setRoleAttempt((attempt) => attempt + 1)}
            >
              <Text style={styles.gatePrimaryText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={styles.gateSecondary} onPress={onSignOut}>
              <Text style={styles.gateSecondaryText}>Sign out</Text>
            </TouchableOpacity>
          </>
        ) : (
          <ActivityIndicator accessibilityLabel="Loading your workspace" />
        )}
      </View>
    );
  }

  const effectiveRole: UserRole = superAdminMode ? 'super_admin' : userRole;

  const handleTabChange = (tab: TabKey) => {
    if (tab === 'leads') {
      setHasClickedLeadsTab(true);
      setLeadsTabPresses((count) => count + 1);
    }
    setActiveTab(tab);
  };

  // Navigate to dashboard (resets hasClickedLeadsTab so dashboard shows)
  const handleNavigateToDashboard = () => {
    setHasClickedLeadsTab(false);
    setActiveTab('leads');
  };

  // Handle navigation to a specific lead from other tabs
  const handleNavigateToLead = (leadId: string, source: 'lead' | 'meta' = 'lead') => {
    setPendingLeadNav({ id: leadId, source });
    setActiveTab('leads');
  };

  // Handle navigation to a specific quick capture from other tabs
  const handleNavigateToCapture = (captureId: string) => {
    setPendingCaptureId(captureId);
    setActiveTab('captures');
  };

  // Clear pending navigation after it's been handled
  const handlePendingLeadHandled = () => {
    setPendingLeadNav(null);
  };

  const handlePendingCaptureHandled = () => {
    setPendingCaptureId(null);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'leads':
        // Combine notification lead with pending lead navigation from other tabs
        const effectiveNotificationLead = pendingLeadNav || notificationLead;
        const effectiveHandler = pendingLeadNav 
          ? handlePendingLeadHandled 
          : onNotificationHandled;
        return (
          <LeadsScreenComponent
            onSignOut={onSignOut}
            session={session}
            notificationLead={effectiveNotificationLead}
            onNotificationHandled={effectiveHandler}
            defaultToMyLeads={false}
            skipDashboard={hasClickedLeadsTab}
            leadsTabPresses={leadsTabPresses}
            onNavigateToCapture={handleNavigateToCapture}
          />
        );
      case 'captures':
        return (
          <QuickCaptureTab
            userId={session?.user?.id || ''}
            onBack={handleNavigateToDashboard}
            onNavigateToLead={handleNavigateToLead}
            initialCaptureId={pendingCaptureId}
            onInitialCaptureHandled={handlePendingCaptureHandled}
          />
        );
      case 'realtors':
        return (
          <RealtorsTabScreen 
            session={session} 
            onClose={handleNavigateToDashboard} 
            onNavigateToLead={handleNavigateToLead}
            userRole={effectiveRole}
          />
        );
      case 'loan_officers':
        return (
          <LoanOfficersTabScreen
            session={session}
            onClose={handleNavigateToDashboard}
          />
        );
      case 'calculator':
        return <CalculatorTabScreen onNavigateToLeads={handleNavigateToDashboard} />;
      case 'messages':
        return (
          <MessagesTabScreen
            session={session}
            userRole={effectiveRole}
            onNavigateToLead={handleNavigateToLead}
          />
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>{renderContent()}</View>
      <BottomTabs activeTab={activeTab} onTabChange={handleTabChange} userRole={effectiveRole} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  gateTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  gateBody: { fontSize: 14, color: '#475569', textAlign: 'center' },
  gatePrimary: {
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 22,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gatePrimaryText: { color: '#FFFFFF', fontWeight: '700' },
  gateSecondary: { minHeight: 44, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  gateSecondaryText: { color: '#475569', fontWeight: '600' },
});

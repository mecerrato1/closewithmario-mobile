// src/screens/AuthenticatedRoot.tsx
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Session } from '@supabase/supabase-js';
import BottomTabs, { TabKey } from '../components/navigation/BottomTabs';
import QuickCaptureTab from '../features/quickCapture/QuickCaptureTab';
import RealtorsTabScreen from './tabs/RealtorsTabScreen';
import CalculatorTabScreen from './tabs/CalculatorTabScreen';

interface AuthenticatedRootProps {
  session: Session;
  onSignOut: () => void;
  notificationLead?: { id: string; source: 'lead' | 'meta'; openToMessages?: boolean } | null;
  onNotificationHandled?: () => void;
  LeadsScreenComponent: React.ComponentType<{
    onSignOut: () => void;
    session: Session | null;
    notificationLead?: { id: string; source: 'lead' | 'meta'; openToMessages?: boolean } | null;
    onNotificationHandled?: () => void;
    defaultToMyLeads?: boolean;
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

  const handleTabChange = (tab: TabKey) => {
    if (tab === 'leads') {
      setHasClickedLeadsTab(true);
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
            defaultToMyLeads={true}
            skipDashboard={hasClickedLeadsTab}
            onNavigateToCapture={handleNavigateToCapture}
          />
        );
      case 'captures':
        return (
          <QuickCaptureTab
            userId={session?.user?.id || ''}
            onBack={handleNavigateToDashboard}
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
          />
        );
      case 'calculator':
        return <CalculatorTabScreen onNavigateToLeads={handleNavigateToDashboard} />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>{renderContent()}</View>
      <BottomTabs activeTab={activeTab} onTabChange={handleTabChange} />
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
});

// src/screens/AuthenticatedRoot.tsx
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Session } from '@supabase/supabase-js';
import BottomTabs, { TabKey } from '../components/navigation/BottomTabs';
import ScenariosTabScreen from './tabs/ScenariosTabScreen';
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
  }>;
}

// State for navigating to a specific lead from other tabs
type PendingLeadNavigation = { id: string; source: 'lead' | 'meta' } | null;

export default function AuthenticatedRoot({
  session,
  onSignOut,
  notificationLead,
  onNotificationHandled,
  LeadsScreenComponent,
}: AuthenticatedRootProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('leads');
  const [pendingLeadNav, setPendingLeadNav] = useState<PendingLeadNavigation>(null);
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

  // Clear pending navigation after it's been handled
  const handlePendingLeadHandled = () => {
    setPendingLeadNav(null);
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
          />
        );
      case 'scenarios':
        return <ScenariosTabScreen onClose={handleNavigateToDashboard} />;
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

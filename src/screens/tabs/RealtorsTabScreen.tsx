// src/screens/tabs/RealtorsTabScreen.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Session } from '@supabase/supabase-js';
import RealtorsListScreen from '../realtors/RealtorsListScreen';
import RealtorDetailScreen from '../realtors/RealtorDetailScreen';
import AddRealtorScreen from '../realtors/AddRealtorScreen';
import { AssignedRealtor } from '../../lib/types/realtors';
import { supabase } from '../../lib/supabase';
import { getUserTeamMemberId } from '../../lib/roles';

type ScreenState =
  | { screen: 'list' }
  | { screen: 'detail'; realtor: AssignedRealtor }
  | { screen: 'add' };

interface RealtorsTabScreenProps {
  session?: Session | null;
  onClose?: () => void;
  onNavigateToLead?: (leadId: string, source: 'lead' | 'meta') => void;
}

export default function RealtorsTabScreen({ session, onClose, onNavigateToLead }: RealtorsTabScreenProps) {
  const [screenState, setScreenState] = useState<ScreenState>({ screen: 'list' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentLOInfo, setCurrentLOInfo] = useState<{ firstName: string; lastName: string; phone: string; email: string } | null>(null);

  const userId = session?.user?.id;

  // Fetch LO info for templates (same approach as LeadDetailScreen)
  useEffect(() => {
    const fetchLOInfo = async () => {
      if (!userId || !session?.user?.email) return;
      
      try {
        // Hardcoded super admin contacts (same as LeadDetailScreen)
        const superAdminContacts: Record<string, { firstName: string; lastName: string; phone: string; email: string }> = {
          'mcerrato@loandepot.com': { firstName: 'Mario', lastName: 'Cerrato', phone: '3052192788', email: 'mcerrato@loandepot.com' },
        };
        
        const emailLower = session.user.email.toLowerCase();
        
        // Check if this is a super admin with hardcoded contact info
        if (superAdminContacts[emailLower]) {
          setCurrentLOInfo(superAdminContacts[emailLower]);
          return;
        }
        
        // First try to get by user_id (for regular loan officers)
        let memberId = await getUserTeamMemberId(userId, 'loan_officer');
        
        // If no member ID found, try to find by email
        if (!memberId) {
          const { data: loByEmail } = await supabase
            .from('loan_officers')
            .select('id')
            .eq('email', emailLower)
            .eq('active', true)
            .maybeSingle();
          
          memberId = loByEmail?.id || null;
        }
        
        if (memberId) {
          const { data, error } = await supabase
            .from('loan_officers')
            .select('first_name, last_name, phone, email')
            .eq('id', memberId)
            .single();
          
          if (data && !error) {
            setCurrentLOInfo({
              firstName: data.first_name || '',
              lastName: data.last_name || '',
              phone: data.phone || '',
              email: data.email || '',
            });
          }
        }
      } catch (err) {
        console.error('Error fetching LO info:', err);
      }
    };
    
    fetchLOInfo();
  }, [userId, session?.user?.email]);

  const handleRealtorPress = useCallback((realtor: AssignedRealtor) => {
    setScreenState({ screen: 'detail', realtor });
  }, []);

  const handleAddPress = useCallback(() => {
    setScreenState({ screen: 'add' });
  }, []);

  const handleBack = useCallback(() => {
    setScreenState({ screen: 'list' });
  }, []);

  const handleUpdate = useCallback(() => {
    // Trigger refresh of the list when returning
    setRefreshKey((k) => k + 1);
  }, []);

  const handleAddSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setScreenState({ screen: 'list' });
  }, []);

  if (screenState.screen === 'detail' && userId) {
    return (
      <RealtorDetailScreen
        realtor={screenState.realtor}
        userId={userId}
        onBack={handleBack}
        onUpdate={handleUpdate}
        onLeadSelect={onNavigateToLead}
        currentLOInfo={currentLOInfo}
      />
    );
  }

  if (screenState.screen === 'add' && userId) {
    return (
      <AddRealtorScreen
        userId={userId}
        onBack={handleBack}
        onSuccess={handleAddSuccess}
      />
    );
  }

  return (
    <View style={styles.container} key={refreshKey}>
      <RealtorsListScreen
        userId={userId}
        onRealtorPress={handleRealtorPress}
        onAddPress={handleAddPress}
        onClose={onClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

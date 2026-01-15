// src/screens/tabs/RealtorsTabScreen.tsx
import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Session } from '@supabase/supabase-js';
import RealtorsListScreen from '../realtors/RealtorsListScreen';
import RealtorDetailScreen from '../realtors/RealtorDetailScreen';
import AddRealtorScreen from '../realtors/AddRealtorScreen';
import { AssignedRealtor } from '../../lib/types/realtors';

type ScreenState =
  | { screen: 'list' }
  | { screen: 'detail'; realtor: AssignedRealtor }
  | { screen: 'add' };

interface RealtorsTabScreenProps {
  session?: Session | null;
  onClose?: () => void;
  onNavigateToLead?: (leadId: string) => void;
}

export default function RealtorsTabScreen({ session, onClose, onNavigateToLead }: RealtorsTabScreenProps) {
  const [screenState, setScreenState] = useState<ScreenState>({ screen: 'list' });
  const [refreshKey, setRefreshKey] = useState(0);

  const userId = session?.user?.id;

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

// src/features/quickCapture/QuickCaptureTab.tsx
// Container that manages navigation between Quick Capture screens
// Follows the same pattern as RealtorsTabScreen

import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import QuickCapturesListScreen from './screens/QuickCapturesListScreen';
import AddQuickCaptureScreen from './screens/AddQuickCaptureScreen';
import QuickCaptureDetailScreen from './screens/QuickCaptureDetailScreen';
import type { QuickCapture } from './types';

type ScreenState =
  | { screen: 'list' }
  | { screen: 'add' }
  | { screen: 'detail'; captureId: string };

interface QuickCaptureTabProps {
  userId: string;
  onBack: () => void;
  onRealtorPress?: (realtorId: string) => void;
  startOnAdd?: boolean;
  initialCaptureId?: string | null;
  onInitialCaptureHandled?: () => void;
}

export default function QuickCaptureTab({
  userId,
  onBack,
  onRealtorPress,
  startOnAdd = false,
  initialCaptureId,
  onInitialCaptureHandled,
}: QuickCaptureTabProps) {
  const [screenState, setScreenState] = useState<ScreenState>(
    startOnAdd ? { screen: 'add' } : { screen: 'list' }
  );
  const [refreshKey, setRefreshKey] = useState(0);

  // Handle cross-tab navigation to a specific capture
  React.useEffect(() => {
    if (initialCaptureId) {
      setScreenState({ screen: 'detail', captureId: initialCaptureId });
      onInitialCaptureHandled?.();
    }
  }, [initialCaptureId]);

  const handleCapturePress = useCallback((capture: QuickCapture) => {
    setScreenState({ screen: 'detail', captureId: capture.id });
  }, []);

  const handleAddPress = useCallback(() => {
    setScreenState({ screen: 'add' });
  }, []);

  const handleBack = useCallback(() => {
    setScreenState({ screen: 'list' });
  }, []);

  const handleUpdate = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleAddSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setScreenState({ screen: 'list' });
  }, []);

  if (screenState.screen === 'add') {
    return (
      <AddQuickCaptureScreen
        userId={userId}
        onBack={handleBack}
        onSuccess={handleAddSuccess}
      />
    );
  }

  if (screenState.screen === 'detail') {
    return (
      <QuickCaptureDetailScreen
        captureId={screenState.captureId}
        userId={userId}
        onBack={handleBack}
        onUpdate={handleUpdate}
        onRealtorPress={onRealtorPress}
      />
    );
  }

  return (
    <View style={styles.container} key={refreshKey}>
      <QuickCapturesListScreen
        onCapturePress={handleCapturePress}
        onAddPress={handleAddPress}
        onBack={onBack}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

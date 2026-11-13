// src/screens/tabs/MyLeadsTabScreen.tsx
// This is a thin wrapper that will receive the LeadsScreen content from AuthenticatedRoot
// The actual LeadsScreen component stays in App.tsx for now to minimize refactoring risk

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { themedStyles } from '../../brand/themedStyles';

interface MyLeadsTabScreenProps {
  children: React.ReactNode;
}

export default function MyLeadsTabScreen({ children }: MyLeadsTabScreenProps) {
  return <View style={styles.container}>{children}</View>;
}

const styles = themedStyles({
  container: {
    flex: 1,
  },
});

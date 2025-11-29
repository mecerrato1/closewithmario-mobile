// src/screens/LockScreen.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppLock } from '../contexts/AppLockContext';

type LockScreenProps = {
  appName?: string;
};

const LockScreen: React.FC<LockScreenProps> = ({ appName = 'Close With Mario' }) => {
  const { requireUnlock } = useAppLock();

  const onUnlockPress = async () => {
    await requireUnlock();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logoText}>{appName}</Text>
      <Text style={styles.title}>App Locked</Text>
      <Text style={styles.subtitle}>Use Face ID or Touch ID to continue</Text>

      <TouchableOpacity style={styles.button} onPress={onUnlockPress}>
        <Text style={styles.buttonText}>Unlock with Face ID</Text>
      </TouchableOpacity>
    </View>
  );
};

export default LockScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3b1154', // your purple base, tweak as needed
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#e5e5e5',
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#00c389', // your green accent, tweak if needed
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
  },
  buttonText: {
    color: '#1b0430',
    fontWeight: '600',
    fontSize: 16,
  },
});

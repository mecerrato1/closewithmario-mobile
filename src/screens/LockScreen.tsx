// src/screens/LockScreen.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
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
      <Image 
        source={require('../../assets/CWMLogo.png')} 
        style={styles.logo}
        resizeMode="contain"
      />
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
    backgroundColor: '#E8DFF5', // matches AuthScreen background
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    width: 200,
    height: 80,
    marginBottom: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.5,
  },
});

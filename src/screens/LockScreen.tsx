// src/screens/LockScreen.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppLock } from '../contexts/AppLockContext';
import BrandLogo from '../brand/BrandLogo';
import { PUBLIC_BRAND } from '../brand/brands';

// Shown before the account's brand is known, so it always uses the public identity.
const brand = PUBLIC_BRAND;

const LockScreen: React.FC = () => {
  const { requireUnlock } = useAppLock();

  const onUnlockPress = async () => {
    await requireUnlock();
  };

  return (
    <View style={styles.container}>
      <View style={styles.logo}>
        <BrandLogo brand={brand} />
      </View>
      <Text style={styles.title}>App Locked</Text>
      <Text style={styles.subtitle}>Use biometrics to continue</Text>

      <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={onUnlockPress}>
        <Text style={styles.buttonText}>Unlock</Text>
      </TouchableOpacity>
    </View>
  );
};

export default LockScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: brand.colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    marginBottom: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: brand.colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: brand.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    minHeight: 48,
    backgroundColor: brand.colors.accentStrong,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.5,
  },
});

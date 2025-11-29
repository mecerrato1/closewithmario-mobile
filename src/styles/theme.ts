import { useColorScheme } from 'react-native';

export const lightColors = {
  background: '#F8FAFC',
  cardBackground: '#FFFFFF',
  headerBackground: '#7C3AED',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  border: '#E2E8F0',
};

export const darkColors = {
  background: '#020617',       // slate-950
  cardBackground: '#020617',   // or '#0F172A' if you want more contrast
  headerBackground: '#1E1B4B', // deep purple
  textPrimary: '#E5E7EB',
  textSecondary: '#9CA3AF',
  border: '#1F2937',
};

export function useThemeColors() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = isDark ? darkColors : lightColors;
  return { colors, isDark, scheme };
}

// src/components/navigation/BottomTabs.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image, ImageSourcePropType } from 'react-native';
import { useThemeColors } from '../../styles/theme';

import type { UserRole } from '../../lib/roles';

export type TabKey = 'leads' | 'captures' | 'realtors' | 'loan_officers' | 'calculator';

interface Tab {
  key: TabKey;
  label: string;
  icon?: string;
  iconImage?: ImageSourcePropType;
}

const DEFAULT_TABS: Tab[] = [
  { key: 'leads', label: 'Leads', icon: '📋' },
  { key: 'captures', label: 'Quick Leads', icon: '⚡' },
  { key: 'realtors', label: 'Realtors', icon: '🧑‍💼' },
  { key: 'calculator', label: 'Calculator', iconImage: require('../../../assets/MortgageCalc.png') },
];

const REALTOR_TABS: Tab[] = [
  { key: 'leads', label: 'Leads', icon: '📋' },
  { key: 'captures', label: 'Quick Leads', icon: '⚡' },
  { key: 'loan_officers', label: 'Loan Officers', icon: '👔' },
  { key: 'calculator', label: 'Calculator', iconImage: require('../../../assets/MortgageCalc.png') },
];

interface BottomTabsProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  userRole?: UserRole;
}

export default function BottomTabs({ activeTab, onTabChange, userRole }: BottomTabsProps) {
  const tabs = userRole === 'realtor' ? REALTOR_TABS : DEFAULT_TABS;
  const { colors } = useThemeColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.cardBackground, borderTopColor: colors.border }]}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => onTabChange(tab.key)}
            activeOpacity={0.7}
          >
            {tab.iconImage ? (
              <Image source={tab.iconImage} style={styles.iconImage} />
            ) : (
              <Text style={styles.icon}>{tab.icon}</Text>
            )}
            <Text
              style={[
                styles.label,
                { color: isActive ? '#7C3AED' : colors.textSecondary },
                isActive && styles.labelActive,
              ]}
            >
              {tab.label}
            </Text>
            {isActive && <View style={styles.activeIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8, // Safe area for iPhone home indicator
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    position: 'relative',
  },
  icon: {
    fontSize: 22,
    marginBottom: 2,
  },
  iconImage: {
    width: 24,
    height: 24,
    marginBottom: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
  },
  labelActive: {
    fontWeight: '700',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#7C3AED',
  },
});

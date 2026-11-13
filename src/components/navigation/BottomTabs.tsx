// src/components/navigation/BottomTabs.tsx
import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../styles/theme';
import { useBrand } from '../../brand/BrandContext';
import { themedStyles } from '../../brand/themedStyles';
import { MIN_TOUCH_TARGET } from '../../brand/layout';

import type { UserRole } from '../../lib/roles';

export type TabKey = 'leads' | 'captures' | 'realtors' | 'loan_officers' | 'messages' | 'calculator';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface Tab {
  key: TabKey;
  label: string;
  icon: IconName;
  activeIcon: IconName;
}

const LEADS: Tab = { key: 'leads', label: 'Leads', icon: 'list-outline', activeIcon: 'list' };
const QUICK: Tab = { key: 'captures', label: 'Quick Leads', icon: 'flash-outline', activeIcon: 'flash' };
const REALTORS: Tab = { key: 'realtors', label: 'Realtors', icon: 'people-outline', activeIcon: 'people' };
const LOAN_OFFICERS: Tab = { key: 'loan_officers', label: 'Loan Officers', icon: 'briefcase-outline', activeIcon: 'briefcase' };
const MESSAGES: Tab = { key: 'messages', label: 'Messages', icon: 'chatbubble-outline', activeIcon: 'chatbubble' };
const CALCULATOR: Tab = { key: 'calculator', label: 'Calculator', icon: 'calculator-outline', activeIcon: 'calculator' };

const DEFAULT_TABS: Tab[] = [LEADS, QUICK, REALTORS, MESSAGES, CALCULATOR];
const REALTOR_TABS: Tab[] = [LEADS, QUICK, LOAN_OFFICERS, MESSAGES, CALCULATOR];

interface BottomTabsProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  userRole?: UserRole;
}

export default function BottomTabs({ activeTab, onTabChange, userRole }: BottomTabsProps) {
  const tabs = userRole === 'realtor' ? REALTOR_TABS : DEFAULT_TABS;
  const { colors } = useThemeColors();
  const brand = useBrand();

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.container, { backgroundColor: colors.cardBackground, borderTopColor: colors.border }]}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const tint = isActive ? brand.colors.accentText : colors.textSecondary;
        return (
          <TouchableOpacity
            key={tab.key}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isActive }}
            style={styles.tab}
            onPress={() => onTabChange(tab.key)}
            activeOpacity={0.7}
          >
            <Ionicons name={isActive ? tab.activeIcon : tab.icon} size={22} color={tint} />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              maxFontSizeMultiplier={1.2}
              style={[styles.label, { color: tint }, isActive && styles.labelActive]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = themedStyles({
  container: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8, // Safe area for iPhone home indicator
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET + 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  labelActive: {
    fontWeight: '700',
  },
});

// src/components/realtors/RealtorStageBadge.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RelationshipStage, STAGE_CONFIG } from '../../lib/types/realtors';

interface RealtorStageBadgeProps {
  stage: RelationshipStage;
  size?: 'small' | 'medium';
}

export default function RealtorStageBadge({ stage, size = 'small' }: RealtorStageBadgeProps) {
  const config = STAGE_CONFIG[stage];
  const isSmall = size === 'small';

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.bgColor },
        isSmall ? styles.badgeSmall : styles.badgeMedium,
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: config.color },
          isSmall ? styles.textSmall : styles.textMedium,
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeMedium: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  text: {
    fontWeight: '600',
  },
  textSmall: {
    fontSize: 11,
  },
  textMedium: {
    fontSize: 13,
  },
});

// src/components/realtors/RealtorFilters.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useThemeColors } from '../../styles/theme';
import { RelationshipStage, STAGE_CONFIG } from '../../lib/types/realtors';

interface RealtorFiltersProps {
  selectedStage: RelationshipStage | 'all';
  onStageChange: (stage: RelationshipStage | 'all') => void;
}

type FilterOption = {
  key: RelationshipStage | 'all';
  label: string;
};

const FILTER_OPTIONS: FilterOption[] = [
  { key: 'all', label: 'All' },
  { key: 'hot', label: '🔥 Hot' },
  { key: 'warm', label: '☀️ Warm' },
  { key: 'cold', label: '❄️ Cold' },
];

export default function RealtorFilters({ selectedStage, onStageChange }: RealtorFiltersProps) {
  const { colors } = useThemeColors();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {FILTER_OPTIONS.map((option) => {
        const isSelected = selectedStage === option.key;
        return (
          <TouchableOpacity
            key={option.key}
            style={[
              styles.chip,
              { borderColor: colors.border },
              isSelected && styles.chipSelected,
            ]}
            onPress={() => onStageChange(option.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.chipText,
                { color: isSelected ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  chipSelected: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

// src/components/realtors/RealtorCard.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../styles/theme';
import { AssignedRealtor, getRealtorFullName, getRealtorInitials, STAGE_CONFIG } from '../../lib/types/realtors';

interface RealtorCardProps {
  realtor: AssignedRealtor;
  onPress: () => void;
}

export default function RealtorCard({ realtor, onPress }: RealtorCardProps) {
  const { colors } = useThemeColors();
  const fullName = getRealtorFullName(realtor);
  const initials = getRealtorInitials(realtor);
  const stageConfig = STAGE_CONFIG[realtor.relationship_stage];

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.cardBackground }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Avatar with stage indicator */}
      <View style={styles.avatarContainer}>
        {realtor.profile_picture_url ? (
          <Image 
            source={{ uri: realtor.profile_picture_url }} 
            style={styles.avatarImage}
          />
        ) : (
          <View style={[styles.avatar, { backgroundColor: stageConfig.color }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {fullName}
        </Text>
        {realtor.brokerage && (
          <Text style={[styles.brokerage, { color: colors.textSecondary }]} numberOfLines={1}>
            {realtor.brokerage}
          </Text>
        )}
      </View>

      {/* Lead count badge - right aligned */}
      {(realtor.lead_count ?? 0) > 0 && (
        <View style={styles.leadBadge}>
          <Ionicons name="people" size={12} color="#FFFFFF" />
          <Text style={styles.leadBadgeText}>{realtor.lead_count}</Text>
        </View>
      )}

      {/* Chevron */}
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  brokerage: {
    fontSize: 13,
  },
  leadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 3,
    marginRight: 8,
  },
  leadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
});

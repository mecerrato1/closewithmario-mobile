// src/components/realtors/NeedsLoveSection.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../styles/theme';
import { AssignedRealtor, getRealtorFullName, getRealtorInitials } from '../../lib/types/realtors';

interface NeedsLoveSectionProps {
  realtors: AssignedRealtor[];
  onRealtorPress: (realtor: AssignedRealtor) => void;
}

function getDaysAgo(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export default function NeedsLoveSection({ realtors, onRealtorPress }: NeedsLoveSectionProps) {
  const { colors } = useThemeColors();

  if (realtors.length === 0) {
    return null;
  }

  const handleSendUpdate = (realtor: AssignedRealtor) => {
    if (realtor.phone) {
      const message = `Hi ${realtor.first_name}! Just checking in - wanted to see if you have any clients looking to buy or refinance. Let me know if there's anything I can help with!`;
      Linking.openURL(`sms:${realtor.phone}?body=${encodeURIComponent(message)}`);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>💜 Needs Love</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Haven't connected recently
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {realtors.map((realtor) => {
          const daysAgo = getDaysAgo(realtor.last_touched_at);
          const initials = getRealtorInitials(realtor);
          const fullName = getRealtorFullName(realtor);

          return (
            <TouchableOpacity
              key={realtor.realtor_id}
              style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
              onPress={() => onRealtorPress(realtor)}
              activeOpacity={0.7}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                {fullName}
              </Text>
              <Text style={[styles.daysAgo, { color: colors.textSecondary }]}>
                {daysAgo}+ days ago
              </Text>
              <TouchableOpacity
                style={styles.sendButton}
                onPress={() => handleSendUpdate(realtor)}
              >
                <Ionicons name="chatbubble-outline" size={14} color="#FFFFFF" />
                <Text style={styles.sendButtonText}>Send Update</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    width: 140,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginRight: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
  },
  daysAgo: {
    fontSize: 11,
    marginBottom: 8,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#7C3AED',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
});

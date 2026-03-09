// src/screens/tabs/LoanOfficersTabScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useThemeColors } from '../../styles/theme';
import { saveContact } from '../../utils/vcard';

interface AssignedLO {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  nmls_id: string | null;
}

interface LoanOfficersTabScreenProps {
  session?: Session | null;
  onClose?: () => void;
}

export default function LoanOfficersTabScreen({ session, onClose }: LoanOfficersTabScreenProps) {
  const { colors } = useThemeColors();
  const [loanOfficers, setLoanOfficers] = useState<AssignedLO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAllLOs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('loan_officers')
        .select('id, first_name, last_name, phone, email, company, nmls_id')
        .eq('active', true)
        .order('first_name', { ascending: true });

      if (error) {
        console.error('Error fetching loan officers:', error);
        return;
      }

      setLoanOfficers(data || []);
    } catch (err) {
      console.error('Error in fetchAllLOs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAllLOs();
  }, [fetchAllLOs]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAllLOs();
  };

  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  const handleCall = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    Linking.openURL(`tel:${cleaned}`);
  };

  const handleText = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    Linking.openURL(`sms:${cleaned}`);
  };

  const handleEmail = (email: string) => {
    Linking.openURL(`mailto:${email}`);
  };

  const handleSaveContact = async (lo: AssignedLO) => {
    try {
      await saveContact({
        firstName: lo.first_name,
        lastName: lo.last_name,
        phone: lo.phone || undefined,
        email: lo.email || undefined,
        company: lo.company || 'Loan Officer',
      });
    } catch (error) {
      console.error('[Contacts] Failed to save LO contact:', error);
      Alert.alert('Error', 'Could not save contact. Please try again.');
    }
  };

  const renderLO = ({ item }: { item: AssignedLO }) => {
    const fullName = `${item.first_name} ${item.last_name}`.trim();
    const initials = `${(item.first_name || '')[0] || ''}${(item.last_name || '')[0] || ''}`.toUpperCase();

    return (
      <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.nameSection}>
            <Text style={[styles.name, { color: colors.textPrimary }]}>{fullName}</Text>
            {item.company && (
              <Text style={[styles.company, { color: colors.textSecondary }]}>{item.company}</Text>
            )}
            {item.nmls_id && (
              <Text style={[styles.nmls, { color: colors.textSecondary }]}>NMLS# {item.nmls_id}</Text>
            )}
          </View>
        </View>

        {/* Contact Info */}
        {item.phone && (
          <View style={styles.contactRow}>
            <Ionicons name="call-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.contactText, { color: colors.textPrimary }]}>{formatPhoneNumber(item.phone)}</Text>
          </View>
        )}
        {item.email && (
          <View style={styles.contactRow}>
            <Ionicons name="mail-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.contactText, { color: colors.textPrimary }]} numberOfLines={1}>{item.email}</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actions}>
          {item.phone && (
            <>
              <TouchableOpacity style={styles.actionButton} onPress={() => handleCall(item.phone!)}>
                <Ionicons name="call" size={18} color="#FFFFFF" />
                <Text style={styles.actionText}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, styles.actionButtonText]} onPress={() => handleText(item.phone!)}>
                <Ionicons name="chatbubble" size={18} color="#FFFFFF" />
                <Text style={styles.actionText}>Text</Text>
              </TouchableOpacity>
            </>
          )}
          {item.email && (
            <TouchableOpacity style={[styles.actionButton, styles.actionButtonEmail]} onPress={() => handleEmail(item.email!)}>
              <Ionicons name="mail" size={18} color="#FFFFFF" />
              <Text style={styles.actionText}>Email</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.actionButton, styles.actionButtonSave]} onPress={() => handleSaveContact(item)}>
            <Ionicons name="person-add" size={18} color="#FFFFFF" />
            <Text style={styles.actionText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading loan officers...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>My Loan Officers</Text>
      </View>

      {loanOfficers.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="people-outline" size={48} color="#CBD5E1" />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No loan officers assigned</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            You'll see your assigned loan officers here
          </Text>
        </View>
      ) : (
        <FlatList
          data={loanOfficers}
          keyExtractor={(item) => item.id}
          renderItem={renderLO}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  nameSection: {
    marginLeft: 12,
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
  },
  company: {
    fontSize: 14,
    marginTop: 2,
  },
  nmls: {
    fontSize: 12,
    marginTop: 2,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  contactText: {
    fontSize: 14,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionButtonText: {
    backgroundColor: '#7C3AED',
  },
  actionButtonEmail: {
    backgroundColor: '#3B82F6',
  },
  actionButtonSave: {
    backgroundColor: '#6B7280',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
});

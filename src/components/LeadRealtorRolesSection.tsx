import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../styles/theme';
import { supabase } from '../lib/supabase';
import {
  clearPrimaryLeadRealtorRole,
  deleteLeadRealtorRole,
  fetchLeadRealtorRoles,
  searchActiveRealtors,
  upsertLeadRealtorRole,
} from '../lib/supabase/leadRealtorRoles';
import type {
  LeadRealtorRole,
  LeadRealtorRoleSource,
  LeadRealtorRoleType,
  LeadRoleRealtor,
} from '../lib/types/leadRealtorRoles';

const PLUM = '#4C1D95';

type RoleConfig = {
  role: Extract<LeadRealtorRoleType, 'buyer_agent' | 'listing_agent'>;
  label: string;
  emptyLabel: string;
  defaultCc: boolean;
};

const ROLE_CONFIGS: RoleConfig[] = [
  {
    role: 'buyer_agent',
    label: 'Buyer Agent',
    emptyLabel: 'No buyer agent',
    defaultCc: true,
  },
  {
    role: 'listing_agent',
    label: 'Listing Agent',
    emptyLabel: 'No listing agent',
    defaultCc: false,
  },
];

type LeadRealtorRolesSectionProps = {
  leadId: string;
  leadSource: LeadRealtorRoleSource;
  onBuyerAgentUpdated?: (updatedRecord: Record<string, unknown> | null) => void;
};

function getRealtorName(realtor?: Pick<LeadRoleRealtor, 'first_name' | 'last_name'> | null) {
  return [realtor?.first_name, realtor?.last_name].filter(Boolean).join(' ').trim();
}

function getRealtorMeta(realtor: LeadRoleRealtor) {
  return [realtor.email, realtor.phone, realtor.brokerage]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' - ');
}

function getPrimaryRole(roles: LeadRealtorRole[], roleType: LeadRealtorRoleType) {
  return roles.find((item) => item.role === roleType && item.is_primary)
    || roles.find((item) => item.role === roleType)
    || null;
}

function getRoleRealtor(roleAssignment: LeadRealtorRole | null) {
  if (!roleAssignment) return null;
  return roleAssignment.realtor || roleAssignment.realtors || null;
}

function getRoleConfig(role: RoleConfig['role']) {
  return ROLE_CONFIGS.find((item) => item.role === role) || ROLE_CONFIGS[0];
}

function openPhone(phone: string) {
  void Linking.openURL(`tel:${phone}`);
}

function openEmail(email: string) {
  void Linking.openURL(`mailto:${email}`);
}

export function LeadRealtorRolesSection({
  leadId,
  leadSource,
  onBuyerAgentUpdated,
}: LeadRealtorRolesSectionProps) {
  const { colors, isDark } = useThemeColors();
  const [roles, setRoles] = useState<LeadRealtorRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<RoleConfig['role'] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LeadRoleRealtor[]>([]);
  const [searching, setSearching] = useState(false);
  const [savingRole, setSavingRole] = useState<RoleConfig['role'] | null>(null);
  const [removingRole, setRemovingRole] = useState<RoleConfig['role'] | null>(null);

  const activeConfig = activeRole ? getRoleConfig(activeRole) : null;
  const trimmedSearch = searchQuery.trim();

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await fetchLeadRealtorRoles({ leadId, leadSource });
    if (result.error) {
      setRoles([]);
      setError(result.error.message);
    } else {
      setRoles(result.data);
    }

    setLoading(false);
  }, [leadId, leadSource]);

  useEffect(() => {
    setRoles([]);
    setActiveRole(null);
    setSearchQuery('');
    setSearchResults([]);
    void loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    if (!activeRole) return;

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      if (trimmedSearch.length > 0 && trimmedSearch.length < 2) {
        setSearching(false);
        setSearchResults([]);
        return;
      }

      setSearching(true);
      const result = await searchActiveRealtors(trimmedSearch);
      if (!cancelled) {
        if (result.error) {
          setSearchResults([]);
        } else {
          setSearchResults(result.data);
        }
        setSearching(false);
      }
    }, trimmedSearch.length >= 2 ? 250 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [activeRole, trimmedSearch]);

  const openPicker = (role: RoleConfig['role']) => {
    setActiveRole(role);
    setSearchQuery('');
    setSearchResults([]);
  };

  const closePicker = () => {
    setActiveRole(null);
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
  };

  const updateLegacyBuyerAgent = async (realtor: LeadRoleRealtor | null) => {
    const tableName = leadSource === 'meta' ? 'meta_ads' : 'leads';
    const { data, error: updateError } = await supabase
      .from(tableName)
      .update({ realtor_id: realtor?.id || null })
      .eq('id', leadId)
      .select()
      .single();

    if (updateError) {
      throw new Error(updateError.message || 'Unable to update buyer agent');
    }

    onBuyerAgentUpdated?.((data as Record<string, unknown>) || null);
  };

  const assignRole = async (role: RoleConfig['role'], realtor: LeadRoleRealtor) => {
    setSavingRole(role);
    setError(null);

    try {
      if (role === 'buyer_agent') {
        await updateLegacyBuyerAgent(realtor);
        closePicker();
        await loadRoles();
        return;
      }

      const config = getRoleConfig(role);
      const clearError = await clearPrimaryLeadRealtorRole({ leadId, leadSource, role });
      if (clearError) throw clearError;

      const upsertError = await upsertLeadRealtorRole({
        leadId,
        leadSource,
        role,
        realtorId: realtor.id,
        ccByDefault: config.defaultCc,
      });
      if (upsertError) throw upsertError;

      closePicker();
      await loadRoles();
    } catch (assignError) {
      const message = assignError instanceof Error ? assignError.message : 'Unable to assign realtor role.';
      setError(message);
      Alert.alert('Realtor Role', message);
    } finally {
      setSavingRole(null);
    }
  };

  const removeRole = async (role: RoleConfig['role']) => {
    const assignment = getPrimaryRole(roles, role);
    if (!assignment && role !== 'buyer_agent') return;

    Alert.alert('Remove Realtor Role', `Remove the ${getRoleConfig(role).label.toLowerCase()} from this lead?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setRemovingRole(role);
          setError(null);

          try {
            if (role === 'buyer_agent') {
              await updateLegacyBuyerAgent(null);
              await loadRoles();
              return;
            }

            const deleteError = await deleteLeadRealtorRole({
              roleId: assignment?.id,
              leadId,
              leadSource,
              role,
            });
            if (deleteError) throw deleteError;
            await loadRoles();
          } catch (removeError) {
            const message = removeError instanceof Error ? removeError.message : 'Unable to remove realtor role.';
            setError(message);
            Alert.alert('Realtor Role', message);
          } finally {
            setRemovingRole(null);
          }
        },
      },
    ]);
  };

  const canShowSearchHint = activeRole && trimmedSearch.length > 0 && trimmedSearch.length < 2;
  const modalTitle = activeConfig ? `${activeConfig.label}` : 'Realtor Role';

  const roleCards = useMemo(() => {
    return ROLE_CONFIGS.map((config) => {
      const assignment = getPrimaryRole(roles, config.role);
      const realtor = getRoleRealtor(assignment);
      const busy = savingRole === config.role || removingRole === config.role;

      return (
        <View
          key={config.role}
          style={[
            localStyles.roleCard,
            { backgroundColor: colors.cardBackground, borderColor: colors.border },
          ]}
        >
          <View style={localStyles.roleHeader}>
            <View style={localStyles.roleTitleRow}>
              <Ionicons
                name={config.role === 'buyer_agent' ? 'home-outline' : 'business-outline'}
                size={15}
                color={PLUM}
              />
              <Text style={[localStyles.roleTitle, { color: colors.textPrimary }]}>{config.label}</Text>
            </View>
            {assignment?.cc_by_default ? (
              <View style={localStyles.ccPill}>
                <Text style={localStyles.ccPillText}>CC default</Text>
              </View>
            ) : null}
          </View>

          {realtor ? (
            <View style={[localStyles.realtorBox, { backgroundColor: isDark ? '#111827' : '#F8FAFC' }]}>
              <Text style={[localStyles.realtorName, { color: colors.textPrimary }]} numberOfLines={1}>
                {getRealtorName(realtor) || 'Realtor'}
              </Text>
              {getRealtorMeta(realtor) ? (
                <Text style={[localStyles.realtorMeta, { color: colors.textSecondary }]} numberOfLines={2}>
                  {getRealtorMeta(realtor)}
                </Text>
              ) : null}
              {(realtor.phone || realtor.email) ? (
                <View style={localStyles.contactActionRow}>
                  {realtor.phone ? (
                    <TouchableOpacity style={localStyles.contactAction} onPress={() => openPhone(realtor.phone || '')}>
                      <Ionicons name="call-outline" size={13} color={PLUM} />
                      <Text style={localStyles.contactActionText}>Call</Text>
                    </TouchableOpacity>
                  ) : null}
                  {realtor.email ? (
                    <TouchableOpacity style={localStyles.contactAction} onPress={() => openEmail(realtor.email || '')}>
                      <Ionicons name="mail-outline" size={13} color={PLUM} />
                      <Text style={localStyles.contactActionText}>Email</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : (
            <View style={[localStyles.emptyBox, { backgroundColor: isDark ? '#111827' : '#F8FAFC' }]}>
              {loading ? (
                <ActivityIndicator size="small" color={PLUM} />
              ) : (
                <Text style={[localStyles.emptyText, { color: colors.textSecondary }]}>
                  {config.emptyLabel}
                </Text>
              )}
            </View>
          )}

          <View style={localStyles.actionRow}>
            <TouchableOpacity
              style={[localStyles.changeButton, busy && localStyles.disabledButton]}
              disabled={busy}
              onPress={() => openPicker(config.role)}
            >
              {savingRole === config.role ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name={realtor ? 'swap-horizontal-outline' : 'add-outline'} size={15} color="#FFFFFF" />
                  <Text style={localStyles.changeButtonText}>{realtor ? 'Change' : 'Assign'}</Text>
                </>
              )}
            </TouchableOpacity>

            {realtor ? (
              <TouchableOpacity
                style={[localStyles.removeButton, busy && localStyles.disabledButton]}
                disabled={busy}
                onPress={() => removeRole(config.role)}
              >
                {removingRole === config.role ? (
                  <ActivityIndicator size="small" color="#B91C1C" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={15} color="#B91C1C" />
                    <Text style={localStyles.removeButtonText}>Remove</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      );
    });
  }, [colors, isDark, loading, removingRole, roles, savingRole]);

  return (
    <View style={localStyles.container}>
      <View style={localStyles.sectionHeader}>
        <View style={localStyles.sectionTitleRow}>
          <Ionicons name="people-outline" size={17} color={PLUM} />
          <Text style={[localStyles.sectionTitle, { color: colors.textPrimary }]}>Realtor Roles</Text>
        </View>
        <TouchableOpacity onPress={loadRoles} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color={PLUM} />
          ) : (
            <Ionicons name="refresh-outline" size={17} color={PLUM} />
          )}
        </TouchableOpacity>
      </View>

      <Text style={[localStyles.subtitle, { color: colors.textSecondary }]}>
        Track the buyer and listing agents separately for this lead.
      </Text>

      {error ? (
        <View style={localStyles.errorBox}>
          <Ionicons name="alert-circle-outline" size={15} color="#B91C1C" />
          <Text style={localStyles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={localStyles.roleList}>{roleCards}</View>

      <Modal visible={Boolean(activeRole)} transparent animationType="fade" onRequestClose={closePicker}>
        <TouchableOpacity style={localStyles.modalOverlay} activeOpacity={1} onPress={closePicker}>
          <TouchableWithoutFeedback onPress={() => undefined}>
            <View style={[localStyles.modalContent, { backgroundColor: colors.cardBackground }]}>
              <View style={localStyles.modalHeader}>
                <Text style={[localStyles.modalTitle, { color: colors.textPrimary }]}>
                  {modalTitle}
                </Text>
                <TouchableOpacity onPress={closePicker}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={[localStyles.searchBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
                <TextInput
                  style={[localStyles.searchInput, { color: colors.textPrimary }]}
                  placeholder="Search realtors..."
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 ? (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {canShowSearchHint ? (
                <Text style={[localStyles.modalHint, { color: colors.textSecondary }]}>
                  Type at least 2 characters to search.
                </Text>
              ) : null}

              {searching ? (
                <View style={localStyles.modalState}>
                  <ActivityIndicator size="small" color={PLUM} />
                  <Text style={[localStyles.modalStateText, { color: colors.textSecondary }]}>Searching...</Text>
                </View>
              ) : (
                <ScrollView style={localStyles.resultsList} keyboardShouldPersistTaps="handled">
                  {searchResults.length > 0 ? (
                    searchResults.map((realtor) => (
                      <TouchableOpacity
                        key={realtor.id}
                        style={[localStyles.resultItem, { borderBottomColor: colors.border }]}
                        onPress={() => activeRole && assignRole(activeRole, realtor)}
                        disabled={Boolean(savingRole)}
                      >
                        <View style={localStyles.resultTextBlock}>
                          <Text style={[localStyles.resultName, { color: colors.textPrimary }]} numberOfLines={1}>
                            {getRealtorName(realtor) || 'Unnamed realtor'}
                          </Text>
                          {getRealtorMeta(realtor) ? (
                            <Text style={[localStyles.resultMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                              {getRealtorMeta(realtor)}
                            </Text>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View style={localStyles.modalState}>
                      <Ionicons name="person-add-outline" size={18} color="#94A3B8" />
                      <Text style={[localStyles.modalStateText, { color: colors.textSecondary }]}>
                        {trimmedSearch.length >= 2 ? 'No realtors found.' : 'Start typing to find a realtor.'}
                      </Text>
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  errorBox: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 10,
  },
  errorText: {
    flex: 1,
    color: '#B91C1C',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  roleList: {
    marginTop: 12,
    gap: 10,
  },
  roleCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  roleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  roleTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  roleTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  ccPill: {
    borderRadius: 999,
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  ccPillText: {
    color: PLUM,
    fontSize: 10,
    fontWeight: '800',
  },
  realtorBox: {
    borderRadius: 10,
    padding: 10,
  },
  realtorName: {
    fontSize: 13,
    fontWeight: '800',
  },
  realtorMeta: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
  },
  contactActionRow: {
    marginTop: 9,
    flexDirection: 'row',
    gap: 8,
  },
  contactAction: {
    minHeight: 28,
    borderRadius: 999,
    backgroundColor: '#F5F3FF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
  },
  contactActionText: {
    color: PLUM,
    fontSize: 11,
    fontWeight: '800',
  },
  emptyBox: {
    borderRadius: 10,
    padding: 10,
    minHeight: 42,
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 17,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  changeButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: PLUM,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  changeButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  removeButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  removeButtonText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.55,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: 18,
  },
  modalContent: {
    borderRadius: 18,
    padding: 16,
    maxHeight: '76%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  searchBox: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
  },
  modalHint: {
    marginTop: 8,
    fontSize: 12,
  },
  modalState: {
    paddingVertical: 22,
    alignItems: 'center',
    gap: 8,
  },
  modalStateText: {
    fontSize: 13,
    textAlign: 'center',
  },
  resultsList: {
    marginTop: 8,
  },
  resultItem: {
    minHeight: 58,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  resultTextBlock: {
    flex: 1,
  },
  resultName: {
    fontSize: 14,
    fontWeight: '800',
  },
  resultMeta: {
    marginTop: 3,
    fontSize: 12,
  },
});

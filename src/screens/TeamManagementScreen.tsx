import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  FlatList,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Session } from '@supabase/supabase-js';
import type { LoanOfficer, Realtor } from '../lib/types/leads';
import { supabase } from '../lib/supabase';
import { styles } from '../styles/appStyles';
import { FLORIDA_COUNTIES } from '../utils/floridaCounties';
import { formatPhoneNumber } from '../lib/textTemplates';

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'ht', label: 'Haitian Creole' },
  { value: 'pt', label: 'Portuguese' },
];

export type TeamManagementScreenProps = {
  onBack: () => void;
  session: Session | null;
};

export default function TeamManagementScreen({ onBack, session }: TeamManagementScreenProps) {
  const [activeTab, setActiveTab] = useState<'loan_officers' | 'realtors'>('loan_officers');
  const [loanOfficers, setLoanOfficers] = useState<LoanOfficer[]>([]);
  const [realtors, setRealtors] = useState<Realtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(false);
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingMember, setEditingMember] = useState<LoanOfficer | Realtor | null>(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    active: true,
    lead_eligible: true,
    // Realtor-specific fields
    preferred_language: 'en',
    secondary_language: '' as string,
    county_filter: [] as string[],
    ai_draft_access: false,
    notes: '',
  });
  const [showCountyPicker, setShowCountyPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch team members and auto-assign state
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch loan officers
      const { data: loData, error: loError } = await supabase
        .from('loan_officers')
        .select('*')
        .order('created_at', { ascending: false });

      if (loError) throw loError;
      setLoanOfficers(loData || []);

      // Fetch realtors - paginate to avoid Supabase 1000-row default limit
      let allRealtors: Realtor[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: realtorPage, error: realtorError } = await supabase
          .from('realtors')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (realtorError) throw realtorError;

        if (realtorPage && realtorPage.length > 0) {
          allRealtors = [...allRealtors, ...realtorPage];
          from += pageSize;
          hasMore = realtorPage.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      setRealtors(allRealtors);

      // Fetch auto-assign state
      const { data: assignData, error: assignError } = await supabase
        .from('lead_assignment_state')
        .select('auto_assign_enabled')
        .limit(1)
        .maybeSingle();

      if (assignError) throw assignError;
      setAutoAssignEnabled(assignData?.auto_assign_enabled ?? false);
    } catch (error: any) {
      console.error('Error fetching team data:', error);
      alert('Error loading team data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleAutoAssign = async (enabled: boolean) => {
    try {
      const { data: rows, error: fetchError } = await supabase
        .from('lead_assignment_state')
        .select('id')
        .limit(1);

      if (fetchError) throw fetchError;

      if (!rows || rows.length === 0) {
        alert('Auto-assign state not initialized. Please contact support.');
        return;
      }

      const { error: updateError } = await supabase
        .from('lead_assignment_state')
        .update({
          auto_assign_enabled: enabled,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rows[0].id);

      if (updateError) throw updateError;
      setAutoAssignEnabled(enabled);
    } catch (error: any) {
      console.error('Error toggling auto-assign:', error);
      alert('Error updating auto-assign: ' + error.message);
    }
  };

  const openAddModal = () => {
    setEditingMember(null);
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      active: true,
      lead_eligible: true,
      preferred_language: 'en',
      secondary_language: '',
      county_filter: [],
      ai_draft_access: false,
      notes: '',
    });
    setShowCountyPicker(false);
    setShowAddEditModal(true);
  };

  const openEditModal = (member: LoanOfficer | Realtor) => {
    setEditingMember(member);
    const isRealtor = activeTab === 'realtors';
    const r = member as Realtor;
    setFormData({
      first_name: member.first_name,
      last_name: member.last_name,
      email: member.email || '',
      phone: member.phone || '',
      active: member.active,
      lead_eligible: 'lead_eligible' in member ? member.lead_eligible : true,
      preferred_language: isRealtor ? (r.preferred_language || 'en') : 'en',
      secondary_language: isRealtor ? (r.secondary_language || '') : '',
      county_filter: isRealtor ? (r.county_filter || []) : [],
      ai_draft_access: isRealtor ? (r.ai_draft_access ?? false) : false,
      notes: isRealtor ? (r.notes || '') : '',
    });
    setShowCountyPicker(false);
    setShowAddEditModal(true);
  };

  const handleSave = async () => {
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      alert('First name and last name are required');
      return;
    }

    setSaving(true);
    try {
      const table = activeTab === 'loan_officers' ? 'loan_officers' : 'realtors';
      const dataToSave: any = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        active: formData.active,
      };

      // Only add lead_eligible for loan officers
      if (activeTab === 'loan_officers') {
        dataToSave.lead_eligible = formData.lead_eligible;
      }

      // Add realtor-specific fields
      if (activeTab === 'realtors') {
        dataToSave.lead_eligible = formData.lead_eligible;
        dataToSave.preferred_language = formData.preferred_language || 'en';
        dataToSave.secondary_language = formData.secondary_language || null;
        dataToSave.county_filter = formData.county_filter.length > 0 ? formData.county_filter : null;
        dataToSave.ai_draft_access = formData.ai_draft_access;
        dataToSave.notes = formData.notes.trim() || null;
      }

      if (editingMember) {
        // Update existing member
        const { error } = await supabase
          .from(table)
          .update(dataToSave)
          .eq('id', editingMember.id);

        if (error) throw error;
      } else {
        // Insert new member
        const { error } = await supabase.from(table).insert([dataToSave]);

        if (error) throw error;
      }

      setShowAddEditModal(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving team member:', error);
      alert('Error saving: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (member: LoanOfficer | Realtor) => {
    if (!confirm(`Delete ${member.first_name} ${member.last_name}?`)) return;

    try {
      const table = activeTab === 'loan_officers' ? 'loan_officers' : 'realtors';
      const { error } = await supabase.from(table).delete().eq('id', member.id);

      if (error) throw error;
      fetchData();
    } catch (error: any) {
      console.error('Error deleting team member:', error);
      alert('Error deleting: ' + error.message);
    }
  };

  const filteredLoanOfficers = loanOfficers.filter((lo) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const fullName = `${lo.first_name} ${lo.last_name}`.toLowerCase();
    const email = lo.email?.toLowerCase() || '';
    return fullName.includes(query) || email.includes(query);
  });

  const filteredRealtors = realtors.filter((r) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const fullName = `${r.first_name} ${r.last_name}`.toLowerCase();
    const email = r.email?.toLowerCase() || '';
    return fullName.includes(query) || email.includes(query);
  });

  const currentList = activeTab === 'loan_officers' ? filteredLoanOfficers : filteredRealtors;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Header */}
      <View style={styles.dashboardHeader}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={onBack} style={styles.teamBackButton}>
            <Text style={styles.teamBackButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.dashboardTitle}>Team Management</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator />
          <Text style={styles.subtitle}>Loading team data...</Text>
        </View>
      ) : (
        <>
          {/* Auto-assign toggle (only for loan officers tab) */}
          {activeTab === 'loan_officers' && (
            <View style={styles.autoAssignContainer}>
              <TouchableOpacity
                style={styles.autoAssignToggle}
                onPress={() => toggleAutoAssign(!autoAssignEnabled)}
              >
                <View style={[
                  styles.toggleSwitch,
                  autoAssignEnabled && styles.toggleSwitchActive
                ]}>
                  <View style={[
                    styles.toggleThumb,
                    autoAssignEnabled && styles.toggleThumbActive
                  ]} />
                </View>
                <Text style={styles.autoAssignLabel}>
                  Auto-assign Meta leads (round robin)
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Tabs */}
          <View style={styles.teamTabBar}>
            <TouchableOpacity
              style={[
                styles.teamTab,
                activeTab === 'loan_officers' && styles.teamTabActive,
              ]}
              onPress={() => setActiveTab('loan_officers')}
            >
              <Text style={[
                styles.teamTabText,
                activeTab === 'loan_officers' && styles.teamTabTextActive,
              ]}>
                👔 Loan Officers ({loanOfficers.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.teamTab,
                activeTab === 'realtors' && styles.teamTabActive,
              ]}
              onPress={() => setActiveTab('realtors')}
            >
              <Text style={[
                styles.teamTabText,
                activeTab === 'realtors' && styles.teamTabTextActive,
              ]}>
                🏠 Realtors ({realtors.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search and Add Button */}
          <View style={styles.teamActionsRow}>
            <View style={styles.teamSearchContainer}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.teamSearchInput}
                placeholder="Search by name or email..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  style={styles.searchClearButton}
                >
                  <Text style={styles.searchClearText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {/* Team Member List */}
          <FlatList
            data={currentList}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.teamMemberCard}
                onPress={() => openEditModal(item)}
              >
                <View style={styles.teamMemberHeader}>
                  <Text style={styles.teamMemberName}>
                    {item.first_name} {item.last_name}
                  </Text>
                  <View style={[
                    styles.teamMemberStatusBadge,
                    item.active ? styles.teamMemberStatusActive : styles.teamMemberStatusInactive
                  ]}>
                    <Text style={[
                      styles.teamMemberStatusText,
                      item.active ? styles.teamMemberStatusTextActive : styles.teamMemberStatusTextInactive
                    ]}>
                      {item.active ? '✓ Active' : '○ Inactive'}
                    </Text>
                  </View>
                </View>
                {item.email && (
                  <Text style={styles.teamMemberDetail}>📧 {item.email}</Text>
                )}
                {item.phone && (
                  <Text style={styles.teamMemberDetail}>📱 {formatPhoneNumber(item.phone)}</Text>
                )}
                {activeTab === 'loan_officers' && 'lead_eligible' in item && (
                  <View style={styles.teamMemberEligible}>
                    <Text style={[
                      styles.teamMemberEligibleText,
                      item.lead_eligible ? styles.teamMemberEligibleYes : styles.teamMemberEligibleNo
                    ]}>
                      {item.lead_eligible ? '✓ Lead Eligible' : '✕ Not Eligible'}
                    </Text>
                  </View>
                )}
                {activeTab === 'realtors' && (() => {
                  const r = item as Realtor;
                  return (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {r.lead_eligible && (
                        <View style={{ backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                          <Text style={{ fontSize: 11, color: '#2563EB' }}>Lead Eligible</Text>
                        </View>
                      )}
                      {r.ai_draft_access && (
                        <View style={{ backgroundColor: '#F3E8FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                          <Text style={{ fontSize: 11, color: '#7C3AED' }}>AI Drafts</Text>
                        </View>
                      )}
                      {r.preferred_language && r.preferred_language !== 'en' && (
                        <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                          <Text style={{ fontSize: 11, color: '#D97706' }}>
                            {r.preferred_language === 'es' ? 'Spanish' : r.preferred_language === 'ht' ? 'Haitian Creole' : r.preferred_language === 'pt' ? 'Portuguese' : r.preferred_language.toUpperCase()}
                          </Text>
                        </View>
                      )}
                      {r.county_filter && r.county_filter.length > 0 && (
                        <View style={{ backgroundColor: '#E0F2FE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                          <Text style={{ fontSize: 11, color: '#0369A1' }}>
                            {r.county_filter.join(', ')}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })()}
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.teamListContent}
            showsVerticalScrollIndicator={false}
          />

          {/* Add/Edit Modal */}
          <Modal
            visible={showAddEditModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowAddEditModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.teamModalContent}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.teamModalTitle}>
                    {editingMember ? 'Edit' : 'Add'} {activeTab === 'loan_officers' ? 'Loan Officer' : 'Realtor'}
                  </Text>

                  <Text style={styles.teamInputLabel}>First Name *</Text>
                  <TextInput
                    style={styles.teamInput}
                    value={formData.first_name}
                    onChangeText={(text) => setFormData({ ...formData, first_name: text })}
                    placeholder="Enter first name"
                    placeholderTextColor="#94A3B8"
                  />

                  <Text style={styles.teamInputLabel}>Last Name *</Text>
                  <TextInput
                    style={styles.teamInput}
                    value={formData.last_name}
                    onChangeText={(text) => setFormData({ ...formData, last_name: text })}
                    placeholder="Enter last name"
                    placeholderTextColor="#94A3B8"
                  />

                  <Text style={styles.teamInputLabel}>Email</Text>
                  <TextInput
                    style={styles.teamInput}
                    value={formData.email}
                    onChangeText={(text) => setFormData({ ...formData, email: text })}
                    placeholder="Enter email"
                    placeholderTextColor="#94A3B8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />

                  <Text style={styles.teamInputLabel}>Phone</Text>
                  <TextInput
                    style={styles.teamInput}
                    value={formData.phone ? formatPhoneNumber(formData.phone) : ''}
                    onChangeText={(text) => setFormData({ ...formData, phone: text.replace(/\D/g, '') })}
                    placeholder="Enter phone"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                  />

                  <TouchableOpacity
                    style={styles.teamCheckboxRow}
                    onPress={() => setFormData({ ...formData, active: !formData.active })}
                  >
                    <View style={[
                      styles.teamCheckbox,
                      formData.active && styles.teamCheckboxChecked
                    ]}>
                      {formData.active && <Text style={styles.teamCheckboxCheck}>✓</Text>}
                    </View>
                    <Text style={styles.teamCheckboxLabel}>Active</Text>
                  </TouchableOpacity>

                  {activeTab === 'loan_officers' && (
                    <TouchableOpacity
                      style={styles.teamCheckboxRow}
                      onPress={() => setFormData({ ...formData, lead_eligible: !formData.lead_eligible })}
                    >
                      <View style={[
                        styles.teamCheckbox,
                        formData.lead_eligible && styles.teamCheckboxChecked
                      ]}>
                        {formData.lead_eligible && <Text style={styles.teamCheckboxCheck}>✓</Text>}
                      </View>
                      <Text style={styles.teamCheckboxLabel}>Eligible for auto-assigned leads</Text>
                    </TouchableOpacity>
                  )}

                  {/* Realtor-specific fields */}
                  {activeTab === 'realtors' && (
                    <>
                      <TouchableOpacity
                        style={styles.teamCheckboxRow}
                        onPress={() => {
                          const newEligible = !formData.lead_eligible;
                          setFormData({
                            ...formData,
                            lead_eligible: newEligible,
                            // Clear counties when disabling lead eligibility
                            county_filter: newEligible ? formData.county_filter : [],
                          });
                          if (!newEligible) setShowCountyPicker(false);
                        }}
                      >
                        <View style={[
                          styles.teamCheckbox,
                          formData.lead_eligible && styles.teamCheckboxChecked
                        ]}>
                          {formData.lead_eligible && <Text style={styles.teamCheckboxCheck}>✓</Text>}
                        </View>
                        <Text style={styles.teamCheckboxLabel}>Lead Eligible (round-robin)</Text>
                      </TouchableOpacity>

                      {formData.lead_eligible && (
                        <>
                          <Text style={[styles.teamInputLabel, { marginTop: 4 }]}>Eligible Counties</Text>
                          <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>
                            Select which counties this realtor receives leads from. Leave empty for all counties.
                          </Text>
                          <TouchableOpacity
                            onPress={() => setShowCountyPicker(!showCountyPicker)}
                            style={{
                              borderWidth: 1,
                              borderColor: '#E2E8F0',
                              borderRadius: 8,
                              padding: 12,
                              marginBottom: 4,
                              backgroundColor: '#FFFFFF',
                            }}
                          >
                            <Text style={{ color: formData.county_filter.length > 0 ? '#1E293B' : '#94A3B8', fontSize: 14 }}>
                              {formData.county_filter.length > 0
                                ? `${formData.county_filter.length} selected: ${formData.county_filter.join(', ')}`
                                : 'All counties (tap to select specific ones)'}
                            </Text>
                          </TouchableOpacity>
                          {formData.county_filter.length > 0 && (
                            <TouchableOpacity
                              onPress={() => setFormData({ ...formData, county_filter: [] })}
                              style={{ marginBottom: 8 }}
                            >
                              <Text style={{ color: '#DC2626', fontSize: 12 }}>Clear county filter</Text>
                            </TouchableOpacity>
                          )}
                          {showCountyPicker && (
                            <View style={{ maxHeight: 200, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, marginBottom: 12, backgroundColor: '#FFFFFF' }}>
                              <ScrollView nestedScrollEnabled={true}>
                                {FLORIDA_COUNTIES.map((county) => {
                                  const isSelected = formData.county_filter.includes(county);
                                  return (
                                    <TouchableOpacity
                                      key={county}
                                      onPress={() => {
                                        const updated = isSelected
                                          ? formData.county_filter.filter(c => c !== county)
                                          : [...formData.county_filter, county];
                                        setFormData({ ...formData, county_filter: updated });
                                      }}
                                      style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        paddingHorizontal: 12,
                                        paddingVertical: 10,
                                        borderBottomWidth: 0.5,
                                        borderBottomColor: '#F1F5F9',
                                        backgroundColor: isSelected ? '#F5F3FF' : '#FFFFFF',
                                      }}
                                    >
                                      <View style={{
                                        width: 20,
                                        height: 20,
                                        borderRadius: 4,
                                        borderWidth: 1.5,
                                        borderColor: isSelected ? '#6D28D9' : '#CBD5E1',
                                        backgroundColor: isSelected ? '#6D28D9' : '#FFFFFF',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginRight: 10,
                                      }}>
                                        {isSelected && <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>✓</Text>}
                                      </View>
                                      <Text style={{ fontSize: 14, color: '#1E293B' }}>{county}</Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </ScrollView>
                            </View>
                          )}
                        </>
                      )}

                      <TouchableOpacity
                        style={styles.teamCheckboxRow}
                        onPress={() => setFormData({ ...formData, ai_draft_access: !formData.ai_draft_access })}
                      >
                        <View style={[
                          styles.teamCheckbox,
                          formData.ai_draft_access && styles.teamCheckboxChecked
                        ]}>
                          {formData.ai_draft_access && <Text style={styles.teamCheckboxCheck}>✓</Text>}
                        </View>
                        <Text style={styles.teamCheckboxLabel}>AI Draft Access</Text>
                      </TouchableOpacity>

                      <Text style={styles.teamInputLabel}>Preferred Language</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        {LANGUAGE_OPTIONS.map((lang) => (
                          <TouchableOpacity
                            key={lang.value}
                            onPress={() => setFormData({ ...formData, preferred_language: lang.value })}
                            style={{
                              paddingHorizontal: 14,
                              paddingVertical: 8,
                              borderRadius: 8,
                              borderWidth: 1.5,
                              borderColor: formData.preferred_language === lang.value ? '#6D28D9' : '#E2E8F0',
                              backgroundColor: formData.preferred_language === lang.value ? '#F5F3FF' : '#FFFFFF',
                            }}
                          >
                            <Text style={{
                              fontSize: 13,
                              fontWeight: formData.preferred_language === lang.value ? '600' : '400',
                              color: formData.preferred_language === lang.value ? '#6D28D9' : '#475569',
                            }}>
                              {lang.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={styles.teamInputLabel}>Secondary Language</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        <TouchableOpacity
                          onPress={() => setFormData({ ...formData, secondary_language: '' })}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 8,
                            borderWidth: 1.5,
                            borderColor: !formData.secondary_language ? '#6D28D9' : '#E2E8F0',
                            backgroundColor: !formData.secondary_language ? '#F5F3FF' : '#FFFFFF',
                          }}
                        >
                          <Text style={{
                            fontSize: 13,
                            fontWeight: !formData.secondary_language ? '600' : '400',
                            color: !formData.secondary_language ? '#6D28D9' : '#475569',
                          }}>None</Text>
                        </TouchableOpacity>
                        {LANGUAGE_OPTIONS.filter(l => l.value !== formData.preferred_language).map((lang) => (
                          <TouchableOpacity
                            key={lang.value}
                            onPress={() => setFormData({ ...formData, secondary_language: lang.value })}
                            style={{
                              paddingHorizontal: 14,
                              paddingVertical: 8,
                              borderRadius: 8,
                              borderWidth: 1.5,
                              borderColor: formData.secondary_language === lang.value ? '#6D28D9' : '#E2E8F0',
                              backgroundColor: formData.secondary_language === lang.value ? '#F5F3FF' : '#FFFFFF',
                            }}
                          >
                            <Text style={{
                              fontSize: 13,
                              fontWeight: formData.secondary_language === lang.value ? '600' : '400',
                              color: formData.secondary_language === lang.value ? '#6D28D9' : '#475569',
                            }}>
                              {lang.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={styles.teamInputLabel}>Admin Notes</Text>
                      <TextInput
                        style={[styles.teamInput, { height: 80, textAlignVertical: 'top' }]}
                        value={formData.notes}
                        onChangeText={(text) => setFormData({ ...formData, notes: text })}
                        placeholder="Internal notes about this realtor..."
                        placeholderTextColor="#94A3B8"
                        multiline
                        numberOfLines={3}
                      />
                    </>
                  )}

                  <View style={styles.teamModalButtons}>
                    {editingMember && (
                      <TouchableOpacity
                        style={styles.teamDeleteButton}
                        onPress={() => {
                          setShowAddEditModal(false);
                          handleDelete(editingMember);
                        }}
                      >
                        <Text style={styles.teamDeleteButtonText}>Delete</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.teamCancelButton}
                      onPress={() => setShowAddEditModal(false)}
                    >
                      <Text style={styles.teamCancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.teamSaveButton, saving && styles.teamSaveButtonDisabled]}
                      onPress={handleSave}
                      disabled={saving}
                    >
                      <Text style={styles.teamSaveButtonText}>
                        {saving ? 'Saving...' : editingMember ? 'Update' : 'Add'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
}

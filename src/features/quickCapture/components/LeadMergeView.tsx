// src/features/quickCapture/components/LeadMergeView.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { QuickCapture } from '../types';
import type { MatchedLead } from '../services/leadMatchService';

type MergeField = {
  key: string;
  label: string;
  captureValue: string | null;
  existingValue: string | null;
};

type LeadMergeViewProps = {
  capture: QuickCapture;
  existingLead: MatchedLead;
  onMerge: (fieldsToUpdate: Record<string, any>) => Promise<void>;
  onCancel: () => void;
  merging: boolean;
};

function mapLoanType(loanType: 'purchase' | 'refinance' | null): string | null {
  if (loanType === 'purchase') return 'Purchase';
  if (loanType === 'refinance') return 'Refinance';
  return null;
}

function normalizePhone(phone: string | null): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(-10);
}

function buildMergeFields(capture: QuickCapture, existing: MatchedLead): MergeField[] {
  const fields: MergeField[] = [];

  const add = (key: string, label: string, captureVal: string | null, existingVal: string | null, isPhone?: boolean) => {
    // Only show fields where at least one side has a value
    if (captureVal || existingVal) {
      // For phone fields, treat normalized-equal values as identical (keep existing)
      if (isPhone && captureVal && existingVal && normalizePhone(captureVal) === normalizePhone(existingVal)) {
        fields.push({ key, label, captureValue: captureVal, existingValue: existingVal });
        return;
      }
      fields.push({ key, label, captureValue: captureVal, existingValue: existingVal });
    }
  };

  add('first_name', 'First Name', capture.first_name, existing.first_name);
  add('last_name', 'Last Name', capture.last_name, existing.last_name);
  add('email', 'Email', capture.email, existing.email);
  add('phone', 'Phone', capture.phone, existing.phone, true);

  // Notes → message (lead) or additional_notes (meta)
  const notesKey = existing.source === 'lead' ? 'message' : 'additional_notes';
  const existingNotes = existing.source === 'lead' ? existing.message : existing.additional_notes;
  add(notesKey, 'Notes', capture.notes, existingNotes || null);

  // Loan type → loan_purpose (both leads and meta_ads)
  add('loan_purpose', 'Loan Purpose', mapLoanType(capture.loan_type), existing.loan_purpose || null);

  // Sales Price
  if (existing.source === 'lead') {
    const priceStr = existing.price != null ? `$${existing.price.toLocaleString()}` : null;
    add('price', 'Sales Price', null, priceStr);
  } else {
    add('price_range', 'Price Range', null, existing.price_range || null);
  }

  // Down Payment
  if (existing.source === 'lead') {
    const dpStr = existing.down_payment != null ? `$${existing.down_payment.toLocaleString()}` : null;
    add('down_payment', 'Down Payment', null, dpStr);
  } else {
    add('down_payment_saved', 'Down Payment Saved', null, existing.down_payment_saved || null);
  }

  // Credit
  if (existing.source === 'lead') {
    const creditStr = existing.credit_score != null ? String(existing.credit_score) : null;
    add('credit_score', 'Credit Score', null, creditStr);
  } else {
    add('credit_range', 'Credit Range', null, existing.credit_range || null);
  }

  // Realtor
  if (capture.realtor_id || existing.realtor_id) {
    const captureRealtorDisplay = capture.realtor_id
      ? [capture.realtor_first_name, capture.realtor_last_name].filter(Boolean).join(' ') || capture.realtor_id
      : null;
    // We don't have the existing realtor name readily, so just show ID presence
    const existingRealtorDisplay = existing.realtor_id ? '(assigned)' : null;
    add('realtor_id', 'Realtor', captureRealtorDisplay, existingRealtorDisplay);
  }

  return fields;
}

export default function LeadMergeView({
  capture,
  existingLead,
  onMerge,
  onCancel,
  merging,
}: LeadMergeViewProps) {
  const fields = buildMergeFields(capture, existingLead);

  // 'capture' = use quick capture value, 'existing' = keep existing, null = no selection yet
  const [selections, setSelections] = useState<Record<string, 'capture' | 'existing'>>(() => {
    const initial: Record<string, 'capture' | 'existing'> = {};
    for (const f of fields) {
      if (f.captureValue && !f.existingValue) {
        // Only capture has a value → default to capture
        initial[f.key] = 'capture';
      } else if (!f.captureValue && f.existingValue) {
        // Only existing has a value → default to existing
        initial[f.key] = 'existing';
      } else if (f.captureValue === f.existingValue) {
        // Same value → default to existing (no change needed)
        initial[f.key] = 'existing';
      } else if (f.key === 'phone' && f.captureValue && f.existingValue && normalizePhone(f.captureValue) === normalizePhone(f.existingValue)) {
        // Phone numbers are the same after normalization → default to existing
        initial[f.key] = 'existing';
      } else if (f.key === 'email' && f.captureValue && f.existingValue && f.captureValue.trim().toLowerCase() === f.existingValue.trim().toLowerCase()) {
        // Emails are the same case-insensitively → default to existing
        initial[f.key] = 'existing';
      } else {
        // Both have different values → default to capture (newer info)
        initial[f.key] = 'capture';
      }
    }
    return initial;
  });

  const toggleSelection = (key: string) => {
    setSelections((prev) => ({
      ...prev,
      [key]: prev[key] === 'capture' ? 'existing' : 'capture',
    }));
  };

  const handleMerge = async () => {
    const fieldsToUpdate: Record<string, any> = {};

    for (const f of fields) {
      if (selections[f.key] === 'capture' && f.captureValue) {
        // Special handling for realtor_id — use the actual ID not display name
        if (f.key === 'realtor_id') {
          fieldsToUpdate.realtor_id = capture.realtor_id;
        } else {
          fieldsToUpdate[f.key] = f.captureValue;
        }
      }
      // If 'existing' is selected, we don't need to update that field
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      Alert.alert('No Changes', 'No fields selected from the quick capture to merge.');
      return;
    }

    await onMerge(fieldsToUpdate);
  };

  const existingName = [existingLead.first_name, existingLead.last_name].filter(Boolean).join(' ') || 'Unknown';
  const sourceLabel = existingLead.source === 'meta' ? 'Meta Ad Lead' : 'Lead';

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Merge Into Existing Lead</Text>
        <TouchableOpacity onPress={onCancel} style={s.closeBtn}>
          <Ionicons name="close" size={22} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <View style={s.matchInfo}>
        <Ionicons name="git-merge-outline" size={18} color="#7C3AED" />
        <Text style={s.matchInfoText}>
          Merging into <Text style={s.bold}>{existingName}</Text> ({sourceLabel} · {existingLead.matchReason})
        </Text>
      </View>

      <View style={s.columnHeaders}>
        <Text style={s.columnHeaderLeft}>Quick Capture</Text>
        <Text style={s.columnHeaderRight}>Existing Lead</Text>
      </View>

      <ScrollView style={s.fieldList} showsVerticalScrollIndicator={false}>
        {fields.map((f) => {
          const sel = selections[f.key];
          const isPhoneMatch = f.key === 'phone' && f.captureValue && f.existingValue && normalizePhone(f.captureValue) === normalizePhone(f.existingValue);
          const isEmailMatch = f.key === 'email' && f.captureValue && f.existingValue && f.captureValue.trim().toLowerCase() === f.existingValue.trim().toLowerCase();
          const hasConflict = !!(f.captureValue && f.existingValue && f.captureValue !== f.existingValue && !isPhoneMatch && !isEmailMatch);

          return (
            <View key={f.key} style={s.fieldRow}>
              <Text style={s.fieldLabel}>{f.label}</Text>
              <View style={s.fieldOptions}>
                <TouchableOpacity
                  style={[
                    s.fieldOption,
                    sel === 'capture' && s.fieldOptionSelected,
                    !f.captureValue && s.fieldOptionEmpty,
                  ]}
                  onPress={() => f.captureValue ? toggleSelection(f.key) : null}
                  disabled={!f.captureValue}
                >
                  <Text
                    style={[
                      s.fieldOptionText,
                      sel === 'capture' && s.fieldOptionTextSelected,
                      !f.captureValue && s.fieldOptionTextEmpty,
                    ]}
                    numberOfLines={2}
                  >
                    {f.captureValue || '—'}
                  </Text>
                  {sel === 'capture' && f.captureValue && (
                    <Ionicons name="checkmark-circle" size={16} color="#7C3AED" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    s.fieldOption,
                    sel === 'existing' && s.fieldOptionSelected,
                    !f.existingValue && s.fieldOptionEmpty,
                  ]}
                  onPress={() => f.existingValue ? toggleSelection(f.key) : null}
                  disabled={!f.existingValue}
                >
                  <Text
                    style={[
                      s.fieldOptionText,
                      sel === 'existing' && s.fieldOptionTextSelected,
                      !f.existingValue && s.fieldOptionTextEmpty,
                    ]}
                    numberOfLines={2}
                  >
                    {f.existingValue || '—'}
                  </Text>
                  {sel === 'existing' && f.existingValue && (
                    <Ionicons name="checkmark-circle" size={16} color="#7C3AED" />
                  )}
                </TouchableOpacity>
              </View>
              {hasConflict && (
                <View style={s.conflictBadge}>
                  <Ionicons name="alert-circle" size={12} color="#F59E0B" />
                  <Text style={s.conflictText}>Different values — pick one</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={s.actions}>
        <TouchableOpacity style={s.cancelBtn} onPress={onCancel} disabled={merging}>
          <Text style={s.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.mergeBtn, merging && s.mergeBtnDisabled]}
          onPress={handleMerge}
          disabled={merging}
        >
          {merging ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="git-merge-outline" size={18} color="#FFFFFF" />
              <Text style={s.mergeBtnText}>Merge & Convert</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  closeBtn: {
    padding: 4,
  },
  matchInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
  },
  matchInfoText: {
    fontSize: 13,
    color: '#4B5563',
    flex: 1,
  },
  bold: {
    fontWeight: '700',
    color: '#1F2937',
  },
  columnHeaders: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  columnHeaderLeft: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7C3AED',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  columnHeaderRight: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldList: {
    flex: 1,
    marginBottom: 16,
  },
  fieldRow: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  fieldOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  fieldOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  fieldOptionSelected: {
    borderColor: '#7C3AED',
    backgroundColor: '#F5F3FF',
  },
  fieldOptionEmpty: {
    opacity: 0.5,
  },
  fieldOptionText: {
    fontSize: 13,
    color: '#4B5563',
    flex: 1,
  },
  fieldOptionTextSelected: {
    color: '#7C3AED',
    fontWeight: '600',
  },
  fieldOptionTextEmpty: {
    fontStyle: 'italic',
    color: '#9CA3AF',
  },
  conflictBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  conflictText: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  mergeBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
  },
  mergeBtnDisabled: {
    opacity: 0.5,
  },
  mergeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

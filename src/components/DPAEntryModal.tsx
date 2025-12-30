// src/components/DPAEntryModal.tsx
// Down Payment Assistance Entry Modal

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../styles/theme';
import {
  DPAEntry,
  DPAValueType,
  DPAPaymentType,
  DPA_PRESETS,
  createEmptyDPA,
  generateDPAId,
} from '../utils/dpaTypes';
import { calculateDPAAmount, calculateDPAPayment } from '../utils/dpaCalculations';

interface DPAEntryModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (entry: DPAEntry) => void;
  editEntry?: DPAEntry | null;
  salesPrice: number;
  loanAmount: number; // Total loan amount (including financed fees)
  firstMortgageRate: number; // First mortgage rate for dynamic rate calculation
}

export default function DPAEntryModal({
  visible,
  onClose,
  onSave,
  editEntry,
  salesPrice,
  loanAmount,
  firstMortgageRate,
}: DPAEntryModalProps) {
  const { colors, isDark } = useThemeColors();

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<DPAValueType>('salesPrice');
  const [value, setValue] = useState('');
  const [paymentType, setPaymentType] = useState<DPAPaymentType>('none');
  const [rate, setRate] = useState('');
  const [term, setTerm] = useState('360');
  const [fixedPayment, setFixedPayment] = useState('');
  const [fees, setFees] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');
  const [showPresetPicker, setShowPresetPicker] = useState(false);

  // Reset form when modal opens/closes or editEntry changes
  useEffect(() => {
    if (visible) {
      if (editEntry) {
        // Editing existing entry
        setName(editEntry.name);
        setType(editEntry.type);
        setValue(editEntry.type === 'fixed' 
          ? editEntry.value.toString() 
          : editEntry.value.toString());
        setPaymentType(editEntry.paymentType);
        setRate(editEntry.rate > 0 ? editEntry.rate.toString() : '');
        setTerm(editEntry.term > 0 ? editEntry.term.toString() : '360');
        setFixedPayment(editEntry.fixedPayment > 0 ? editEntry.fixedPayment.toString() : '');
        setFees(editEntry.fees > 0 ? editEntry.fees.toString() : '');
        setSelectedPreset('custom');
      } else {
        // New entry
        resetForm();
      }
    }
  }, [visible, editEntry]);

  const resetForm = () => {
    setName('');
    setType('salesPrice');
    setValue('');
    setPaymentType('none');
    setRate('');
    setTerm('360');
    setFixedPayment('');
    setFees('');
    setSelectedPreset('custom');
  };

  // Apply preset
  const applyPreset = (presetLabel: string) => {
    if (presetLabel === 'custom') {
      resetForm();
      setSelectedPreset('custom');
      return;
    }

    const preset = DPA_PRESETS.find((p) => p.label === presetLabel);
    if (preset) {
      setName(preset.entry.name);
      setType(preset.entry.type);
      setValue(preset.entry.value.toString());
      setPaymentType(preset.entry.paymentType);
      // Apply rate offset if preset has one (e.g., Access Zero = 1st mortgage + 2%)
      const calculatedRate = preset.rateOffset 
        ? (firstMortgageRate + preset.rateOffset).toFixed(3)
        : (preset.entry.rate > 0 ? preset.entry.rate.toString() : '');
      setRate(calculatedRate);
      setTerm(preset.entry.term > 0 ? preset.entry.term.toString() : '360');
      setFixedPayment(preset.entry.fixedPayment > 0 ? preset.entry.fixedPayment.toString() : '');
      setFees(preset.entry.fees > 0 ? preset.entry.fees.toString() : '');
      setSelectedPreset(presetLabel);
    }
    setShowPresetPicker(false);
  };

  // Calculate DPA amount
  const calculatedAmount = useMemo(() => {
    const entry: DPAEntry = {
      id: '',
      name,
      type,
      value: parseFloat(value) || 0,
      paymentType,
      rate: parseFloat(rate) || 0,
      term: parseFloat(term) || 0,
      fixedPayment: parseFloat(fixedPayment) || 0,
      fees: parseFloat(fees) || 0,
    };
    return calculateDPAAmount(entry, salesPrice, loanAmount);
  }, [type, value, salesPrice, loanAmount]);

  // Calculate monthly payment
  const calculatedPayment = useMemo(() => {
    const entry: DPAEntry = {
      id: '',
      name,
      type,
      value: parseFloat(value) || 0,
      paymentType,
      rate: parseFloat(rate) || 0,
      term: parseFloat(term) || 0,
      fixedPayment: parseFloat(fixedPayment) || 0,
      fees: parseFloat(fees) || 0,
    };
    return calculateDPAPayment(entry, calculatedAmount);
  }, [paymentType, rate, term, fixedPayment, calculatedAmount]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatCurrencyDetailed = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const handleSave = () => {
    const entry: DPAEntry = {
      id: editEntry?.id || generateDPAId(),
      name: name || 'DPA Program',
      type,
      value: parseFloat(value) || 0,
      paymentType,
      rate: parseFloat(rate) || 0,
      term: parseFloat(term) || 360,
      fixedPayment: parseFloat(fixedPayment) || 0,
      fees: parseFloat(fees) || 0,
    };
    onSave(entry);
    onClose();
  };

  const styles = StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.cardBackground,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '90%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    },
    section: {
      marginBottom: 20,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    input: {
      backgroundColor: isDark ? '#1F2937' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 14,
      fontSize: 16,
      color: colors.textPrimary,
    },
    pickerButton: {
      backgroundColor: isDark ? '#1F2937' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 14,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    pickerButtonText: {
      fontSize: 16,
      color: colors.textPrimary,
    },
    radioGroup: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    radioButton: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: isDark ? '#1F2937' : '#F8FAFC',
    },
    radioButtonActive: {
      backgroundColor: '#7C3AED',
      borderColor: '#7C3AED',
    },
    radioButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    radioButtonTextActive: {
      color: '#FFFFFF',
    },
    calculatedValue: {
      backgroundColor: isDark ? '#1F2937' : '#F0F9FF',
      borderRadius: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: '#7C3AED',
    },
    calculatedValueText: {
      fontSize: 18,
      fontWeight: '700',
      color: '#7C3AED',
      textAlign: 'right',
    },
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    halfWidth: {
      flex: 1,
    },
    saveButton: {
      backgroundColor: '#7C3AED',
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 10,
    },
    saveButtonText: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '700',
    },
    presetPicker: {
      backgroundColor: colors.cardBackground,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 20,
      paddingBottom: Platform.OS === 'ios' ? 40 : 20,
      maxHeight: '50%',
    },
    presetItem: {
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    presetItemText: {
      fontSize: 16,
      color: colors.textPrimary,
    },
    presetItemSelected: {
      backgroundColor: isDark ? '#1F2937' : '#F8FAFC',
    },
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editEntry ? 'Edit DPA Program' : 'Add DPA Program'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Preset Selector */}
            <View style={styles.section}>
              <Text style={styles.label}>Quick Select (Optional)</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowPresetPicker(true)}
              >
                <Text style={styles.pickerButtonText}>
                  {selectedPreset === 'custom' ? 'Custom Program' : selectedPreset}
                </Text>
                <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Name */}
            <View style={styles.section}>
              <Text style={styles.label}>Program Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter program name"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* Type */}
            <View style={styles.section}>
              <Text style={styles.label}>Type</Text>
              <View style={styles.radioGroup}>
                {[
                  { value: 'salesPrice', label: 'Sales Price %' },
                  { value: 'loanAmount', label: 'Loan Amount %' },
                  { value: 'fixed', label: 'Fixed Amount' },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.radioButton,
                      type === option.value && styles.radioButtonActive,
                    ]}
                    onPress={() => {
                      setType(option.value as DPAValueType);
                      setValue(''); // Reset value when type changes
                    }}
                  >
                    <Text
                      style={[
                        styles.radioButtonText,
                        type === option.value && styles.radioButtonTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Value */}
            <View style={styles.section}>
              <Text style={styles.label}>
                {type === 'fixed' ? 'Amount ($)' : 'Value (%)'}
              </Text>
              <TextInput
                style={styles.input}
                value={value}
                onChangeText={setValue}
                keyboardType="decimal-pad"
                placeholder={type === 'fixed' ? '10000' : '5'}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* Calculated Value */}
            <View style={styles.section}>
              <Text style={styles.label}>Calculated Value</Text>
              <View style={styles.calculatedValue}>
                <Text style={styles.calculatedValueText}>
                  {formatCurrency(calculatedAmount)}
                </Text>
              </View>
            </View>

            {/* Payment Type */}
            <View style={styles.section}>
              <Text style={styles.label}>Payment Type</Text>
              <View style={styles.radioGroup}>
                {[
                  { value: 'none', label: 'None (Forgivable)' },
                  { value: 'fixed', label: 'Fixed' },
                  { value: 'loanPI', label: 'Loan (P&I)' },
                  { value: 'loanIO', label: 'Loan (I/O)' },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.radioButton,
                      paymentType === option.value && styles.radioButtonActive,
                    ]}
                    onPress={() => setPaymentType(option.value as DPAPaymentType)}
                  >
                    <Text
                      style={[
                        styles.radioButtonText,
                        paymentType === option.value && styles.radioButtonTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Conditional fields based on payment type */}
            {paymentType === 'fixed' && (
              <View style={styles.section}>
                <Text style={styles.label}>Fixed Monthly Payment ($)</Text>
                <TextInput
                  style={styles.input}
                  value={fixedPayment}
                  onChangeText={setFixedPayment}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            )}

            {(paymentType === 'loanPI' || paymentType === 'loanIO') && (
              <View style={styles.row}>
                <View style={[styles.section, styles.halfWidth]}>
                  <Text style={styles.label}>Interest Rate (%)</Text>
                  <TextInput
                    style={styles.input}
                    value={rate}
                    onChangeText={setRate}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={[styles.section, styles.halfWidth]}>
                  <Text style={styles.label}>Term (months)</Text>
                  <TextInput
                    style={styles.input}
                    value={term}
                    onChangeText={setTerm}
                    keyboardType="numeric"
                    placeholder="360"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>
            )}

            {/* Monthly Payment (calculated) */}
            {paymentType !== 'none' && (
              <View style={styles.section}>
                <Text style={styles.label}>Monthly Payment</Text>
                <View style={styles.calculatedValue}>
                  <Text style={styles.calculatedValueText}>
                    {formatCurrencyDetailed(calculatedPayment)}
                  </Text>
                </View>
              </View>
            )}

            {/* Fees */}
            <View style={styles.section}>
              <Text style={styles.label}>Fees ($)</Text>
              <TextInput
                style={styles.input}
                value={fees}
                onChangeText={setFees}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* Save Button */}
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>
                {editEntry ? 'Update Program' : 'Add Program'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>

      {/* Preset Picker Modal */}
      <Modal
        visible={showPresetPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPresetPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.presetPicker}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Program</Text>
              <TouchableOpacity onPress={() => setShowPresetPicker(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <TouchableOpacity
                style={[
                  styles.presetItem,
                  selectedPreset === 'custom' && styles.presetItemSelected,
                ]}
                onPress={() => applyPreset('custom')}
              >
                <Text style={styles.presetItemText}>Custom Program</Text>
              </TouchableOpacity>
              {DPA_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.label}
                  style={[
                    styles.presetItem,
                    selectedPreset === preset.label && styles.presetItemSelected,
                  ]}
                  onPress={() => applyPreset(preset.label)}
                >
                  <Text style={styles.presetItemText}>{preset.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

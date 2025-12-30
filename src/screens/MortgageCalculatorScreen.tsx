// src/screens/MortgageCalculatorScreen.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  KeyboardAvoidingView,
  PanResponder,
  Linking,
  Alert,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors } from '../styles/theme';
import {
  calculateMortgage,
  MortgageInputs,
  MortgageResults,
  LoanType,
  CreditBand,
  VALoanUsage,
  MIN_DOWN_BY_LOAN,
  DEFAULT_FEES,
} from '../utils/mortgageCalculations';
import { FLORIDA_COUNTIES } from '../utils/floridaCounties';
import { fetchRates, getRateForLoanType, type RateData } from '../utils/rateService';
import { DPAEntry, createEmptyDPA } from '../utils/dpaTypes';
import {
  calculateTotalDPA,
  calculateTotalDPAPayment,
  calculateTotalDPAFees,
  calculateDPAAmount,
  calculateDPAPayment,
  calculateLTV,
  calculateCLTV,
  formatDPAForText,
} from '../utils/dpaCalculations';
import DPAEntryModal from '../components/DPAEntryModal';

const STORAGE_KEY = '@mortgage_calculator_inputs';

interface MortgageCalculatorScreenProps {
  onClose: () => void;
}

export default function MortgageCalculatorScreen({ onClose }: MortgageCalculatorScreenProps) {
  const { colors, isDark } = useThemeColors();

  // Input states
  const [price, setPrice] = useState('450,000');
  const [loanType, setLoanType] = useState<LoanType>('Conventional');
  const [downPct, setDownPct] = useState('3');
  const [termYears, setTermYears] = useState(30);
  const [creditBand, setCreditBand] = useState<CreditBand>('740-759');
  const [county, setCounty] = useState('Broward');
  const [annualTax, setAnnualTax] = useState('6,000');
  const [annualIns, setAnnualIns] = useState('2,400');
  const [buyerPaysSellerTransfer, setBuyerPaysSellerTransfer] = useState(false);
  const [vaLoanUsage, setVaLoanUsage] = useState<VALoanUsage>('firstUse');
  const [sellerCredit, setSellerCredit] = useState('0');
  const [sellerCreditType, setSellerCreditType] = useState<'percentage' | 'dollar'>('percentage');
  const [customRate, setCustomRate] = useState('');
  const [discountPoints, setDiscountPoints] = useState('0.5');
  const [dpaEntries, setDpaEntries] = useState<DPAEntry[]>([]);
  
  // Rate fetching state
  const [rates, setRates] = useState<RateData | null>(null);
  const [loadingRates, setLoadingRates] = useState(true);

  // UI states
  const [showLoanTypePicker, setShowLoanTypePicker] = useState(false);
  const [showCountyPicker, setShowCountyPicker] = useState(false);
  const [showCreditPicker, setShowCreditPicker] = useState(false);
  const [showVAPicker, setShowVAPicker] = useState(false);
  const [showClosingBreakdown, setShowClosingBreakdown] = useState(false);
  const [showPrepaidsBreakdown, setShowPrepaidsBreakdown] = useState(false);
  const [showDPAModal, setShowDPAModal] = useState(false);
  const [editingDPA, setEditingDPA] = useState<DPAEntry | null>(null);

  // Fetch rates on mount
  useEffect(() => {
    const loadRates = async () => {
      try {
        setLoadingRates(true);
        const rateData = await fetchRates();
        setRates(rateData);
      } catch (error) {
        console.error('Failed to fetch rates:', error);
      } finally {
        setLoadingRates(false);
      }
    };
    loadRates();
  }, []);

  // Clear custom rate when loan type changes (so it uses the live rate for the new loan type)
  useEffect(() => {
    if (customRate) {
      setCustomRate('');
    }
  }, [loanType]);

  // Load saved inputs on mount
  useEffect(() => {
    loadSavedInputs();
  }, []);

  // Save inputs whenever they change
  useEffect(() => {
    saveInputs();
  }, [price, loanType, downPct, termYears, creditBand, county, annualTax, annualIns, 
      buyerPaysSellerTransfer, vaLoanUsage, sellerCredit, sellerCreditType, customRate, dpaEntries]);

  const loadSavedInputs = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.price) setPrice(formatNumberWithCommas(data.price));
        if (data.loanType) setLoanType(data.loanType);
        if (data.downPct !== undefined) setDownPct(data.downPct.toString());
        if (data.termYears) setTermYears(data.termYears);
        if (data.creditBand) setCreditBand(data.creditBand);
        if (data.county) setCounty(data.county);
        if (data.annualTax) setAnnualTax(formatNumberWithCommas(data.annualTax));
        if (data.annualIns) setAnnualIns(formatNumberWithCommas(data.annualIns));
        if (data.buyerPaysSellerTransfer !== undefined) setBuyerPaysSellerTransfer(data.buyerPaysSellerTransfer);
        if (data.vaLoanUsage) setVaLoanUsage(data.vaLoanUsage);
        if (data.sellerCredit) setSellerCredit(formatNumberWithCommas(data.sellerCredit));
        if (data.sellerCreditType) setSellerCreditType(data.sellerCreditType);
        if (data.customRate) setCustomRate(data.customRate);
        if (data.discountPoints !== undefined) setDiscountPoints(data.discountPoints.toString());
        if (data.dpaEntries) setDpaEntries(data.dpaEntries);
      }
    } catch (error) {
      console.error('Failed to load saved inputs:', error);
    }
  };

  const saveInputs = async () => {
    try {
      const data = {
        price, loanType, downPct, termYears, creditBand, county, annualTax, annualIns,
        buyerPaysSellerTransfer, vaLoanUsage, sellerCredit, sellerCreditType, customRate, discountPoints, dpaEntries
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save inputs:', error);
    }
  };

  // Check if Hometown Heroes, FL Assist, or FHFC HFA Plus is in DPA (waives intangible & doc stamps)
  const hasWaivedTaxProgram = useMemo(() => {
    return dpaEntries.some(e => 
      e.name === 'Hometown Heroes' || e.name === 'FL Assist' || e.name === 'FHFC HFA Plus'
    );
  }, [dpaEntries]);

  // Calculate results
  const results: MortgageResults = useMemo(() => {
    // Determine which rate to use: custom rate if entered, otherwise live rate from API
    let rateToUse: number | undefined;
    if (customRate) {
      rateToUse = parseFloat(customRate.replace(/[^0-9.]/g, ''));
    } else if (rates) {
      rateToUse = getRateForLoanType(rates, loanType);
    }

    const inputs: MortgageInputs = {
      price: parseFloat(price.replace(/[^0-9.]/g, '')) || 0,
      loanType,
      downPct: parseFloat(downPct) || MIN_DOWN_BY_LOAN[loanType],
      termYears,
      creditBand,
      county,
      annualTax: parseFloat(annualTax.replace(/[^0-9.]/g, '')) || 0,
      annualIns: parseFloat(annualIns.replace(/[^0-9.]/g, '')) || 0,
      buyerPaysSellerTransfer,
      vaLoanUsage,
      sellerCredit: parseFloat(sellerCredit.replace(/[^0-9.]/g, '')) || 0,
      sellerCreditType,
      customRate: rateToUse,
    };
    return calculateMortgage(inputs, DEFAULT_FEES, { waiveIntangibleAndDeed: hasWaivedTaxProgram });
  }, [price, loanType, downPct, termYears, creditBand, county, annualTax, annualIns, 
      buyerPaysSellerTransfer, vaLoanUsage, sellerCredit, sellerCreditType, customRate, rates, hasWaivedTaxProgram]);

  // Calculate discount points dollar amount
  const discountPointsAmount = useMemo(() => {
    const points = parseFloat(discountPoints) || 0;
    // For FHA/VA: multiply by total loan (includes financed fee)
    // For Conventional: multiply by base loan amount
    const loanForPoints = (loanType === 'FHA' || loanType === 'VA') 
      ? results.baseLoan 
      : results.baseLoanBeforeFee;
    return loanForPoints * (points / 100);
  }, [discountPoints, results.baseLoan, results.baseLoanBeforeFee, loanType]);

  // Calculate DPA totals
  const priceValue = parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
  const totalDPAAmount = useMemo(() => {
    return calculateTotalDPA(dpaEntries, priceValue, results.baseLoan);
  }, [dpaEntries, priceValue, results.baseLoan]);

  const totalDPAPayment = useMemo(() => {
    return calculateTotalDPAPayment(dpaEntries, priceValue, results.baseLoan);
  }, [dpaEntries, priceValue, results.baseLoan]);

  const totalDPAFees = useMemo(() => {
    return calculateTotalDPAFees(dpaEntries);
  }, [dpaEntries]);

  // Calculate LTV and CLTV
  const ltv = useMemo(() => {
    return calculateLTV(results.baseLoan, priceValue);
  }, [results.baseLoan, priceValue]);

  const cltv = useMemo(() => {
    return calculateCLTV(results.baseLoan, totalDPAAmount, priceValue);
  }, [results.baseLoan, totalDPAAmount, priceValue]);

  // Adjusted cash to close including discount points and DPA
  // DPA reduces cash needed, fees add to it
  const adjustedCashToClose = results.cashToClose + discountPointsAmount - totalDPAAmount + totalDPAFees;

  // Total monthly payment including DPA payments
  const totalMonthlyWithDPA = results.monthlyTotal + totalDPAPayment;

  // DPA handlers
  const handleSaveDPA = (entry: DPAEntry) => {
    // Calculate new DPA entries
    const newEntries = (() => {
      const existingIndex = dpaEntries.findIndex((e) => e.id === entry.id);
      if (existingIndex >= 0) {
        const updated = [...dpaEntries];
        updated[existingIndex] = entry;
        return updated;
      }
      return [...dpaEntries, entry];
    })();
    
    // Calculate total DPA
    let dpaTotal = 0;
    for (const e of newEntries) {
      if (e.type === 'fixed') dpaTotal += e.value;
      else if (e.type === 'salesPrice') dpaTotal += priceValue * (e.value / 100);
      else if (e.type === 'loanAmount') dpaTotal += priceValue * 0.965 * (e.value / 100);
    }
    
    // Check if CLTV would exceed 105% at current down payment
    const feeMultiplier = loanType === 'FHA' ? 1.0175 : loanType === 'VA' ? 1.023 : 1;
    const currentDown = parseFloat(downPct) || MIN_DOWN_BY_LOAN[loanType];
    const currentLoan = priceValue * (1 - currentDown / 100) * feeMultiplier;
    const projectedCLTV = ((currentLoan + dpaTotal) / priceValue) * 100;
    
    // Auto-adjust if needed
    if (projectedCLTV > 105) {
      const maxBaseLoan = priceValue * 1.05 - dpaTotal;
      const maxBaseLoanBeforeFee = maxBaseLoan / feeMultiplier;
      const optimalDownPct = ((priceValue - maxBaseLoanBeforeFee) / priceValue) * 100;
      const minDown = MIN_DOWN_BY_LOAN[loanType];
      const finalDownPct = Math.max(Math.ceil(optimalDownPct * 2) / 2, minDown);
      setDownPct(finalDownPct.toFixed(1));
    }
    
    setDpaEntries(newEntries);
    setEditingDPA(null);
  };

  const handleDeleteDPA = (id: string) => {
    setDpaEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleEditDPA = (entry: DPAEntry) => {
    setEditingDPA(entry);
    setShowDPAModal(true);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleTextResults = async () => {
    const priceValue = parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
    const downPaymentAmount = results.actualDownPayment;
    const downPaymentPct = parseFloat(downPct) || 0;

    const financedFeeBlurb = results.financedFee > 0 
      ? loanType === 'FHA'
        ? `\n• UFMIP (1.75%): ${formatCurrency(results.financedFee)} (financed)`
        : `\n• VA Funding Fee (${(results.feeRate * 100).toFixed(2)}%): ${formatCurrency(results.financedFee)} (financed)`
      : '';

    const message = `Hi,

🏠 Mortgage Illustration

📍 ${county} County, FL
💰 Sales Price: ${formatCurrency(priceValue)}
💵 Down Payment: ${formatCurrency(downPaymentAmount)} (${downPaymentPct}%)

📋 Loan Details
• Type: ${loanType}${dpaEntries.length > 0 ? ` + ${dpaEntries.map(e => e.name || 'DPA').join(', ')}` : ''}
• Term: ${termYears} years
• Rate: ${results.noteRate.toFixed(3)}% | APR: ${results.apr.toFixed(3)}%
• Base Loan: ${formatCurrency(results.baseLoanBeforeFee)}${financedFeeBlurb}${results.financedFee > 0 ? `\n• Total Loan: ${formatCurrency(results.baseLoan)}` : ''}

💳 Monthly Payment: ${formatCurrencyDetailed(totalMonthlyWithDPA)}
• P&I: ${formatCurrency(results.monthlyPI)}
• Taxes: ${formatCurrency(results.monthlyTax)}
• Insurance: ${formatCurrency(results.monthlyIns)}${results.monthlyMI > 0 ? `\n• MI: ${formatCurrency(results.monthlyMI)}` : ''}${totalDPAPayment > 0 ? `\n• DPA Payment: ${formatCurrency(totalDPAPayment)}` : ''}

🔑 Cash to Close: ${formatCurrencyDetailed(adjustedCashToClose)}
• Down Payment: ${formatCurrency(results.actualDownPayment)}
• Closing Costs: ${formatCurrency(results.closingCosts)}
• Prepaids: ${formatCurrency(results.prepaids)}${discountPointsAmount > 0 ? `\n• Discount Points (${discountPoints}%): ${formatCurrency(discountPointsAmount)}` : ''}${totalDPAAmount > 0 ? `\n• DPA Credit: -${formatCurrency(totalDPAAmount)}` : ''}${totalDPAFees > 0 ? `\n• DPA Fees: ${formatCurrency(totalDPAFees)}` : ''}${results.sellerCreditAmount > 0 ? `\n• Seller Credit: -${formatCurrency(results.sellerCreditAmount)}` : ''}

⚠️ This is an illustration only and not a commitment to lend. Actual rates, payments, and costs may vary. Please contact me for a personalized quote.`;

    const smsUrl = Platform.OS === 'ios' 
      ? `sms:&body=${encodeURIComponent(message)}`
      : `sms:?body=${encodeURIComponent(message)}`;

    try {
      const canOpen = await Linking.canOpenURL(smsUrl);
      if (canOpen) {
        await Linking.openURL(smsUrl);
      } else {
        Alert.alert('Unable to Send', 'SMS is not available on this device.');
      }
    } catch (error) {
      console.log('Error opening SMS:', error);
      Alert.alert('Error', 'Could not open messaging app.');
    }
  };

  const formatCurrencyDetailed = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Format number with commas for display
  const formatNumberWithCommas = (value: string) => {
    // Remove all non-numeric characters except decimal point
    const numericValue = value.replace(/[^0-9.]/g, '');
    
    // Split into integer and decimal parts
    const parts = numericValue.split('.');
    
    // Add commas to integer part
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    // Rejoin with decimal if it exists
    return parts.join('.');
  };

  // Remove commas for calculation
  const removeCommas = (value: string) => {
    return value.replace(/,/g, '');
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: Platform.OS === 'ios' ? 60 : 16,
      paddingBottom: 16,
      backgroundColor: colors.headerBackground,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: '#FFFFFF',
      flex: 1,
      textAlign: 'center',
    },
    closeButton: {
      padding: 8,
    },
    scrollContent: {
      padding: 16,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 16,
      letterSpacing: -0.5,
    },
    card: {
      backgroundColor: colors.cardBackground,
      borderRadius: 16,
      padding: 18,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    input: {
      backgroundColor: isDark ? '#1F2937' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: colors.textPrimary,
    },
    pickerButton: {
      backgroundColor: isDark ? '#1F2937' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    pickerButtonText: {
      fontSize: 16,
      color: colors.textPrimary,
    },
    loanTypeRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    loanTypeButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    loanTypeButtonActive: {
      backgroundColor: '#7C3AED',
      borderColor: '#7C3AED',
    },
    loanTypeButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    loanTypeButtonTextActive: {
      color: '#FFFFFF',
    },
    termRow: {
      flexDirection: 'row',
      gap: 8,
    },
    termButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    termButtonActive: {
      backgroundColor: '#7C3AED',
      borderColor: '#7C3AED',
    },
    termButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    termButtonTextActive: {
      color: '#FFFFFF',
    },
    sliderContainer: {
      marginTop: 8,
    },
    sliderLabel: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 8,
    },
    sliderValue: {
      fontSize: 18,
      fontWeight: '700',
      color: '#7C3AED',
      textAlign: 'center',
      marginBottom: 8,
    },
    sliderTrack: {
      height: 40,
      backgroundColor: isDark ? '#1F2937' : '#F8FAFC',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    sliderFill: {
      height: '100%',
      backgroundColor: '#7C3AED',
      borderRadius: 7,
      opacity: 0.3,
    },
    sliderThumb: {
      position: 'absolute',
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: '#7C3AED',
      borderWidth: 3,
      borderColor: '#FFFFFF',
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.border,
      marginRight: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      backgroundColor: '#7C3AED',
      borderColor: '#7C3AED',
    },
    checkboxLabel: {
      fontSize: 14,
      color: colors.textPrimary,
      flex: 1,
    },
    resultCard: {
      backgroundColor: '#7C3AED',
      borderRadius: 20,
      padding: 24,
      marginBottom: 20,
      shadowColor: '#7C3AED',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 12,
    },
    resultLabel: {
      fontSize: 14,
      color: '#FFFFFF',
      opacity: 0.85,
      marginBottom: 4,
      fontWeight: '500',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    resultValue: {
      fontSize: 52,
      fontWeight: '800',
      color: '#FFFFFF',
      marginBottom: 24,
      letterSpacing: -1,
    },
    resultBreakdown: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      borderRadius: 12,
      padding: 12,
      gap: 6,
    },
    resultBreakdownItem: {
      flex: 1,
      alignItems: 'center',
      minWidth: 0,
    },
    resultBreakdownLabel: {
      fontSize: 11,
      color: '#FFFFFF',
      opacity: 0.75,
      marginBottom: 6,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    resultBreakdownValue: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    detailLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    detailValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    expandButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: isDark ? '#1F2937' : '#F8FAFC',
      borderRadius: 8,
      marginTop: 8,
    },
    expandButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#7C3AED',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.cardBackground,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 20,
      paddingBottom: Platform.OS === 'ios' ? 40 : 20,
      maxHeight: '70%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    pickerItem: {
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    pickerItemText: {
      fontSize: 16,
      color: colors.textPrimary,
    },
    pickerItemSelected: {
      backgroundColor: isDark ? '#1F2937' : '#F8FAFC',
    },
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ width: 40 }} />
        <Text style={styles.headerTitle}>Mortgage Calculator</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Results Card */}
        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>Monthly Payment{totalDPAPayment > 0 ? ' (incl. DPA)' : ''}</Text>
          <Text style={styles.resultValue}>{formatCurrencyDetailed(totalMonthlyWithDPA)}</Text>
          
          <View style={styles.resultBreakdown}>
            <View style={styles.resultBreakdownItem}>
              <Text style={styles.resultBreakdownLabel}>P&I</Text>
              <Text style={styles.resultBreakdownValue} numberOfLines={1}>{formatCurrency(results.monthlyPI)}</Text>
            </View>
            <View style={styles.resultBreakdownItem}>
              <Text style={styles.resultBreakdownLabel}>Taxes</Text>
              <Text style={styles.resultBreakdownValue} numberOfLines={1}>{formatCurrency(results.monthlyTax)}</Text>
            </View>
            <View style={styles.resultBreakdownItem}>
              <Text style={styles.resultBreakdownLabel}>Insurance</Text>
              <Text style={styles.resultBreakdownValue} numberOfLines={1}>{formatCurrency(results.monthlyIns)}</Text>
            </View>
            {results.monthlyMI > 0 && (
              <View style={styles.resultBreakdownItem}>
                <Text style={styles.resultBreakdownLabel}>MI ({results.miRatePct.toFixed(2)}%)</Text>
                <Text style={styles.resultBreakdownValue} numberOfLines={1}>{formatCurrency(results.monthlyMI)}</Text>
              </View>
            )}
            {totalDPAPayment > 0 && (
              <View style={styles.resultBreakdownItem}>
                <Text style={styles.resultBreakdownLabel}>DPA</Text>
                <Text style={styles.resultBreakdownValue} numberOfLines={1}>{formatCurrency(totalDPAPayment)}</Text>
              </View>
            )}
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.2)', marginVertical: 20 }} />

          {/* Cash to Close */}
          <Text style={styles.resultLabel}>Cash to Close</Text>
          <Text style={styles.resultValue}>{formatCurrencyDetailed(adjustedCashToClose)}</Text>
          
          <View style={styles.resultBreakdown}>
            <View style={styles.resultBreakdownItem}>
              <Text style={styles.resultBreakdownLabel}>Down Pmt</Text>
              <Text style={styles.resultBreakdownValue} numberOfLines={1}>{formatCurrency(results.actualDownPayment)}</Text>
            </View>
            <View style={styles.resultBreakdownItem}>
              <Text style={styles.resultBreakdownLabel}>Closing</Text>
              <Text style={styles.resultBreakdownValue} numberOfLines={1}>{formatCurrency(results.closingCosts)}</Text>
            </View>
            <View style={styles.resultBreakdownItem}>
              <Text style={styles.resultBreakdownLabel}>Prepaids</Text>
              <Text style={styles.resultBreakdownValue} numberOfLines={1}>{formatCurrency(results.prepaids)}</Text>
            </View>
            {discountPointsAmount > 0 && (
              <View style={styles.resultBreakdownItem}>
                <Text style={styles.resultBreakdownLabel}>Points</Text>
                <Text style={styles.resultBreakdownValue} numberOfLines={1}>{formatCurrency(discountPointsAmount)}</Text>
              </View>
            )}
            {results.sellerCreditAmount > 0 && (
              <View style={styles.resultBreakdownItem}>
                <Text style={styles.resultBreakdownLabel}>Credit</Text>
                <Text style={styles.resultBreakdownValue} numberOfLines={1}>-{formatCurrency(results.sellerCreditAmount)}</Text>
              </View>
            )}
          </View>

          {/* Text Results Button */}
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#10B981',
              borderRadius: 12,
              paddingVertical: 14,
              marginTop: 16,
              gap: 8,
            }}
            onPress={handleTextResults}
          >
            <Ionicons name="chatbubble-outline" size={20} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
              Text Results
            </Text>
          </TouchableOpacity>
        </View>

        {/* Cash to Close Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Cash to Close</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Down Payment</Text>
            <Text style={styles.detailValue}>{formatCurrency(results.actualDownPayment)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Closing Costs</Text>
            <Text style={styles.detailValue}>{formatCurrency(results.closingCosts)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Prepaids</Text>
            <Text style={styles.detailValue}>{formatCurrency(results.prepaids)}</Text>
          </View>
          {discountPointsAmount > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Discount Points ({discountPoints}%)</Text>
              <Text style={styles.detailValue}>{formatCurrency(discountPointsAmount)}</Text>
            </View>
          )}
          {totalDPAAmount > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>DPA Assistance</Text>
              <Text style={[styles.detailValue, { color: '#10B981' }]}>
                -{formatCurrency(totalDPAAmount)}
              </Text>
            </View>
          )}
          {totalDPAFees > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>DPA Fees</Text>
              <Text style={styles.detailValue}>{formatCurrency(totalDPAFees)}</Text>
            </View>
          )}
          {results.sellerCreditAmount > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Seller Credit</Text>
              <Text style={[styles.detailValue, { color: '#10B981' }]}>
                -{formatCurrency(results.sellerCreditAmount)}
              </Text>
            </View>
          )}
          <View style={[styles.detailRow, { borderBottomWidth: 0, paddingTop: 12 }]}>
            <Text style={[styles.detailLabel, { fontSize: 16, fontWeight: '700', color: colors.textPrimary }]}>
              Total Cash to Close
            </Text>
            <Text style={[styles.detailValue, { fontSize: 18, color: '#7C3AED' }]}>
              {formatCurrencyDetailed(adjustedCashToClose)}
            </Text>
          </View>

          {/* Expandable Breakdowns */}
          <TouchableOpacity
            style={styles.expandButton}
            onPress={() => setShowClosingBreakdown(!showClosingBreakdown)}
          >
            <Text style={styles.expandButtonText}>Closing Costs Breakdown</Text>
            <Ionicons
              name={showClosingBreakdown ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#7C3AED"
            />
          </TouchableOpacity>
          
          {showClosingBreakdown && (
            <View style={{ marginTop: 12 }}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Processing Fee</Text>
                <Text style={styles.detailValue}>{formatCurrencyDetailed(DEFAULT_FEES.processingFee)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Underwriting Fee</Text>
                <Text style={styles.detailValue}>{formatCurrencyDetailed(DEFAULT_FEES.underwritingFee)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Tax Service Fee</Text>
                <Text style={styles.detailValue}>{formatCurrencyDetailed(DEFAULT_FEES.taxServiceFee)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Credit Report Fee</Text>
                <Text style={styles.detailValue}>{formatCurrencyDetailed(DEFAULT_FEES.creditReportFee)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Appraisal Fee</Text>
                <Text style={styles.detailValue}>{formatCurrencyDetailed(DEFAULT_FEES.appraisalFee)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Flood Cert Fee</Text>
                <Text style={styles.detailValue}>{formatCurrencyDetailed(DEFAULT_FEES.floodCertFee)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Survey Fee</Text>
                <Text style={styles.detailValue}>{formatCurrencyDetailed(DEFAULT_FEES.surveyFee)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Title Closing Fee</Text>
                <Text style={styles.detailValue}>{formatCurrencyDetailed(DEFAULT_FEES.titleClosingFee)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Owner's Title Fee</Text>
                <Text style={styles.detailValue}>{formatCurrencyDetailed(DEFAULT_FEES.ownersTitleFee)}</Text>
              </View>
              {results.lendersTitleBuyerSide > 0 && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Lender's Title</Text>
                  <Text style={styles.detailValue}>{formatCurrencyDetailed(results.lendersTitleBuyerSide)}</Text>
                </View>
              )}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Title Search Fee</Text>
                <Text style={styles.detailValue}>{formatCurrencyDetailed(DEFAULT_FEES.titleSearchFee)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Endorsements</Text>
                <Text style={styles.detailValue}>{formatCurrencyDetailed(DEFAULT_FEES.endorsements)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Recording Fee</Text>
                <Text style={styles.detailValue}>{formatCurrencyDetailed(DEFAULT_FEES.recordingFee)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Intangible Tax</Text>
                <Text style={styles.detailValue}>{formatCurrencyDetailed(results.intangible)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Doc Stamps</Text>
                <Text style={styles.detailValue}>{formatCurrencyDetailed(results.deed)}</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.expandButton}
            onPress={() => setShowPrepaidsBreakdown(!showPrepaidsBreakdown)}
          >
            <Text style={styles.expandButtonText}>Prepaids Breakdown</Text>
            <Ionicons
              name={showPrepaidsBreakdown ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#7C3AED"
            />
          </TouchableOpacity>

          {showPrepaidsBreakdown && (
            <View style={{ marginTop: 12 }}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Property Taxes (3 months)</Text>
                <Text style={styles.detailValue}>{formatCurrencyDetailed(results.prepaidTaxes)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Insurance (15 months)</Text>
                <Text style={styles.detailValue}>{formatCurrencyDetailed(results.prepaidInsurance)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Interest (15 days)</Text>
                <Text style={styles.detailValue}>{formatCurrencyDetailed(results.prepaidInterest)}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Loan Details */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Loan Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Loan Amount</Text>
            <Text style={styles.detailValue}>{formatCurrency(results.baseLoan)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Interest Rate</Text>
            <Text style={styles.detailValue}>{results.noteRate.toFixed(3)}%</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>APR</Text>
            <Text style={styles.detailValue}>{results.apr.toFixed(3)}%</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>LTV</Text>
            <Text style={styles.detailValue}>{ltv.toFixed(2)}%</Text>
          </View>
          {dpaEntries.length > 0 && (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>CLTV</Text>
                <Text style={[styles.detailValue, cltv > 105 ? { color: '#EF4444' } : {}]}>
                  {cltv.toFixed(2)}%
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>DPA Program{dpaEntries.length > 1 ? 's' : ''}</Text>
                <Text style={[styles.detailValue, { color: '#7C3AED', flex: 1, textAlign: 'right' }]} numberOfLines={2}>
                  {dpaEntries.map(e => e.name || 'DPA').join(', ')}
                </Text>
              </View>
            </>
          )}
          {results.financedFee > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                {loanType === 'VA' 
                  ? `VA Funding Fee (${(results.feeRate * 100).toFixed(2)}%)`
                  : 'FHA UFMIP (1.75%)'}
              </Text>
              <Text style={styles.detailValue}>{formatCurrency(results.financedFee)}</Text>
            </View>
          )}
        </View>

        {/* Input Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Property Details</Text>
          
          <View style={styles.card}>
            <Text style={styles.inputLabel}>County</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowCountyPicker(true)}
            >
              <Text style={styles.pickerButtonText}>{county}</Text>
              <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.inputLabel}>Purchase Price</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={(text) => setPrice(formatNumberWithCommas(text))}
              keyboardType="numeric"
              placeholder="450,000"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.inputLabel}>Annual Property Tax</Text>
            <TextInput
              style={styles.input}
              value={annualTax}
              onChangeText={(text) => setAnnualTax(formatNumberWithCommas(text))}
              keyboardType="numeric"
              placeholder="6,000"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.inputLabel}>Annual Insurance</Text>
            <TextInput
              style={styles.input}
              value={annualIns}
              onChangeText={(text) => setAnnualIns(formatNumberWithCommas(text))}
              keyboardType="numeric"
              placeholder="2,400"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>

        {/* Loan Configuration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Loan Configuration</Text>
          
          <View style={styles.card}>
            <Text style={styles.inputLabel}>Loan Type</Text>
            <View style={styles.loanTypeRow}>
              {(['Conventional', 'FHA', 'VA'] as LoanType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.loanTypeButton,
                    loanType === type && styles.loanTypeButtonActive,
                  ]}
                  onPress={() => {
                    setLoanType(type);
                    setDownPct(MIN_DOWN_BY_LOAN[type].toString());
                  }}
                >
                  <Text
                    style={[
                      styles.loanTypeButtonText,
                      loanType === type && styles.loanTypeButtonTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.inputLabel}>Term</Text>
            <View style={styles.termRow}>
              {[30, 20, 15].map((term) => (
                <TouchableOpacity
                  key={term}
                  style={[
                    styles.termButton,
                    termYears === term && styles.termButtonActive,
                  ]}
                  onPress={() => setTermYears(term)}
                >
                  <Text
                    style={[
                      styles.termButtonText,
                      termYears === term && styles.termButtonTextActive,
                    ]}
                  >
                    {term} years
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.inputLabel}>Down Payment</Text>
            
            {/* Editable Percentage Input */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <TextInput
                style={[styles.sliderValue, { 
                  minWidth: 80, 
                  textAlign: 'center',
                  backgroundColor: isDark ? '#1F2937' : '#F8FAFC',
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                }]}
                value={downPct}
                onChangeText={(text) => {
                  setDownPct(text);
                }}
                onBlur={() => {
                  const num = parseFloat(downPct.replace(/[^0-9.]/g, '')) || MIN_DOWN_BY_LOAN[loanType];
                  const clamped = Math.max(MIN_DOWN_BY_LOAN[loanType], Math.min(30, num));
                  setDownPct((Math.round(clamped * 10) / 10).toString());
                }}
                keyboardType="decimal-pad"
                maxLength={4}
              />
              <Text style={[styles.sliderValue, { marginLeft: 4 }]}>%</Text>
            </View>
            
            {/* Interactive Slider Track */}
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => {
                const { locationX } = e.nativeEvent;
                const trackWidth = 300; // Approximate width
                const percentage = Math.max(MIN_DOWN_BY_LOAN[loanType], Math.min(30, Math.round((locationX / trackWidth) * 30)));
                setDownPct(percentage.toString());
              }}
            >
              <View style={styles.sliderTrack}>
                <View style={[styles.sliderFill, { width: `${(parseFloat(downPct) / 30) * 100}%` }]} />
                <View style={[styles.sliderThumb, { left: `${(parseFloat(downPct) / 30) * 100}%`, marginLeft: -12 }]} />
              </View>
            </TouchableOpacity>
            
            {/* Quick Select Buttons */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
              {[MIN_DOWN_BY_LOAN[loanType], 5, 10, 15, 20, 25, 30].map((pct) => (
                <TouchableOpacity 
                  key={pct} 
                  onPress={() => setDownPct(pct.toString())}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                    borderRadius: 6,
                    backgroundColor: parseFloat(downPct) === pct ? '#7C3AED' : 'transparent',
                  }}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    fontWeight: parseFloat(downPct) === pct ? '700' : '400',
                    color: parseFloat(downPct) === pct ? '#FFFFFF' : colors.textSecondary 
                  }}>
                    {pct}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.inputLabel}>Credit Score</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowCreditPicker(true)}
            >
              <Text style={styles.pickerButtonText}>{creditBand}</Text>
              <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.inputLabel}>Interest Rate (%)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {customRate && (
                  <TouchableOpacity 
                    onPress={() => setCustomRate('')}
                    style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                  >
                    <Text style={{ fontSize: 12, color: '#7C3AED', fontWeight: '600' }}>
                      Reset to Live
                    </Text>
                  </TouchableOpacity>
                )}
                {!customRate && !loadingRates && rates && (
                  <Text style={{ fontSize: 12, color: '#10B981' }}>
                    Live rate
                  </Text>
                )}
                {loadingRates && (
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    Loading...
                  </Text>
                )}
              </View>
            </View>
            <TextInput
              style={styles.input}
              value={customRate}
              onChangeText={setCustomRate}
              keyboardType="decimal-pad"
              placeholder={rates ? getRateForLoanType(rates, loanType).toFixed(3) : '7.5'}
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
              {customRate ? 'Custom rate - edit as needed' : 'Live market rate - tap to customize'}
            </Text>
          </View>

          <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.inputLabel}>Discount Points (%)</Text>
              {parseFloat(discountPoints) > 0 && (
                <Text style={{ fontSize: 12, color: '#7C3AED', fontWeight: '600' }}>
                  = {formatCurrency(discountPointsAmount)}
                </Text>
              )}
            </View>
            <TextInput
              style={styles.input}
              value={discountPoints}
              onChangeText={(text) => {
                // Allow up to 2 decimal places
                const cleaned = text.replace(/[^0-9.]/g, '');
                const parts = cleaned.split('.');
                if (parts.length > 2) return;
                if (parts[1] && parts[1].length > 2) return;
                const num = parseFloat(cleaned) || 0;
                if (num <= 10) {
                  setDiscountPoints(cleaned);
                }
              }}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
              Points paid upfront to lower rate (added to prepaids)
            </Text>
          </View>

          {loanType === 'VA' && (
            <View style={styles.card}>
              <Text style={styles.inputLabel}>VA Loan Usage</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowVAPicker(true)}
              >
                <Text style={styles.pickerButtonText}>
                  {vaLoanUsage === 'firstUse' ? 'First Use' : 
                   vaLoanUsage === 'subsequentUse' ? 'Subsequent Use' : 'Exempt'}
                </Text>
                <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Seller Credit */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seller Credit (Optional)</Text>
          
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TouchableOpacity
                style={[
                  styles.termButton,
                  sellerCreditType === 'percentage' && styles.termButtonActive,
                ]}
                onPress={() => setSellerCreditType('percentage')}
              >
                <Text
                  style={[
                    styles.termButtonText,
                    sellerCreditType === 'percentage' && styles.termButtonTextActive,
                  ]}
                >
                  Percentage
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.termButton,
                  sellerCreditType === 'dollar' && styles.termButtonActive,
                ]}
                onPress={() => setSellerCreditType('dollar')}
              >
                <Text
                  style={[
                    styles.termButtonText,
                    sellerCreditType === 'dollar' && styles.termButtonTextActive,
                  ]}
                >
                  Dollar Amount
                </Text>
              </TouchableOpacity>
            </View>
            
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {sellerCreditType === 'dollar' && (
                <Text style={{ fontSize: 18, fontWeight: '600', color: colors.textPrimary, marginRight: 4 }}>$</Text>
              )}
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={sellerCredit}
                onChangeText={(text) => {
                  if (sellerCreditType === 'percentage') {
                    // Strip commas and limit to reasonable percentage (0-10)
                    const numericValue = text.replace(/[^0-9.]/g, '');
                    const num = parseFloat(numericValue) || 0;
                    if (num <= 10) {
                      setSellerCredit(numericValue);
                    }
                  } else {
                    setSellerCredit(formatNumberWithCommas(text));
                  }
                }}
                keyboardType="decimal-pad"
                placeholder={sellerCreditType === 'percentage' ? '0' : '0'}
                placeholderTextColor={colors.textSecondary}
              />
              {sellerCreditType === 'percentage' && (
                <Text style={{ fontSize: 18, fontWeight: '600', color: colors.textPrimary, marginLeft: 4 }}>%</Text>
              )}
            </View>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
              {sellerCreditType === 'percentage' 
                ? 'Enter percentage of sales price' 
                : 'Enter dollar amount'}
            </Text>
          </View>

          <View style={styles.card}>
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setBuyerPaysSellerTransfer(!buyerPaysSellerTransfer)}
            >
              <View style={[styles.checkbox, buyerPaysSellerTransfer && styles.checkboxChecked]}>
                {buyerPaysSellerTransfer && (
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                )}
              </View>
              <Text style={styles.checkboxLabel}>Buyer pays seller transfer tax</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Down Payment Assistance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Down Payment Assistance</Text>
          
          {/* DPA List */}
          {dpaEntries.map((entry, index) => {
            const entryAmount = calculateDPAAmount(entry, priceValue, results.baseLoan);
            return (
              <View key={entry.id} style={[styles.card, { marginBottom: 12 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 }}>
                      {entry.name || `DPA Program ${index + 1}`}
                    </Text>
                    <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                      {entry.type === 'salesPrice' ? `${entry.value}% of Sales Price` :
                       entry.type === 'loanAmount' ? `${entry.value}% of Loan Amount` :
                       'Fixed Amount'}
                    </Text>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#7C3AED', marginTop: 8 }}>
                      {formatCurrency(entryAmount)}
                    </Text>
                    {entry.paymentType !== 'none' && (
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
                        Payment: {formatCurrencyDetailed(calculateDPAPayment(entry, entryAmount))}/mo
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => handleEditDPA(entry)}
                      style={{ padding: 8 }}
                    >
                      <Ionicons name="pencil" size={20} color="#7C3AED" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteDPA(entry.id)}
                      style={{ padding: 8 }}
                    >
                      <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}

          {/* Add DPA Button */}
          <TouchableOpacity
            style={[styles.card, { 
              flexDirection: 'row', 
              alignItems: 'center', 
              justifyContent: 'center',
              paddingVertical: 16,
              borderStyle: 'dashed',
              borderWidth: 2,
              borderColor: '#7C3AED',
              backgroundColor: isDark ? 'rgba(124, 58, 237, 0.1)' : 'rgba(124, 58, 237, 0.05)',
            }]}
            onPress={() => {
              setEditingDPA(null);
              setShowDPAModal(true);
            }}
          >
            <Ionicons name="add-circle-outline" size={24} color="#7C3AED" />
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#7C3AED', marginLeft: 8 }}>
              Add DPA Program
            </Text>
          </TouchableOpacity>

          {/* CLTV Warning */}
          {cltv > 105 && (
            <View style={{ 
              backgroundColor: '#FEF3C7', 
              borderRadius: 8, 
              padding: 12, 
              marginTop: 12,
              borderLeftWidth: 4,
              borderLeftColor: '#F59E0B'
            }}>
              <Text style={{ fontSize: 13, color: '#92400E', fontWeight: '600' }}>
                ⚠️ CLTV ({cltv.toFixed(1)}%) exceeds 105% maximum. Reduce DPA or increase down payment.
              </Text>
            </View>
          )}
        </View>

        {/* Disclaimer */}
        <View style={[styles.card, { marginTop: 24, marginBottom: 32 }]}>
          <Text style={[styles.sectionTitle, { fontSize: 18, marginBottom: 12 }]}>Disclaimer</Text>
          <Text style={{ 
            fontSize: 13, 
            color: colors.textSecondary, 
            lineHeight: 20,
            textAlign: 'justify',
          }}>
            The results provided by this calculator are intended for comparative and educational purposes only and do not constitute a Loan Estimate as defined under the Truth in Lending Act. The accuracy of calculations cannot be guaranteed. This calculator cannot pre-qualify you. Loan qualification may require additional documentation including credit scores and financial reserves not collected by this calculator. All figures shown, including interest rates, taxes, insurance, and PMI calculations, are estimates only and are subject to change without notice. Additional costs such as HOA fees may not be reflected in the total. For an accurate assessment of your loan terms and costs, please request an official Loan Estimate from your loan officer.
          </Text>
        </View>
      </ScrollView>

      {/* County Picker Modal */}
      <Modal
        visible={showCountyPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCountyPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select County</Text>
              <TouchableOpacity onPress={() => setShowCountyPicker(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {FLORIDA_COUNTIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.pickerItem, county === c && styles.pickerItemSelected]}
                  onPress={() => {
                    setCounty(c);
                    setShowCountyPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Credit Score Picker Modal */}
      <Modal
        visible={showCreditPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreditPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Credit Score</Text>
              <TouchableOpacity onPress={() => setShowCreditPicker(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {(['760+', '740-759', '720-739', '700-719', '680-699', '660-679', '640-659', 'Below 620'] as CreditBand[]).map((band) => (
                <TouchableOpacity
                  key={band}
                  style={[styles.pickerItem, creditBand === band && styles.pickerItemSelected]}
                  onPress={() => {
                    setCreditBand(band);
                    setShowCreditPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{band}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* VA Loan Usage Picker Modal */}
      <Modal
        visible={showVAPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowVAPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>VA Loan Usage</Text>
              <TouchableOpacity onPress={() => setShowVAPicker(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {[
                { value: 'firstUse' as VALoanUsage, label: 'First Use' },
                { value: 'subsequentUse' as VALoanUsage, label: 'Subsequent Use' },
                { value: 'exempt' as VALoanUsage, label: 'Exempt (Disabled Veteran)' },
              ].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.pickerItem, vaLoanUsage === option.value && styles.pickerItemSelected]}
                  onPress={() => {
                    setVaLoanUsage(option.value);
                    setShowVAPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* DPA Entry Modal */}
      <DPAEntryModal
        visible={showDPAModal}
        onClose={() => {
          setShowDPAModal(false);
          setEditingDPA(null);
        }}
        onSave={handleSaveDPA}
        editEntry={editingDPA}
        salesPrice={priceValue}
        loanAmount={results.baseLoan}
        firstMortgageRate={results.noteRate}
      />
    </KeyboardAvoidingView>
  );
}

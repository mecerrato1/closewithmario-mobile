// src/utils/dpaCalculations.ts
// Down Payment Assistance Calculation Logic

import { DPAEntry, MAX_CLTV, MAX_LTV_BY_LOAN } from './dpaTypes';
import { LoanType } from './mortgageCalculations';

/**
 * Calculate the dollar amount for a single DPA entry
 */
export function calculateDPAAmount(
  entry: DPAEntry,
  salesPrice: number,
  loanAmount: number // This should be the total loan amount (including financed fees for FHA/VA)
): number {
  switch (entry.type) {
    case 'salesPrice':
      return salesPrice * (entry.value / 100);
    case 'loanAmount':
      return loanAmount * (entry.value / 100);
    case 'fixed':
      return entry.value;
    default:
      return 0;
  }
}

/**
 * Calculate the monthly payment for a single DPA entry
 */
export function calculateDPAPayment(entry: DPAEntry, dpaAmount: number): number {
  switch (entry.paymentType) {
    case 'none':
      return 0;
    case 'fixed':
      return entry.fixedPayment;
    case 'loanPI': {
      // Principal & Interest calculation
      if (entry.rate <= 0 || entry.term <= 0 || dpaAmount <= 0) return 0;
      const monthlyRate = entry.rate / 100 / 12;
      const n = entry.term;
      return dpaAmount * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
    }
    case 'loanIO': {
      // Interest Only calculation
      if (entry.rate <= 0 || dpaAmount <= 0) return 0;
      const monthlyRate = entry.rate / 100 / 12;
      return dpaAmount * monthlyRate;
    }
    default:
      return 0;
  }
}

/**
 * Calculate total DPA amount from all entries
 */
export function calculateTotalDPA(
  entries: DPAEntry[],
  salesPrice: number,
  loanAmount: number
): number {
  return entries.reduce((total, entry) => {
    return total + calculateDPAAmount(entry, salesPrice, loanAmount);
  }, 0);
}

/**
 * Calculate total monthly DPA payments from all entries
 */
export function calculateTotalDPAPayment(
  entries: DPAEntry[],
  salesPrice: number,
  loanAmount: number
): number {
  return entries.reduce((total, entry) => {
    const dpaAmount = calculateDPAAmount(entry, salesPrice, loanAmount);
    return total + calculateDPAPayment(entry, dpaAmount);
  }, 0);
}

/**
 * Calculate total DPA fees
 */
export function calculateTotalDPAFees(entries: DPAEntry[]): number {
  return entries.reduce((total, entry) => total + entry.fees, 0);
}

/**
 * Calculate LTV (Loan-to-Value)
 */
export function calculateLTV(loanAmount: number, salesPrice: number): number {
  if (salesPrice <= 0) return 0;
  return (loanAmount / salesPrice) * 100;
}

/**
 * Calculate CLTV (Combined Loan-to-Value)
 */
export function calculateCLTV(
  loanAmount: number,
  totalDPA: number,
  salesPrice: number
): number {
  if (salesPrice <= 0) return 0;
  return ((loanAmount + totalDPA) / salesPrice) * 100;
}

/**
 * Get max LTV for a loan type
 */
export function getMaxLTV(loanType: LoanType): number {
  return MAX_LTV_BY_LOAN[loanType] || 97;
}

/**
 * Auto-adjust results to meet CLTV and cash to close constraints
 * Returns adjusted values and any warning messages
 */
export interface AdjustmentResult {
  adjustedDownPct: number;
  adjustedBaseLoan: number;
  ltvWarning: string | null;
  cltvWarning: string | null;
  cashWarning: string | null;
}

export function calculateAdjustments(
  salesPrice: number,
  originalDownPct: number,
  baseLoanBeforeFee: number,
  totalLoan: number, // baseLoan including financed fees
  totalDPA: number,
  closingCosts: number,
  prepaids: number,
  sellerCredit: number,
  loanType: LoanType
): AdjustmentResult {
  let adjustedDownPct = originalDownPct;
  let adjustedBaseLoan = totalLoan;
  let ltvWarning: string | null = null;
  let cltvWarning: string | null = null;
  let cashWarning: string | null = null;

  const maxLTV = getMaxLTV(loanType);

  // Calculate current CLTV
  let cltv = calculateCLTV(totalLoan, totalDPA, salesPrice);

  // Check if CLTV exceeds 105%
  if (cltv > MAX_CLTV) {
    // Reduce first mortgage so CLTV = 105%
    const maxTotalFinancing = salesPrice * (MAX_CLTV / 100);
    adjustedBaseLoan = maxTotalFinancing - totalDPA;
    
    // Calculate new down payment percentage
    adjustedDownPct = ((salesPrice - adjustedBaseLoan) / salesPrice) * 100;
    
    cltvWarning = `Loan adjusted to meet ${MAX_CLTV}% CLTV limit`;
    cltv = MAX_CLTV;
  }

  // Calculate cash to close with current values
  const downPayment = salesPrice * (adjustedDownPct / 100);
  let cashToClose = downPayment + closingCosts + prepaids - sellerCredit - totalDPA;

  // Check if cash to close is negative
  if (cashToClose < 0) {
    // Reduce loan amount to eliminate negative cash
    // If cash is negative, we need to increase down payment (reduce loan)
    const additionalDown = Math.abs(cashToClose);
    adjustedBaseLoan = adjustedBaseLoan - additionalDown;
    adjustedDownPct = ((salesPrice - adjustedBaseLoan) / salesPrice) * 100;
    
    cashWarning = 'Loan adjusted to eliminate negative cash to close';
  }

  // Final LTV check
  const finalLTV = calculateLTV(adjustedBaseLoan, salesPrice);
  if (finalLTV > maxLTV) {
    ltvWarning = `LTV (${finalLTV.toFixed(1)}%) exceeds ${loanType} maximum of ${maxLTV}%`;
  }

  return {
    adjustedDownPct,
    adjustedBaseLoan,
    ltvWarning,
    cltvWarning,
    cashWarning,
  };
}

/**
 * Format DPA entries for text message summary
 */
export function formatDPAForText(
  entries: DPAEntry[],
  salesPrice: number,
  loanAmount: number,
  formatCurrency: (value: number) => string
): string {
  if (entries.length === 0) return '';

  const lines = entries.map((entry) => {
    const amount = calculateDPAAmount(entry, salesPrice, loanAmount);
    const payment = calculateDPAPayment(entry, amount);
    let line = `• ${entry.name || 'DPA'}: ${formatCurrency(amount)}`;
    if (payment > 0) {
      line += ` (${formatCurrency(payment)}/mo)`;
    }
    return line;
  });

  return '\n' + lines.join('\n');
}

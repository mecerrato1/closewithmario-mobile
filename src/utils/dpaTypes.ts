// src/utils/dpaTypes.ts
// Down Payment Assistance Types and Presets

export type DPAValueType = 'salesPrice' | 'loanAmount' | 'fixed';
export type DPAPaymentType = 'fixed' | 'loanPI' | 'loanIO' | 'none';

export interface DPAEntry {
  id: string;
  name: string;
  type: DPAValueType;
  value: number; // Percentage (0-100) for salesPrice/loanAmount, or dollar amount for fixed
  paymentType: DPAPaymentType;
  rate: number; // Interest rate (for loanPI/loanIO)
  term: number; // Term in months (for loanPI/loanIO)
  fixedPayment: number; // Fixed monthly payment amount (for fixed payment type)
  fees: number;
}

export interface DPAPreset {
  label: string;
  entry: Omit<DPAEntry, 'id'>;
  rateOffset?: number; // If set, rate = first mortgage rate + this offset
}

// Generate unique ID for DPA entries
export const generateDPAId = (): string => {
  return `dpa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Create a new empty DPA entry
export const createEmptyDPA = (): DPAEntry => ({
  id: generateDPAId(),
  name: '',
  type: 'salesPrice',
  value: 0,
  paymentType: 'none',
  rate: 0,
  term: 360, // 30 years default
  fixedPayment: 0,
  fees: 0,
});

// Preset DPA programs - ordered by most used
export const DPA_PRESETS: DPAPreset[] = [
  {
    label: 'Hometown Heroes (5% of Loan)',
    entry: {
      name: 'Hometown Heroes',
      type: 'loanAmount',
      value: 5,
      paymentType: 'none',
      rate: 0,
      term: 0,
      fixedPayment: 0,
      fees: 675,
    },
  },
  {
    label: 'FL Assist ($10,000)',
    entry: {
      name: 'FL Assist',
      type: 'fixed',
      value: 10000,
      paymentType: 'none',
      rate: 0,
      term: 0,
      fixedPayment: 0,
      fees: 675,
    },
  },
  {
    label: 'PHCD 35k (DPA)',
    entry: {
      name: 'PHCD 35k',
      type: 'fixed',
      value: 35000,
      paymentType: 'none',
      rate: 0,
      term: 0,
      fixedPayment: 0,
      fees: 500,
    },
  },
  {
    label: 'PHCD 80k (HLP) 2% Rate',
    entry: {
      name: 'PHCD 80k',
      type: 'fixed',
      value: 80000,
      paymentType: 'loanPI',
      rate: 2,
      term: 360, // 30 years
      fixedPayment: 0,
      fees: 500,
    },
  },
  {
    label: 'PHCD 100k (HLP) 1% Rate',
    entry: {
      name: 'PHCD 100k',
      type: 'fixed',
      value: 100000,
      paymentType: 'loanPI',
      rate: 1,
      term: 360, // 30 years
      fixedPayment: 0,
      fees: 500,
    },
  },
  {
    label: 'Access Zero 5% (5% of Sales Price)',
    entry: {
      name: 'Access Zero 5%',
      type: 'salesPrice',
      value: 5,
      paymentType: 'loanPI',
      rate: 0, // Will be set dynamically: 1st mortgage + 2%
      term: 120, // 10 year amortization
      fixedPayment: 0,
      fees: 500,
    },
    rateOffset: 2, // 2 points above first mortgage
  },
  {
    label: 'Access Zero 3.5% (3.5% of Sales Price)',
    entry: {
      name: 'Access Zero 3.5%',
      type: 'salesPrice',
      value: 3.5,
      paymentType: 'loanPI',
      rate: 0, // Will be set dynamically: 1st mortgage + 2%
      term: 120, // 10 year amortization
      fixedPayment: 0,
      fees: 500,
    },
    rateOffset: 2, // 2 points above first mortgage
  },
  // === FL HLP ===
  {
    label: 'FL HLP ($12,500)',
    entry: {
      name: 'FL HLP',
      type: 'fixed',
      value: 12500,
      paymentType: 'loanPI',
      rate: 3,
      term: 360, // 30 year amortization
      fixedPayment: 0,
      fees: 675,
    },
  },
  // === FHFC HFA PLUS GRANTS ===
  {
    label: 'FHFC HFA Plus Grant (3% of Loan)',
    entry: {
      name: 'FHFC HFA Plus',
      type: 'loanAmount',
      value: 3,
      paymentType: 'none',
      rate: 0,
      term: 0,
      fixedPayment: 0,
      fees: 675,
    },
  },
  {
    label: 'FHFC HFA Plus Grant (4% of Loan)',
    entry: {
      name: 'FHFC HFA Plus',
      type: 'loanAmount',
      value: 4,
      paymentType: 'none',
      rate: 0,
      term: 0,
      fixedPayment: 0,
      fees: 675,
    },
  },
  {
    label: 'FHFC HFA Plus Grant (5% of Loan)',
    entry: {
      name: 'FHFC HFA Plus',
      type: 'loanAmount',
      value: 5,
      paymentType: 'none',
      rate: 0,
      term: 0,
      fixedPayment: 0,
      fees: 675,
    },
  },
];

// Max limits
export const MAX_CLTV = 105; // 105%
export const MAX_LTV_BY_LOAN: Record<string, number> = {
  Conventional: 97,
  FHA: 96.5,
  VA: 100,
};

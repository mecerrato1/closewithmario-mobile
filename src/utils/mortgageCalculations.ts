// src/utils/mortgageCalculations.ts
import { LoanType, calculateMI } from './calculateMI';
import { FloridaTaxCalculator } from './floridaTaxes';

// Re-export LoanType for convenience
export type { LoanType };

export type CreditBand = '760+' | '740-759' | '720-739' | '700-719' | '680-699' | '660-679' | '640-659' | 'Below 620';
export type VALoanUsage = 'firstUse' | 'subsequentUse' | 'exempt';

export interface ClosingCostFees {
  underwritingFee: number;
  processingFee: number;
  appraisalFee: number;
  taxServiceFee: number;
  floodCertFee: number;
  surveyFee: number;
  titleClosingFee: number;
  ownersTitleFee: number;
  titleSearchFee: number;
  endorsements: number;
  recordingFee: number;
  creditReportFee: number;
}

export const DEFAULT_FEES: ClosingCostFees = {
  underwritingFee: 795,
  processingFee: 995,
  appraisalFee: 550,
  taxServiceFee: 68,
  floodCertFee: 5,
  surveyFee: 400,
  titleClosingFee: 795,
  ownersTitleFee: 450,
  titleSearchFee: 125,
  endorsements: 300,
  recordingFee: 250,
  creditReportFee: 225
};

export const MIN_DOWN_BY_LOAN: Record<LoanType, number> = {
  Conventional: 3,
  FHA: 3.5,
  VA: 0,
  DSCR: 20
};

// Static rates (can be replaced with dynamic rates later)
export const RATE_BY_LOAN: Record<LoanType, number> = {
  Conventional: 7.5,
  FHA: 7.2,
  VA: 6.9,
  DSCR: 8.5
};

export interface MortgageInputs {
  price: number;
  loanType: LoanType;
  downPct: number;
  termYears: number;
  creditBand: CreditBand;
  county: string;
  annualTax: number;
  annualIns: number;
  buyerPaysSellerTransfer: boolean;
  vaLoanUsage?: VALoanUsage;
  sellerCredit: number;
  sellerCreditType: 'percentage' | 'dollar';
  customRate?: number; // Optional custom interest rate override
}

export interface MortgageResults {
  baseLoan: number;
  baseLoanBeforeFee: number;
  financedFee: number;
  feeRate: number;
  noteRate: number;
  apr: number;
  monthlyPI: number;
  monthlyMI: number;
  miRatePct: number;
  monthlyTax: number;
  monthlyIns: number;
  monthlyTotal: number;
  closingCosts: number;
  prepaids: number;
  cashToClose: number;
  actualDownPayment: number;
  sellerCreditAmount: number;
  ltv: number;
  // Breakdown details
  lendersTitle: number;
  intangible: number;
  deed: number;
  lendersTitleBuyerSide: number;
  prepaidTaxes: number;
  prepaidInsurance: number;
  prepaidInterest: number;
}

function getCreditScore(creditBand: CreditBand): number {
  if (creditBand === '760+') return 760;
  if (creditBand === 'Below 620') return 619;
  const match = creditBand.match(/^(\d+)-/);
  return match ? parseInt(match[1], 10) : 740;
}

export interface MortgageOptions {
  waiveIntangibleAndDeed?: boolean; // For programs like Hometown Heroes, FL Assist
}

export function calculateMortgage(inputs: MortgageInputs, fees: ClosingCostFees = DEFAULT_FEES, options: MortgageOptions = {}): MortgageResults {
  const fl = new FloridaTaxCalculator();
  const creditScore = getCreditScore(inputs.creditBand);
  
  // Calculate base loan and financed fees
  const downPayment = inputs.price * (inputs.downPct / 100);
  const baseLoanBeforeFee = inputs.price - downPayment;
  let baseLoan = baseLoanBeforeFee;
  let financedFee = 0;
  let feeRate = 0;

  // VA funding fee & FHA UFMIP roll-in
  if (inputs.loanType === 'VA') {
    const vaUsage = inputs.vaLoanUsage || 'firstUse';
    if (vaUsage === 'exempt') {
      feeRate = 0;
    } else if (vaUsage === 'firstUse') {
      if (inputs.downPct < 5) {
        feeRate = 2.15 / 100;
      } else if (inputs.downPct < 10) {
        feeRate = 1.50 / 100;
      } else {
        feeRate = 1.25 / 100;
      }
    } else if (vaUsage === 'subsequentUse') {
      if (inputs.downPct < 5) {
        feeRate = 3.30 / 100;
      } else {
        feeRate = 1.50 / 100;
      }
    }
    
    financedFee = baseLoan * feeRate;
    baseLoan = baseLoan + financedFee;
  } else if (inputs.loanType === 'FHA') {
    feeRate = 0.0175;
    financedFee = baseLoan * feeRate;
    baseLoan = baseLoan + financedFee;
  }

  // Get note rate (use custom rate if provided, otherwise use default)
  const noteRate = inputs.customRate !== undefined && inputs.customRate > 0 
    ? inputs.customRate 
    : RATE_BY_LOAN[inputs.loanType];

  // Calculate P&I
  const monthlyRate = noteRate / 100 / 12;
  const n = inputs.termYears * 12;
  const monthlyPI = baseLoan && monthlyRate
    ? baseLoan * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1)
    : 0;

  // Calculate MI
  const ltv = 100 - inputs.downPct;
  const { monthlyMI, annualRatePct: miRatePct } = calculateMI(
    inputs.loanType,
    baseLoan,
    ltv,
    { creditScore, termYears: inputs.termYears }
  );

  // Monthly taxes and insurance
  const monthlyTax = inputs.annualTax / 12;
  const monthlyIns = inputs.annualIns / 12;

  // Calculate lender's title insurance
  const lendersTitle = fl.getLendersTitle(baseLoan);

  // APR calculation using TILA-compliant formula
  const prepaidFinanceCharges = 
    fees.underwritingFee +
    fees.processingFee +
    fees.taxServiceFee +
    fees.titleClosingFee +
    fees.floodCertFee +
    fees.endorsements +
    lendersTitle;
    
  const amountFinanced = baseLoan - prepaidFinanceCharges;
  const numberOfPayments = inputs.termYears * 12;
  const monthlyNoteRate = noteRate / 100 / 12;
  const basePIPayment = baseLoan * (monthlyNoteRate * Math.pow(1 + monthlyNoteRate, numberOfPayments)) / 
                        (Math.pow(1 + monthlyNoteRate, numberOfPayments) - 1);
  const totalMonthlyPayment = basePIPayment + monthlyMI;
  
  // APR bisection method
  const targetPV = amountFinanced;
  let lowerBound = 0.0001;
  let upperBound = 0.30;
  const tolerance = 0.000001;
  const maxIterations = 100;
  
  let apr = noteRate;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const guessRate = (lowerBound + upperBound) / 2;
    const monthlyGuessRate = guessRate / 12;
    
    let presentValue = 0;
    for (let i = 1; i <= numberOfPayments; i++) {
      presentValue += totalMonthlyPayment / Math.pow(1 + monthlyGuessRate, i);
    }
    
    const difference = presentValue - targetPV;
    if (Math.abs(difference) < tolerance) {
      apr = parseFloat((guessRate * 100).toFixed(3));
      break;
    }
    
    if (presentValue > targetPV) {
      lowerBound = guessRate;
    } else {
      upperBound = guessRate;
    }
  }

  // State taxes (waived for Hometown Heroes, FL Assist)
  const intangible = options.waiveIntangibleAndDeed ? 0 : fl.getIntangibleTax(baseLoan);
  const deed = options.waiveIntangibleAndDeed ? 0 : fl.getDeedTax(baseLoan, inputs.buyerPaysSellerTransfer, inputs.price, inputs.county);
  const lendersTitleBuyerSide = fl.buyerPaysOwnersTitle(inputs.county) ? lendersTitle : 0;

  // Closing costs
  const closingCosts =
    fees.underwritingFee + fees.processingFee + fees.appraisalFee + fees.taxServiceFee + fees.floodCertFee +
    fees.surveyFee + fees.titleClosingFee + fees.ownersTitleFee + lendersTitleBuyerSide +
    fees.titleSearchFee + fees.endorsements + fees.recordingFee + fees.creditReportFee +
    intangible + deed;

  // Prepaids
  const prepaidTaxes = monthlyTax * 3;
  const prepaidInsurance = monthlyIns * 15;
  const prepaidInterest = baseLoan * (noteRate / 100 / 365) * 15;
  const prepaids = prepaidTaxes + prepaidInsurance + prepaidInterest;

  // Seller credit
  const sellerCreditAmount = inputs.sellerCreditType === 'percentage'
    ? inputs.price * (inputs.sellerCredit / 100)
    : inputs.sellerCredit;

  // Cash to close
  const actualDownPayment = downPayment;
  const cashToClose = actualDownPayment + closingCosts + prepaids - sellerCreditAmount;

  // Total monthly payment
  const monthlyTotal = monthlyPI + monthlyMI + monthlyTax + monthlyIns;

  return {
    baseLoan,
    baseLoanBeforeFee,
    financedFee,
    feeRate,
    noteRate,
    apr,
    monthlyPI,
    monthlyMI,
    miRatePct,
    monthlyTax,
    monthlyIns,
    monthlyTotal,
    closingCosts,
    prepaids,
    cashToClose,
    actualDownPayment,
    sellerCreditAmount,
    ltv,
    lendersTitle,
    intangible,
    deed,
    lendersTitleBuyerSide,
    prepaidTaxes,
    prepaidInsurance,
    prepaidInterest
  };
}

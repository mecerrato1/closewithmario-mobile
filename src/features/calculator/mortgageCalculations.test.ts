import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMortgage,
  monthlyPrincipalAndInterest,
  vaFundingFeeRate,
  type MortgageInputs,
} from '../../utils/mortgageCalculations';

const base: MortgageInputs = {
  price: 400000,
  loanType: 'Conventional',
  downPct: 20,
  termYears: 30,
  creditBand: '740-759',
  county: 'Palm Beach',
  annualTax: 6000,
  annualIns: 2400,
  buyerPaysSellerTransfer: false,
  sellerCredit: 0,
  sellerCreditType: 'dollar',
};

function close(actual: number, expected: number, tolerance = 0.01) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);
}

test('VA first-use funding fee tiers', () => {
  assert.equal(vaFundingFeeRate('firstUse', 0), 0.0215);
  assert.equal(vaFundingFeeRate('firstUse', 4.99), 0.0215);
  assert.equal(vaFundingFeeRate('firstUse', 5), 0.015);
  assert.equal(vaFundingFeeRate('firstUse', 9.99), 0.015);
  assert.equal(vaFundingFeeRate('firstUse', 10), 0.0125);
  assert.equal(vaFundingFeeRate('firstUse', 25), 0.0125);
});

test('VA subsequent-use funding fee is 1.25% at 10% or more down (was 1.50%)', () => {
  assert.equal(vaFundingFeeRate('subsequentUse', 0), 0.033);
  assert.equal(vaFundingFeeRate('subsequentUse', 4.99), 0.033);
  assert.equal(vaFundingFeeRate('subsequentUse', 5), 0.015);
  assert.equal(vaFundingFeeRate('subsequentUse', 9.99), 0.015);
  assert.equal(vaFundingFeeRate('subsequentUse', 10), 0.0125);
  assert.equal(vaFundingFeeRate('subsequentUse', 30), 0.0125);
});

test('VA exempt has no funding fee at any down payment', () => {
  for (const down of [0, 5, 10, 30]) assert.equal(vaFundingFeeRate('exempt', down), 0);
});

test('calculateMortgage applies the corrected VA subsequent-use fee to the loan', () => {
  const r = calculateMortgage({ ...base, loanType: 'VA', vaLoanUsage: 'subsequentUse', downPct: 10 });
  assert.equal(r.feeRate, 0.0125);
  close(r.baseLoanBeforeFee, 360000);
  close(r.financedFee, 4500); // the old 1.50% rate gave 5,400
  close(r.baseLoan, 364500);
});

test('VA first use and the default usage are unchanged', () => {
  const first = calculateMortgage({ ...base, loanType: 'VA', vaLoanUsage: 'firstUse', downPct: 3 });
  const unset = calculateMortgage({ ...base, loanType: 'VA', downPct: 3 });
  assert.equal(first.feeRate, 0.0215);
  assert.equal(unset.feeRate, 0.0215);
  assert.equal(first.baseLoan, unset.baseLoan);
});

test('FHA and Conventional fee handling is unchanged', () => {
  assert.equal(calculateMortgage({ ...base, loanType: 'FHA', downPct: 3.5 }).feeRate, 0.0175);
  const conv = calculateMortgage(base);
  assert.equal(conv.feeRate, 0);
  assert.equal(conv.financedFee, 0);
});

test('standard payment matches the amortization formula', () => {
  close(monthlyPrincipalAndInterest(300000, 6, 30), 1798.65);
  close(monthlyPrincipalAndInterest(250000, 7.5, 15), 2317.53);
});

test('payment is identical to the previous formula for normal inputs', () => {
  const previous = (loan: number, rate: number, years: number) => {
    const r = rate / 100 / 12;
    const n = years * 12;
    return loan && r ? (loan * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1) : 0;
  };
  for (const [loan, rate, years] of [[320000, 6.875, 30], [180500, 7.2, 15], [415000, 6.5, 20], [95000, 8.5, 30]]) {
    assert.equal(monthlyPrincipalAndInterest(loan, rate, years), previous(loan, rate, years));
  }
});

test('a 0% rate gives straight-line payments, not $0', () => {
  close(monthlyPrincipalAndInterest(360000, 0, 30), 1000);
  close(monthlyPrincipalAndInterest(120000, 0, 10), 1000);
});

test('zero or invalid term and principal give 0 instead of NaN or Infinity', () => {
  for (const [principal, rate, years] of [[300000, 6, 0], [300000, 6, -5], [300000, 6, NaN], [0, 6, 30], [-1000, 6, 30], [NaN, 6, 30]]) {
    const payment = monthlyPrincipalAndInterest(principal, rate, years);
    assert.equal(payment, 0, `${principal}/${rate}/${years}`);
  }
});

test('every numeric result stays finite for a zero term', () => {
  const r = calculateMortgage({ ...base, termYears: 0 });
  for (const [key, value] of Object.entries(r)) {
    assert.ok(Number.isFinite(value), `${key} is ${value}`);
  }
});

test('a normal scenario produces sensible, finite results', () => {
  const r = calculateMortgage(base);
  assert.equal(r.noteRate, 7.5);
  close(r.baseLoan, 320000);
  assert.ok(r.monthlyPI > 2200 && r.monthlyPI < 2300, `P&I ${r.monthlyPI}`);
  assert.ok(r.apr > r.noteRate - 0.5 && r.apr < r.noteRate + 1, `APR ${r.apr}`);
  for (const [key, value] of Object.entries(r)) assert.ok(Number.isFinite(value), `${key} is ${value}`);
});

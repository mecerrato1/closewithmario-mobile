// src/utils/calculateMI.ts
export type LoanType = 'Conventional' | 'FHA' | 'VA' | 'DSCR';

export function calculateMI(
  loanType: LoanType,
  finalLoanAmount: number,
  ltvPercent: number,
  opts?: { creditScore?: number; termYears?: number }
): { monthlyMI: number; annualRatePct: number } {
  const ltv = ltvPercent; // e.g., 97 (not decimal)
  const creditScore = opts?.creditScore ?? 740;
  const termMonths = (opts?.termYears ?? 30) * 12;

  // FHA (use base amount—remove UFMIP for annual MIP calc)
  if (loanType === 'FHA') {
    const baseLoanAmount = finalLoanAmount / 1.0175;
    const annualRate = ltv > 95 ? 0.0055 : 0.005; // 55 or 50 bps
    return { monthlyMI: (baseLoanAmount * annualRate) / 12, annualRatePct: annualRate * 100 };
  }

  // VA & DSCR: no MI
  if (loanType === 'VA' || loanType === 'DSCR') return { monthlyMI: 0, annualRatePct: 0 };

  // Conventional grid (compact, mirrors your former approach)
  if (loanType === 'Conventional') {
    if (ltv <= 80) return { monthlyMI: 0, annualRatePct: 0 };

    // pick a bucketed MI % (annual) by LTV + score; term ≥ 240 months uses "std" bucket
    let miPct = 0.0;

    const score = creditScore;
    const pick = (a760: number, a740: number, a720: number, a700: number, a680: number, a660: number, a640: number, a620: number) => {
      if (score >= 760) return a760;
      if (score >= 740) return a740;
      if (score >= 720) return a720;
      if (score >= 700) return a700;
      if (score >= 680) return a680;
      if (score >= 660) return a660;
      if (score >= 640) return a640;
      return a620;
    };

    if (ltv > 95) miPct = pick(0.0058, 0.0070, 0.0087, 0.0099, 0.0121, 0.0154, 0.0165, 0.0186);
    else if (ltv > 90) miPct = pick(0.0046, 0.0055, 0.0068, 0.0077, 0.0093, 0.0118, 0.0132, 0.0150);
    else if (ltv > 85) miPct = pick(0.0031, 0.0037, 0.0047, 0.0054, 0.0067, 0.0087, 0.0102, 0.0119);
    else /* >80 */ miPct = pick(0.0021, 0.0025, 0.0032, 0.0037, 0.0046, 0.0062, 0.0075, 0.0088);

    const monthlyMI = (finalLoanAmount * miPct) / 12;
    return { monthlyMI, annualRatePct: miPct * 100 };
  }

  return { monthlyMI: 0, annualRatePct: 0 };
}

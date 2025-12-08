// src/utils/floridaTaxes.ts
export class FloridaTaxCalculator {
  // Lender's title: $575 up to 100k, then +$5 per $1k over 100k
  getLendersTitle(loanAmount: number): number {
    if (loanAmount <= 100000) return 575;
    return parseFloat((((loanAmount - 100000) / 1000) * 5 + 575).toFixed(2));
  }

  // Intangible tax on note
  getIntangibleTax(loanAmount: number): number {
    return parseFloat((loanAmount * 0.002).toFixed(2));
  }

  // Mortgage doc stamps (borrower) + optional seller deed stamps
  // If includeSellerTransfer is true, add seller deed stamps on price using MD rate exception
  getDeedTax(loanAmount: number, includeSellerTransfer: boolean, salesPrice: number, county: string): number {
    const borrowerDocStamps = loanAmount * 0.0035; // 35¢ per $100 of debt
    let sellerDeed = 0;
    if (includeSellerTransfer) {
      const rate = county === 'Miami-Dade' ? 0.006 : 0.007; // 60¢ vs 70¢ per $100
      sellerDeed = salesPrice * rate;
    }
    return parseFloat((borrowerDocStamps + sellerDeed).toFixed(2));
  }

  // Whether buyer customarily pays Owner's title premium by county
  // Per your requirement: ONLY Miami-Dade & Broward buyer pays owner's title
  buyerPaysOwnersTitle(county: string): boolean {
    return county === 'Miami-Dade' || county === 'Broward';
  }
}

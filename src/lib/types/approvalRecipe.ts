export type ApprovalRecipeLeadSource = 'organic' | 'meta';

export type ApprovalRecipeRow = {
  id: string;
  lead_id: string;
  lead_source: ApprovalRecipeLeadSource;
  aus_system?: string | null;
  aus_type?: string | null;
  recommendation?: string | null;
  findings_date?: string | null;
  product_type?: string | null;
  loan_product?: string | null;
  loan_purpose?: string | null;
  property_type?: string | null;
  occupancy?: string | null;
  purchase_price?: number | string | null;
  price_value?: number | string | null;
  loan_amount?: number | string | null;
  ltv?: number | string | null;
  cltv?: number | string | null;
  hcltv?: number | string | null;
  htl_tv?: number | string | null;
  dti?: number | string | null;
  housing_ratio?: number | string | null;
  credit_score?: number | string | null;
  reserves?: string | null;
  must_not_change?: string | null;
  strategy_note?: string | null;
  strategy_notes?: string | null;
  debt_strategy?: string | null;
  key_conditions?: string | null;
  conditions_summary?: string | null;
  findings_file_path?: string | null;
  findings_file_name?: string | null;
  findings_file_size_bytes?: number | null;
  pdf_storage_path?: string | null;
  pdf_file_name?: string | null;
  confidence_score?: number | string | null;
  extraction_snapshot?: Record<string, unknown> | null;
  archived_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ApprovalRecipeFormState = {
  ausSystem: string;
  recommendation: string;
  findingsDate: string;
  productType: string;
  loanPurpose: string;
  propertyType: string;
  occupancy: string;
  purchasePrice: string;
  loanAmount: string;
  ltv: string;
  cltv: string;
  hcltv: string;
  dti: string;
  housingRatio: string;
  creditScore: string;
  reserves: string;
  strategyNotes: string;
  debtStrategy: string;
  keyConditions: string;
};

export const emptyApprovalRecipeForm: ApprovalRecipeFormState = {
  ausSystem: '',
  recommendation: '',
  findingsDate: '',
  productType: '',
  loanPurpose: '',
  propertyType: '',
  occupancy: '',
  purchasePrice: '',
  loanAmount: '',
  ltv: '',
  cltv: '',
  hcltv: '',
  dti: '',
  housingRatio: '',
  creditScore: '',
  reserves: '',
  strategyNotes: '',
  debtStrategy: '',
  keyConditions: '',
};

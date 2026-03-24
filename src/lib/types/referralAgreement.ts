export interface ReferralAgreement {
  id: string;
  lead_id: string;
  lead_source: 'quick_captures' | 'leads' | 'meta_ads';
  realtor_id: string;
  status: 'generated' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired' | 'failed';
  prospect_name: string | null;
  referral_percent: number;
  commission_type: string;
  additional_terms: string | null;
  generated_pdf_path: string | null;
  signed_pdf_path: string | null;
  eversign_document_hash: string | null;
  last_error: string | null;
  sent_at: string | null;
  signed_at: string | null;
  created_at: string;
  // Joined from realtors table by API
  realtor_name: string | null;
  realtor_email: string | null;
  realtor_brokerage: string | null;
  realtor_license_number: string | null;
}

export interface SignerStatus {
  id: number;
  name: string;
  email: string;
  signed: number;   // 0 or 1
  declined: number;  // 0 or 1
  sent: number;      // 0 or 1
  viewed: number;    // 0 or 1
}

export interface SignerStatusResponse {
  success: boolean;
  document_hash: string;
  is_completed: boolean;
  is_cancelled: boolean;
  signers: SignerStatus[];
}

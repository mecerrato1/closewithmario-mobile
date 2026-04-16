// Lead type definitions extracted from App.tsx
export type TrackingReason = 'manual' | 'auto_docs_requested' | 'auto_qualified' | null;

export type CoBorrowerInfo = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  employer_name: string;
  job_title: string;
  is_self_employed: boolean;
  total_monthly_income: number | null;
  marital_status: string;
  is_military: boolean;
  military_status: string;
};

export type LoanOriginatorInfo = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  license?: string | null;
};

export type LeadMetadata = {
  has_co_borrower?: boolean;
  co_borrowers?: CoBorrowerInfo[];
  loan_originator?: LoanOriginatorInfo;
  ad_creative?: Record<string, unknown> | null;
  raw?: Record<string, unknown> | null;
  import_source?: string | null;
  import_date?: string | null;
  [key: string]: unknown;
};

export type Lead = {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  last_contact_date?: string | null;
  last_touched_at?: string | null;
  lo_id?: string | null;
  realtor_id?: string | null;
  loan_purpose?: string | null;
  price?: number | null;
  loan_amount?: number | null;
  down_payment?: number | null;
  credit_score?: number | null;
  ltv?: number | null;
  interest_rate?: number | null;
  message?: string | null;
  source?: string | null; // e.g., 'My Lead', 'CTA Form', etc.
  source_detail?: string | null; // Referral source for self-created leads
  subject_address?: string | null;
  subject_city?: string | null;
  subject_state?: string | null;
  subject_county?: string | null;
  subject_zipcode?: string | null;
  xml_property_type?: string | null;
  occupancy_type?: string | null;
  mortgage_type?: string | null;
  amortization_type?: string | null;
  loan_term_months?: number | null;
  lender_loan_number?: string | null;
  estimated_closing_costs?: number | null;
  employer_name?: string | null;
  employment_title?: string | null;
  employment_start_date?: string | null;
  employment_monthly_income?: number | null;
  self_employed?: boolean | null;
  marital_status?: string | null;
  dependent_count?: number | null;
  citizenship_status?: string | null;
  current_housing_type?: string | null;
  current_housing_payment?: number | null;
  originator_name?: string | null;
  originator_company?: string | null;
  originator_license?: string | null;
  originator_email?: string | null;
  sms_opt_in?: boolean | null;
  sms_opted_out?: boolean | null;
  // Tracking fields
  is_tracked?: boolean;
  tracking_reason?: TrackingReason;
  tracking_note?: string | null;
  tracking_note_updated_at?: string | null;
  // Referral partner fields
  referral_source_name?: string | null;
  referral_source_email?: string | null;
  last_referral_update_at?: string | null;
  last_referral_update_summary?: string | null;
  // Metadata (JSONB) — contains co-borrowers from XML imports
  metadata?: LeadMetadata | null;
};

export type MetaLead = {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  last_contact_date?: string | null;
  last_touched_at?: string | null;
  lo_id?: string | null;
  realtor_id?: string | null;
  ad_id?: string | null;
  adset_name?: string | null;
  platform: string | null;
  campaign_name: string | null;
  ad_name?: string | null;
  subject_address?: string | null;
  preferred_language?: string | null;
  credit_range?: string | null;
  income_type?: string | null;
  purchase_timeline?: string | null;
  price_range?: string | null;
  down_payment_saved?: string | null;
  has_realtor?: boolean | null;
  additional_notes?: string | null;
  source_detail?: string | null;
  loan_purpose?: string | null;
  county_interest?: string | null;
  monthly_income?: string | null;
  meta_ad_notes?: string | null;
  form_data?: Record<string, string> | null;
  metadata?: LeadMetadata | null;
  raw?: Record<string, unknown> | null;
  sms_opt_in?: boolean | null;
  sms_opted_out?: boolean | null;
  // Tracking fields
  is_tracked?: boolean;
  tracking_reason?: TrackingReason;
  tracking_note?: string | null;
  tracking_note_updated_at?: string | null;
  // Referral partner fields
  referral_source_name?: string | null;
  referral_source_email?: string | null;
  last_referral_update_at?: string | null;
  last_referral_update_summary?: string | null;
};

export type SelectedLeadRef =
  | { source: 'lead'; id: string }
  | { source: 'meta'; id: string };

export type LoanOfficer = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  lead_eligible: boolean;
  created_at: string;
};

export type Realtor = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  brokerage: string | null;
  active: boolean;
  lead_eligible: boolean;
  campaign_eligible: boolean;
  email_opt_out: boolean;
  preferred_language: string;
  secondary_language: string | null;
  county_filter: string[] | null;
  profile_picture_url: string | null;
  ai_draft_access: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Activity = {
  id: string;
  lead_id?: string;
  meta_ad_id?: string;
  activity_type: 'call' | 'text' | 'email' | 'note' | 'docs_received';
  notes: string;
  created_at: string;
  created_by?: string;
  user_email?: string;
  audio_url?: string | null; // 👈 NEW - for voice notes
  body?: string | null; // Email body from inbound emails
  subject?: string | null;
  from_email?: string | null;
  to_email?: string | null;
  to_emails?: string[] | null;
  cc_email?: string | null;
  cc_emails?: string[] | string | null;
  recipients?: {
    to?: string[] | null;
    cc?: string[] | null;
    bcc?: string[] | null;
  } | null;
  direction?: string | null;
};

export type AttentionBadge = {
  type: 'new' | 'stale' | 'no_activity';
  label: string;
  color: string;
} | null;

// AI-powered attention data from GPT analysis
export type AiAttentionData = {
  leadId: string;
  needsAttention: boolean;
  priority: number; // 1-5, 1 = highest
  badge: string; // Short display label like "High: Call Today"
  reason: string;
  suggestedAction: string;
  fromCache: boolean;
  loading: boolean;
  error?: string;
};

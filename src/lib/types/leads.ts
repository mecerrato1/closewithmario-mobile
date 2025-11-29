// Lead type definitions extracted from App.tsx
export type Lead = {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  last_contact_date?: string | null;
  lo_id?: string | null;
  realtor_id?: string | null;
  loan_purpose?: string | null;
  price?: number | null;
  down_payment?: number | null;
  credit_score?: number | null;
  message?: string | null;
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
  lo_id?: string | null;
  realtor_id?: string | null;
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
  county_interest?: string | null;
  monthly_income?: string | null;
  meta_ad_notes?: string | null;
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
  active: boolean;
  created_at: string;
};

export type Activity = {
  id: string;
  lead_id?: string;
  meta_ad_id?: string;
  activity_type: 'call' | 'text' | 'email' | 'note';
  notes: string;
  created_at: string;
  created_by?: string;
  user_email?: string;
  audio_url?: string | null; // 👈 NEW - for voice notes
};

export type AttentionBadge = {
  type: 'new' | 'stale' | 'no_activity';
  label: string;
  color: string;
} | null;

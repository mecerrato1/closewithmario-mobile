export type LeadRealtorRoleSource = 'organic' | 'meta';

export type LeadRealtorRoleType = 'buyer_agent' | 'listing_agent' | 'referral_partner' | 'other';

export type LeadRoleRealtor = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  brokerage: string | null;
  active?: boolean | null;
};

export type LeadRealtorRole = {
  id: string;
  lead_id: string;
  lead_source: LeadRealtorRoleSource;
  realtor_id: string;
  role: LeadRealtorRoleType;
  is_primary: boolean;
  cc_by_default: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  realtor?: LeadRoleRealtor | null;
  realtors?: LeadRoleRealtor | null;
};

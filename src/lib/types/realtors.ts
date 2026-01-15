// src/lib/types/realtors.ts
// Type definitions for Realtor CRM features

export type RelationshipStage = 'hot' | 'warm' | 'cold';

export type RealtorActivityType = 'note' | 'call' | 'text' | 'email' | 'meeting';

// Language options - defined early so other types can reference it
export type LanguageCode = 'en' | 'es' | 'pt' | 'fr' | 'ht' | 'zh';

export interface Realtor {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  brokerage: string | null;
  active: boolean;
  campaign_eligible: boolean;
  email_opt_out: boolean;
  created_by_user_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RealtorAssignment {
  id: string;
  realtor_id: string;
  lo_user_id: string;
  relationship_stage: RelationshipStage;
  notes: string | null;
  last_touched_at: string;
  created_at: string;
}

export interface RealtorActivity {
  id: string;
  realtor_id: string;
  lo_user_id: string;
  activity_type: RealtorActivityType;
  content: string | null;
  created_at: string;
}

// Combined type for display - realtor with assignment data
export interface AssignedRealtor {
  // Assignment fields
  assignment_id: string;
  lo_user_id: string;
  relationship_stage: RelationshipStage;
  assignment_notes: string | null;
  last_touched_at: string;
  assigned_at: string;
  // Realtor fields
  realtor_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  brokerage: string | null;
  active: boolean;
  campaign_eligible: boolean;
  email_opt_out: boolean;
  preferred_language: LanguageCode;
  secondary_language: LanguageCode | null;
  realtor_created_at: string;
  // Computed fields
  lead_count?: number;
}

export const LANGUAGE_OPTIONS: { value: LanguageCode | 'none'; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'fr', label: 'French' },
  { value: 'ht', label: 'Haitian Creole' },
  { value: 'zh', label: 'Chinese' },
  { value: 'none', label: 'None' },
];

// For creating a new realtor
export interface CreateRealtorPayload {
  first_name: string;
  last_name: string;
  phone?: string;
  email: string; // Required per screenshot
  brokerage?: string;
  active?: boolean;
  campaign_eligible?: boolean;
  email_opt_out?: boolean;
  preferred_language?: string;
  secondary_language?: string | null;
  // Assignment-related (not in realtors table, handled separately)
  notes?: string;
  relationship_stage?: RelationshipStage;
}

// For updating realtor assignment (stage, notes)
export interface UpdateAssignmentPayload {
  relationship_stage?: RelationshipStage;
  notes?: string;
}

// Filter options for the list
export interface RealtorFilters {
  assignedToMe: boolean;
  stage: RelationshipStage | 'all';
  needsLove: boolean; // No activity in 14+ days
}

// Helper to get full name
export function getRealtorFullName(realtor: { first_name: string; last_name: string }): string {
  return `${realtor.first_name} ${realtor.last_name}`.trim();
}

// Helper to get initials
export function getRealtorInitials(realtor: { first_name: string; last_name: string }): string {
  const first = realtor.first_name?.[0] || '';
  const last = realtor.last_name?.[0] || '';
  return `${first}${last}`.toUpperCase();
}

// Stage display config
export const STAGE_CONFIG: Record<RelationshipStage, { label: string; color: string; bgColor: string }> = {
  hot: { label: 'Hot', color: '#DC2626', bgColor: '#FEE2E2' },
  warm: { label: 'Warm', color: '#D97706', bgColor: '#FEF3C7' },
  cold: { label: 'Cold', color: '#2563EB', bgColor: '#DBEAFE' },
};

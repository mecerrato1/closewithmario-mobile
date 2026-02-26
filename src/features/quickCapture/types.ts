// src/features/quickCapture/types.ts

export type QuickCaptureStatus = 'open' | 'converted' | 'archived';

export interface QuickCapture {
  id: string;
  created_at: string;
  created_by_user_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  realtor_id: string | null;
  notes: string | null;
  loan_type: 'purchase' | 'refinance' | null;
  status: QuickCaptureStatus;
  converted_lead_id: string | null;
  last_touched_at: string;
  // Joined fields (optional, from realtor)
  realtor_first_name?: string | null;
  realtor_last_name?: string | null;
}

export interface QuickCaptureAttachment {
  id: string;
  created_at: string;
  quick_capture_id: string;
  file_path: string;
  file_url: string;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  sort_order: number;
}

export interface CreateQuickCapturePayload {
  first_name: string;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  realtor_id?: string | null;
  notes?: string | null;
  loan_type?: 'purchase' | 'refinance' | null;
}

export interface UpdateQuickCapturePayload {
  first_name?: string;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  realtor_id?: string | null;
  notes?: string | null;
  loan_type?: 'purchase' | 'refinance' | null;
  status?: QuickCaptureStatus;
  converted_lead_id?: string | null;
  last_touched_at?: string;
}

export interface ListQuickCapturesOptions {
  status?: QuickCaptureStatus;
  query?: string;
}

export interface LocalAttachment {
  localUri: string;
  width?: number;
  height?: number;
  uploading?: boolean;
  error?: string;
  // After upload
  attachment?: QuickCaptureAttachment;
}

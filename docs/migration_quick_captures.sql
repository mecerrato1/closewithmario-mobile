-- Migration: Quick Captures feature
-- Run this in Supabase SQL Editor (or via CLI migration)
-- Created: 2025-02-25

-- ============================================================================
-- 1. Create table: quick_captures
-- ============================================================================
CREATE TABLE IF NOT EXISTS quick_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NOT NULL DEFAULT auth.uid(),
  first_name text NOT NULL,
  last_name text NULL,
  email text NULL,
  phone text NULL,
  realtor_id uuid NULL REFERENCES realtors(id),
  notes text NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'converted', 'archived')),
  converted_lead_id uuid NULL REFERENCES leads(id),
  last_touched_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_quick_captures_user_status
  ON quick_captures (created_by_user_id, status);
CREATE INDEX idx_quick_captures_phone
  ON quick_captures (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_quick_captures_email
  ON quick_captures (email) WHERE email IS NOT NULL;
CREATE INDEX idx_quick_captures_last_touched
  ON quick_captures (last_touched_at DESC);

-- ============================================================================
-- 2. Create table: quick_capture_attachments
-- ============================================================================
CREATE TABLE IF NOT EXISTS quick_capture_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  quick_capture_id uuid NOT NULL REFERENCES quick_captures(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_url text NOT NULL,
  mime_type text NULL,
  width int NULL,
  height int NULL,
  size_bytes bigint NULL,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX idx_qca_capture_id
  ON quick_capture_attachments (quick_capture_id);

-- ============================================================================
-- 3. Enable RLS
-- ============================================================================
ALTER TABLE quick_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_capture_attachments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. RLS Policies for quick_captures
-- ============================================================================

-- Users can SELECT their own captures
CREATE POLICY "Users can view own quick captures"
  ON quick_captures FOR SELECT
  USING (created_by_user_id = auth.uid());

-- Users can INSERT their own captures
CREATE POLICY "Users can create quick captures"
  ON quick_captures FOR INSERT
  WITH CHECK (created_by_user_id = auth.uid());

-- Users can UPDATE their own captures
CREATE POLICY "Users can update own quick captures"
  ON quick_captures FOR UPDATE
  USING (created_by_user_id = auth.uid())
  WITH CHECK (created_by_user_id = auth.uid());

-- Users can DELETE their own captures
CREATE POLICY "Users can delete own quick captures"
  ON quick_captures FOR DELETE
  USING (created_by_user_id = auth.uid());

-- ============================================================================
-- 5. RLS Policies for quick_capture_attachments
-- ============================================================================

-- Users can SELECT attachments for their own captures
CREATE POLICY "Users can view own capture attachments"
  ON quick_capture_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM quick_captures
      WHERE quick_captures.id = quick_capture_attachments.quick_capture_id
        AND quick_captures.created_by_user_id = auth.uid()
    )
  );

-- Users can INSERT attachments for their own captures
CREATE POLICY "Users can create capture attachments"
  ON quick_capture_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quick_captures
      WHERE quick_captures.id = quick_capture_attachments.quick_capture_id
        AND quick_captures.created_by_user_id = auth.uid()
    )
  );

-- Users can UPDATE attachments for their own captures
CREATE POLICY "Users can update own capture attachments"
  ON quick_capture_attachments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM quick_captures
      WHERE quick_captures.id = quick_capture_attachments.quick_capture_id
        AND quick_captures.created_by_user_id = auth.uid()
    )
  );

-- Users can DELETE attachments for their own captures
CREATE POLICY "Users can delete own capture attachments"
  ON quick_capture_attachments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM quick_captures
      WHERE quick_captures.id = quick_capture_attachments.quick_capture_id
        AND quick_captures.created_by_user_id = auth.uid()
    )
  );

-- ============================================================================
-- 6. Create Storage Bucket
-- ============================================================================
-- Run this via Supabase Dashboard > Storage > New Bucket
-- OR use the SQL below (requires service_role or dashboard access):

INSERT INTO storage.buckets (id, name, public)
VALUES ('quick-capture-attachments', 'quick-capture-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload quick capture attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'quick-capture-attachments'
    AND auth.role() = 'authenticated'
  );

-- Storage RLS: Allow authenticated users to read their own uploads
CREATE POLICY "Users can read quick capture attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'quick-capture-attachments'
    AND auth.role() = 'authenticated'
  );

-- Storage RLS: Allow authenticated users to delete their own uploads
CREATE POLICY "Users can delete quick capture attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'quick-capture-attachments'
    AND auth.role() = 'authenticated'
  );

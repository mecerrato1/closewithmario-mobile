-- Realtor Schema Additions for Mobile App CRM Features
-- Run these migrations in Supabase SQL Editor

-- ============================================================================
-- 1. Add relationship management fields to realtor_assignments table
-- These are per-LO fields (each LO can have different stage/notes for same realtor)
-- ============================================================================

ALTER TABLE realtor_assignments
ADD COLUMN IF NOT EXISTS relationship_stage text DEFAULT 'warm' CHECK (relationship_stage IN ('hot', 'warm', 'cold')),
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS last_touched_at timestamptz DEFAULT now();

-- Add index for filtering by stage
CREATE INDEX IF NOT EXISTS idx_realtor_assignments_stage ON realtor_assignments(relationship_stage);

-- Add index for "needs love" queries (oldest last_touched_at)
CREATE INDEX IF NOT EXISTS idx_realtor_assignments_last_touched ON realtor_assignments(lo_user_id, last_touched_at);

-- ============================================================================
-- 2. Create realtor_activity table for tracking interactions
-- ============================================================================

CREATE TABLE IF NOT EXISTS realtor_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  realtor_id uuid NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
  lo_user_id uuid NOT NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('note', 'call', 'text', 'email', 'meeting')),
  content text,
  created_at timestamptz DEFAULT now()
);

-- Index for fetching activity by realtor
CREATE INDEX IF NOT EXISTS idx_realtor_activity_realtor ON realtor_activity(realtor_id, created_at DESC);

-- Index for fetching activity by LO
CREATE INDEX IF NOT EXISTS idx_realtor_activity_lo ON realtor_activity(lo_user_id, created_at DESC);

-- ============================================================================
-- 3. RLS Policies for realtor_activity
-- ============================================================================

ALTER TABLE realtor_activity ENABLE ROW LEVEL SECURITY;

-- LOs can view their own activity
CREATE POLICY "LOs can view own realtor activity"
ON realtor_activity FOR SELECT
USING (lo_user_id = auth.uid());

-- LOs can insert their own activity
CREATE POLICY "LOs can insert own realtor activity"
ON realtor_activity FOR INSERT
WITH CHECK (lo_user_id = auth.uid());

-- LOs can update their own activity
CREATE POLICY "LOs can update own realtor activity"
ON realtor_activity FOR UPDATE
USING (lo_user_id = auth.uid());

-- LOs can delete their own activity
CREATE POLICY "LOs can delete own realtor activity"
ON realtor_activity FOR DELETE
USING (lo_user_id = auth.uid());

-- ============================================================================
-- 4. Function to update last_touched_at when activity is logged
-- ============================================================================

CREATE OR REPLACE FUNCTION update_realtor_last_touched()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE realtor_assignments
  SET last_touched_at = NEW.created_at
  WHERE realtor_id = NEW.realtor_id AND lo_user_id = NEW.lo_user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update last_touched_at
DROP TRIGGER IF EXISTS trigger_update_realtor_last_touched ON realtor_activity;
CREATE TRIGGER trigger_update_realtor_last_touched
AFTER INSERT ON realtor_activity
FOR EACH ROW
EXECUTE FUNCTION update_realtor_last_touched();

-- ============================================================================
-- 5. Helpful view for fetching assigned realtors with all data
-- ============================================================================

CREATE OR REPLACE VIEW my_realtors AS
SELECT 
  ra.id as assignment_id,
  ra.lo_user_id,
  ra.relationship_stage,
  ra.notes as assignment_notes,
  ra.last_touched_at,
  ra.created_at as assigned_at,
  r.id as realtor_id,
  r.first_name,
  r.last_name,
  r.phone,
  r.email,
  r.brokerage,
  r.active,
  r.created_at as realtor_created_at,
  (SELECT COUNT(*) FROM leads l WHERE l.realtor_id = r.id) as lead_count
FROM realtor_assignments ra
JOIN realtors r ON ra.realtor_id = r.id
WHERE ra.lo_user_id = auth.uid();

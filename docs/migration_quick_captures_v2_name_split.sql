-- Migration v2: Split 'name' column into 'first_name' + 'last_name'
-- Run this ONLY if you already ran the original migration_quick_captures.sql
-- (i.e. the quick_captures table already exists with a 'name' column)

-- 1. Add new columns
ALTER TABLE quick_captures ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE quick_captures ADD COLUMN IF NOT EXISTS last_name text;

-- 2. Copy existing 'name' data into 'first_name'
UPDATE quick_captures SET first_name = name WHERE first_name IS NULL AND name IS NOT NULL;

-- 3. Make first_name NOT NULL (after populating it)
ALTER TABLE quick_captures ALTER COLUMN first_name SET NOT NULL;

-- 4. Drop the old 'name' column
ALTER TABLE quick_captures DROP COLUMN IF EXISTS name;

-- Done! The table now has first_name (NOT NULL) + last_name (NULL) instead of name.

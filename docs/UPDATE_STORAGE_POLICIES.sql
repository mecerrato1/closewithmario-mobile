-- ============================================
-- Supabase Storage Policies Update
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================
-- This will fix the "Upload failed" error for all admin emails
-- by updating storage policies to allow all admins to upload/update/delete

-- Step 1: Drop any existing conflicting policies
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes" ON storage.objects;
DROP POLICY IF EXISTS "Admin uploads only" ON storage.objects;
DROP POLICY IF EXISTS "Admin updates only" ON storage.objects;
DROP POLICY IF EXISTS "Admin deletes only" ON storage.objects;

-- Step 2: Ensure the images bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Step 3: Create policies for authenticated admin users
-- IMPORTANT: These emails must match src/config/admin.ts and api/config/admin.ts

-- Allow authenticated admin users to upload images
CREATE POLICY "Admin uploads only" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'images' AND
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- Allow everyone to read/view images (public access)
CREATE POLICY "Allow public reads" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'images');

-- Allow authenticated admin users to update images
CREATE POLICY "Admin updates only" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'images' AND
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- Allow authenticated admin users to delete images
CREATE POLICY "Admin deletes only" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'images' AND
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- ============================================
-- ✅ Done! All admin emails can now upload
-- ============================================
-- Test by:
-- 1. Log in with sofloandresre@gmail.com (or any admin email)
-- 2. Go to Admin Dashboard → Testimonials
-- 3. Try uploading an image
-- 4. Should work without "Upload failed" error

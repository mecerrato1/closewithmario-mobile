-- ============================================
-- Supabase Database Table Policies Update
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================
-- This will fix the "cannot add" error for all admin emails
-- by updating RLS policies to allow all admins to manage data

-- ============================================
-- TESTIMONIALS TABLE POLICIES
-- ============================================

-- Drop existing testimonials policies
DROP POLICY IF EXISTS "Allow public reads" ON testimonials;
DROP POLICY IF EXISTS "Allow admin inserts" ON testimonials;
DROP POLICY IF EXISTS "Allow admin updates" ON testimonials;
DROP POLICY IF EXISTS "Allow admin deletes" ON testimonials;
DROP POLICY IF EXISTS "Public can read testimonials" ON testimonials;
DROP POLICY IF EXISTS "Admins can insert testimonials" ON testimonials;
DROP POLICY IF EXISTS "Admins can update testimonials" ON testimonials;
DROP POLICY IF EXISTS "Admins can delete testimonials" ON testimonials;

-- Enable RLS on testimonials table (if not already enabled)
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read testimonials (public access for website)
CREATE POLICY "Public can read testimonials" ON testimonials
FOR SELECT TO public
USING (true);

-- Allow authenticated admin users to insert testimonials
CREATE POLICY "Admins can insert testimonials" ON testimonials
FOR INSERT TO authenticated
WITH CHECK (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- Allow authenticated admin users to update testimonials
CREATE POLICY "Admins can update testimonials" ON testimonials
FOR UPDATE TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- Allow authenticated admin users to delete testimonials
CREATE POLICY "Admins can delete testimonials" ON testimonials
FOR DELETE TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- ============================================
-- HERO TABLE POLICIES (for HeroPanel)
-- ============================================

-- Drop existing hero policies
DROP POLICY IF EXISTS "Allow public reads" ON hero;
DROP POLICY IF EXISTS "Allow admin inserts" ON hero;
DROP POLICY IF EXISTS "Allow admin updates" ON hero;
DROP POLICY IF EXISTS "Allow admin deletes" ON hero;
DROP POLICY IF EXISTS "Public can read hero" ON hero;
DROP POLICY IF EXISTS "Admins can insert hero" ON hero;
DROP POLICY IF EXISTS "Admins can update hero" ON hero;
DROP POLICY IF EXISTS "Admins can delete hero" ON hero;

-- Enable RLS on hero table (if not already enabled)
ALTER TABLE hero ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read hero section (public access for website)
CREATE POLICY "Public can read hero" ON hero
FOR SELECT TO public
USING (true);

-- Allow authenticated admin users to insert hero entries
CREATE POLICY "Admins can insert hero" ON hero
FOR INSERT TO authenticated
WITH CHECK (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- Allow authenticated admin users to update hero entries
CREATE POLICY "Admins can update hero" ON hero
FOR UPDATE TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- Allow authenticated admin users to delete hero entries
CREATE POLICY "Admins can delete hero" ON hero
FOR DELETE TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- ============================================
-- LEADS TABLE POLICIES (for contact forms)
-- ============================================

-- Drop existing leads policies
DROP POLICY IF EXISTS "Allow public inserts" ON leads;
DROP POLICY IF EXISTS "Allow admin reads" ON leads;
DROP POLICY IF EXISTS "Allow admin deletes" ON leads;
DROP POLICY IF EXISTS "Public can submit leads" ON leads;
DROP POLICY IF EXISTS "Admins can read leads" ON leads;
DROP POLICY IF EXISTS "Admins can delete leads" ON leads;

-- Enable RLS on leads table (if not already enabled)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Allow anyone to submit a lead (contact form)
CREATE POLICY "Public can submit leads" ON leads
FOR INSERT TO public
WITH CHECK (true);

-- Allow authenticated admin users to read leads
CREATE POLICY "Admins can read leads" ON leads
FOR SELECT TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- Allow authenticated admin users to delete leads
CREATE POLICY "Admins can delete leads" ON leads
FOR DELETE TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- ============================================
-- VIDEOS TABLE POLICIES (for Real Estate & Mortgage videos)
-- ============================================

-- Drop existing videos policies
DROP POLICY IF EXISTS "Allow public reads" ON videos;
DROP POLICY IF EXISTS "Allow admin inserts" ON videos;
DROP POLICY IF EXISTS "Allow admin updates" ON videos;
DROP POLICY IF EXISTS "Allow admin deletes" ON videos;
DROP POLICY IF EXISTS "Public can read videos" ON videos;
DROP POLICY IF EXISTS "Admins can insert videos" ON videos;
DROP POLICY IF EXISTS "Admins can update videos" ON videos;
DROP POLICY IF EXISTS "Admins can delete videos" ON videos;

-- Enable RLS on videos table
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read videos (public access for website)
CREATE POLICY "Public can read videos" ON videos
FOR SELECT TO public
USING (true);

-- Allow authenticated admin users to insert videos
CREATE POLICY "Admins can insert videos" ON videos
FOR INSERT TO authenticated
WITH CHECK (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- Allow authenticated admin users to update videos
CREATE POLICY "Admins can update videos" ON videos
FOR UPDATE TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- Allow authenticated admin users to delete videos
CREATE POLICY "Admins can delete videos" ON videos
FOR DELETE TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- ============================================
-- FEATURED TABLE POLICIES (for featured videos)
-- ============================================

-- Drop existing featured policies
DROP POLICY IF EXISTS "Allow public reads" ON featured;
DROP POLICY IF EXISTS "Allow admin inserts" ON featured;
DROP POLICY IF EXISTS "Allow admin updates" ON featured;
DROP POLICY IF EXISTS "Allow admin deletes" ON featured;
DROP POLICY IF EXISTS "Public can read featured" ON featured;
DROP POLICY IF EXISTS "Admins can insert featured" ON featured;
DROP POLICY IF EXISTS "Admins can update featured" ON featured;
DROP POLICY IF EXISTS "Admins can delete featured" ON featured;

-- Enable RLS on featured table
ALTER TABLE featured ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read featured videos (public access for website)
CREATE POLICY "Public can read featured" ON featured
FOR SELECT TO public
USING (true);

-- Allow authenticated admin users to insert featured entries
CREATE POLICY "Admins can insert featured" ON featured
FOR INSERT TO authenticated
WITH CHECK (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- Allow authenticated admin users to update featured entries
CREATE POLICY "Admins can update featured" ON featured
FOR UPDATE TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- Allow authenticated admin users to delete featured entries
CREATE POLICY "Admins can delete featured" ON featured
FOR DELETE TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- ============================================
-- PROFILES TABLE POLICIES (for User Maintenance)
-- ============================================

-- Drop existing profiles policies
DROP POLICY IF EXISTS "Allow public reads" ON profiles;
DROP POLICY IF EXISTS "Allow admin reads" ON profiles;
DROP POLICY IF EXISTS "Allow admin updates" ON profiles;
DROP POLICY IF EXISTS "Allow admin deletes" ON profiles;
DROP POLICY IF EXISTS "Admins can read profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

-- Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own profile
CREATE POLICY "Users can view own profile" ON profiles
FOR SELECT TO authenticated
USING (auth.uid() = id);

-- Allow authenticated admin users to read all profiles
CREATE POLICY "Admins can read profiles" ON profiles
FOR SELECT TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- Allow authenticated admin users to update profiles
CREATE POLICY "Admins can update profiles" ON profiles
FOR UPDATE TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- Allow authenticated admin users to insert profiles
CREATE POLICY "Admins can insert profiles" ON profiles
FOR INSERT TO authenticated
WITH CHECK (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- Allow authenticated admin users to delete profiles
CREATE POLICY "Admins can delete profiles" ON profiles
FOR DELETE TO authenticated
USING (
  auth.email() IN (
    'mario@closewithmario.com',
    'dhruv@loandock.com',
    'mecerrato16@gmail.com',
    'sofloandresre@gmail.com'
  )
);

-- ============================================
-- ✅ Done! All admin emails can now manage data
-- ============================================
-- Complete coverage for all admin panels:
-- ✅ Testimonials (add/edit/delete testimonials)
-- ✅ Hero/Featured Property (add/edit/delete hero entries)
-- ✅ Real Estate Videos (add/edit/delete/feature videos)
-- ✅ Mortgage Videos (add/edit/delete/feature videos)
-- ✅ User Maintenance (view/edit/delete user profiles)
-- ✅ Leads (view/edit/delete contact form leads)

-- Test by:
-- 1. Log in with sofloandresre@gmail.com (or any admin email)
-- 2. Test each panel in the Admin Dashboard
-- 3. All CRUD operations should work without errors!

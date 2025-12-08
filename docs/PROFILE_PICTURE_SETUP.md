# Profile Picture Upload Setup

## Supabase Storage Bucket Setup

### 1. Create the Storage Bucket

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **Storage** in the left sidebar
4. Click **New bucket**
5. Configure the bucket:
   - **Name:** `profile-pictures`
   - **Public bucket:** ✅ Check this (so images are publicly accessible)
   - Click **Create bucket**

### 2. Set Up Storage Policies

After creating the bucket, you need to set up Row Level Security (RLS) policies:

1. Click on the `profile-pictures` bucket
2. Click **Policies** tab
3. Click **New Policy**

#### Policy 1: Allow Users to Upload Their Own Picture

```sql
-- Policy Name: Users can upload their own profile picture
-- Operation: INSERT
-- Policy Definition:

CREATE POLICY "Users can upload own profile picture"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-pictures' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

#### Policy 2: Allow Users to Update Their Own Picture

```sql
-- Policy Name: Users can update their own profile picture
-- Operation: UPDATE
-- Policy Definition:

CREATE POLICY "Users can update own profile picture"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-pictures' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

#### Policy 3: Allow Users to Delete Their Own Picture

```sql
-- Policy Name: Users can delete their own profile picture
-- Operation: DELETE
-- Policy Definition:

CREATE POLICY "Users can delete own profile picture"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-pictures' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

#### Policy 4: Allow Public Read Access

```sql
-- Policy Name: Public can view profile pictures
-- Operation: SELECT
-- Policy Definition:

CREATE POLICY "Public can view profile pictures"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profile-pictures');
```

### 3. Verify Setup

1. Go to **Storage** → `profile-pictures`
2. Click **Policies** tab
3. You should see 4 policies:
   - ✅ Users can upload own profile picture (INSERT)
   - ✅ Users can update own profile picture (UPDATE)
   - ✅ Users can delete own profile picture (DELETE)
   - ✅ Public can view profile pictures (SELECT)

### File Structure in Bucket

Files will be stored as:
```
profile-pictures/
  └── {user-id}/
      └── avatar.jpg
```

This structure ensures:
- Each user has their own folder
- Users can only access their own folder
- Public can view all pictures (for display)
- Easy to find and manage user pictures

## Done!

Your storage bucket is now ready for profile picture uploads.

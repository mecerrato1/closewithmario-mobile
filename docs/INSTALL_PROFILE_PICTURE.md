# Profile Picture Upload - Installation Instructions

## Step 1: Install Required Package

Install the Expo Image Picker package:

```bash
npx expo install expo-image-picker
```

## Step 2: Set Up Supabase Storage Bucket

Follow the instructions in `PROFILE_PICTURE_SETUP.md` to:
1. Create the `profile-pictures` storage bucket
2. Set up the 4 required RLS policies
3. Verify the setup

## Step 3: Test the Feature

1. Start your development server:
   ```bash
   npx expo start --tunnel --dev-client
   ```

2. On your device:
   - Tap the profile picture in the top-right corner
   - Select "Change Profile Picture"
   - Choose a photo from your library
   - Wait for upload to complete

3. Verify:
   - Profile picture appears in header
   - "Remove Custom Picture" option appears in menu
   - Picture persists after app restart

## How It Works

### Priority System
The app displays profile pictures in this order:
1. **Custom uploaded picture** (if user uploaded one)
2. **Google/OAuth profile picture** (from sign-in)
3. **Initial letter** (fallback)

### Storage Structure
```
profile-pictures/
  └── {user-id}/
      └── avatar.jpg (or .png, .jpeg)
```

### Features
- ✅ Square crop with 1:1 aspect ratio
- ✅ 50% quality compression to reduce file size
- ✅ Automatic file replacement (upsert)
- ✅ Public read access for display
- ✅ User-only write access for security
- ✅ Remove custom picture to revert to Google pic

## Permissions

The app will automatically request photo library access when the user tries to upload a picture. On iOS, the permission message is:

> "We need access to your photo library to upload a profile picture."

This is defined in `app.json` under `ios.infoPlist.NSPhotoLibraryUsageDescription`.

## Troubleshooting

### Upload Fails
- Check Supabase storage bucket exists and is public
- Verify RLS policies are set up correctly
- Check network connection
- Look for errors in console logs

### Picture Doesn't Update
- The app uses the session metadata which updates after upload
- Try closing and reopening the profile menu
- Check Supabase dashboard to verify file was uploaded

### Permission Denied
- User must grant photo library access
- On iOS: Settings → Your App → Photos → Allow Access
- The app will show an alert if permission is denied

## Files Added/Modified

### New Files
- `src/utils/profilePicture.ts` - Profile picture utilities
- `docs/PROFILE_PICTURE_SETUP.md` - Supabase setup guide
- `docs/INSTALL_PROFILE_PICTURE.md` - This file

### Modified Files
- `App.tsx` - Added upload/remove handlers and menu items
- `package.json` - Will add expo-image-picker dependency

## Next Steps

After installation:
1. Test uploading a picture
2. Test removing a picture
3. Test with Google sign-in users
4. Test with email/password users
5. Verify pictures persist across sessions

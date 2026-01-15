import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Request permission to access the photo library
 */
export async function requestMediaLibraryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

/**
 * Pick an image from the user's photo library
 */
export async function pickProfileImage(): Promise<ImagePicker.ImagePickerResult | null> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1], // Square aspect ratio
      quality: 0.5, // Compress to 50% quality to keep file size down
    });

    if (!result.canceled) {
      return result;
    }
    return null;
  } catch (error) {
    console.error('Error picking image:', error);
    return null;
  }
}

/**
 * Upload profile picture to Supabase Storage
 */
export async function uploadProfilePicture(
  userId: string,
  imageUri: string
): Promise<UploadResult> {
  try {
    // Fetch the image as a blob
    const response = await fetch(imageUri);
    const blob = await response.blob();
    
    // Convert blob to array buffer
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });

    // Get file extension
    const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${userId}/avatar.${fileExt}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('profile-pictures')
      .upload(fileName, arrayBuffer, {
        contentType: `image/${fileExt}`,
        upsert: true, // Replace existing file
      });

    if (error) {
      console.error('Upload error:', error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('profile-pictures')
      .getPublicUrl(fileName);

    // Update user metadata with custom avatar URL
    const { error: updateError } = await supabase.auth.updateUser({
      data: { custom_avatar_url: urlData.publicUrl }
    });

    if (updateError) {
      console.error('Metadata update error:', updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true, url: urlData.publicUrl };
  } catch (error) {
    console.error('Upload error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Remove custom profile picture and revert to default (Google pic or initial)
 */
export async function removeCustomProfilePicture(userId: string): Promise<UploadResult> {
  try {
    // Delete from storage
    const { error: deleteError } = await supabase.storage
      .from('profile-pictures')
      .remove([`${userId}/avatar.jpg`, `${userId}/avatar.jpeg`, `${userId}/avatar.png`]);

    // Note: deleteError might occur if file doesn't exist, which is fine

    // Remove custom_avatar_url from user metadata
    const { error: updateError } = await supabase.auth.updateUser({
      data: { custom_avatar_url: null }
    });

    if (updateError) {
      console.error('Metadata update error:', updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Remove error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Get the avatar URL to display, with priority:
 * 1. Custom uploaded picture
 * 2. Google/OAuth profile picture
 * 3. null (will show initial letter)
 */
export function getAvatarUrl(userMetadata: any): string | null {
  return userMetadata?.custom_avatar_url || userMetadata?.avatar_url || null;
}

/**
 * Upload realtor profile picture to Supabase Storage
 * Path pattern: realtors/{timestamp}-{random}.{ext}
 */
export async function uploadRealtorProfilePicture(
  realtorId: string,
  imageUri: string
): Promise<UploadResult> {
  try {
    // Fetch the image as a blob
    const response = await fetch(imageUri);
    const blob = await response.blob();
    
    // Convert blob to array buffer
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });

    // Get file extension
    const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 10);
    const fileName = `realtors/${timestamp}-${randomStr}.${fileExt}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('profile-pictures')
      .upload(fileName, arrayBuffer, {
        contentType: `image/${fileExt}`,
        upsert: false,
      });

    if (error) {
      console.error('Realtor upload error:', error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('profile-pictures')
      .getPublicUrl(fileName);

    // Update realtor record with profile_picture_url
    const { error: updateError } = await supabase
      .from('realtors')
      .update({ profile_picture_url: urlData.publicUrl })
      .eq('id', realtorId);

    if (updateError) {
      console.error('Realtor update error:', updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true, url: urlData.publicUrl };
  } catch (error) {
    console.error('Realtor upload error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Remove realtor profile picture
 */
export async function removeRealtorProfilePicture(
  realtorId: string,
  currentUrl: string | null
): Promise<UploadResult> {
  try {
    // Extract file path from URL if exists
    if (currentUrl) {
      const urlParts = currentUrl.split('/profile-pictures/');
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        await supabase.storage
          .from('profile-pictures')
          .remove([filePath]);
      }
    }

    // Update realtor record to remove profile_picture_url
    const { error: updateError } = await supabase
      .from('realtors')
      .update({ profile_picture_url: null })
      .eq('id', realtorId);

    if (updateError) {
      console.error('Realtor update error:', updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Remove realtor picture error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

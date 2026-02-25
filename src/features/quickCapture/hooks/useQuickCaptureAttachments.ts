// src/features/quickCapture/hooks/useQuickCaptureAttachments.ts
// Hook for camera/library image picking, compression, and upload

import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Alert } from 'react-native';
import {
  uploadQuickCaptureAttachment,
  deleteQuickCaptureAttachment,
} from '../services/quickCaptureService';
import type { QuickCaptureAttachment, LocalAttachment } from '../types';

const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.65;

interface UseQuickCaptureAttachmentsResult {
  localAttachments: LocalAttachment[];
  uploading: boolean;
  pickFromCamera: () => Promise<void>;
  pickFromLibrary: () => Promise<void>;
  addLocalUri: (uri: string) => Promise<void>;
  uploadAll: (quickCaptureId: string) => Promise<QuickCaptureAttachment[]>;
  removeLocal: (index: number) => void;
  removeUploaded: (attachment: QuickCaptureAttachment) => Promise<void>;
  setInitialAttachments: (attachments: QuickCaptureAttachment[]) => void;
  uploadedAttachments: QuickCaptureAttachment[];
}

async function compressImage(uri: string): Promise<{
  uri: string;
  width: number;
  height: number;
}> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_WIDTH } }],
    {
      compress: JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );
  return { uri: result.uri, width: result.width, height: result.height };
}

async function requestCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Camera Permission',
      'Camera access is needed to take notebook photos.'
    );
    return false;
  }
  return true;
}

async function requestLibraryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Photo Library Permission',
      'Photo library access is needed to select notebook photos.'
    );
    return false;
  }
  return true;
}

export function useQuickCaptureAttachments(): UseQuickCaptureAttachmentsResult {
  const [localAttachments, setLocalAttachments] = useState<LocalAttachment[]>([]);
  const [uploadedAttachments, setUploadedAttachments] = useState<QuickCaptureAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const addLocalImage = useCallback(async (pickerResult: ImagePicker.ImagePickerResult) => {
    if (pickerResult.canceled || !pickerResult.assets?.length) return;

    for (const asset of pickerResult.assets) {
      try {
        const compressed = await compressImage(asset.uri);
        setLocalAttachments((prev) => [
          ...prev,
          {
            localUri: compressed.uri,
            width: compressed.width,
            height: compressed.height,
          },
        ]);
      } catch (err) {
        console.error('[attachments] compress error:', err);
        Alert.alert('Error', 'Failed to process image. Please try again.');
      }
    }
  }, []);

  const addLocalUri = useCallback(async (uri: string) => {
    try {
      const compressed = await compressImage(uri);
      setLocalAttachments((prev) => [
        ...prev,
        {
          localUri: compressed.uri,
          width: compressed.width,
          height: compressed.height,
        },
      ]);
    } catch (err) {
      console.error('[attachments] compress error:', err);
    }
  }, []);

  const pickFromCamera = useCallback(async () => {
    const granted = await requestCameraPermission();
    if (!granted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1, // We compress ourselves
      allowsEditing: false,
    });

    await addLocalImage(result);
  }, [addLocalImage]);

  const pickFromLibrary = useCallback(async () => {
    const granted = await requestLibraryPermission();
    if (!granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });

    await addLocalImage(result);
  }, [addLocalImage]);

  const uploadAll = useCallback(
    async (quickCaptureId: string): Promise<QuickCaptureAttachment[]> => {
      if (localAttachments.length === 0) return [];

      setUploading(true);
      const results: QuickCaptureAttachment[] = [];

      for (let i = 0; i < localAttachments.length; i++) {
        const local = localAttachments[i];
        // Skip already-uploaded attachments (have an attachment object)
        if (local.attachment) {
          results.push(local.attachment);
          continue;
        }

        setLocalAttachments((prev) =>
          prev.map((a, idx) => (idx === i ? { ...a, uploading: true } : a))
        );

        const { data, error } = await uploadQuickCaptureAttachment({
          quickCaptureId,
          compressedUri: local.localUri,
          mimeType: 'image/jpeg',
          width: local.width,
          height: local.height,
          sortOrder: uploadedAttachments.length + i,
        });

        if (error || !data) {
          setLocalAttachments((prev) =>
            prev.map((a, idx) =>
              idx === i ? { ...a, uploading: false, error: error?.message || 'Upload failed' } : a
            )
          );
          Alert.alert('Upload Error', `Failed to upload image ${i + 1}: ${error?.message}`);
        } else {
          results.push(data);
          setLocalAttachments((prev) =>
            prev.map((a, idx) =>
              idx === i ? { ...a, uploading: false, attachment: data } : a
            )
          );
        }
      }

      setUploadedAttachments((prev) => [...prev, ...results]);
      // Clear successfully uploaded from local list
      setLocalAttachments((prev) => prev.filter((a) => !a.attachment));
      setUploading(false);

      return results;
    },
    [localAttachments, uploadedAttachments.length]
  );

  const removeLocal = useCallback((index: number) => {
    setLocalAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removeUploaded = useCallback(async (attachment: QuickCaptureAttachment) => {
    const { error } = await deleteQuickCaptureAttachment(attachment.id, attachment.file_path);
    if (error) {
      Alert.alert('Error', 'Failed to delete attachment.');
      return;
    }
    setUploadedAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
  }, []);

  const setInitialAttachments = useCallback((attachments: QuickCaptureAttachment[]) => {
    setUploadedAttachments(attachments);
    setLocalAttachments([]);
  }, []);

  return {
    localAttachments,
    uploading,
    pickFromCamera,
    pickFromLibrary,
    addLocalUri,
    uploadAll,
    removeLocal,
    removeUploaded,
    setInitialAttachments,
    uploadedAttachments,
  };
}

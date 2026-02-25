// src/features/quickCapture/components/QuickCaptureAttachmentStrip.tsx
// Horizontal thumbnail strip for attachments with add/delete controls

import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { QuickCaptureAttachment, LocalAttachment } from '../types';

const THUMB_SIZE = 88;
const SCREEN_WIDTH = Dimensions.get('window').width;

interface QuickCaptureAttachmentStripProps {
  uploadedAttachments: QuickCaptureAttachment[];
  localAttachments: LocalAttachment[];
  onAddPress: () => void;
  onRemoveLocal?: (index: number) => void;
  onRemoveUploaded?: (attachment: QuickCaptureAttachment) => void;
  editable?: boolean;
}

export default function QuickCaptureAttachmentStrip({
  uploadedAttachments,
  localAttachments,
  onAddPress,
  onRemoveLocal,
  onRemoveUploaded,
  editable = true,
}: QuickCaptureAttachmentStripProps) {
  const [fullScreenUri, setFullScreenUri] = useState<string | null>(null);

  const handleDeleteUploaded = (attachment: QuickCaptureAttachment) => {
    Alert.alert('Delete Photo', 'Remove this attachment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onRemoveUploaded?.(attachment),
      },
    ]);
  };

  const handleDeleteLocal = (index: number) => {
    onRemoveLocal?.(index);
  };

  const totalCount = uploadedAttachments.length + localAttachments.length;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>
          Attachments{totalCount > 0 ? ` (${totalCount})` : ''}
        </Text>
        {editable && (
          <TouchableOpacity style={styles.addBtn} onPress={onAddPress}>
            <Ionicons name="camera-outline" size={18} color="#7C3AED" />
            <Text style={styles.addBtnText}>Add Photo</Text>
          </TouchableOpacity>
        )}
      </View>

      {totalCount === 0 && !editable ? (
        <Text style={styles.emptyText}>No attachments</Text>
      ) : totalCount === 0 && editable ? (
        <TouchableOpacity style={styles.emptyCard} onPress={onAddPress}>
          <Ionicons name="image-outline" size={28} color="#9CA3AF" />
          <Text style={styles.emptyCardText}>Tap to add notebook photos</Text>
        </TouchableOpacity>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
        >
          {/* Uploaded attachments */}
          {uploadedAttachments.map((att) => (
            <View key={att.id} style={styles.thumbWrap}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setFullScreenUri(att.file_url)}
              >
                <Image source={{ uri: att.file_url }} style={styles.thumb} />
              </TouchableOpacity>
              {editable && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteUploaded(att)}
                >
                  <Ionicons name="close-circle" size={22} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {/* Local (pending upload) attachments */}
          {localAttachments.map((local, idx) => (
            <View key={`local-${idx}`} style={styles.thumbWrap}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setFullScreenUri(local.localUri)}
              >
                <Image source={{ uri: local.localUri }} style={styles.thumb} />
                {local.uploading && (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  </View>
                )}
                {local.error && (
                  <View style={styles.errorOverlay}>
                    <Ionicons name="alert-circle" size={20} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
              {editable && !local.uploading && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteLocal(idx)}
                >
                  <Ionicons name="close-circle" size={22} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Full-screen image viewer */}
      <Modal visible={!!fullScreenUri} transparent animationType="fade">
        <View style={styles.fullScreenOverlay}>
          <TouchableOpacity
            style={styles.fullScreenClose}
            onPress={() => setFullScreenUri(null)}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          {fullScreenUri && (
            <Image
              source={{ uri: fullScreenUri }}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F5F3FF',
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#7C3AED',
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
    paddingVertical: 8,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 6,
  },
  emptyCardText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  strip: {
    gap: 8,
    paddingVertical: 4,
  },
  thumbWrap: {
    position: 'relative',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  deleteBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(239,68,68,0.5)',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  fullScreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.3,
  },
});

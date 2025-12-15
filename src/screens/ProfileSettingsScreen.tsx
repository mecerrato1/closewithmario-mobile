import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
  Alert,
  Image,
  ScrollView,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { useThemeColors } from '../styles/theme';
import {
  requestMediaLibraryPermission,
  pickProfileImage,
  uploadProfilePicture,
  removeCustomProfilePicture,
  getAvatarUrl,
} from '../utils/profilePicture';

type ProfileSettingsScreenProps = {
  session: Session | null;
  onBack: () => void;
  onSignOut: () => void;
};

export default function ProfileSettingsScreen({ session, onBack, onSignOut }: ProfileSettingsScreenProps) {
  const { colors } = useThemeColors();
  const [uploadingPicture, setUploadingPicture] = useState(false);

  const avatarUrl = getAvatarUrl(session?.user?.user_metadata);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });

    return () => subscription.remove();
  }, [onBack]);

  const handleUploadProfilePicture = async () => {
    try {
      const hasPermission = await requestMediaLibraryPermission();
      if (!hasPermission) {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to upload a profile picture.',
          [{ text: 'OK' }]
        );
        return;
      }

      const result = await pickProfileImage();
      if (!result || result.canceled) return;

      setUploadingPicture(true);
      const uploadResult = await uploadProfilePicture(
        session?.user?.id || '',
        result.assets[0].uri
      );
      setUploadingPicture(false);

      if (uploadResult.success) {
        Alert.alert('Success', 'Profile picture updated!', [{ text: 'OK' }]);
      } else {
        Alert.alert('Error', uploadResult.error || 'Failed to upload picture', [{ text: 'OK' }]);
      }
    } catch {
      setUploadingPicture(false);
      Alert.alert('Error', 'An unexpected error occurred', [{ text: 'OK' }]);
    }
  };

  const handleRemoveProfilePicture = async () => {
    try {
      Alert.alert(
        'Remove Profile Picture',
        'Are you sure you want to remove your custom profile picture?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              setUploadingPicture(true);
              const result = await removeCustomProfilePicture(session?.user?.id || '');
              setUploadingPicture(false);

              if (result.success) {
                Alert.alert('Success', 'Profile picture removed', [{ text: 'OK' }]);
              } else {
                Alert.alert('Error', result.error || 'Failed to remove picture', [{ text: 'OK' }]);
              }
            },
          },
        ]
      );
    } catch {
      setUploadingPicture(false);
      Alert.alert('Error', 'An unexpected error occurred', [{ text: 'OK' }]);
    }
  };

  return (
    <SafeAreaView style={[localStyles.container, { backgroundColor: colors.background }]}>
      <View style={[localStyles.header, { borderBottomColor: colors.border }]}
      >
        <TouchableOpacity onPress={onBack} style={localStyles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          <Text style={[localStyles.backButtonText, { color: colors.textPrimary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[localStyles.headerTitle, { color: colors.textPrimary }]}>Profile Settings</Text>
        <View style={localStyles.headerRightSpacer} />
      </View>

      <ScrollView contentContainerStyle={localStyles.content}>
        <View style={[localStyles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[localStyles.sectionTitle, { color: colors.textPrimary }]}>Profile Picture</Text>

          <View style={localStyles.avatarRow}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={localStyles.avatar} />
            ) : (
              <View style={[localStyles.avatarPlaceholder, { backgroundColor: colors.border }]}>
                <Text style={[localStyles.avatarPlaceholderText, { color: colors.textPrimary }]}>
                  {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                </Text>
              </View>
            )}

            <View style={localStyles.avatarActions}>
              <TouchableOpacity
                style={[localStyles.primaryButton, { backgroundColor: '#7C3AED' }]}
                onPress={handleUploadProfilePicture}
                disabled={uploadingPicture}
              >
                {uploadingPicture ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={localStyles.primaryButtonText}>Change Picture</Text>
                )}
              </TouchableOpacity>

              {session?.user?.user_metadata?.custom_avatar_url ? (
                <TouchableOpacity
                  style={[localStyles.secondaryButton, { borderColor: colors.border }]}
                  onPress={handleRemoveProfilePicture}
                  disabled={uploadingPicture}
                >
                  <Text style={[localStyles.secondaryButtonText, { color: colors.textPrimary }]}>Remove Custom Picture</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        <View style={[localStyles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <TouchableOpacity style={localStyles.menuRow} onPress={onSignOut}>
            <View style={localStyles.menuRowLeft}>
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              <Text style={[localStyles.menuRowText, { color: '#EF4444' }]}>Sign Out</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[localStyles.doneButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
          onPress={onBack}
        >
          <Text style={[localStyles.doneButtonText, { color: colors.textPrimary }]}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    minWidth: 70,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 2,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  headerRightSpacer: {
    minWidth: 70,
    height: 40,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  avatarRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 20,
    fontWeight: '800',
  },
  avatarActions: {
    flex: 1,
    gap: 10,
  },
  primaryButton: {
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryButton: {
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  menuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuRowText: {
    fontSize: 15,
    fontWeight: '700',
  },
  doneButton: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: '800',
  },
});

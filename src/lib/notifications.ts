import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

const DEFAULT_ANDROID_CHANNEL_ID = 'default';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Register for push notifications and store the token in Supabase
 * Call this once when the app starts and user is authenticated
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  // Note: Constants.isDevice can be unreliable in dev client builds
  // We'll try to register anyway and let it fail gracefully if on simulator
  console.log('📱 [Notifications] Starting registration for user:', userId);

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(DEFAULT_ANDROID_CHANNEL_ID, {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#7C3AED',
      });
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not already granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('📱 [Notifications] Permission not granted');
      return null;
    }

    // Get the Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const pushToken = tokenData.data;
    console.log('📱 [Notifications] Push token:', pushToken);

    // Store token in Supabase (upsert to handle existing tokens)
    const { error } = await supabase
      .from('expo_push_tokens')
      .upsert(
        {
          user_id: userId,
          push_token: pushToken,
          device_type: Platform.OS,
          is_active: true,
        },
        {
          onConflict: 'user_id,push_token',
        }
      );

    if (error) {
      console.error('📱 [Notifications] Error storing push token:', error);
    } else {
      console.log('📱 [Notifications] Push token stored successfully');
    }

    return pushToken;
  } catch (error) {
    console.error('📱 [Notifications] Error registering for push notifications:', error);
    return null;
  }
}

/**
 * Remove push token when user logs out
 */
export async function unregisterPushNotifications(userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('expo_push_tokens')
      .update({ is_active: false })
      .eq('user_id', userId);

    if (error) {
      console.error('📱 [Notifications] Error deactivating push token:', error);
    } else {
      console.log('📱 [Notifications] Push token deactivated');
    }
  } catch (error) {
    console.error('📱 [Notifications] Error unregistering push notifications:', error);
  }
}

/**
 * Add a listener for when a notification is received while app is foregrounded
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Add a listener for when user taps on a notification
 */
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

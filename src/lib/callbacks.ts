// src/lib/callbacks.ts
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { openOutlookEvent } from '../utils/outlookCalendar';

type ScheduleCallbackOptions = {
  leadId: string;
  leadName: string;
  scheduledFor: Date;
  createdByUserId?: string;
  note?: string;
  leadSource?: 'lead' | 'meta'; // Add source to distinguish between leads and meta_ads
  leadDetailsForOutlook?: Record<string, any>;
  taskHistoryForOutlook?: string;
  leadPhoneForOutlook?: string;
};

export async function scheduleLeadCallback({
  leadId,
  leadName,
  scheduledFor,
  createdByUserId,
  note,
  leadSource = 'lead', // Default to 'lead' for backwards compatibility
  leadDetailsForOutlook,
  taskHistoryForOutlook,
  leadPhoneForOutlook,
}: ScheduleCallbackOptions) {
  const title = `Call ${leadName || 'lead'}`;

  // 1) Save to Supabase - use appropriate column based on source
  const insertData: any = {
    scheduled_for: scheduledFor.toISOString(),
    title,
    notes: note ?? null,
    created_by: createdByUserId ?? null,
  };

  // Set the appropriate foreign key column
  if (leadSource === 'meta') {
    insertData.meta_ad_id = leadId;
  } else {
    insertData.lead_id = leadId;
  }

  const { data, error } = await supabase
    .from('lead_callbacks')
    .insert([insertData])
    .select()
    .single();

  if (error) {
    console.error('Error inserting lead_callback:', error);
    throw new Error(error.message);
  }

  // 2) Ask for notification permission
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Notification permission not granted');
  }

  // 3) Schedule local notification
  // Ensure we don't schedule a notification in the past (iOS will assert on invalid triggers)
  const now = new Date();
  const triggerDate = scheduledFor.getTime() <= now.getTime()
    ? new Date(now.getTime() + 1000 * 10) // 10 seconds in the future as a minimal fallback
    : scheduledFor;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: note || 'Follow up with this lead.',
      data: { 
        lead_id: leadId,
        lead_source: leadSource,
      },
    },
    // Use a DATE trigger with a safe future date to avoid iOS assertion failures
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });

  // 4) Open Outlook calendar event with email fallback
  try {
    await openOutlookEvent({
      start: scheduledFor,
      durationMinutes: 30,
      title,
      location: leadPhoneForOutlook || 'Phone Call',
      notes: note || '',
      leadDetails: {
        'Lead ID': leadId,
        Name: leadName,
        Source: leadSource,
        ...(leadDetailsForOutlook || {}),
        ...(taskHistoryForOutlook
          ? { 'Task History': taskHistoryForOutlook }
          : {}),
      },
    });
  } catch (err) {
    console.error('Failed to open Outlook event for lead callback (non-fatal):', err);
  }

  return data;
}

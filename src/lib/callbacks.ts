// src/lib/callbacks.ts
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

type ScheduleCallbackOptions = {
  leadId: string;
  leadName: string;
  scheduledFor: Date;
  createdByUserId?: string;
  note?: string;
  leadSource?: 'lead' | 'meta'; // Add source to distinguish between leads and meta_ads
};

export async function scheduleLeadCallback({
  leadId,
  leadName,
  scheduledFor,
  createdByUserId,
  note,
  leadSource = 'lead', // Default to 'lead' for backwards compatibility
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
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: note || 'Follow up with this lead.',
      data: { 
        lead_id: leadId,
        lead_source: leadSource,
      },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: scheduledFor }, // DateTriggerInput format
  });

  return data;
}

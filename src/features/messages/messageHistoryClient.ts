import { supabase } from '../../lib/supabase';
import type { SmsRawPayload, SmsVoiceSummary } from '../../lib/smsMedia';
import {
  MESSAGE_HISTORY_PAGE_SIZE,
  parseDescendingHistoryPage,
  type HistoryCursor,
  type HistoryPage,
} from './messagePagination';

export interface SmsHistoryMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  from_number: string;
  to_number: string;
  message_text: string | null;
  created_at: string;
  sent_at?: string;
  received_at?: string;
  status?: string;
  raw_payload?: SmsRawPayload | string | null;
  voice_transcription_status?: string | null;
  voice_transcript?: string | null;
  voice_summary?: SmsVoiceSummary | string | null;
  voice_transcribed_at?: string | null;
  voice_transcription_error?: string | null;
}

export type MetaDmPlatform = 'messenger' | 'instagram';

export interface MetaDmConversation {
  id: string;
  platform: MetaDmPlatform;
  participant_name: string | null;
  can_reply: boolean;
  conversation_link: string | null;
  last_message_at: string | null;
  message_count: number | null;
  matched_via: string | null;
}

export interface MetaDmHistoryMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  message_text: string | null;
  created_at: string;
  sender_name: string | null;
  attachments?: unknown;
  status?: string | null;
  received_at?: string | null;
  read_at?: string | null;
}

const SMS_HISTORY_SELECT =
  'id, direction, from_number, to_number, message_text, created_at, sent_at, received_at, status, raw_payload, voice_transcription_status, voice_transcript, voice_summary, voice_transcribed_at, voice_transcription_error';
const META_DM_CONVERSATION_SELECT =
  'id, platform, participant_name, can_reply, conversation_link, last_message_at, message_count, matched_via';
const META_DM_HISTORY_SELECT =
  'id, direction, message_text, created_at, sender_name, attachments, status, received_at, read_at';

function applyOlderCursor<T>(query: T, cursor: HistoryCursor | null): T {
  if (!cursor) return query;

  const filter =
    `created_at.lt.${cursor.createdAt},` +
    `and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
  return (query as T & { or: (value: string) => T }).or(filter);
}

export async function fetchSmsHistoryPage({
  leadId,
  cursor = null,
  signal,
}: {
  leadId: string;
  cursor?: HistoryCursor | null;
  signal?: AbortSignal;
}): Promise<HistoryPage<SmsHistoryMessage>> {
  let query = supabase
    .from('sms_messages')
    .select(SMS_HISTORY_SELECT)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MESSAGE_HISTORY_PAGE_SIZE + 1);

  query = applyOlderCursor(query, cursor);
  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return parseDescendingHistoryPage((data || []) as SmsHistoryMessage[]);
}

export async function fetchMetaDmConversation({
  leadId,
  leadSource,
  conversationId,
  signal,
}: {
  leadId: string;
  leadSource: 'organic' | 'meta';
  conversationId?: string | null;
  signal?: AbortSignal;
}) {
  let query = supabase
    .from('meta_dm_conversations')
    .select(META_DM_CONVERSATION_SELECT);

  if (conversationId) {
    query = query
      .eq('id', conversationId)
      .eq('lead_id', leadId)
      .eq('lead_source', leadSource)
      .limit(1);
  } else {
    query = query
      .eq('lead_id', leadId)
      .eq('lead_source', leadSource)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1);
  }
  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MetaDmConversation | null) || null;
}

export async function fetchMetaDmHistoryPage({
  conversationId,
  cursor = null,
  signal,
}: {
  conversationId: string;
  cursor?: HistoryCursor | null;
  signal?: AbortSignal;
}): Promise<HistoryPage<MetaDmHistoryMessage>> {
  let query = supabase
    .from('meta_dm_messages')
    .select(META_DM_HISTORY_SELECT)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MESSAGE_HISTORY_PAGE_SIZE + 1);

  query = applyOlderCursor(query, cursor);
  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return parseDescendingHistoryPage((data || []) as MetaDmHistoryMessage[]);
}

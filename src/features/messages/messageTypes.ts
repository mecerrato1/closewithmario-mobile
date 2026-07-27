import type { SmsRawPayload, SmsVoiceSummary } from '../../lib/smsMedia';

export type ThreadSource = 'lead' | 'meta';
export type ApiLeadSource = 'organic' | 'meta';

export interface MessageLeadSummary {
  id: string;
  source: ApiLeadSource;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  platform?: string | null;
  sms_opt_in?: boolean | null;
  sms_opted_out?: boolean | null;
  unread_sms_count?: number | null;
}

export interface PendingScenarioUpdateChange {
  key?: string;
  label?: string;
  kind?: 'currency' | 'percent' | 'number' | 'text';
  before?: number | string | null;
  after?: number | string | null;
  beforeLabel?: string;
  afterLabel?: string;
}

export interface PendingScenarioUpdate {
  id: string;
  leadId: string;
  leadSource: ApiLeadSource;
  scenarioId: string | null;
  scenarioName?: string | null;
  recipientType: 'borrower' | 'co_borrower' | 'realtor' | 'key_contact';
  recipientName: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  changedSummary: PendingScenarioUpdateChange[];
  status: 'pending' | 'applied' | 'dismissed';
  submittedAt: string;
}

export interface ConversationSummary {
  key: string;
  channel: 'sms' | 'dm' | 'scenario_update';
  conversationId: string | null;
  leadId: string;
  source: ThreadSource;
  leadName: string;
  leadEmail?: string | null;
  platform?: string | null;
  phone: string;
  preview: string;
  latestMessageAt: string;
  latestDirection: 'inbound' | 'outbound' | null;
  unreadCount: number;
  isAutomated?: boolean;
  smsOptIn?: boolean | null;
  smsOptedOut?: boolean | null;
  scenarioUpdates?: PendingScenarioUpdate[];
}

export interface SmsConversationSummaryRow {
  id: string;
  lead_id: string | null;
  direction: 'inbound' | 'outbound';
  from_number: string;
  to_number: string;
  message_text: string | null;
  created_at: string;
  is_automated?: boolean | null;
  raw_payload?: SmsRawPayload | string | null;
  voice_transcript?: string | null;
  voice_summary?: SmsVoiceSummary | string | null;
}

export interface MetaDmConversationSummaryRow {
  id: string;
  lead_id: string | null;
  lead_source: ApiLeadSource | null;
  platform: 'messenger' | 'instagram' | null;
  participant_name: string | null;
  last_message_at: string | null;
}

export interface MetaDmUnreadCountRow {
  lead_id: string;
  lead_source: ApiLeadSource;
  unread_count: number | string;
}

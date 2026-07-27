import AsyncStorage from '@react-native-async-storage/async-storage';
import { authenticatedFetch } from '../../lib/authenticatedFetch';
import { getUserRole, type UserRole } from '../../lib/roles';
import {
  getSmsMessageMedia,
  getSmsMessagePreviewText,
  parseSmsVoiceSummary,
} from '../../lib/smsMedia';
import { supabase } from '../../lib/supabase';
import { chunkValues, CRM_SUMMARY_ID_CHUNK_SIZE } from './messagePagination';
import type {
  ApiLeadSource,
  ConversationSummary,
  MessageLeadSummary,
  MetaDmConversationSummaryRow,
  MetaDmUnreadCountRow,
  PendingScenarioUpdate,
  SmsConversationSummaryRow,
  ThreadSource,
} from './messageTypes';

type MessageInboxScope = 'all' | 'loan_officer' | 'realtor';

type LeadListPayload = {
  items?: unknown;
  nextCursor?: unknown;
  hasMore?: unknown;
};

const CRM_API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.closewithmario.com'
).replace(/\/$/, '');
const LEAD_LIST_PAGE_SIZE = 1000;
const MAX_LEAD_LIST_PAGES = 2;
const DM_CONVERSATION_PAGE_SIZE = 200;
const MAX_DM_CONVERSATION_PAGES = 10;
const SCENARIO_UPDATE_READ_STORAGE_PREFIX = 'messages.scenarioUpdateReadIds.v1';

function createAbortError() {
  const error = new Error('Request cancelled');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw createAbortError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseLeadListItem(value: unknown): MessageLeadSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    (value.source !== 'organic' && value.source !== 'meta')
  ) {
    throw new Error('The message lead-list response was invalid.');
  }

  const nullableString = (input: unknown) =>
    typeof input === 'string' ? input : null;
  const nullableBoolean = (input: unknown) =>
    typeof input === 'boolean' ? input : null;
  const unreadCount = Number(value.unread_sms_count);

  return {
    id: value.id,
    source: value.source,
    first_name: nullableString(value.first_name),
    last_name: nullableString(value.last_name),
    email: nullableString(value.email),
    phone: nullableString(value.phone),
    platform: nullableString(value.platform),
    sms_opt_in: nullableBoolean(value.sms_opt_in),
    sms_opted_out: nullableBoolean(value.sms_opted_out),
    unread_sms_count:
      Number.isSafeInteger(unreadCount) && unreadCount >= 0 ? unreadCount : 0,
  };
}

function parseLeadListPayload(value: unknown) {
  if (!isRecord(value) || !Array.isArray((value as LeadListPayload).items)) {
    throw new Error('The message lead-list response was invalid.');
  }

  const cursorValue = (value as LeadListPayload).nextCursor;
  if (
    cursorValue !== null &&
    cursorValue !== undefined &&
    typeof cursorValue !== 'string'
  ) {
    throw new Error('The message lead-list cursor was invalid.');
  }

  return {
    items: ((value as LeadListPayload).items as unknown[]).map(
      parseLeadListItem
    ),
    nextCursor:
      typeof cursorValue === 'string' && cursorValue.length > 0
        ? cursorValue
        : null,
    hasMore: (value as LeadListPayload).hasMore === true,
  };
}

function getInboxScope(role: UserRole): MessageInboxScope | null {
  if (role === 'super_admin' || role === 'admin') return 'all';
  if (role === 'loan_officer') return 'loan_officer';
  if (role === 'realtor') return 'realtor';
  return null;
}

function getLeadDisplayName(lead: MessageLeadSummary) {
  return (
    [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim() ||
    lead.email ||
    lead.phone ||
    'Unknown lead'
  );
}

function toThreadSource(source: ApiLeadSource): ThreadSource {
  return source === 'meta' ? 'meta' : 'lead';
}

function buildLeadKey(source: ApiLeadSource, id: string) {
  return `${source}:${id}`;
}

function getSmsPreview(message: SmsConversationSummaryRow) {
  const voiceSummary = parseSmsVoiceSummary(message.voice_summary);
  return (
    message.message_text?.trim() ||
    voiceSummary?.one_sentence_summary?.trim() ||
    message.voice_transcript?.trim() ||
    getSmsMessagePreviewText(message) ||
    (getSmsMessageMedia(message).length > 0
      ? 'Media attachment'
      : message.direction === 'outbound'
      ? 'Sent a message'
      : 'New message')
  );
}

function sortConversations(conversations: ConversationSummary[]) {
  return [...conversations].sort((left, right) => {
    const unreadDifference =
      Number(right.unreadCount > 0) - Number(left.unreadCount > 0);
    if (unreadDifference !== 0) return unreadDifference;
    return (
      new Date(right.latestMessageAt).getTime() -
      new Date(left.latestMessageAt).getTime()
    );
  });
}

function getScenarioUpdatePreview(updates: PendingScenarioUpdate[]) {
  const count = updates.length;
  const latestScenario = updates[0]?.scenarioName;
  const suffix =
    count === 1 ? 'pending scenario update' : 'pending scenario updates';
  return latestScenario
    ? `${count} ${suffix} for ${latestScenario}`
    : `${count} ${suffix}`;
}

function getScenarioUpdateReadStorageKey(userId?: string | null) {
  return `${SCENARIO_UPDATE_READ_STORAGE_PREFIX}:${userId || 'anonymous'}`;
}

export async function loadReadScenarioUpdateIds(userId?: string | null) {
  try {
    const stored = await AsyncStorage.getItem(
      getScenarioUpdateReadStorageKey(userId)
    );
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : []
    );
  } catch (error) {
    console.warn('Failed to load read scenario update ids:', error);
    return new Set<string>();
  }
}

export async function saveReadScenarioUpdateIds(
  userId: string | undefined,
  ids: Set<string>
) {
  try {
    await AsyncStorage.setItem(
      getScenarioUpdateReadStorageKey(userId),
      JSON.stringify(Array.from(ids).slice(-1000))
    );
  } catch (error) {
    console.warn('Failed to save read scenario update ids:', error);
  }
}

async function fetchAuthorizedMessageLeads(
  scope: MessageInboxScope,
  signal?: AbortSignal
) {
  const leadsByKey = new Map<string, MessageLeadSummary>();
  let cursor: string | null = null;
  let pageCount = 0;

  while (pageCount < MAX_LEAD_LIST_PAGES) {
    throwIfAborted(signal);
    const params = new URLSearchParams({
      projection: 'summary',
      scope,
      limit: String(LEAD_LIST_PAGE_SIZE),
      search: '',
      status: 'all',
      ad: 'all',
      platform: 'all',
      importSource: 'all',
      sort: 'last_contact',
      direction: 'desc',
      includeFacets: '0',
    });
    if (cursor) params.set('cursor', cursor);

    const response = await authenticatedFetch(
      `${CRM_API_BASE_URL}/api/leads/list?${params.toString()}`,
      { signal }
    );
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        isRecord(payload) && typeof payload.error === 'string'
          ? payload.error
          : 'Failed to load authorized message contacts.'
      );
    }

    const page = parseLeadListPayload(payload);
    page.items.forEach((lead) => {
      leadsByKey.set(buildLeadKey(lead.source, lead.id), lead);
    });

    pageCount += 1;
    if (page.hasMore && !page.nextCursor) {
      throw new Error(
        'The message lead-list response omitted its next cursor.'
      );
    }
    if (!page.hasMore) break;
    cursor = page.nextCursor;
  }

  return Array.from(leadsByKey.values());
}

async function fetchSmsConversationSummaries(
  leadIds: string[],
  signal?: AbortSignal
) {
  const summaryByMessageId = new Map<string, SmsConversationSummaryRow>();
  for (const chunk of chunkValues(leadIds, CRM_SUMMARY_ID_CHUNK_SIZE)) {
    throwIfAborted(signal);
    let query = supabase.rpc('get_crm_sms_conversation_summaries', {
      p_lead_ids: chunk,
    });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    ((data || []) as SmsConversationSummaryRow[]).forEach((message) => {
      if (message?.id) summaryByMessageId.set(message.id, message);
    });
  }
  return Array.from(summaryByMessageId.values());
}

async function fetchDmConversationSummaries(signal?: AbortSignal) {
  const conversations = new Map<string, MetaDmConversationSummaryRow>();
  let cursor: { id: string; lastMessageAt: string } | null = null;

  for (let page = 0; page < MAX_DM_CONVERSATION_PAGES; page += 1) {
    throwIfAborted(signal);
    let query = supabase
      .from('meta_dm_conversations')
      .select(
        'id, lead_id, lead_source, platform, participant_name, last_message_at'
      )
      .not('lead_id', 'is', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(DM_CONVERSATION_PAGE_SIZE);
    if (cursor) {
      query = query.or(
        `last_message_at.lt.${cursor.lastMessageAt},and(last_message_at.eq.${cursor.lastMessageAt},id.lt.${cursor.id})`
      );
    }
    if (signal) query = query.abortSignal(signal);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data || []) as MetaDmConversationSummaryRow[];
    rows.forEach((conversation) => {
      if (conversation.id) conversations.set(conversation.id, conversation);
    });
    if (rows.length < DM_CONVERSATION_PAGE_SIZE) {
      return Array.from(conversations.values());
    }
    const oldest = rows[rows.length - 1];
    if (!oldest?.last_message_at) {
      return Array.from(conversations.values());
    }
    cursor = {
      id: oldest.id,
      lastMessageAt: oldest.last_message_at,
    };
  }

  return Array.from(conversations.values());
}

async function fetchDmUnreadCounts(signal?: AbortSignal) {
  let query = supabase.rpc('get_unread_meta_dm_counts');
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as MetaDmUnreadCountRow[];
}

async function fetchPendingScenarioUpdates(signal?: AbortSignal) {
  const response = await authenticatedFetch(
    `${CRM_API_BASE_URL}/api/leads/qualification-submissions?pending=1&limit=1000`,
    {
      headers: { Accept: 'application/json' },
      signal,
    }
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : 'Failed to load scenario updates.'
    );
  }
  if (!isRecord(payload) || !Array.isArray(payload.submissions)) {
    throw new Error('The scenario update response was invalid.');
  }
  return payload.submissions as PendingScenarioUpdate[];
}

export async function loadMessageInbox({
  userId,
  email,
  signal,
}: {
  userId: string;
  email: string;
  signal?: AbortSignal;
}) {
  const role = await getUserRole(userId, email);
  throwIfAborted(signal);
  const scope = getInboxScope(role);
  if (!scope) return [] as ConversationSummary[];

  const [leads, readScenarioUpdateIds] = await Promise.all([
    fetchAuthorizedMessageLeads(scope, signal),
    loadReadScenarioUpdateIds(userId),
  ]);
  throwIfAborted(signal);

  if (leads.length === 0) return [] as ConversationSummary[];

  const uniqueLeadIds = Array.from(new Set(leads.map((lead) => lead.id)));
  const [smsRows, dmRows, dmUnreadRows, pendingScenarioUpdates] =
    await Promise.all([
      fetchSmsConversationSummaries(uniqueLeadIds, signal),
      fetchDmConversationSummaries(signal),
      fetchDmUnreadCounts(signal),
      fetchPendingScenarioUpdates(signal),
    ]);
  throwIfAborted(signal);

  const leadsByKey = new Map(
    leads.map((lead) => [buildLeadKey(lead.source, lead.id), lead])
  );
  const leadsById = new Map<string, MessageLeadSummary>();
  leads.forEach((lead) => {
    const existing = leadsById.get(lead.id);
    if (!existing || lead.source === 'organic') leadsById.set(lead.id, lead);
  });

  const conversations = new Map<string, ConversationSummary>();
  smsRows.forEach((message) => {
    if (!message.lead_id) return;
    const lead = leadsById.get(message.lead_id);
    if (!lead) return;

    const key = `sms:${buildLeadKey(lead.source, lead.id)}`;
    const existing = conversations.get(key);
    if (
      existing &&
      new Date(existing.latestMessageAt).getTime() >=
        new Date(message.created_at).getTime()
    ) {
      return;
    }

    conversations.set(key, {
      key,
      channel: 'sms',
      conversationId: null,
      leadId: lead.id,
      source: toThreadSource(lead.source),
      leadName: getLeadDisplayName(lead),
      leadEmail: lead.email,
      platform: lead.platform,
      phone: lead.phone || '',
      preview: getSmsPreview(message),
      latestMessageAt: message.created_at,
      latestDirection: message.direction,
      unreadCount: Math.max(0, Number(lead.unread_sms_count) || 0),
      isAutomated: Boolean(message.is_automated),
      smsOptIn: lead.sms_opt_in,
      smsOptedOut: lead.sms_opted_out,
    });
  });

  const unreadDmByLeadKey = new Map<string, number>();
  dmUnreadRows.forEach((row) => {
    if (row.lead_source !== 'organic' && row.lead_source !== 'meta') {
      return;
    }
    unreadDmByLeadKey.set(
      buildLeadKey(row.lead_source, row.lead_id),
      Math.max(0, Number(row.unread_count) || 0)
    );
  });

  const dmUnreadAssigned = new Set<string>();
  dmRows.forEach((conversation) => {
    if (!conversation.lead_id || !conversation.lead_source) return;
    const leadKey = buildLeadKey(
      conversation.lead_source,
      conversation.lead_id
    );
    const lead = leadsByKey.get(leadKey);
    if (!lead) return;

    const key = `dm:${conversation.id}`;
    const unreadCount = dmUnreadAssigned.has(leadKey)
      ? 0
      : unreadDmByLeadKey.get(leadKey) || 0;
    dmUnreadAssigned.add(leadKey);
    conversations.set(key, {
      key,
      channel: 'dm',
      conversationId: conversation.id,
      leadId: lead.id,
      source: toThreadSource(lead.source),
      leadName: getLeadDisplayName(lead),
      leadEmail: lead.email,
      platform: conversation.platform || lead.platform,
      phone: lead.phone || '',
      preview: conversation.participant_name
        ? `Conversation with ${conversation.participant_name}`
        : 'Direct message conversation',
      latestMessageAt:
        conversation.last_message_at || new Date(0).toISOString(),
      latestDirection: null,
      unreadCount,
      isAutomated: false,
      smsOptIn: lead.sms_opt_in,
      smsOptedOut: lead.sms_opted_out,
    });
  });

  const scenariosByLeadKey = new Map<string, PendingScenarioUpdate[]>();
  pendingScenarioUpdates.forEach((submission) => {
    if (
      submission.status !== 'pending' ||
      (submission.leadSource !== 'organic' && submission.leadSource !== 'meta')
    ) {
      return;
    }
    const leadKey = buildLeadKey(submission.leadSource, submission.leadId);
    if (!leadsByKey.has(leadKey)) return;
    const updates = scenariosByLeadKey.get(leadKey) || [];
    updates.push(submission);
    scenariosByLeadKey.set(leadKey, updates);
  });

  scenariosByLeadKey.forEach((updates, leadKey) => {
    const sortedUpdates = [...updates].sort(
      (left, right) =>
        new Date(right.submittedAt).getTime() -
        new Date(left.submittedAt).getTime()
    );
    const latest = sortedUpdates[0];
    const lead = leadsByKey.get(leadKey);
    if (!latest || !lead) return;

    const key = `scenario_update:${leadKey}`;
    conversations.set(key, {
      key,
      channel: 'scenario_update',
      conversationId: null,
      leadId: lead.id,
      source: toThreadSource(lead.source),
      leadName: getLeadDisplayName(lead),
      leadEmail: lead.email,
      platform: lead.platform,
      phone: lead.phone || '',
      preview: getScenarioUpdatePreview(sortedUpdates),
      latestMessageAt: latest.submittedAt,
      latestDirection: 'inbound',
      unreadCount: sortedUpdates.filter(
        (update) => !readScenarioUpdateIds.has(update.id)
      ).length,
      isAutomated: false,
      smsOptIn: lead.sms_opt_in,
      smsOptedOut: lead.sms_opted_out,
      scenarioUpdates: sortedUpdates,
    });
  });

  return sortConversations(Array.from(conversations.values()));
}

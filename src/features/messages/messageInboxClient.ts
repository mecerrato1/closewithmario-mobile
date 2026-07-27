import AsyncStorage from '@react-native-async-storage/async-storage';
import { authenticatedFetch } from '../../lib/authenticatedFetch';
import type {
  ConversationSummary,
  PendingScenarioUpdate,
  ThreadSource,
} from './messageTypes';

const CRM_API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.closewithmario.com'
).replace(/\/$/, '');
export const MESSAGE_INBOX_PAGE_SIZE = 50;
const SCENARIO_UPDATE_READ_STORAGE_PREFIX = 'messages.scenarioUpdateReadIds.v1';

export type MessageInboxQuery = {
  userId: string;
  search: string;
  unreadOnly: boolean;
};

export type MessageInboxPage = {
  items: ConversationSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
};

type Requester = (input: string, init?: RequestInit) => Promise<Response>;

type ApiConversationSummary = {
  key: string;
  channel: 'sms' | 'dm';
  conversationId: string | null;
  leadId: string;
  leadSource: 'organic' | 'meta';
  leadName: string;
  leadEmail: string | null;
  leadPhone: string | null;
  platform: string | null;
  smsOptIn: boolean | null;
  smsOptedOut: boolean | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastMessageDirection: 'inbound' | 'outbound' | null;
  unreadCount: number;
  isAutomated: boolean;
};

type PendingLeadSummary = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  platform?: string | null;
  smsOptIn?: boolean | null;
  smsOptedOut?: boolean | null;
};

type PendingScenarioUpdateWithLead = PendingScenarioUpdate & {
  leadSummary?: PendingLeadSummary | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createAbortError() {
  const error = new Error('Request cancelled');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw createAbortError();
}

function readNullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function readNullableBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function readCount(value: unknown) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('The conversation summary count was invalid.');
  }
  return count;
}

function toThreadSource(source: 'organic' | 'meta'): ThreadSource {
  return source === 'meta' ? 'meta' : 'lead';
}

function parseApiConversation(value: unknown): ApiConversationSummary {
  if (
    !isRecord(value) ||
    typeof value.key !== 'string' ||
    (value.channel !== 'sms' && value.channel !== 'dm') ||
    typeof value.leadId !== 'string' ||
    (value.leadSource !== 'organic' && value.leadSource !== 'meta') ||
    typeof value.leadName !== 'string' ||
    typeof value.lastMessageAt !== 'string' ||
    !Number.isFinite(Date.parse(value.lastMessageAt)) ||
    typeof value.isAutomated !== 'boolean'
  ) {
    throw new Error('The conversation summary response was invalid.');
  }
  const conversationId = readNullableString(value.conversationId);
  if (
    (value.channel === 'dm' && !conversationId) ||
    (value.channel === 'sms' && conversationId)
  ) {
    throw new Error('The conversation summary response was invalid.');
  }
  const direction = value.lastMessageDirection;
  if (
    direction !== null &&
    direction !== 'inbound' &&
    direction !== 'outbound'
  ) {
    throw new Error('The conversation summary response was invalid.');
  }
  return {
    key: value.key,
    channel: value.channel,
    conversationId,
    leadId: value.leadId,
    leadSource: value.leadSource,
    leadName: value.leadName,
    leadEmail: readNullableString(value.leadEmail),
    leadPhone: readNullableString(value.leadPhone),
    platform: readNullableString(value.platform),
    smsOptIn: readNullableBoolean(value.smsOptIn),
    smsOptedOut: readNullableBoolean(value.smsOptedOut),
    lastMessageAt: value.lastMessageAt,
    lastMessagePreview: readNullableString(value.lastMessagePreview),
    lastMessageDirection: direction,
    unreadCount: readCount(value.unreadCount),
    isAutomated: value.isAutomated,
  };
}

function toConversationSummary(
  conversation: ApiConversationSummary
): ConversationSummary {
  return {
    key: conversation.key,
    channel: conversation.channel,
    conversationId: conversation.conversationId,
    leadId: conversation.leadId,
    source: toThreadSource(conversation.leadSource),
    leadName: conversation.leadName,
    leadEmail: conversation.leadEmail,
    platform: conversation.platform,
    phone: conversation.leadPhone || '',
    preview:
      conversation.lastMessagePreview ||
      (conversation.lastMessageDirection === 'outbound'
        ? 'Sent a message'
        : 'New message'),
    latestMessageAt: conversation.lastMessageAt,
    latestDirection: conversation.lastMessageDirection,
    unreadCount: conversation.unreadCount,
    isAutomated: conversation.isAutomated,
    smsOptIn: conversation.smsOptIn,
    smsOptedOut: conversation.smsOptedOut,
  };
}

export function sortConversationSummaries(
  conversations: ConversationSummary[]
) {
  return [...conversations].sort((left, right) => {
    const scenarioDifference =
      Number(right.channel === 'scenario_update') -
      Number(left.channel === 'scenario_update');
    if (scenarioDifference !== 0) return scenarioDifference;
    const unreadDifference =
      Number(right.unreadCount > 0) - Number(left.unreadCount > 0);
    if (unreadDifference !== 0) return unreadDifference;
    const timeDifference =
      new Date(right.latestMessageAt).getTime() -
      new Date(left.latestMessageAt).getTime();
    return timeDifference || left.key.localeCompare(right.key);
  });
}

export function parseMessageInboxPage(value: unknown): MessageInboxPage {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error('The conversation page response was invalid.');
  }
  if (
    value.nextCursor !== null &&
    value.nextCursor !== undefined &&
    typeof value.nextCursor !== 'string'
  ) {
    throw new Error('The conversation cursor response was invalid.');
  }
  if (typeof value.hasMore !== 'boolean') {
    throw new Error('The conversation page response was invalid.');
  }
  const nextCursor =
    typeof value.nextCursor === 'string' && value.nextCursor.length > 0
      ? value.nextCursor
      : null;
  if (value.hasMore !== Boolean(nextCursor)) {
    throw new Error('The conversation pagination response was invalid.');
  }
  const items = value.items
    .map(parseApiConversation)
    .map(toConversationSummary);
  if (new Set(items.map((item) => item.key)).size !== items.length) {
    throw new Error('The conversation page contained duplicate rows.');
  }
  const totalCount = readCount(value.totalCount);
  if (totalCount < items.length) {
    throw new Error('The conversation total was invalid.');
  }
  return {
    items,
    nextCursor,
    hasMore: value.hasMore,
    totalCount,
  };
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

async function fetchPendingScenarioUpdates({
  userId,
  search,
  unreadOnly,
  signal,
  request,
}: {
  userId: string;
  search: string;
  unreadOnly: boolean;
  signal?: AbortSignal;
  request: Requester;
}) {
  const [response, readIds] = await Promise.all([
    request(
      `${CRM_API_BASE_URL}/api/leads/qualification-submissions?pending=1&limit=1000`,
      {
        headers: { Accept: 'application/json' },
        signal,
      }
    ),
    loadReadScenarioUpdateIds(userId),
  ]);
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

  const updatesByLead = new Map<string, PendingScenarioUpdateWithLead[]>();
  payload.submissions.forEach((value) => {
    if (
      !isRecord(value) ||
      typeof value.id !== 'string' ||
      typeof value.leadId !== 'string' ||
      (value.leadSource !== 'organic' && value.leadSource !== 'meta') ||
      value.status !== 'pending' ||
      typeof value.submittedAt !== 'string'
    ) {
      return;
    }
    const update = value as unknown as PendingScenarioUpdateWithLead;
    const key = `${update.leadSource}:${update.leadId}`;
    const current = updatesByLead.get(key) || [];
    current.push(update);
    updatesByLead.set(key, current);
  });

  const normalizedSearch = search.trim().toLowerCase();
  const digitSearch = search.replace(/\D/g, '');
  const conversations: ConversationSummary[] = [];
  updatesByLead.forEach((updates, leadKey) => {
    const ordered = [...updates].sort(
      (left, right) =>
        new Date(right.submittedAt).getTime() -
        new Date(left.submittedAt).getTime()
    );
    const latest = ordered[0];
    if (!latest) return;
    const leadSummary = latest.leadSummary || {};
    const unreadCount = ordered.filter(
      (update) => !readIds.has(update.id)
    ).length;
    if (unreadOnly && unreadCount === 0) return;

    const preview = getScenarioUpdatePreview(ordered);
    const leadName = leadSummary.name?.trim() || 'Unknown lead';
    const phone = leadSummary.phone?.trim() || '';
    if (
      normalizedSearch &&
      !leadName.toLowerCase().includes(normalizedSearch) &&
      !preview.toLowerCase().includes(normalizedSearch) &&
      !phone.toLowerCase().includes(normalizedSearch) &&
      !(
        digitSearch.length > 0 && phone.replace(/\D/g, '').includes(digitSearch)
      )
    ) {
      return;
    }

    conversations.push({
      key: `scenario_update:${leadKey}`,
      channel: 'scenario_update',
      conversationId: null,
      leadId: latest.leadId,
      source: toThreadSource(latest.leadSource),
      leadName,
      leadEmail: leadSummary.email || null,
      platform: leadSummary.platform || null,
      phone,
      preview,
      latestMessageAt: latest.submittedAt,
      latestDirection: 'inbound',
      unreadCount,
      isAutomated: false,
      smsOptIn: leadSummary.smsOptIn ?? null,
      smsOptedOut: leadSummary.smsOptedOut ?? null,
      scenarioUpdates: ordered,
    });
  });
  return conversations;
}

export async function fetchMessageInboxPage(
  query: MessageInboxQuery,
  options: {
    cursor: string | null;
    includeScenarioUpdates: boolean;
    signal?: AbortSignal;
    request?: Requester;
  }
): Promise<MessageInboxPage> {
  throwIfAborted(options.signal);
  const request = options.request ?? authenticatedFetch;
  const params = new URLSearchParams({
    limit: String(MESSAGE_INBOX_PAGE_SIZE),
    unreadOnly: query.unreadOnly ? '1' : '0',
  });
  const search = query.search.trim();
  if (search.length >= 2) params.set('search', search);
  if (options.cursor) params.set('cursor', options.cursor);

  const pagePromise = request(
    `${CRM_API_BASE_URL}/api/messages/conversations?${params.toString()}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    }
  ).then(async (response) => {
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        isRecord(payload) && typeof payload.error === 'string'
          ? payload.error
          : 'Failed to load conversations.'
      );
    }
    return parseMessageInboxPage(payload);
  });
  const scenariosPromise = options.includeScenarioUpdates
    ? fetchPendingScenarioUpdates({
        userId: query.userId,
        search,
        unreadOnly: query.unreadOnly,
        signal: options.signal,
        request,
      })
    : Promise.resolve([] as ConversationSummary[]);

  const [page, scenarioUpdates] = await Promise.all([
    pagePromise,
    scenariosPromise,
  ]);
  throwIfAborted(options.signal);
  return {
    ...page,
    items: sortConversationSummaries([...page.items, ...scenarioUpdates]),
    totalCount: page.totalCount + scenarioUpdates.length,
  };
}

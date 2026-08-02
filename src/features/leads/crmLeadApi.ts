import type { Activity, Lead, MetaLead } from '../../lib/types/leads';
import type { LeadRealtorRole } from '../../lib/types/leadRealtorRoles';

export const CRM_API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.closewithmario.com'
).replace(/\/$/, '');

export type CrmLeadSource = 'organic' | 'meta';
export type CrmLeadScope = 'all' | 'loan_officer' | 'realtor' | 'assistant';
export type CrmLeadPlatform =
  | 'all'
  | 'organic'
  | 'meta'
  | 'facebook'
  | 'instagram';
export type CrmLeadSort =
  | 'tracked'
  | 'name'
  | 'status'
  | 'date'
  | 'ad'
  | 'loan_purpose'
  | 'last_contact';

export type CrmLeadSummary = Record<string, unknown> & {
  id: string;
  source: CrmLeadSource;
  db_source?: string | null;
  created_at: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  last_contact_date: string | null;
  unread_sms_count?: number | null;
  needs_attention?: boolean | null;
  attention_badge?: string | null;
  attention_reason?: string | null;
  attention_suggested_action?: string | null;
  has_active_borrower_scenario?: boolean | null;
  has_active_realtor_scenario?: boolean | null;
};

export type CrmLeadFacets = {
  total: number;
  tracked: number;
  organic: number;
  meta: number;
  facebook: number;
  instagram: number;
  loandock: number;
  active: number;
  archived: number;
  unreadSms: number;
  needsAttention: number;
  newThisWeek: number;
  ownerTotal: number;
  unassignedOwner: number;
  statuses: Record<string, number>;
  ads: Record<string, number>;
  sourceDetails: Record<string, number>;
  metaSourceKeys: Record<string, number>;
  organicSourceKeys: Record<string, number>;
  loanOfficers: Record<string, number>;
};

export type CrmLeadListPage = {
  items: CrmLeadSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
  searchTotal: number;
  facets: CrmLeadFacets | null;
};

export type CrmLeadListQuery = {
  scope: CrmLeadScope;
  limit?: number;
  search?: string;
  status?: string;
  ad?: string;
  platform?: CrmLeadPlatform;
  importSource?: 'all' | 'loandock';
  ownerLoId?: string | 'unassigned' | null;
  sourceKey?: string;
  sourceDetail?: string;
  excludeUnqualified?: boolean;
  needsAttention?: boolean;
  unreadOnly?: boolean;
  trackedOnly?: boolean;
  sort?: CrmLeadSort;
  direction?: 'asc' | 'desc';
};

export type LeadDetailContact = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  relationship?: string | null;
  role?: string | null;
  preferred_contact?: string | null;
  notes?: string | null;
  is_primary?: boolean | null;
};

export type LeadDetailBootstrap = {
  leadId: string;
  leadSource: CrmLeadSource;
  lead: Lead | MetaLead;
  activities: Activity[];
  activitiesNextCursor: string | null;
  contacts: LeadDetailContact[];
  realtorRoles: LeadRealtorRole[] | null;
};

export type LeadDetailActivityPage = {
  activities: Activity[];
  nextCursor: string | null;
};

export type LeadActivityBody = {
  activityId: string;
  body: string | null;
};

type Requester = (input: string, init?: RequestInit) => Promise<Response>;

const defaultRequester: Requester = async (input, init) => {
  const { authenticatedFetch } = await import('../../lib/authenticatedFetch');
  return authenticatedFetch(input, init);
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readCount(value: unknown) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

function readCounts(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key.length > 0)
      .map(([key, count]) => [key, readCount(count)])
  );
}

function readLoanOfficerCounts(value: unknown): Record<string, number> {
  if (!Array.isArray(value)) return readCounts(value);
  return Object.fromEntries(
    value.flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.id !== 'string') return [];
      return [[entry.id, readCount(entry.count)]];
    })
  );
}

function parseFacets(value: unknown): CrmLeadFacets | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value))
    throw new Error('The lead-list facets response was invalid.');

  return {
    total: readCount(value.total),
    tracked: readCount(value.tracked),
    organic: readCount(value.organic),
    meta: readCount(value.meta),
    facebook: readCount(value.facebook),
    instagram: readCount(value.instagram),
    loandock: readCount(value.loandock),
    active: readCount(value.active),
    archived: readCount(value.archived),
    unreadSms: readCount(value.unreadSms ?? value.unread_sms),
    needsAttention: readCount(value.needsAttention ?? value.needs_attention),
    newThisWeek: readCount(value.newThisWeek ?? value.new_this_week),
    ownerTotal: readCount(value.ownerTotal ?? value.owner_total),
    unassignedOwner: readCount(value.unassignedOwner ?? value.unassigned_owner),
    statuses: readCounts(value.statuses),
    ads: readCounts(value.ads),
    sourceDetails: readCounts(value.sourceDetails ?? value.source_details),
    metaSourceKeys: readCounts(value.metaSourceKeys ?? value.meta_source_keys),
    organicSourceKeys: readCounts(
      value.organicSourceKeys ?? value.organic_source_keys
    ),
    loanOfficers: readLoanOfficerCounts(
      value.loanOfficers ?? value.loan_officers
    ),
  };
}

function parseSummary(value: unknown): CrmLeadSummary {
  if (!isRecord(value))
    throw new Error('The lead-list item response was invalid.');
  if (typeof value.id !== 'string' || !UUID_PATTERN.test(value.id)) {
    throw new Error('The lead-list item ID was invalid.');
  }
  if (value.source !== 'organic' && value.source !== 'meta') {
    throw new Error('The lead-list item source was invalid.');
  }
  if (
    'metadata' in value ||
    'form_data' in value ||
    'calculator_state' in value
  ) {
    throw new Error('The lead-list summary contained detail-only data.');
  }
  return value as CrmLeadSummary;
}

export function parseCrmLeadListPage(value: unknown): CrmLeadListPage {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error('The lead-list response was invalid.');
  }
  if (
    value.nextCursor !== null &&
    value.nextCursor !== undefined &&
    typeof value.nextCursor !== 'string'
  ) {
    throw new Error('The lead-list cursor response was invalid.');
  }

  const facets = parseFacets(value.facets);
  const totalCount = readCount(
    value.totalCount ?? value.filteredTotal ?? value.filtered_total
  );
  return {
    items: value.items.map(parseSummary),
    nextCursor:
      typeof value.nextCursor === 'string' && value.nextCursor.length > 0
        ? value.nextCursor
        : null,
    hasMore: value.hasMore === true,
    totalCount,
    searchTotal: readCount(
      value.searchTotal ?? value.search_total ?? facets?.total ?? totalCount
    ),
    facets,
  };
}

function errorFromPayload(payload: unknown, fallback: string) {
  return isRecord(payload) && typeof payload.error === 'string'
    ? payload.error
    : fallback;
}

export async function fetchCrmLeadListPage(
  query: CrmLeadListQuery,
  options: {
    cursor?: string | null;
    includeFacets?: boolean;
    signal?: AbortSignal;
    request?: Requester;
  } = {}
) {
  const params = new URLSearchParams({
    projection: 'summary',
    scope: query.scope,
    limit: String(Math.min(100, Math.max(1, query.limit ?? 50))),
    status: query.status || 'all',
    platform: query.platform || 'all',
    importSource: query.importSource || 'all',
    sort: query.sort || 'last_contact',
    direction: query.direction || 'desc',
    includeFacets: options.includeFacets === false ? '0' : '1',
  });
  const search = query.search?.trim() || '';
  if (search.length >= 2) params.set('search', search);
  if (query.ad && query.ad !== 'all') params.set('ad', query.ad);
  if (query.ownerLoId) params.set('ownerLoId', query.ownerLoId);
  if (query.sourceKey && query.sourceKey !== 'all') {
    params.set('sourceKey', query.sourceKey);
  }
  if (query.sourceDetail && query.sourceDetail !== 'all') {
    params.set('sourceDetail', query.sourceDetail);
  }
  if (query.excludeUnqualified) params.set('excludeUnqualified', '1');
  if (query.needsAttention) params.set('needsAttention', '1');
  if (query.unreadOnly) params.set('unreadOnly', '1');
  if (query.trackedOnly) params.set('trackedOnly', '1');
  if (options.cursor) params.set('cursor', options.cursor);

  const request = options.request ?? defaultRequester;
  const response = await request(
    `${CRM_API_BASE_URL}/api/leads/list?${params.toString()}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(errorFromPayload(payload, 'Could not load leads.'));
  }
  return parseCrmLeadListPage(payload);
}

function parseLeadRecord(
  value: unknown,
  expected: { leadId: string; leadSource: CrmLeadSource }
): Lead | MetaLead {
  if (
    !isRecord(value) ||
    value.id !== expected.leadId ||
    value.source !== expected.leadSource
  ) {
    throw new Error('The lead record response was invalid.');
  }
  for (const key of [
    'created_at',
    'first_name',
    'last_name',
    'email',
    'phone',
    'status',
  ]) {
    const field = value[key];
    if (field !== null && typeof field !== 'string') {
      throw new Error('The lead record response was invalid.');
    }
  }
  return toMobileLead(value as CrmLeadSummary);
}

export async function fetchCrmLeadRecord(
  leadId: string,
  leadSource: CrmLeadSource,
  options: { signal?: AbortSignal; request?: Requester } = {}
) {
  const params = new URLSearchParams({ leadId, leadSource });
  const response = await (options.request ?? defaultRequester)(
    `${CRM_API_BASE_URL}/api/leads/record?${params.toString()}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(errorFromPayload(payload, 'Could not load the lead.'));
  if (
    !isRecord(payload) ||
    payload.leadId !== leadId ||
    payload.leadSource !== leadSource
  ) {
    throw new Error('The lead record response was invalid.');
  }
  return parseLeadRecord(payload.lead, { leadId, leadSource });
}

function parseActivity(value: unknown): Activity {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.activity_type !== 'string' ||
    typeof value.notes !== 'string' ||
    typeof value.created_at !== 'string' ||
    typeof value.has_audio !== 'boolean' ||
    (value.has_body !== undefined && typeof value.has_body !== 'boolean')
  ) {
    throw new Error('The lead detail response was invalid.');
  }
  const summary = { ...value };
  delete summary.body;
  delete summary.audio_url;
  return {
    ...(summary as unknown as Activity),
    activity_type: value.activity_type as Activity['activity_type'],
    has_audio: value.has_audio,
    has_body: value.has_body === true,
  };
}

function parseActivityCursor(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('The lead activity cursor response was invalid.');
  }
  return value;
}

export function parseLeadDetailActivityPage(value: unknown): LeadDetailActivityPage {
  if (!isRecord(value) || !Array.isArray(value.activities)) {
    throw new Error('The lead activity response was invalid.');
  }
  return {
    activities: value.activities.map(parseActivity),
    nextCursor: parseActivityCursor(value.nextCursor),
  };
}

function parseContact(value: unknown): LeadDetailContact {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string'
  ) {
    throw new Error('The lead detail response was invalid.');
  }
  return value as LeadDetailContact;
}

export function parseLeadDetailBootstrap(
  value: unknown,
  expected: { leadId: string; leadSource: CrmLeadSource }
): LeadDetailBootstrap {
  if (
    !isRecord(value) ||
    value.leadId !== expected.leadId ||
    value.leadSource !== expected.leadSource ||
    !Array.isArray(value.activities) ||
    !Array.isArray(value.contacts) ||
    (value.realtorRoles !== null && !Array.isArray(value.realtorRoles))
  ) {
    throw new Error('The lead detail response was invalid.');
  }

  const roles = value.realtorRoles as unknown[] | null;
  return {
    leadId: expected.leadId,
    leadSource: expected.leadSource,
    lead: parseLeadRecord(value.lead, expected),
    activities: value.activities.map(parseActivity),
    activitiesNextCursor: parseActivityCursor(value.activitiesNextCursor),
    contacts: value.contacts.map(parseContact),
    realtorRoles: roles === null ? null : (roles as LeadRealtorRole[]),
  };
}

export async function fetchCrmLeadDetailBootstrap(
  leadId: string,
  leadSource: CrmLeadSource,
  options: { signal?: AbortSignal; request?: Requester } = {}
) {
  const params = new URLSearchParams({
    leadId,
    leadSource,
    profile: 'mobile',
    activityBodyMode: 'summary',
  });
  const response = await (options.request ?? defaultRequester)(
    `${CRM_API_BASE_URL}/api/leads/detail-bootstrap?${params.toString()}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(errorFromPayload(payload, 'Could not load lead details.'));
  return parseLeadDetailBootstrap(payload, { leadId, leadSource });
}

export async function fetchCrmLeadActivitiesPage(
  leadId: string,
  leadSource: CrmLeadSource,
  options: {
    cursor?: string | null;
    limit?: number;
    signal?: AbortSignal;
    request?: Requester;
  } = {}
) {
  const params = new URLSearchParams({
    leadId,
    leadSource,
    profile: 'mobile',
    activityBodyMode: 'summary',
    limit: String(Math.min(50, Math.max(1, options.limit ?? 20))),
  });
  if (options.cursor) params.set('cursor', options.cursor);
  const response = await (options.request ?? defaultRequester)(
    `${CRM_API_BASE_URL}/api/leads/activities?${params.toString()}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(errorFromPayload(payload, 'Could not load lead activity.'));
  }
  return parseLeadDetailActivityPage(payload);
}

export async function fetchCrmLeadActivityBody(
  leadId: string,
  leadSource: CrmLeadSource,
  activityId: string,
  options: { signal?: AbortSignal; request?: Requester } = {}
): Promise<LeadActivityBody> {
  const params = new URLSearchParams({
    leadId,
    leadSource,
    activityId,
    profile: 'mobile',
  });
  const response = await (options.request ?? defaultRequester)(
    `${CRM_API_BASE_URL}/api/leads/activity-body?${params.toString()}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(errorFromPayload(payload, 'Could not load the email body.'));
  }
  if (
    !isRecord(payload) ||
    payload.activityId !== activityId ||
    (payload.body !== null && typeof payload.body !== 'string')
  ) {
    throw new Error('The email body response was invalid.');
  }
  return { activityId, body: payload.body };
}

export function crmLeadKey(lead: Pick<CrmLeadSummary, 'id' | 'source'>) {
  return `${lead.source}:${lead.id}`;
}

type CrmLeadSourceFields = {
  source?: string | null;
  db_source?: string | null;
  source_detail?: string | null;
  ad_name?: string | null;
  campaign_name?: string | null;
};

function firstSourceValue(
  values: Array<string | null | undefined>,
  fallback: string
) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }
  return fallback;
}

export function getCrmLeadSourceKey(
  lead: CrmLeadSourceFields,
  source: CrmLeadSource
) {
  return source === 'meta'
    ? firstSourceValue(
        [lead.ad_name, lead.source_detail, lead.campaign_name],
        'meta'
      )
    : firstSourceValue(
        [lead.source_detail, lead.db_source, lead.source],
        'organic'
      );
}

export function toMobileLead(
  lead: CrmLeadSummary | Record<string, unknown>
): Lead | MetaLead {
  if (lead.source === 'meta') {
    return { ...lead } as unknown as MetaLead;
  }
  const dbSource = typeof lead.db_source === 'string' ? lead.db_source : null;
  return {
    ...lead,
    source: dbSource,
    db_source: dbSource,
  } as unknown as Lead;
}

const MOBILE_SUMMARY_FIELDS = [
  'created_at',
  'created_time',
  'first_name',
  'last_name',
  'email',
  'phone',
  'status',
  'last_contact_date',
  'last_contact_type',
  'last_touched_at',
  'last_contact_notes',
  'lender_loan_number',
  'subject_address',
  'loan_purpose',
  'credit_score',
  'income_type',
  'monthly_income',
  'purchase_timeline',
  'down_payment_saved',
  'has_realtor',
  'county_interest',
  'preferred_language',
  'price',
  'ad_id',
  'ad_name',
  'campaign_name',
  'platform',
  'is_tracked',
  'tracking_reason',
  'tracking_note',
  'tracking_note_updated_at',
  'source_detail',
  'import_source',
  'realtor_id',
  'realtor_name',
  'realtor_email',
  'lo_id',
  'lo_name',
  'sms_opted_out',
  'sms_opt_in',
  'needs_attention',
  'attention_priority',
  'attention_badge',
  'attention_reason',
  'attention_suggested_action',
  'unread_sms_count',
  'has_active_borrower_scenario',
  'has_active_realtor_scenario',
] as const;

export function toCrmLeadSummary(
  source: 'lead' | 'meta',
  record: Lead | MetaLead
): CrmLeadSummary {
  const summary: Record<string, unknown> = {
    id: record.id,
    source: source === 'lead' ? 'organic' : 'meta',
  };
  for (const field of MOBILE_SUMMARY_FIELDS) {
    const value = (record as unknown as Record<string, unknown>)[field];
    if (value !== undefined) summary[field] = value;
  }
  if (source === 'lead') {
    summary.db_source =
      (record as Lead).source ?? (record as Lead).db_source ?? null;
  }
  return summary as CrmLeadSummary;
}

const CRM_API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.closewithmario.com'
).replace(/\/$/, '');

export type RealtorLinkedLead = {
  id: string;
  source: 'lead' | 'meta';
  first_name: string | null;
  last_name: string | null;
  status: string | null;
  created_at: string;
};

export type RealtorLeadPage = {
  items: RealtorLinkedLead[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
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

function readNullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

export function parseRealtorLeadPage(value: unknown): RealtorLeadPage {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error('The realtor lead response was invalid.');
  }
  const items = value.items.map((item): RealtorLinkedLead => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      !UUID_PATTERN.test(item.id) ||
      (item.source !== 'organic' && item.source !== 'meta') ||
      typeof item.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(item.createdAt))
    ) {
      throw new Error('The realtor lead response was invalid.');
    }
    return {
      id: item.id,
      source: item.source === 'organic' ? 'lead' : 'meta',
      first_name: readNullableString(item.firstName),
      last_name: readNullableString(item.lastName),
      status: readNullableString(item.status),
      created_at: new Date(item.createdAt).toISOString(),
    };
  });
  const nextCursor =
    value.nextCursor === null || typeof value.nextCursor === 'string'
      ? value.nextCursor
      : undefined;
  const totalCount = Number(value.totalCount);
  if (
    nextCursor === undefined ||
    typeof value.hasMore !== 'boolean' ||
    (value.hasMore && !nextCursor) ||
    !Number.isInteger(totalCount) ||
    totalCount < 0
  ) {
    throw new Error('The realtor lead response was invalid.');
  }
  return { items, nextCursor, hasMore: value.hasMore, totalCount };
}

export async function fetchRealtorLeadPage(
  realtorId: string,
  options: {
    cursor?: string | null;
    limit?: number;
    signal?: AbortSignal;
    requester?: Requester;
  } = {}
) {
  if (!UUID_PATTERN.test(realtorId)) {
    throw new Error('A valid realtor is required.');
  }
  const params = new URLSearchParams({
    realtorId,
    limit: String(options.limit ?? 25),
  });
  if (options.cursor) params.set('cursor', options.cursor);

  const response = await (options.requester ?? defaultRequester)(
    `${CRM_API_BASE_URL}/api/realtors/leads?${params.toString()}`,
    { method: 'GET', signal: options.signal }
  );
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // The status-specific error below remains deliberate for non-JSON failures.
  }
  if (!response.ok) {
    throw new Error(
      isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : 'Could not load this realtor’s leads.'
    );
  }
  return parseRealtorLeadPage(payload);
}

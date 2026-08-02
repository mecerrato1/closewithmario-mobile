import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchRealtorLeadPage,
  parseRealtorLeadPage,
} from './realtorLeadApi';

const REALTOR_ID = '50c5d2af-3018-4d6e-9432-7ffac2842afa';
const LEAD_ID = 'd21da98c-7cf2-4204-9cc3-8ce2e007a123';

function payload(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        id: LEAD_ID,
        source: 'organic',
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phone: null,
        status: 'new',
        createdAt: '2030-01-02T00:00:00.000Z',
      },
    ],
    nextCursor: 'next-page',
    hasMore: true,
    totalCount: 3,
    ...overrides,
  };
}

test('parses the projected realtor lead DTO and canonical mobile source', () => {
  const parsed = parseRealtorLeadPage(payload());
  assert.equal(parsed.items[0].source, 'lead');
  assert.equal(parsed.items[0].first_name, 'Ada');
  assert.equal(parsed.items[0].created_at, '2030-01-02T00:00:00.000Z');
  assert.equal(parsed.totalCount, 3);
});

test('rejects malformed, inconsistent, or over-broad response shapes', () => {
  for (const value of [
    null,
    payload({ items: [{ id: 'bad' }] }),
    payload({ hasMore: true, nextCursor: null }),
    payload({ totalCount: -1 }),
    payload({ items: [{ ...payload().items[0], createdAt: 'not-a-date' }] }),
  ]) {
    assert.throws(() => parseRealtorLeadPage(value));
  }
});

test('uses the authenticated endpoint and forwards cursor cancellation', async () => {
  const controller = new AbortController();
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;
  const page = await fetchRealtorLeadPage(REALTOR_ID, {
    cursor: 'opaque-cursor',
    limit: 10,
    signal: controller.signal,
    requester: async (url, init) => {
      requestedUrl = url;
      requestedInit = init;
      return {
        ok: true,
        async json() {
          return payload({ nextCursor: null, hasMore: false });
        },
      } as Response;
    },
  });

  assert.match(requestedUrl, /\/api\/realtors\/leads\?/);
  assert.match(requestedUrl, new RegExp(`realtorId=${REALTOR_ID}`));
  assert.match(requestedUrl, /cursor=opaque-cursor/);
  assert.equal(requestedInit?.signal, controller.signal);
  assert.equal(page.hasMore, false);
});

test('surfaces deliberate API errors and rejects invalid realtor identity', async () => {
  await assert.rejects(
    () => fetchRealtorLeadPage('bad-id'),
    /valid realtor/
  );
  await assert.rejects(
    () =>
      fetchRealtorLeadPage(REALTOR_ID, {
        requester: async () =>
          ({
            ok: false,
            async json() {
              return { error: 'You do not have access to this realtor' };
            },
          }) as Response,
      }),
    /do not have access/
  );
});

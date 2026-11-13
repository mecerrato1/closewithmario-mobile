import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_LO_CONNECT,
  CLOSE_WITH_MARIO,
  PUBLIC_BRAND,
  getBrand,
  parseBrandId,
} from '../../brand/brands';
import { BrandResolutionError, fetchAccountBrand } from '../../brand/fetchAccountBrand';

const BASE = 'https://api.example.test';

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }) {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, ...init });
}

function deps(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  return {
    calls,
    deps: {
      baseUrl: BASE,
      request: async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return handler(url, init);
      },
    },
  };
}

test('a Close With Mario account resolves to Close With Mario branding', async () => {
  const { deps: d } = deps(async () => jsonResponse({ brand: 'close-with-mario', roles: ['loan_officer'] }));
  const id = await fetchAccountBrand(d);
  assert.equal(getBrand(id), CLOSE_WITH_MARIO);
  assert.equal(getBrand(id).displayName, 'Close With Mario');
});

test('an AgentLOConnect account resolves to AgentLOConnect branding', async () => {
  const { deps: d } = deps(async () => jsonResponse({ brand: 'agent-lo-connect' }));
  assert.equal(getBrand(await fetchAccountBrand(d)), AGENT_LO_CONNECT);
});

test('the public identity before sign-in is AgentLOConnect', () => {
  assert.equal(PUBLIC_BRAND.id, 'agent-lo-connect');
});

test('the request carries no brand, email or username hint', async () => {
  const { deps: d, calls } = deps(async () => jsonResponse({ brand: 'agent-lo-connect' }));
  await fetchAccountBrand(d);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE}/api/account/onboarding`);
  assert.equal(calls[0].init?.method, 'GET');
  assert.equal(calls[0].init?.body, undefined);
  assert.doesNotMatch(calls[0].url, /brand|email|user|@/i);
  assert.doesNotMatch(JSON.stringify(calls[0].init?.headers), /brand|email|user/i);
});

test('only the server brand field is read; look-alike fields in the response are ignored', async () => {
  const { deps: d } = deps(async () =>
    jsonResponse({
      brand: 'agent-lo-connect',
      email: 'someone@closewithmario.com',
      profile: { company: 'Close With Mario', brand: 'close-with-mario' },
      user_metadata: { brand: 'close-with-mario' },
    }),
  );
  assert.equal(await fetchAccountBrand(d), 'agent-lo-connect');
});

test('null brand (no profile) is an error, never a default', async () => {
  const { deps: d } = deps(async () => jsonResponse({ brand: null }));
  await assert.rejects(fetchAccountBrand(d), (e: unknown) => e instanceof BrandResolutionError && e.reason === 'unassigned');
});

test('a server that does not return the field yet fails closed', async () => {
  const { deps: d } = deps(async () => jsonResponse({ roles: ['loan_officer'], destination: '/crm' }));
  await assert.rejects(fetchAccountBrand(d), (e: unknown) => e instanceof BrandResolutionError && e.reason === 'unassigned');
});

test('unknown, differently cased or non-string values are rejected', async () => {
  for (const value of ['Close With Mario', 'CLOSE-WITH-MARIO', 'shared', '', 1, true, {}, ['close-with-mario']]) {
    const { deps: d } = deps(async () => jsonResponse({ brand: value }));
    await assert.rejects(fetchAccountBrand(d), BrandResolutionError, `value ${JSON.stringify(value)}`);
  }
});

test('HTTP failures are errors for every status', async () => {
  for (const status of [401, 403, 404, 429, 500, 503]) {
    const { deps: d } = deps(async () => jsonResponse({ brand: 'close-with-mario' }, { status }));
    await assert.rejects(fetchAccountBrand(d), (e: unknown) => e instanceof BrandResolutionError && e.reason === 'request_failed', `status ${status}`);
  }
});

test('network errors and timeouts are errors', async () => {
  const { deps: d } = deps(async () => { throw new TypeError('Network request failed'); });
  await assert.rejects(fetchAccountBrand(d), (e: unknown) => e instanceof BrandResolutionError && e.reason === 'request_failed');
});

test('a malformed body is an error', async () => {
  const { deps: d } = deps(async () => new Response('<html>oops</html>', { status: 200 }));
  await assert.rejects(fetchAccountBrand(d), (e: unknown) => e instanceof BrandResolutionError && e.reason === 'bad_response');
  for (const body of [null, 'close-with-mario', 7, []]) {
    const { deps: d2 } = deps(async () => jsonResponse(body));
    await assert.rejects(fetchAccountBrand(d2), BrandResolutionError);
  }
});

test('the abort signal is forwarded so stale lookups can be cancelled', async () => {
  const controller = new AbortController();
  const { deps: d, calls } = deps(async () => jsonResponse({ brand: 'agent-lo-connect' }));
  await fetchAccountBrand(d, controller.signal);
  assert.equal(calls[0].init?.signal, controller.signal);
});

test('base URL trailing slash does not double up', async () => {
  const { deps: d, calls } = deps(async () => jsonResponse({ brand: 'agent-lo-connect' }));
  await fetchAccountBrand({ ...d, baseUrl: `${BASE}/` });
  assert.equal(calls[0].url, `${BASE}/api/account/onboarding`);
});

test('parseBrandId accepts exactly the two server values', () => {
  assert.equal(parseBrandId('close-with-mario'), 'close-with-mario');
  assert.equal(parseBrandId('agent-lo-connect'), 'agent-lo-connect');
  assert.equal(parseBrandId(undefined), null);
  assert.equal(parseBrandId('agentloconnect'), null);
});

test('both brands expose the same set of colour tokens and a name', () => {
  assert.deepEqual(Object.keys(CLOSE_WITH_MARIO.colors).sort(), Object.keys(AGENT_LO_CONNECT.colors).sort());
  assert.ok(CLOSE_WITH_MARIO.displayName && AGENT_LO_CONNECT.displayName);
});

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('button fills and link colours meet 4.5:1 contrast on their backgrounds, for both brands', () => {
  for (const brand of [AGENT_LO_CONNECT, CLOSE_WITH_MARIO]) {
    assert.ok(contrast('#FFFFFF', brand.colors.accentStrong) >= 4.5, `${brand.id} button`);
    assert.ok(contrast(brand.colors.accentText, '#FFFFFF') >= 4.5, `${brand.id} link on white`);
    assert.ok(contrast(brand.colors.accentText, brand.colors.canvas) >= 4.5, `${brand.id} link on canvas`);
    assert.ok(contrast('#FFFFFF', brand.colors.primary) >= 7, `${brand.id} header text`);
    assert.ok(contrast(brand.colors.textSecondary, brand.colors.canvas) >= 4.5, `${brand.id} secondary text`);
  }
});

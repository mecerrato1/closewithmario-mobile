import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const inboxClientUrl = new URL('./messageInboxClient.ts', import.meta.url);
const historyClientUrl = new URL('./messageHistoryClient.ts', import.meta.url);
const messagesScreenUrl = new URL(
  '../../screens/tabs/MessagesTabScreen.tsx',
  import.meta.url
);
const metaComponentUrl = new URL(
  '../../components/MetaDmMessaging.tsx',
  import.meta.url
);

test('message inbox uses authorized compact summaries instead of row scans', async () => {
  const [client, screen] = await Promise.all([
    readFile(inboxClientUrl, 'utf8'),
    readFile(messagesScreenUrl, 'utf8'),
  ]);

  assert.match(client, /\/api\/messages\/conversations/);
  assert.match(client, /authenticatedFetch/);
  assert.match(client, /cursor/);
  assert.match(client, /unreadOnly/);
  assert.match(client, /compact: '1'/);
  assert.match(client, /SCENARIO_INBOX_PAGE_SIZE/);
  assert.doesNotMatch(client, /pending=1&limit=1000/);
  assert.doesNotMatch(client, /\/api\/leads\/list/);
  assert.doesNotMatch(client, /get_crm_sms_conversation_summaries/);
  assert.doesNotMatch(client, /get_unread_meta_dm_counts/);
  assert.doesNotMatch(client, /from\(["']meta_dm_conversations["']\)/);
  assert.doesNotMatch(client, /from\(["']sms_messages["']\)/);
  assert.doesNotMatch(client, /from\(["']meta_dm_messages["']\)/);
  assert.doesNotMatch(screen, /\.from\('leads'\)[\s\S]*\.select/);
  assert.doesNotMatch(screen, /\.from\('meta_ads'\)[\s\S]*\.select/);
  assert.match(screen, /reload\(isScenarioUpdate\)/);
  assert.equal((screen.match(/reload\(false\)/g) || []).length, 2);
  assert.doesNotMatch(screen, /void reload\(\)/);
});

test('opened SMS and DM histories use explicit bounded page queries', async () => {
  const historyClient = await readFile(historyClientUrl, 'utf8');

  assert.match(
    historyClient,
    /from\(["']sms_messages["']\)[\s\S]*\.limit\(MESSAGE_HISTORY_PAGE_SIZE \+ 1\)/
  );
  assert.match(
    historyClient,
    /from\(["']meta_dm_messages["']\)[\s\S]*\.limit\(MESSAGE_HISTORY_PAGE_SIZE \+ 1\)/
  );
  assert.match(
    historyClient,
    /\.order\(["']created_at["'], \{ ascending: false \}\)/
  );
  assert.match(historyClient, /\.order\(["']id["'], \{ ascending: false \}\)/);
  assert.doesNotMatch(historyClient, /\.select\(["']\*["']\)/);
});

test('Meta HTTP requests share the authenticated mobile fetch helper', async () => {
  const metaComponent = await readFile(metaComponentUrl, 'utf8');

  assert.match(metaComponent, /authenticatedFetch/);
  assert.doesNotMatch(metaComponent, /getAccessToken/);
  assert.doesNotMatch(metaComponent, /fetchWithAuthRetry/);
});

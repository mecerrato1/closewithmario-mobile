import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { assertResolvedTemplate, prefersSpanish, prepareLeadTemplateMessage } from './leadTemplateMessage';
import { CRM_API_BASE_URL } from './crmLeadApi';

const leadId = '11111111-1111-4111-8111-111111111111';
const base = { leadId, leadSource: 'organic' as const, message: '{LO application URL}' };
const assignedUrl = 'https://lender.com/assigned-officer?ref=$&';

for (const spanish of [false, true]) {
  for (const leadSource of ['organic', 'meta'] as const) {
    test(`resolves assigned LO link for ${leadSource} in ${spanish ? 'Spanish' : 'English'}`, async () => {
      let requests = 0;
      const message = spanish ? 'Hola Ana, solicite aquí: {LO application URL}' : 'Hi Ana, apply here: {LO application URL}';
      const result = await prepareLeadTemplateMessage({ ...base, message, spanish, leadSource,
        request: async (input, init) => {
          requests++;
          const url = new URL(input);
          assert.equal(input.split('/api/')[0], CRM_API_BASE_URL);
          assert.deepEqual([...url.searchParams.entries()], [['leadId', leadId], ['leadSource', leadSource]]);
          assert.equal(init?.method, 'GET');
          assert.ok(init?.signal);
          // An assistant's authenticated request supplies only the lead identity;
          // the server owns assignment resolution, never the caller's LO ID.
          return Response.json({ url: assignedUrl });
        },
      });
      assert.equal(result, message.replace('{LO application URL}', () => assignedUrl));
      assert.equal(requests, 1);
    });
  }
}

test('replaces repeated application placeholders literally', async () => {
  assert.equal(await prepareLeadTemplateMessage({ ...base, message: `${base.message} ${base.message}`, request: async () => Response.json({ url: assignedUrl }) }), `${assignedUrl} ${assignedUrl}`);
});
for (const spanish of [false, true]) test(`missing URL instructs assigned LO to save settings (${spanish})`, async () => {
  await assert.rejects(prepareLeadTemplateMessage({ ...base, spanish, request: async () => Response.json({ url: '' }) }), /Profile Settings/);
});
for (const [status, expected] of [[401, /sign in/i], [403, /permission/i], [404, /deployed/i], [500, /try again/i]] as const) {
  test(`API ${status} blocks preparation`, async () => {
    await assert.rejects(prepareLeadTemplateMessage({ ...base, request: async () => new Response('private error', { status }) }), expected);
  });
}
test('network and expired-session failures allow a new attempt', async () => {
  for (const [message, expected] of [['Network request failed', /connection/], ['Your session expired. Please sign in again.', /sign in/]] as const) {
    await assert.rejects(prepareLeadTemplateMessage({ ...base, request: async () => { throw new Error(message); } }), expected);
  }
  assert.equal(await prepareLeadTemplateMessage({ ...base, request: async () => Response.json({ url: assignedUrl }) }), assignedUrl);
});
for (const payload of [{}, { url: null }, { url: 'javascript:alert(1)' }, { url: 'bad-url' }]) test(`rejects invalid payload ${JSON.stringify(payload)}`, async () => {
  await assert.rejects(prepareLeadTemplateMessage({ ...base, request: async () => Response.json(payload) }), /invalid response/);
});
test('unresolved fields block even after URL resolution', async () => {
  await assert.rejects(prepareLeadTemplateMessage({ ...base, message: '{fname} {LO application URL}', request: async () => Response.json({ url: assignedUrl }) }), /\{fname\}/);
  assert.throws(() => assertResolvedTemplate('Hi [First Name]'), /unresolved/);
});
test('other messages skip lookup; supplied fields remain usable', async () => {
  const request = async () => { throw new Error('must not fetch'); };
  assert.equal(await prepareLeadTemplateMessage({ ...base, message: 'Our callback is tomorrow at 2pm', request }), 'Our callback is tomorrow at 2pm');
  await assert.rejects(prepareLeadTemplateMessage({ ...base, message: '{custom field}', request }), /custom field/);
});
test('language defaults support both sources without removing the manual override', () => {
  for (const language of ['Spanish', 'es', ' Español ']) assert.equal(prefersSpanish(language), true);
  for (const language of ['English', null, undefined]) assert.equal(prefersSpanish(language), false);
  const screen = readFileSync(new URL('../../screens/LeadDetailScreen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /prefersSpanish\(record\?\.preferred_language/);
  assert.match(screen, /onPress=\{\(\) => setUseSpanishTemplates\(true\)\}/);
});
test('screen awaits authenticated preparation before activity writes or composer and guards duplicate taps', () => {
  const screen = readFileSync(new URL('../../screens/LeadDetailScreen.tsx', import.meta.url), 'utf8');
  const handler = screen.slice(screen.indexOf('const handleTemplateSelect'), screen.indexOf('const handleCustomMessageSend'));
  assert.match(handler, /if \(preparingTemplateRef.current\) return/);
  assert.match(handler, /request: authenticatedFetch/);
  assert.ok(handler.indexOf('await prepareLeadTemplateMessage') < handler.indexOf('await autoAdvanceStatus'));
  assert.ok(handler.indexOf('await prepareLeadTemplateMessage') < handler.indexOf('await Linking.openURL'));
  assert.match(handler, /finally \{\s*preparingTemplateRef.current = false/);
  assert.doesNotMatch(handler, /lo_profile_settings|service_role/);
});

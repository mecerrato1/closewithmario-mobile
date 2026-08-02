import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  parseLeadDetailBootstrap,
  type LeadDetailBootstrap,
} from './crmLeadApi';
import { loadLeadDetail } from './leadDetailLoader';

const LEAD_ID = '00000000-0000-4000-8000-000000000001';

const rawLead = {
  id: LEAD_ID,
  source: 'organic',
  db_source: 'My Lead',
  created_at: '2026-01-01T00:00:00.000Z',
  first_name: 'Deep',
  last_name: 'Link',
  email: null,
  phone: '5551234567',
  status: 'new',
  last_contact_date: null,
};

function parsedBootstrap(): LeadDetailBootstrap {
  return parseLeadDetailBootstrap(
    {
      leadId: LEAD_ID,
      leadSource: 'organic',
      lead: rawLead,
      activities: [
        {
          id: 'activity-1',
          activity_type: 'note',
          notes: 'Bounded note',
          created_at: '2026-01-02T00:00:00.000Z',
          has_audio: false,
        },
      ],
      activitiesNextCursor: null,
      contacts: [
        {
          id: 'contact-1',
          name: 'Related Person',
          phone: '5550000000',
          email: null,
        },
      ],
      realtorRoles: [],
    },
    { leadId: LEAD_ID, leadSource: 'organic' }
  );
}

test('parses bootstrap data and maps the organic db_source for mobile', () => {
  const bootstrap = parsedBootstrap();
  assert.equal(bootstrap.lead.id, LEAD_ID);
  assert.equal(
    (bootstrap.lead as { source?: string | null }).source,
    'My Lead'
  );
  assert.equal(bootstrap.activities[0].has_audio, false);
  assert.equal(bootstrap.contacts[0].name, 'Related Person');
  assert.deepEqual(bootstrap.realtorRoles, []);
});

test('summary audio metadata preserves the voice-note presentation path', () => {
  const source = readFileSync(
    new URL('../../screens/LeadDetailScreen.tsx', import.meta.url),
    'utf8'
  );
  assert.match(
    source,
    /activity\.audio_url \|\| activity\.has_audio \? 'mic-outline'/
  );
  assert.match(
    source,
    /activity\.audio_url \|\| activity\.has_audio\s+\? 'Voice note'/
  );
});

test('uses detail bootstrap as the primary out-of-page/deep-link retrieval', async () => {
  const bootstrap = parsedBootstrap();
  let recordCalls = 0;
  const result = await loadLeadDetail(LEAD_ID, 'organic', {
    dependencies: {
      bootstrap: async () => bootstrap,
      record: async () => {
        recordCalls += 1;
        return bootstrap.lead;
      },
    },
  });
  assert.equal(result.lead.id, LEAD_ID);
  assert.equal(result.usedRecordFallback, false);
  assert.equal(recordCalls, 0);
});

test('falls back to the focused record endpoint if bootstrap fails', async () => {
  const bootstrap = parsedBootstrap();
  const result = await loadLeadDetail(LEAD_ID, 'organic', {
    dependencies: {
      bootstrap: async () => {
        throw new Error('Bootstrap temporarily unavailable');
      },
      record: async () => bootstrap.lead,
    },
  });
  assert.equal(result.lead.id, LEAD_ID);
  assert.equal(result.bootstrap, null);
  assert.equal(result.usedRecordFallback, true);
  assert.equal(result.bootstrapError, 'Bootstrap temporarily unavailable');
});

test('does not issue the fallback request after cancellation', async () => {
  const controller = new AbortController();
  let recordCalls = 0;
  await assert.rejects(
    loadLeadDetail(LEAD_ID, 'organic', {
      signal: controller.signal,
      dependencies: {
        bootstrap: async () => {
          controller.abort();
          throw new Error('Aborted');
        },
        record: async () => {
          recordCalls += 1;
          return parsedBootstrap().lead;
        },
      },
    }),
    /Aborted/
  );
  assert.equal(recordCalls, 0);
});

test('rejects a mismatched detail response instead of trusting it', () => {
  assert.throws(
    () =>
      parseLeadDetailBootstrap(
        {
          leadId: '00000000-0000-4000-8000-000000000099',
          leadSource: 'organic',
          lead: rawLead,
          activities: [],
          activitiesNextCursor: null,
          contacts: [],
          realtorRoles: [],
        },
        { leadId: LEAD_ID, leadSource: 'organic' }
      ),
    /invalid/i
  );
});

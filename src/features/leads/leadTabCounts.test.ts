import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchOtherTabCounts } from './leadTabCounts';

const query = { scope: 'admin', status: 'qualified', platform: 'all', excludeUnqualified: false, limit: 50 } as any;

test('counts the other tabs with the same filters', async () => {
  const seen: any[] = [];
  const counts = await fetchOtherTabCounts(query, 'all', async (asked, options) => {
    seen.push([asked.platform, asked.status, asked.limit, options.includeFacets]);
    return { totalCount: asked.platform === 'organic' ? 12 : 30 };
  });
  assert.deepEqual(counts, { leads: 12, meta: 30 });
  assert.deepEqual(seen.sort(), [
    ['meta', 'qualified', 1, false],
    ['organic', 'qualified', 1, false],
  ]);
});

test('a failed count is left unknown without losing the others', async () => {
  const counts = await fetchOtherTabCounts(query, 'meta', async (asked) => {
    if (asked.platform === 'organic') throw new Error('offline');
    return { totalCount: 41 };
  });
  assert.deepEqual(counts, { all: 41 });
});

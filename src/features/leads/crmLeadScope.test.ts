import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveCrmLeadScopeForRole } from '../../lib/crmLeadScope';

test('admins always keep all-leads CRM scope', () => {
  assert.equal(resolveCrmLeadScopeForRole('super_admin'), 'all');
  assert.equal(resolveCrmLeadScopeForRole('admin'), 'all');
});

test('realtors keep realtor CRM scope', () => {
  assert.equal(resolveCrmLeadScopeForRole('realtor'), 'realtor');
});

test('loan officers start in their own pipeline; assistants in the assisted one', () => {
  assert.equal(resolveCrmLeadScopeForRole('loan_officer'), 'loan_officer');
  assert.equal(resolveCrmLeadScopeForRole('assistant'), 'assistant');
});

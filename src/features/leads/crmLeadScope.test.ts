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

test('loan officers switch into assistant CRM scope only when delegated access exists', () => {
  assert.equal(resolveCrmLeadScopeForRole('loan_officer', false), 'loan_officer');
  assert.equal(resolveCrmLeadScopeForRole('loan_officer', true), 'assistant');
});

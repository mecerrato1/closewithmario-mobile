import test from 'node:test';
import assert from 'node:assert/strict';

import { leadSourceLine, shortCampaignName } from './leadSummary';

test('drops the account prefix, date and objective from campaign names', () => {
  assert.equal(shortCampaignName('CWM | 15 Oct | Lead Gen | Florida | DPA'), 'Florida DPA');
  assert.equal(shortCampaignName('CWM | Oct 15 | Condo'), 'Condo');
});

test('keeps a name that has nothing to strip, or would be left empty', () => {
  assert.equal(shortCampaignName('Spring renters'), 'Spring renters');
  assert.equal(shortCampaignName('CWM | Lead Gen'), 'CWM | Lead Gen');
  assert.equal(shortCampaignName(null), '');
});

test('names the platform and campaign for ad leads', () => {
  assert.equal(leadSourceLine({ isMeta: true, platform: 'ig', campaignName: 'CWM | Condo' }), 'Instagram · Condo');
  assert.equal(leadSourceLine({ isMeta: true }), 'Facebook');
  assert.equal(leadSourceLine({ isMeta: false, campaignName: 'x' }), 'Website');
});

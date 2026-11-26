import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { activityPreview, pipelineProgress } from './leadPipeline';

describe('pipelineProgress', () => {
  it('counts stages reached', () => {
    assert.equal(pipelineProgress('new'), 1);
    assert.equal(pipelineProgress(null), 1);
    assert.equal(pipelineProgress('qualified'), 5);
    assert.equal(pipelineProgress('closed'), 7);
  });

  it('is empty for a status beside the pipeline', () => {
    assert.equal(pipelineProgress('nurturing'), 0);
    assert.equal(pipelineProgress('lost_deal'), 0);
  });
});

describe('activityPreview', () => {
  it('uses the subject for email and drops links', () => {
    assert.equal(
      activityPreview({ activity_type: 'email', subject: 'Documents', notes: 'long body' }),
      'Documents'
    );
    assert.equal(
      activityPreview({ activity_type: 'call', notes: 'Left message\nhttps://x.test/rec.mp3' }),
      'Left message'
    );
    assert.equal(activityPreview({ activity_type: 'note', notes: null }), '');
  });
});

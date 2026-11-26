import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configureWorkspace,
  describeAssisted,
  getWorkspace,
  resetWorkspace,
  setAssistedLoanOfficer,
  setWorkspaceMode,
  workspaceRequestParams,
} from './workspace';

const assisted = [
  { id: 'a', name: 'Ann', canCreateLeads: true },
  { id: 'b', name: 'Bo', canCreateLeads: false },
];

test('a loan officer who assists starts on their own leads, then All, then one officer', () => {
  resetWorkspace();
  assert.deepEqual(workspaceRequestParams(getWorkspace()), {});
  configureWorkspace({ userId: 'u', assistantId: 's', assisted, hasOwn: true, mode: 'own' });
  assert.deepEqual(workspaceRequestParams(getWorkspace()), { workspace: 'own' });
  setWorkspaceMode('assisting');
  assert.deepEqual(workspaceRequestParams(getWorkspace()), { workspace: 'assisting' });
  setAssistedLoanOfficer('b');
  assert.deepEqual(workspaceRequestParams(getWorkspace()), { workspace: 'assisting', loId: 'b' });
  setAssistedLoanOfficer('someone-else');
  assert.equal(getWorkspace().loId, 'b');
  setWorkspaceMode('own');
  assert.deepEqual(workspaceRequestParams(getWorkspace()), { workspace: 'own' });
});

test('an assistant without their own pipeline is always assisting', () => {
  resetWorkspace();
  configureWorkspace({ userId: 'v', assistantId: 's', assisted, hasOwn: false, mode: 'own' });
  setWorkspaceMode('own');
  assert.deepEqual(workspaceRequestParams(getWorkspace()), { workspace: 'assisting' });
});

test('assisted officers are named briefly', () => {
  assert.equal(describeAssisted(assisted), 'Ann and Bo');
  assert.equal(describeAssisted([...assisted, assisted[0]]), 'Ann and 2 others');
});

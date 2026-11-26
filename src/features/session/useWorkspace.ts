import { useSyncExternalStore } from 'react';
import { getWorkspace, subscribeWorkspace, type Workspace } from './workspace';

export function useWorkspace(): Workspace {
  return useSyncExternalStore(subscribeWorkspace, getWorkspace);
}

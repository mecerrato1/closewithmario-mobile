import { useSyncExternalStore } from 'react';
import { isSuperAdminModeOn, subscribeSuperAdminMode } from './superAdminMode';

export function useSuperAdminMode(email?: string | null): boolean {
  return useSyncExternalStore(subscribeSuperAdminMode, () => isSuperAdminModeOn(email));
}

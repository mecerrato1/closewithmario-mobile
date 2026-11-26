import AsyncStorage from '@react-native-async-storage/async-storage';
import { setWorkspaceMode, type WorkspaceMode } from './workspace';

const key = (userId: string) => `crmWorkspaceMode:${userId}`;

/** The last workspace chosen on this device. Defaults to the person's own leads. */
export async function readWorkspaceMode(userId: string): Promise<WorkspaceMode> {
  try {
    return (await AsyncStorage.getItem(key(userId))) === 'assisting' ? 'assisting' : 'own';
  } catch {
    return 'own';
  }
}

export function chooseWorkspaceMode(userId: string, mode: WorkspaceMode) {
  setWorkspaceMode(mode);
  // A convenience only; the workspace still works without storage.
  AsyncStorage.setItem(key(userId), mode).catch(() => undefined);
}

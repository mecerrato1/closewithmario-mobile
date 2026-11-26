// The website's "My leads" / "Assisting" switch. A loan officer who also assists
// sees one or the other, never both mixed; assisting can narrow to one officer.

export type AssistedLoanOfficer = {
  id: string;
  name: string;
  canCreateLeads: boolean;
};

export type WorkspaceMode = 'own' | 'assisting';

export type Workspace = {
  userId: string | null;
  assistantId: string | null;
  assisted: AssistedLoanOfficer[];
  /** Whether this person also has their own loan officer pipeline. */
  hasOwn: boolean;
  mode: WorkspaceMode;
  /** 'all' or one assisted loan officer's id. Only used while assisting. */
  loId: string;
};

const EMPTY: Workspace = {
  userId: null,
  assistantId: null,
  assisted: [],
  hasOwn: false,
  mode: 'own',
  loId: 'all',
};

let current: Workspace = EMPTY;
const listeners = new Set<() => void>();

function publish(next: Workspace) {
  current = next;
  listeners.forEach((listener) => listener());
}

export function getWorkspace(): Workspace {
  return current;
}

export function subscribeWorkspace(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function configureWorkspace(input: {
  userId: string;
  assistantId: string;
  assisted: AssistedLoanOfficer[];
  hasOwn: boolean;
  mode: WorkspaceMode;
}) {
  const same = current.userId === input.userId;
  const mode = !input.hasOwn ? 'assisting' : same ? current.mode : input.mode;
  const loId = same && input.assisted.some((lo) => lo.id === current.loId) ? current.loId : 'all';
  publish({ ...input, mode, loId });
}

export function resetWorkspace() {
  if (current !== EMPTY) publish(EMPTY);
}

export function setWorkspaceMode(mode: WorkspaceMode) {
  if (!current.hasOwn || mode === current.mode) return;
  publish({ ...current, mode });
}

export function setAssistedLoanOfficer(loId: string) {
  if (loId === current.loId) return;
  if (loId !== 'all' && !current.assisted.some((lo) => lo.id === loId)) return;
  publish({ ...current, loId });
}

export function isAssisting(workspace: Workspace): boolean {
  return workspace.assisted.length > 0 && workspace.mode === 'assisting';
}

/** The one assisted loan officer on screen, or null for all of them or none. */
export function pickedLoanOfficerId(workspace: Workspace): string | null {
  return isAssisting(workspace) && workspace.loId !== 'all' ? workspace.loId : null;
}

/** What the server needs to show the same workspace. Nothing for non-assistants. */
export function workspaceRequestParams(workspace: Workspace): Record<string, string> {
  if (!workspace.assisted.length) return {};
  if (!isAssisting(workspace)) return { workspace: 'own' };
  const loId = pickedLoanOfficerId(workspace);
  return loId ? { workspace: 'assisting', loId } : { workspace: 'assisting' };
}

/** "Jane Doe", "Jane Doe and John Roe", "Jane Doe and 2 others". */
export function describeAssisted(loanOfficers: Pick<AssistedLoanOfficer, 'name'>[]): string {
  const names = loanOfficers.map((lo) => lo.name);
  if (names.length === 0) return 'No loan officers';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} others`;
}

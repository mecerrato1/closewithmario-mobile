export type SignOutSteps = {
  /** Stop this device receiving pushes for the departing account. Needs the live session. */
  deactivatePushToken: () => Promise<void>;
  /** Cancel reminders scheduled on this device for the departing account. */
  cancelScheduledNotifications: () => Promise<void>;
  /** End the authentication session. */
  signOut: () => Promise<unknown>;
  /** Drop in-memory, account-scoped caches. */
  clearAccountCaches: () => void;
};

export type SignOutResult = { failedSteps: string[] };

/**
 * Ordered, best-effort sign-out. Cleanup that needs the live session runs
 * first. A failing step never prevents the session from ending, and local
 * caches are always cleared.
 */
export async function runSignOut(steps: SignOutSteps): Promise<SignOutResult> {
  const failedSteps: string[] = [];
  const attempt = async (name: string, step: () => Promise<unknown>) => {
    try {
      await step();
    } catch {
      failedSteps.push(name);
    }
  };

  await attempt('deactivatePushToken', steps.deactivatePushToken);
  await attempt('cancelScheduledNotifications', steps.cancelScheduledNotifications);
  await attempt('signOut', steps.signOut);
  try {
    steps.clearAccountCaches();
  } catch {
    failedSteps.push('clearAccountCaches');
  }
  return { failedSteps };
}

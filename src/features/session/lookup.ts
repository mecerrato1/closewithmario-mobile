export const ACCOUNT_LOOKUP_ERROR_MESSAGE =
  'We could not verify your account. Check your connection and try again.';

/**
 * Returns the row from a Supabase lookup, or throws when the lookup itself
 * failed. A failed lookup is not the same as "no row": callers must never turn
 * an error into a default role such as "buyer".
 */
export function unwrapLookup<T>(result: { data: T; error: unknown }): T {
  if (result.error) {
    throw new Error(ACCOUNT_LOOKUP_ERROR_MESSAGE);
  }
  return result.data;
}

import { Alert } from 'react-native';
import { supabase } from './supabase';

const API_BASE_URL = 'https://www.closewithmario.com';

/**
 * Shared helper for AI rewrite/refine API calls with retry-on-401.
 * Returns the rewritten text or null on auth/access errors.
 */
export async function callRewriteApi(body: Record<string, string>): Promise<string | null> {
  const doFetch = async (token: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(`${API_BASE_URL}/api/ai/rewrite-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  };

  let { data: { session: currentSession } } = await supabase.auth.getSession();
  if (!currentSession?.access_token) {
    Alert.alert('Error', 'Not authenticated. Please sign in again.');
    return null;
  }

  let response = await doFetch(currentSession.access_token);

  // Retry once on 401 after refreshing session
  if (response.status === 401) {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    if (!refreshed?.access_token) {
      Alert.alert('Error', 'Session expired. Please sign in again.');
      return null;
    }
    response = await doFetch(refreshed.access_token);
  }

  if (response.status === 403) {
    Alert.alert('Access Denied', 'AI rewrite access is not enabled for your account.');
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    let errorMessage = 'Failed to rewrite text';
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error || errorMessage;
    } catch {}
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data.rewrittenText || null;
}

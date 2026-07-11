import { supabase } from './supabase';

async function getAccessToken(forceRefresh = false) {
  let {
    data: { session },
  } = forceRefresh
    ? await supabase.auth.refreshSession()
    : await supabase.auth.getSession();

  const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : null;
  const expiresSoon = expiresAtMs !== null && expiresAtMs <= Date.now() + 60_000;

  if (!forceRefresh && (!session?.access_token || expiresSoon)) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      throw new Error('Your session expired. Please sign in again.');
    }
    session = data.session;
  }

  if (!session?.access_token) {
    throw new Error('Your session expired. Please sign in again.');
  }

  return session.access_token;
}

export async function authenticatedFetch(input: string, init: RequestInit = {}) {
  const makeRequest = async (forceRefresh = false) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${await getAccessToken(forceRefresh)}`);

    return fetch(input, {
      ...init,
      headers,
    });
  };

  let response = await makeRequest();
  if (response.status === 401) {
    response = await makeRequest(true);
  }

  return response;
}

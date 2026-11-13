import { parseBrandId, type BrandId } from './brands';

export const ACCOUNT_BRAND_PATH = '/api/account/onboarding';

export class BrandResolutionError extends Error {
  constructor(public readonly reason: 'request_failed' | 'bad_response' | 'unassigned') {
    super('We could not confirm your account settings.');
    this.name = 'BrandResolutionError';
  }
}

export type FetchAccountBrandDeps = {
  /** Must attach the signed-in user's access token (authenticatedFetch). */
  request: (url: string, init?: RequestInit) => Promise<Response>;
  baseUrl: string;
};

/**
 * Asks the server which brand the signed-in account belongs to. The request
 * carries only the user's token: no email, username, stored value or brand
 * hint is sent, and none is read back from anywhere but the response.
 * A missing, null or unknown value is an error, never a default.
 */
export async function fetchAccountBrand(
  { request, baseUrl }: FetchAccountBrandDeps,
  signal?: AbortSignal,
): Promise<BrandId> {
  let response: Response;
  try {
    response = await request(`${baseUrl.replace(/\/$/, '')}${ACCOUNT_BRAND_PATH}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch {
    throw new BrandResolutionError('request_failed');
  }
  if (!response.ok) throw new BrandResolutionError('request_failed');

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new BrandResolutionError('bad_response');
  }
  const brand = parseBrandId(
    body && typeof body === 'object' ? (body as { brand?: unknown }).brand : undefined,
  );
  if (!brand) throw new BrandResolutionError('unassigned');
  return brand;
}

// src/utils/rateService.ts
// Rate service for fetching mortgage rates from FRED API (mobile version)

import { API_BASE_URL } from '../lib/apiBaseUrl';

export type RateData = {
  /** 'live' came from the rates API; 'fallback' is the built-in default estimate. */
  source: 'live' | 'fallback';
  /** Time the live rates were produced. Empty for fallback rates, which have no known date. */
  updatedAt: string;
  conventional30: { apr: number; noteRate: number };
  fha30: { apr: number; noteRate: number };
  va30: { apr: number; noteRate: number };
};

// Simple in-memory cache to prevent excessive API calls
let rateCache: { data: RateData; timestamp: number } | null = null;
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

// Request deduplication: prevent multiple simultaneous API calls
let ongoingFetchPromise: Promise<RateData> | null = null;

// Fallback rates if API fails
// TODO: Update these rates periodically or create an API endpoint
const FALLBACK_RATES: RateData = {
  source: 'fallback',
  updatedAt: '',
  conventional30: { apr: 7.5, noteRate: 7.5 },
  fha30: { apr: 7.2, noteRate: 7.2 },
  va30: { apr: 6.9, noteRate: 6.9 }
};

const REQUEST_TIMEOUT_MS = 10_000;

// Set to true to enable API rate fetching (requires /api/rates endpoint)
const ENABLE_API_FETCH = true;

/**
 * Validates the rates API payload. Returns null unless every loan type has a
 * positive note rate, so a partial or malformed response is never shown as live.
 */
export function parseRatesPayload(data: any): RateData | null {
  const ok = (v: any) => typeof v?.noteRate === 'number' && v.noteRate > 0;
  if (!data || !ok(data.conventional30) || !ok(data.fha30) || !ok(data.va30)) return null;
  const entry = (v: any) => ({
    apr: typeof v.apr === 'number' && v.apr > 0 ? v.apr : v.noteRate,
    noteRate: v.noteRate,
  });
  return {
    source: 'live',
    updatedAt: typeof data.updatedAt === 'string' && data.updatedAt ? data.updatedAt : new Date().toISOString(),
    conventional30: entry(data.conventional30),
    fha30: entry(data.fha30),
    va30: entry(data.va30),
  };
}

/**
 * Fetch mortgage rates from the website's API endpoint
 * This uses the same FRED API integration as the web version
 */
export async function fetchRates(): Promise<RateData> {
  try {
    // If API fetch is disabled, return fallback rates immediately
    if (!ENABLE_API_FETCH) {
      console.log('📊 Using default rates (API fetch disabled)');
      return FALLBACK_RATES;
    }
    
    // Check cache first
    const now = Date.now();
    if (rateCache && (now - rateCache.timestamp) < CACHE_TTL) {
      console.log('✅ Using cached rate data');
      return rateCache.data;
    }
    
    // REQUEST DEDUPLICATION: If there's already an ongoing fetch, return that promise
    if (ongoingFetchPromise) {
      console.log('⏳ Waiting for ongoing rate fetch...');
      return await ongoingFetchPromise;
    }
    
    console.log('📊 Fetching fresh rate data from API...');
    
    // Create the fetch promise and store it for deduplication
    ongoingFetchPromise = (async () => {
      try {
        // Fetch from your website's API endpoint
        // You can replace this URL with your actual production URL
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let response: Response;
        try {
          response = await fetch(`${API_BASE_URL}/api/rates`, {
            headers: {
              'Accept': 'application/json',
            },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
        
        if (!response.ok) {
          console.warn(`API returned status ${response.status}, using fallback rates`);
          return FALLBACK_RATES;
        }
        
        // Check if response is HTML instead of JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.warn('API returned non-JSON response, using fallback rates');
          return FALLBACK_RATES;
        }
        
        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          console.warn('Failed to parse API response as JSON, using fallback rates');
          return FALLBACK_RATES;
        }
        
        // Validate the response has the expected structure
        const rateData = parseRatesPayload(data);
        if (rateData) {
          // Cache the result
          rateCache = { data: rateData, timestamp: Date.now() };
          console.log('✅ Cached fresh rate data');

          return rateData;
        }

        // If response doesn't have expected structure, use fallback
        console.warn('API response missing expected data, using fallback rates');
        return FALLBACK_RATES;
        
      } catch (error) {
        console.error('Error fetching rates:', error);
        return FALLBACK_RATES;
      } finally {
        // Clear the ongoing promise after completion
        ongoingFetchPromise = null;
      }
    })();
    
    return await ongoingFetchPromise;
    
  } catch (error) {
    console.error('Error in fetchRates:', error);
    ongoingFetchPromise = null;
    return FALLBACK_RATES;
  }
}

/**
 * Get rate for a specific loan type
 */
export function getRateForLoanType(rates: RateData | null, loanType: 'Conventional' | 'FHA' | 'VA' | 'DSCR'): number {
  if (!rates) {
    // Return fallback rates
    if (loanType === 'Conventional') return 7.5;
    if (loanType === 'FHA') return 7.2;
    if (loanType === 'VA') return 6.9;
    return 8.5; // DSCR
  }
  
  if (loanType === 'Conventional') return rates.conventional30.noteRate;
  if (loanType === 'FHA') return rates.fha30.noteRate;
  if (loanType === 'VA') return rates.va30.noteRate;
  return rates.conventional30.noteRate; // DSCR uses conventional rate
}

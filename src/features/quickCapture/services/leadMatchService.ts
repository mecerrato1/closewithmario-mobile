// src/features/quickCapture/services/leadMatchService.ts
import { supabase } from '../../../lib/supabase';
import type { Lead, MetaLead } from '../../../lib/types/leads';
import type { QuickCapture } from '../types';

export type MatchedLead = {
  id: string;
  source: 'lead' | 'meta';
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  created_at: string;
  matchReason: string; // e.g. "Phone match", "Email match"
  loan_purpose?: string | null;
  realtor_id?: string | null;
  // Lead-specific
  message?: string | null;
  source_field?: string | null;
  price?: number | null;
  down_payment?: number | null;
  credit_score?: number | null;
  // Meta-specific
  campaign_name?: string | null;
  platform?: string | null;
  ad_name?: string | null;
  additional_notes?: string | null;
  price_range?: string | null;
  down_payment_saved?: string | null;
  credit_range?: string | null;
};

/**
 * Find existing leads/meta_ads that may match a quick capture (by phone or email).
 */
export async function findMatchingLeads(
  capture: QuickCapture
): Promise<{ matches: MatchedLead[]; error: Error | null }> {
  try {
    const matches: MatchedLead[] = [];
    const seenIds = new Set<string>();

    // Normalize phone: strip non-digits, take last 10
    const normalizedPhone = capture.phone
      ? capture.phone.replace(/\D/g, '').slice(-10)
      : null;
    const normalizedEmail = capture.email?.trim().toLowerCase() || null;

    if (!normalizedPhone && !normalizedEmail) {
      return { matches: [], error: null };
    }

    // --- Search leads table ---
    if (normalizedPhone) {
      const { data: phoneLeads } = await supabase
        .from('leads')
        .select('id, first_name, last_name, email, phone, status, created_at, loan_purpose, message, realtor_id, source, price, down_payment, credit_score')
        .ilike('phone', `%${normalizedPhone}%`)
        .limit(10);

      for (const row of phoneLeads || []) {
        if (!seenIds.has(row.id)) {
          seenIds.add(row.id);
          matches.push({
            id: row.id,
            source: 'lead',
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            phone: row.phone,
            status: row.status,
            created_at: row.created_at,
            matchReason: 'Phone match',
            loan_purpose: row.loan_purpose,
            message: row.message,
            realtor_id: row.realtor_id,
            source_field: row.source,
            price: row.price,
            down_payment: row.down_payment,
            credit_score: row.credit_score,
          });
        }
      }
    }

    if (normalizedEmail) {
      const { data: emailLeads } = await supabase
        .from('leads')
        .select('id, first_name, last_name, email, phone, status, created_at, loan_purpose, message, realtor_id, source, price, down_payment, credit_score')
        .ilike('email', normalizedEmail)
        .limit(10);

      for (const row of emailLeads || []) {
        if (!seenIds.has(row.id)) {
          seenIds.add(row.id);
          matches.push({
            id: row.id,
            source: 'lead',
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            phone: row.phone,
            status: row.status,
            created_at: row.created_at,
            matchReason: 'Email match',
            loan_purpose: row.loan_purpose,
            message: row.message,
            realtor_id: row.realtor_id,
            source_field: row.source,
            price: row.price,
            down_payment: row.down_payment,
            credit_score: row.credit_score,
          });
        }
      }
    }

    // --- Search meta_ads table ---
    if (normalizedPhone) {
      const { data: phoneMeta } = await supabase
        .from('meta_ads')
        .select('id, first_name, last_name, email, phone, status, created_at, campaign_name, platform, ad_name, additional_notes, realtor_id, loan_purpose, price_range, down_payment_saved, credit_range')
        .ilike('phone', `%${normalizedPhone}%`)
        .limit(10);

      for (const row of phoneMeta || []) {
        const metaId = `meta_${row.id}`;
        if (!seenIds.has(metaId)) {
          seenIds.add(metaId);
          matches.push({
            id: row.id,
            source: 'meta',
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            phone: row.phone,
            status: row.status,
            created_at: row.created_at,
            matchReason: 'Phone match',
            campaign_name: row.campaign_name,
            platform: row.platform,
            ad_name: row.ad_name,
            additional_notes: row.additional_notes,
            realtor_id: row.realtor_id,
            loan_purpose: row.loan_purpose,
            price_range: row.price_range,
            down_payment_saved: row.down_payment_saved,
            credit_range: row.credit_range,
          });
        }
      }
    }

    if (normalizedEmail) {
      const { data: emailMeta } = await supabase
        .from('meta_ads')
        .select('id, first_name, last_name, email, phone, status, created_at, campaign_name, platform, ad_name, additional_notes, realtor_id, loan_purpose, price_range, down_payment_saved, credit_range')
        .ilike('email', normalizedEmail)
        .limit(10);

      for (const row of emailMeta || []) {
        const metaId = `meta_${row.id}`;
        if (!seenIds.has(metaId)) {
          seenIds.add(metaId);
          matches.push({
            id: row.id,
            source: 'meta',
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            phone: row.phone,
            status: row.status,
            created_at: row.created_at,
            matchReason: 'Email match',
            campaign_name: row.campaign_name,
            platform: row.platform,
            ad_name: row.ad_name,
            additional_notes: row.additional_notes,
            realtor_id: row.realtor_id,
            loan_purpose: row.loan_purpose,
            price_range: row.price_range,
            down_payment_saved: row.down_payment_saved,
            credit_range: row.credit_range,
          });
        }
      }
    }

    return { matches, error: null };
  } catch (err: any) {
    console.error('[leadMatch] search error:', err);
    return { matches: [], error: err };
  }
}

/**
 * Search leads and meta_ads by free-text query (for manual "Link to Existing Lead").
 */
export async function searchLeads(
  query: string
): Promise<{ results: MatchedLead[]; error: Error | null }> {
  try {
    const q = query.trim();
    if (!q) return { results: [], error: null };

    const results: MatchedLead[] = [];
    const seenIds = new Set<string>();

    // Search leads by name, phone, or email
    const { data: leadResults } = await supabase
      .from('leads')
      .select('id, first_name, last_name, email, phone, status, created_at, loan_purpose, message, realtor_id, source, price, down_payment, credit_score')
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(20);

    for (const row of leadResults || []) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        results.push({
          id: row.id,
          source: 'lead',
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          phone: row.phone,
          status: row.status,
          created_at: row.created_at,
          matchReason: 'Search',
          loan_purpose: row.loan_purpose,
          message: row.message,
          realtor_id: row.realtor_id,
          source_field: row.source,
          price: row.price,
          down_payment: row.down_payment,
          credit_score: row.credit_score,
        });
      }
    }

    // Search meta_ads
    const { data: metaResults } = await supabase
      .from('meta_ads')
      .select('id, first_name, last_name, email, phone, status, created_at, campaign_name, platform, ad_name, additional_notes, realtor_id, loan_purpose, price_range, down_payment_saved, credit_range')
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(20);

    for (const row of metaResults || []) {
      const metaId = `meta_${row.id}`;
      if (!seenIds.has(metaId)) {
        seenIds.add(metaId);
        results.push({
          id: row.id,
          source: 'meta',
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          phone: row.phone,
          status: row.status,
          created_at: row.created_at,
          matchReason: 'Search',
          campaign_name: row.campaign_name,
          platform: row.platform,
          ad_name: row.ad_name,
          additional_notes: row.additional_notes,
          realtor_id: row.realtor_id,
          loan_purpose: row.loan_purpose,
          price_range: row.price_range,
          down_payment_saved: row.down_payment_saved,
          credit_range: row.credit_range,
        });
      }
    }

    return { results, error: null };
  } catch (err: any) {
    console.error('[leadMatch] search error:', err);
    return { results: [], error: err };
  }
}

/**
 * Merge selected field values from quick capture into an existing lead/meta_ad.
 * Also marks the quick capture as converted and transfers attachments.
 */
export async function mergeIntoExistingLead(
  captureId: string,
  targetId: string,
  targetSource: 'lead' | 'meta',
  fieldsToUpdate: Record<string, any>
): Promise<{ error: Error | null }> {
  try {
    const table = targetSource === 'lead' ? 'leads' : 'meta_ads';

    // 1. Store the quick capture ID as source_detail so the
    //    "View Quick Capture & Photos" button works on the lead detail view
    fieldsToUpdate.source_detail = captureId;

    // 2. Update the existing lead with merged fields
    const { error: updateError } = await supabase
      .from(table)
      .update(fieldsToUpdate)
      .eq('id', targetId);

    if (updateError) {
      console.error('[leadMerge] update error:', updateError.message);
      return { error: new Error(updateError.message) };
    }

    // 3. Mark quick capture as converted
    // converted_lead_id FK references leads table only, so only set it for lead merges
    const captureUpdate: Record<string, any> = {
      status: 'converted',
      last_touched_at: new Date().toISOString(),
    };
    if (targetSource === 'lead') {
      captureUpdate.converted_lead_id = targetId;
    } else {
      captureUpdate.converted_meta_ad_id = targetId;
    }

    const { error: captureError } = await supabase
      .from('quick_captures')
      .update(captureUpdate)
      .eq('id', captureId);

    if (captureError) {
      console.error('[leadMerge] capture status update error:', captureError.message);
      // Not fatal — the merge succeeded
    }

    return { error: null };
  } catch (err: any) {
    console.error('[leadMerge] exception:', err);
    return { error: err };
  }
}

// Lead tracking utilities for Supabase
import { supabase } from '../supabase';
import { TrackingReason } from '../types/leads';

type LeadSource = 'lead' | 'meta';

// Statuses that auto-track
const AUTO_TRACK_STATUSES = ['gathering_docs', 'qualified'];
// Statuses that auto-untrack
const AUTO_UNTRACK_STATUSES = ['closed', 'unqualified'];

/**
 * Get the tracking reason based on status
 */
export function getAutoTrackingReason(status: string): TrackingReason {
  if (status === 'gathering_docs') return 'auto_docs_requested';
  if (status === 'qualified') return 'auto_qualified';
  return null;
}

/**
 * Check if a status should trigger auto-tracking
 */
export function shouldAutoTrack(status: string): boolean {
  return AUTO_TRACK_STATUSES.includes(status);
}

/**
 * Check if a status should trigger auto-untracking
 */
export function shouldAutoUntrack(status: string): boolean {
  return AUTO_UNTRACK_STATUSES.includes(status);
}

/**
 * Toggle lead tracking status
 */
export async function toggleLeadTracking(
  leadId: string,
  source: LeadSource,
  isTracked: boolean,
  reason: TrackingReason = 'manual'
): Promise<{ success: boolean; error?: string }> {
  const table = source === 'meta' ? 'meta_ads' : 'leads';
  
  const updateData = isTracked
    ? { is_tracked: true, tracking_reason: reason }
    : { is_tracked: false, tracking_reason: null };

  const { error } = await supabase
    .from(table)
    .update(updateData)
    .eq('id', leadId);

  if (error) {
    console.error('Error toggling lead tracking:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Update tracking note for a lead
 */
export async function updateTrackingNote(
  leadId: string,
  source: LeadSource,
  note: string
): Promise<{ success: boolean; error?: string }> {
  const table = source === 'meta' ? 'meta_ads' : 'leads';

  const { error } = await supabase
    .from(table)
    .update({
      tracking_note: note || null,
      tracking_note_updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  if (error) {
    console.error('Error updating tracking note:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Apply auto-tracking logic when status changes
 * Returns the new tracking state if it changed, null otherwise
 */
export async function applyAutoTracking(
  leadId: string,
  source: LeadSource,
  newStatus: string,
  currentIsTracked: boolean,
  currentReason: TrackingReason
): Promise<{ changed: boolean; isTracked: boolean; reason: TrackingReason }> {
  // Auto-track for gathering_docs or qualified
  if (shouldAutoTrack(newStatus) && !currentIsTracked) {
    const reason = getAutoTrackingReason(newStatus);
    await toggleLeadTracking(leadId, source, true, reason);
    return { changed: true, isTracked: true, reason };
  }

  // Auto-untrack for closed or unqualified (only if auto-tracked, not manual)
  if (shouldAutoUntrack(newStatus) && currentIsTracked && currentReason !== 'manual') {
    await toggleLeadTracking(leadId, source, false, null);
    return { changed: true, isTracked: false, reason: null };
  }

  return { changed: false, isTracked: currentIsTracked, reason: currentReason };
}

/**
 * Get human-readable tracking reason label
 */
export function getTrackingReasonLabel(reason: TrackingReason): string {
  switch (reason) {
    case 'manual':
      return 'Manually tracked';
    case 'auto_docs_requested':
      return 'Auto-tracked: Gathering docs';
    case 'auto_qualified':
      return 'Auto-tracked: Qualified';
    default:
      return '';
  }
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { API_BASE_URL } from '../../lib/apiBaseUrl';
import { authenticatedFetch } from '../../lib/authenticatedFetch';
import { supabase } from '../../lib/supabase';
import { hoursSummary, showsAvailabilitySwitch, type ProgramSchedule } from './availability';

export type LeadAvailability = {
  officerId: string;
  enabled: boolean;
  adminPaused: boolean;
  hours: string;
};

async function load(userId: string): Promise<LeadAvailability | null> {
  const membership = await authenticatedFetch(`${API_BASE_URL}/api/crm/lead-program?section=membership`);
  if (!membership.ok) throw new Error('Membership unavailable');
  if (!showsAvailabilitySwitch(await membership.json())) return null;

  const officer = await supabase
    .from('loan_officers')
    .select('id,lead_eligible')
    .eq('user_id', userId)
    .maybeSingle();
  if (officer.error) throw officer.error;
  if (!officer.data) return null;

  const pause = await supabase.rpc('my_meta_assignments_paused');
  if (pause.error) throw pause.error;

  let hours = 'Hours unavailable';
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/api/crm/lead-program?section=availability`);
    if (response.ok) {
      const data = (await response.json()) as {
        availability: { timezone: string | null; schedule: ProgramSchedule | null } | null;
      };
      hours = hoursSummary(data.availability?.schedule, data.availability?.timezone);
    }
  } catch {
    // The switch still works without the hours line.
  }

  return {
    officerId: officer.data.id,
    enabled: officer.data.lead_eligible === true,
    adminPaused: pause.data === true,
    hours,
  };
}

/** The signed-in loan officer's "receive new leads" setting, shared with the website. */
export function useLeadAvailability(userId: string | undefined, active: boolean) {
  const [availability, setAvailability] = useState<LeadAvailability | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const savingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId || savingRef.current) return;
    const current = ++version.current;
    try {
      const next = await load(userId);
      if (current !== version.current) return;
      setAvailability(next);
      setError(null);
    } catch (caught) {
      // Keep the last confirmed answer; a failed check is not "off" or "not a member".
      console.warn('[leadAvailability] could not load:', caught);
    }
  }, [userId]);

  useEffect(() => {
    version.current += 1;
    setAvailability(null);
    setError(null);
  }, [userId]);

  // Reload when the dashboard comes back, so a change made in settings or on the website shows.
  useEffect(() => {
    if (!active) return;
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [active, refresh]);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      if (!availability || !userId || savingRef.current || availability.adminPaused) return;
      savingRef.current = true;
      version.current += 1;
      setSaving(true);
      setError(null);
      try {
        const result = await supabase
          .from('loan_officers')
          .update({ lead_eligible: enabled })
          .eq('id', availability.officerId)
          .eq('user_id', userId)
          .select('lead_eligible')
          .single();
        if (result.error) throw result.error;
        setAvailability({ ...availability, enabled: result.data.lead_eligible === true });
      } catch (caught) {
        console.warn('[leadAvailability] could not save:', caught);
        setError('Could not save. Please try again.');
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [availability, userId]
  );

  return { availability, saving, error, setEnabled, refresh };
}

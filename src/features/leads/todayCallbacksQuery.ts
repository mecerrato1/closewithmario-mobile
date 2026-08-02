export const TODAY_CALLBACK_COLUMNS =
  'id, scheduled_for, title, notes, lead_id, meta_ad_id, completed_at';

type SupabaseQueryClient = {
  from: (table: string) => any;
};

export function queryIncompleteTodayCallbacks(
  client: SupabaseQueryClient,
  userId: string,
  now = new Date()
) {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  return client
    .from('lead_callbacks')
    .select(TODAY_CALLBACK_COLUMNS)
    .gte('scheduled_for', todayStart.toISOString())
    .lte('scheduled_for', todayEnd.toISOString())
    .eq('created_by', userId)
    .is('completed_at', null)
    .order('scheduled_for', { ascending: true });
}

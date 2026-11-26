// The stages a loan moves through. Other statuses (nurturing, credit work, lost…)
// sit beside the pipeline rather than on it.
export const PIPELINE_STAGE_KEYS = [
  'new',
  'attempting_contact',
  'contacted',
  'gathering_docs',
  'qualified',
  'in_process',
  'closed',
] as const;

/** How many stages are filled for a status; 0 when it is off the pipeline. */
export function pipelineProgress(status: string | null | undefined): number {
  return PIPELINE_STAGE_KEYS.indexOf((status || 'new') as (typeof PIPELINE_STAGE_KEYS)[number]) + 1;
}

/** A one or two line summary of a history entry. */
export function activityPreview(activity: {
  activity_type: string;
  notes?: string | null;
  subject?: string | null;
}): string {
  const text = activity.activity_type === 'email' ? activity.subject || activity.notes : activity.notes;
  return (text ?? '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
}

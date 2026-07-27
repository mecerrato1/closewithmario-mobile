import {
  fetchCrmLeadDetailBootstrap,
  fetchCrmLeadRecord,
  type CrmLeadSource,
  type LeadDetailBootstrap,
} from './crmLeadApi';
import type { Lead, MetaLead } from '../../lib/types/leads';

export type LeadDetailLoadResult = {
  bootstrap: LeadDetailBootstrap | null;
  lead: Lead | MetaLead;
  usedRecordFallback: boolean;
  bootstrapError: string | null;
};

type LoadDependencies = {
  bootstrap?: typeof fetchCrmLeadDetailBootstrap;
  record?: typeof fetchCrmLeadRecord;
};

export async function loadLeadDetail(
  leadId: string,
  leadSource: CrmLeadSource,
  options: { signal?: AbortSignal; dependencies?: LoadDependencies } = {}
): Promise<LeadDetailLoadResult> {
  const loadBootstrap =
    options.dependencies?.bootstrap ?? fetchCrmLeadDetailBootstrap;
  const loadRecord = options.dependencies?.record ?? fetchCrmLeadRecord;
  try {
    const bootstrap = await loadBootstrap(leadId, leadSource, {
      signal: options.signal,
    });
    return {
      bootstrap,
      lead: bootstrap.lead,
      usedRecordFallback: false,
      bootstrapError: null,
    };
  } catch (bootstrapError) {
    if (options.signal?.aborted) throw bootstrapError;
    const lead = await loadRecord(leadId, leadSource, {
      signal: options.signal,
    });
    return {
      bootstrap: null,
      lead,
      usedRecordFallback: true,
      bootstrapError:
        bootstrapError instanceof Error
          ? bootstrapError.message
          : 'Could not load the complete lead details.',
    };
  }
}

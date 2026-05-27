import { supabase } from '../supabase';
import type {
  ApprovalRecipeFormState,
  ApprovalRecipeLeadSource,
  ApprovalRecipeRow,
} from '../types/approvalRecipe';

const AUS_FINDINGS_BUCKET = 'aus-findings';

const trimOrNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const numberOrNull = (value: string) => {
  const normalized = value.replace(/[$,%\s,]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const integerOrNull = (value: string) => {
  const parsed = numberOrNull(value);
  return parsed == null ? null : Math.round(parsed);
};

const getRawErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return '';
};

const getRawErrorCode = (error: unknown) => {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : '';
  }
  return '';
};

export function getApprovalRecipeErrorMessage(error: unknown, fallback: string) {
  const message = getRawErrorMessage(error);
  const code = getRawErrorCode(error);
  const lowerMessage = message.toLowerCase();

  if (
    code === 'PGRST205' ||
    lowerMessage.includes('schema cache') ||
    lowerMessage.includes('lead_approval_recipes')
  ) {
    return 'Approval Recipe setup is pending. Run the latest Supabase migration, then refresh.';
  }

  if (lowerMessage.includes('bucket not found') || lowerMessage.includes(AUS_FINDINGS_BUCKET)) {
    return 'AUS findings storage is pending. Run the latest Supabase migration to create the bucket.';
  }

  return message || fallback;
}

export async function fetchActiveApprovalRecipe(params: {
  leadId: string;
  leadSource: ApprovalRecipeLeadSource;
}): Promise<{ data: ApprovalRecipeRow | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('lead_approval_recipes')
      .select('*')
      .eq('lead_id', params.leadId)
      .eq('lead_source', params.leadSource)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        data: null,
        error: new Error(getApprovalRecipeErrorMessage(error, 'Unable to load recipe')),
      };
    }

    return { data: (data as ApprovalRecipeRow | null) || null, error: null };
  } catch (error) {
    return {
      data: null,
      error: new Error(getApprovalRecipeErrorMessage(error, 'Unable to load recipe')),
    };
  }
}

export async function saveApprovalRecipe(params: {
  recipeId?: string | null;
  leadId: string;
  leadSource: ApprovalRecipeLeadSource;
  form: ApprovalRecipeFormState;
}): Promise<{ data: ApprovalRecipeRow | null; error: Error | null }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const payload = {
      lead_id: params.leadId,
      lead_source: params.leadSource,
      aus_system: trimOrNull(params.form.ausSystem),
      recommendation: trimOrNull(params.form.recommendation),
      findings_date: trimOrNull(params.form.findingsDate),
      product_type: trimOrNull(params.form.productType),
      loan_purpose: trimOrNull(params.form.loanPurpose),
      property_type: trimOrNull(params.form.propertyType),
      occupancy: trimOrNull(params.form.occupancy),
      purchase_price: numberOrNull(params.form.purchasePrice),
      loan_amount: numberOrNull(params.form.loanAmount),
      ltv: numberOrNull(params.form.ltv),
      cltv: numberOrNull(params.form.cltv),
      hcltv: numberOrNull(params.form.hcltv),
      dti: numberOrNull(params.form.dti),
      housing_ratio: numberOrNull(params.form.housingRatio),
      credit_score: integerOrNull(params.form.creditScore),
      reserves: trimOrNull(params.form.reserves),
      strategy_notes: trimOrNull(params.form.strategyNotes),
      debt_strategy: trimOrNull(params.form.debtStrategy),
      key_conditions: trimOrNull(params.form.keyConditions),
      updated_by: user?.id || null,
    };

    const query = params.recipeId
      ? supabase
          .from('lead_approval_recipes')
          .update(payload)
          .eq('id', params.recipeId)
          .select('*')
          .single()
      : supabase
          .from('lead_approval_recipes')
          .insert({ ...payload, created_by: user?.id || null })
          .select('*')
          .single();

    const { data, error } = await query;

    if (error) {
      return {
        data: null,
        error: new Error(getApprovalRecipeErrorMessage(error, 'Unable to save recipe')),
      };
    }

    return { data: data as ApprovalRecipeRow, error: null };
  } catch (error) {
    return {
      data: null,
      error: new Error(getApprovalRecipeErrorMessage(error, 'Unable to save recipe')),
    };
  }
}

export async function getApprovalRecipeFindingsUrl(
  storagePath: string,
  expiresInSeconds = 60 * 5
): Promise<{ url: string | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.storage
      .from(AUS_FINDINGS_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error) {
      return {
        url: null,
        error: new Error(getApprovalRecipeErrorMessage(error, 'Unable to open AUS findings')),
      };
    }

    return { url: data?.signedUrl || null, error: null };
  } catch (error) {
    return {
      url: null,
      error: new Error(getApprovalRecipeErrorMessage(error, 'Unable to open AUS findings')),
    };
  }
}

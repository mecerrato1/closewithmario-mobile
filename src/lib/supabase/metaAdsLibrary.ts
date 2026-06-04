import { supabase } from '../supabase';
import type { UserRole } from '../roles';

const PAGE_SIZE = 1000;

const META_AD_LIBRARY_SELECT =
  'id, created_at, first_name, last_name, ad_id, adset_name, platform, campaign_name, ad_name, form_data, preferred_language, credit_range, income_type, purchase_timeline, price_range, down_payment_saved, has_realtor, loan_purpose, county_interest, monthly_income, subject_address, additional_notes, metadata, raw';

type MetaAdLibrarySourceRow = {
  id: string;
  created_at: string | null;
  first_name: string | null;
  last_name: string | null;
  ad_id: string | null;
  adset_name: string | null;
  platform: string | null;
  campaign_name: string | null;
  ad_name: string | null;
  form_data?: Record<string, unknown> | null;
  preferred_language?: unknown;
  credit_range?: unknown;
  income_type?: unknown;
  purchase_timeline?: unknown;
  price_range?: unknown;
  down_payment_saved?: unknown;
  has_realtor?: unknown;
  loan_purpose?: unknown;
  county_interest?: unknown;
  monthly_income?: unknown;
  subject_address?: unknown;
  additional_notes?: unknown;
  metadata?: Record<string, unknown> | null;
  raw?: Record<string, unknown> | null;
};

type SavedCreative = {
  imageUrl: string | null;
  thumbnailUrl: string | null;
  headline: string | null;
  body: string | null;
  description: string | null;
  adName: string | null;
  adsetName: string | null;
  campaignName: string | null;
};

export type MetaAdLibraryFormField = {
  key: string;
  label: string;
};

export type MetaAdLibraryItem = {
  key: string;
  adId: string | null;
  adName: string | null;
  campaignName: string | null;
  adsetName: string | null;
  platform: string | null;
  leadCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sampleLeadName: string | null;
  savedImageUrl: string | null;
  thumbnailUrl: string | null;
  headline: string | null;
  body: string | null;
  description: string | null;
  formFields: MetaAdLibraryFormField[];
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getTrimmedString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
};

const normalizeKeyPart = (value: string | null) =>
  value?.trim().toLowerCase().replace(/\s+/g, ' ') || '';

const isAfter = (candidate: string | null, current: string | null) => {
  if (!candidate) return false;
  if (!current) return true;
  return new Date(candidate).getTime() > new Date(current).getTime();
};

const isBefore = (candidate: string | null, current: string | null) => {
  if (!candidate) return false;
  if (!current) return true;
  return new Date(candidate).getTime() < new Date(current).getTime();
};

const getLeadDisplayName = (row: MetaAdLibrarySourceRow) => {
  const fullName = [row.first_name, row.last_name].map((value) => value?.trim()).filter(Boolean).join(' ');
  return fullName || null;
};

const normalizeFieldKey = (key: string) =>
  key
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

const FORM_FIELD_LABEL_MAP: Record<string, string> = {
  additional_notes: 'Additional Notes',
  are_you_working_with_a_realtor: 'Has Realtor',
  county_interest: 'County Interest',
  credit_range: 'Credit Range',
  do_you_currently_work_with_a_realtor: 'Has Realtor',
  do_you_have_a_va_certificate: 'VA Certificate',
  down_payment_saved: 'Down Payment Saved',
  has_realtor: 'Has Realtor',
  how_did_you_hear_about_us: 'How Did You Hear About Us',
  how_much_have_you_saved_or_plan_to_save_for_your_home_purchase: 'Down Payment Saved',
  income_type: 'Income Type',
  loan_purpose: 'Loan Purpose',
  monthly_income: 'Monthly Income',
  preferred_language: 'Preferred Language',
  price_range: 'Price Range',
  purchase_timeline: 'Purchase Timeline',
  subject_address: 'Property Address',
  what_is_your_current_credit_score_range: 'Credit Range',
  what_price_range_are_you_shopping_in: 'Price Range',
  what_type_of_income_do_you_earn: 'Income Type',
  when_are_you_looking_to_buy_your_home: 'Purchase Timeline',
  which_county_are_you_looking_to_buy_in: 'County Interest',
  which_county_you_are_looking_to_buy_in: 'County Interest',
};

const FORM_FIELD_EXCLUDE_KEYS = new Set([
  'ad_name',
  'ad_set',
  'campaign_name',
  'created_time',
  'email',
  'first_name',
  'form_id',
  'full_name',
  'id',
  'inbox_url',
  'last_name',
  'leadgen_id',
  'meta_ad_notes',
  'name',
  'notes',
  'phone',
  'phone_number',
  'platform',
]);

const FORM_FIELD_ORDER = [
  'county_interest',
  'which_county_you_are_looking_to_buy_in',
  'which_county_are_you_looking_to_buy_in',
  'preferred_language',
  'has_realtor',
  'are_you_working_with_a_realtor',
  'do_you_currently_work_with_a_realtor',
  'income_type',
  'what_type_of_income_do_you_earn',
  'monthly_income',
  'price_range',
  'what_price_range_are_you_shopping_in',
  'purchase_timeline',
  'when_are_you_looking_to_buy_your_home',
  'credit_range',
  'what_is_your_current_credit_score_range',
  'down_payment_saved',
  'how_much_have_you_saved_or_plan_to_save_for_your_home_purchase',
  'do_you_have_a_va_certificate',
  'loan_purpose',
  'subject_address',
  'how_did_you_hear_about_us',
  'additional_notes',
];

const getFieldOrder = (key: string) => {
  const index = FORM_FIELD_ORDER.indexOf(normalizeFieldKey(key));
  return index === -1 ? FORM_FIELD_ORDER.length + 1 : index;
};

const formatQuestionLabel = (key: string) => {
  const normalized = normalizeFieldKey(key);
  return (
    FORM_FIELD_LABEL_MAP[normalized] ||
    normalized
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
};

const hasFormFieldValue = (value: unknown) => {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some(hasFormFieldValue);
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

const getRawFieldDataEntries = (raw: Record<string, unknown> | null) => {
  if (!Array.isArray(raw?.field_data)) return [];

  return raw.field_data
    .filter(isPlainObject)
    .map((field) => ({
      key: getTrimmedString(field.name),
      value: field.values,
    }))
    .filter((field): field is { key: string; value: unknown } => Boolean(field.key));
};

const getFormFields = (row: MetaAdLibrarySourceRow): MetaAdLibraryFormField[] => {
  const raw = isPlainObject(row.raw) ? row.raw : null;
  const entries: Array<{ key: string; value: unknown }> = [];

  if (isPlainObject(row.form_data)) {
    Object.entries(row.form_data).forEach(([key, value]) => entries.push({ key, value }));
  }

  entries.push(...getRawFieldDataEntries(raw));

  [
    ['preferred_language', row.preferred_language],
    ['has_realtor', row.has_realtor],
    ['income_type', row.income_type],
    ['monthly_income', row.monthly_income],
    ['price_range', row.price_range],
    ['purchase_timeline', row.purchase_timeline],
    ['credit_range', row.credit_range],
    ['down_payment_saved', row.down_payment_saved],
    ['loan_purpose', row.loan_purpose],
    ['county_interest', row.county_interest],
    ['subject_address', row.subject_address],
    ['additional_notes', row.additional_notes],
  ].forEach(([key, value]) => entries.push({ key: key as string, value }));

  const seenLabels = new Set<string>();

  return entries
    .filter(({ key, value }) => {
      const normalized = normalizeFieldKey(key);
      return !FORM_FIELD_EXCLUDE_KEYS.has(normalized) && hasFormFieldValue(value);
    })
    .sort((left, right) => getFieldOrder(left.key) - getFieldOrder(right.key))
    .map(({ key }) => ({
      key: normalizeFieldKey(key),
      label: formatQuestionLabel(key),
    }))
    .filter((field) => {
      if (seenLabels.has(field.label)) return false;
      seenLabels.add(field.label);
      return true;
    });
};

const mergeFormFields = (
  current: MetaAdLibraryFormField[],
  incoming: MetaAdLibraryFormField[]
) => {
  const fieldsByLabel = new Map<string, MetaAdLibraryFormField>();

  [...current, ...incoming].forEach((field) => {
    if (!fieldsByLabel.has(field.label)) {
      fieldsByLabel.set(field.label, field);
    }
  });

  return Array.from(fieldsByLabel.values()).sort((left, right) => getFieldOrder(left.key) - getFieldOrder(right.key));
};

const getSavedCreative = (row: MetaAdLibrarySourceRow): SavedCreative => {
  const metadata = isPlainObject(row.metadata) ? row.metadata : null;
  const raw = isPlainObject(row.raw) ? row.raw : null;
  const metadataRaw = isPlainObject(metadata?.raw) ? metadata.raw : null;

  const creativeCandidates = [
    metadata?.ad_creative,
    raw?.ad_creative,
    metadataRaw?.ad_creative,
    metadata?.saved_ad_creative,
    metadata?.creative,
  ];

  const creative = creativeCandidates.find(isPlainObject) || null;

  if (!creative) {
    return {
      imageUrl: null,
      thumbnailUrl: null,
      headline: null,
      body: null,
      description: null,
      adName: null,
      adsetName: null,
      campaignName: null,
    };
  }

  const imageUrl = getTrimmedString(creative.image_url);
  const thumbnailUrl = getTrimmedString(creative.thumbnail_url);

  return {
    imageUrl: imageUrl || thumbnailUrl,
    thumbnailUrl,
    headline: getTrimmedString(creative.headline),
    body: getTrimmedString(creative.body),
    description: getTrimmedString(creative.description),
    adName: getTrimmedString(creative.ad_name),
    adsetName: getTrimmedString(creative.adset_name),
    campaignName: getTrimmedString(creative.campaign_name),
  };
};

const getLibraryKey = (params: {
  adId: string | null;
  adName: string | null;
  campaignName: string | null;
  platform: string | null;
  savedImageUrl: string | null;
}) => {
  if (params.adId) {
    return `ad:${params.adId}`;
  }

  return [
    'fallback',
    normalizeKeyPart(params.adName),
    normalizeKeyPart(params.campaignName),
    normalizeKeyPart(params.platform),
    normalizeKeyPart(params.savedImageUrl),
  ].join(':');
};

function buildMetaAdLibrary(rows: MetaAdLibrarySourceRow[]): MetaAdLibraryItem[] {
  const grouped = new Map<string, MetaAdLibraryItem>();

  rows.forEach((row) => {
    const savedCreative = getSavedCreative(row);
    const adId = getTrimmedString(row.ad_id);
    const adName = getTrimmedString(row.ad_name) || savedCreative.adName;
    const campaignName = getTrimmedString(row.campaign_name) || savedCreative.campaignName;
    const adsetName = getTrimmedString(row.adset_name) || savedCreative.adsetName;
    const platform = getTrimmedString(row.platform);
    const savedImageUrl = savedCreative.imageUrl;
    const thumbnailUrl = savedCreative.thumbnailUrl;
    const formFields = getFormFields(row);
    const hasAdSignal = Boolean(
      adId ||
        adName ||
        campaignName ||
        savedImageUrl ||
        savedCreative.headline ||
        savedCreative.body ||
        savedCreative.description
    );

    if (!hasAdSignal) return;

    const key = getLibraryKey({ adId, adName, campaignName, platform, savedImageUrl });
    const leadName = getLeadDisplayName(row);
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        key,
        adId,
        adName,
        campaignName,
        adsetName,
        platform,
        leadCount: 1,
        firstSeenAt: row.created_at,
        lastSeenAt: row.created_at,
        sampleLeadName: leadName,
        savedImageUrl,
        thumbnailUrl,
        headline: savedCreative.headline,
        body: savedCreative.body,
        description: savedCreative.description,
        formFields,
      });
      return;
    }

    existing.leadCount += 1;

    if (isAfter(row.created_at, existing.lastSeenAt)) {
      existing.lastSeenAt = row.created_at;
      existing.sampleLeadName = leadName || existing.sampleLeadName;
    }

    if (isBefore(row.created_at, existing.firstSeenAt)) {
      existing.firstSeenAt = row.created_at;
    }

    existing.adName = existing.adName || adName;
    existing.campaignName = existing.campaignName || campaignName;
    existing.adsetName = existing.adsetName || adsetName;
    existing.platform = existing.platform || platform;
    existing.savedImageUrl = existing.savedImageUrl || savedImageUrl;
    existing.thumbnailUrl = existing.thumbnailUrl || thumbnailUrl;
    existing.headline = existing.headline || savedCreative.headline;
    existing.body = existing.body || savedCreative.body;
    existing.description = existing.description || savedCreative.description;
    existing.formFields = mergeFormFields(existing.formFields, formFields);
  });

  return Array.from(grouped.values()).sort((a, b) => {
    const bTime = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
    const aTime = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
    return bTime - aTime;
  });
}

export async function fetchMetaAdsLibrary(userRole: UserRole): Promise<MetaAdLibraryItem[]> {
  if (userRole !== 'super_admin') {
    throw new Error('Ads Library is only available to super admins.');
  }

  const rows: MetaAdLibrarySourceRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('meta_ads')
      .select(META_AD_LIBRARY_SELECT)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = (data || []) as MetaAdLibrarySourceRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return buildMetaAdLibrary(rows);
}

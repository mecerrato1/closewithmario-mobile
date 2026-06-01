import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Linking,
  Modal,
  FlatList,
  Image,
  ActivityIndicator,
  Platform,
  RefreshControl,
  AppState,
  Animated,
  LayoutAnimation,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
  Clipboard,
  Share,
  StyleSheet,
  useWindowDimensions,
  ActionSheetIOS,
  type ImageSourcePropType,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Session } from '@supabase/supabase-js';
import { Audio, InterruptionModeIOS } from 'expo-av';
import RenderHTML from 'react-native-render-html';
import { WebView } from 'react-native-webview';
import type { Lead, MetaLead, SelectedLeadRef, Activity, LoanOfficer, Realtor, TrackingReason, CoBorrowerInfo, LoanOriginatorInfo } from '../lib/types/leads';
import type { UserRole } from '../lib/roles';
import { supabase } from '../lib/supabase';
import { getUserRole, getUserTeamMemberId, canSeeAllLeads } from '../lib/roles';
import { TEXT_TEMPLATES, fetchLeadTemplates, fillTemplate, getTemplateText, getTemplateName, getTemplateSubject, formatPhoneNumber, type TemplateVariables, type TextTemplate } from '../lib/textTemplates';
import { STATUSES, STATUS_DISPLAY_MAP, STATUS_COLOR_MAP, getLeadAlert, formatStatus, getTimeAgo, sortLeadsByLastTouchedDesc } from '../lib/leadsHelpers';
import { scheduleLeadCallback } from '../lib/callbacks';
import DateTimePicker from '@react-native-community/datetimepicker';
import { styles } from '../styles/appStyles';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors } from '../styles/theme';
import { parseRecordingUrl } from '../utils/parseRecordingUrl';
import { saveContact } from '../utils/vcard';
import { SmsMessaging } from '../components/SmsMessaging';
import { MetaDmMessaging } from '../components/MetaDmMessaging';
import { toggleLeadTracking, updateTrackingNote, getTrackingReasonLabel } from '../lib/supabase/leadTracking';
import { AiRewriteToolbar, AiRewriteToolbarRef } from '../components/AiRewriteToolbar';
import { ReferralAgreementsSection } from '../components/ReferralAgreementsSection';
import { MetaAdPreviewModal } from '../components/MetaAdPreviewModal';
import { ApprovalRecipeSection } from '../components/ApprovalRecipeSection';

const PLUM = '#4C1D95';
const CRM_API_BASE_URL = 'https://www.closewithmario.com';
const SCENARIO_VIEWING_NOW_WINDOW_MS = 3 * 60 * 1000;
const HTML_TAG_PATTERN = /<[a-z][\s\S]*>/i;
const HTML_TABLE_PATTERN = /<table[\s>]/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_HTML_IGNORED_TAGS = ['head', 'script', 'iframe', 'object', 'embed', 'form'];

function getMetaDmTabIcon(platform?: string | null): keyof typeof Ionicons.glyphMap {
  const normalized = platform?.trim().toLowerCase() || '';
  if (normalized.includes('ig') || normalized.includes('instagram')) {
    return 'logo-instagram';
  }
  return 'logo-facebook';
}

function getMetaPlatformLabel(platform?: string | null): string | null {
  const normalized = platform?.trim().toLowerCase() || '';
  if (!normalized) return null;
  if (normalized.includes('fb') || normalized.includes('facebook')) return 'Facebook';
  if (normalized.includes('ig') || normalized.includes('instagram')) return 'Instagram';
  if (normalized.includes('messenger')) return 'Messenger';
  if (normalized.includes('whatsapp')) return 'WhatsApp';
  return platform?.trim() || null;
}

function getDealSnapshotSourceLabel(record: Lead | MetaLead, isMeta: boolean, attributedPlatform?: string | null): string | null {
  const attributedPlatformLabel = getMetaPlatformLabel(attributedPlatform);
  if (attributedPlatformLabel === 'Facebook' || attributedPlatformLabel === 'Instagram') {
    return attributedPlatformLabel;
  }

  if (isMeta) {
    const platformLabel = getMetaPlatformLabel((record as MetaLead).platform);
    return platformLabel === 'Facebook' || platformLabel === 'Instagram' ? platformLabel : null;
  }

  const source = (record as Lead).source?.trim().toLowerCase();
  return source === 'my lead' ? null : 'Website';
}

function getDealSnapshotSourceIcon(label: string): keyof typeof Ionicons.glyphMap {
  switch (label) {
    case 'Facebook':
      return 'logo-facebook';
    case 'Instagram':
      return 'logo-instagram';
    case 'Website':
    default:
      return 'globe-outline';
  }
}

const normalizeEmailRecipients = (value?: string[] | string | null) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((entry) => entry?.trim()).filter(Boolean) as string[];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const formatEmailRecipientList = (value?: string[] | string | null) => {
  const recipients = normalizeEmailRecipients(value);
  return recipients.length > 0 ? recipients.join(', ') : null;
};

const pickEmailRecipients = (...candidates: Array<string[] | string | null | undefined>) => {
  for (const candidate of candidates) {
    const recipients = normalizeEmailRecipients(candidate);
    if (recipients.length > 0) {
      return recipients;
    }
  }

  return [];
};

const getActivityRecipientList = (activity: Activity, recipientType: 'to' | 'cc') => {
  if (recipientType === 'to') {
    return pickEmailRecipients(activity.recipients?.to, activity.to_emails, activity.to_email);
  }

  return pickEmailRecipients(activity.recipients?.cc, activity.cc_emails, activity.cc_email);
};

const getEmailBodyContent = (activity: Activity) => {
  const body = activity.body?.trim();
  if (body) return body;

  const notes = activity.notes?.trim();
  return notes || null;
};

const sanitizeEmailHtml = (html: string) =>
  html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

const buildEmailHtmlDocument = (html: string) => `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: #F3F4F6;
        color: #4B5563;
        font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
        font-size: 14px;
        line-height: 1.5;
        word-break: break-word;
      }
      body {
        padding: 12px;
      }
      table {
        width: 100% !important;
        max-width: 100% !important;
        border-collapse: collapse;
      }
      th, td {
        border: 1px solid #CBD5E1;
        padding: 6px;
        vertical-align: top;
      }
      img {
        max-width: 100% !important;
        height: auto !important;
      }
      a {
        color: #2563EB;
      }
    </style>
  </head>
  <body>${sanitizeEmailHtml(html)}</body>
</html>`;

type DetailSummaryRow = {
  label: string;
  value?: string | null;
  valueColor?: string;
};

type DetailThemeColors = {
  cardBackground: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
};

type CurrentRealtorContact = { name: string; phone: string; email: string };

type LeadContactRole = 'primary' | 'coBorrower' | 'realtor';

type LeadContactCandidate = {
  key: string;
  label: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  company?: string;
  extraNotes?: string;
};

const SAVED_CONTACTS_STORAGE_PREFIX = 'leadDetailSavedContacts';

const normalizeContactStoragePart = (value?: string | null) =>
  (value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeContactPhoneKey = (value?: string | null) => {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const getSavedContactsStorageKey = (source: SelectedLeadRef['source'], leadId: string) =>
  `${SAVED_CONTACTS_STORAGE_PREFIX}:${source}:${leadId}`;

const buildContactCandidateKey = (
  role: LeadContactRole,
  roleId: string,
  firstName: string,
  lastName: string,
  phone: string,
  email: string
) => [
  role,
  normalizeContactStoragePart(roleId),
  normalizeContactPhoneKey(phone),
  normalizeContactStoragePart(email),
  normalizeContactStoragePart(firstName),
  normalizeContactStoragePart(lastName),
].join('|');

const splitContactName = (name: string, fallbackFirstName: string) => {
  const nameParts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: nameParts[0] || fallbackFirstName,
    lastName: nameParts.slice(1).join(' '),
  };
};

const buildLeadContactCandidates = ({
  record,
  isMeta,
  phone,
  email,
  currentRealtorName,
  currentRealtorContact,
}: {
  record: Lead | MetaLead | null | undefined;
  isMeta: boolean;
  phone: string;
  email: string;
  currentRealtorName: string | null;
  currentRealtorContact: CurrentRealtorContact | null;
}): LeadContactCandidate[] => {
  if (!record) return [];

  const candidates: LeadContactCandidate[] = [];
  const primaryFirstName = record.first_name || 'Lead';
  const primaryLastName = record.last_name || '';
  const primaryName = `${primaryFirstName} ${primaryLastName}`.trim();

  if (phone || email) {
    candidates.push({
      key: buildContactCandidateKey('primary', record.id, primaryFirstName, primaryLastName, phone || '', email || ''),
      label: `${primaryName} (Primary)`,
      firstName: primaryFirstName,
      lastName: primaryLastName,
      phone: phone || '',
      email: email || '',
    });
  }

  const coBorrowers = !isMeta ? (record as Lead).metadata?.co_borrowers : undefined;
  if (Array.isArray(coBorrowers) && coBorrowers.length > 0) {
    const primaryFullName = `${record.first_name || ''} ${record.last_name || ''}`.trim() || 'Primary Borrower';

    coBorrowers.forEach((cb, index) => {
      const cbPhone = (cb.phone || '').trim();
      const cbEmail = (cb.email || '').trim();
      if (!cbPhone && !cbEmail) return;

      const cbFirstName = cb.first_name || 'Co-Borrower';
      const cbLastName = cb.last_name || '';
      const name = `${cbFirstName} ${cbLastName}`.trim() || 'Co-Borrower';

      candidates.push({
        key: buildContactCandidateKey('coBorrower', String(index), cbFirstName, cbLastName, cbPhone, cbEmail),
        label: `${name} (Co-Borrower)`,
        firstName: cbFirstName,
        lastName: cbLastName,
        phone: cbPhone,
        email: cbEmail,
        extraNotes: `Co-Borrower of ${primaryFullName}`,
      });
    });
  }

  const realtorName = currentRealtorContact?.name || currentRealtorName || record.referral_source_name || '';
  const realtorPhone = (currentRealtorContact?.phone || '').trim();
  const realtorEmail = (currentRealtorContact?.email || record.referral_source_email || '').trim();
  if ((realtorPhone || realtorEmail) && (record.realtor_id || realtorName)) {
    const primaryFullName = `${record.first_name || ''} ${record.last_name || ''}`.trim() || 'Primary Borrower';
    const { firstName: realtorFirstName, lastName: realtorLastName } = splitContactName(
      realtorName || 'Realtor',
      'Realtor'
    );

    candidates.push({
      key: buildContactCandidateKey(
        'realtor',
        record.realtor_id || realtorName || 'realtor',
        realtorFirstName,
        realtorLastName,
        realtorPhone,
        realtorEmail
      ),
      label: `${realtorName || 'Realtor'} (Realtor)`,
      firstName: realtorFirstName,
      lastName: realtorLastName,
      phone: realtorPhone,
      email: realtorEmail,
      company: 'Realtor',
      extraNotes: `Realtor for ${primaryFullName}`,
    });
  }

  return candidates;
};

type SavedMetaAdCreative = {
  imageUrl: string | null;
  thumbnailUrl: string | null;
  headline: string | null;
  body: string | null;
  adName: string | null;
  adType: string | null;
  adsetName: string | null;
  campaignName: string | null;
};

type LandingAdAttribution = {
  adId: string | null;
  adName: string | null;
  adsetId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  platform: string | null;
  sourceDetail: string | null;
  dbSource: string | null;
};

type LandingMetadataCandidate = {
  key: string;
  title: string;
  data: Record<string, unknown>;
};

type LandingSummarySection = {
  key: string;
  title: string;
  rows: DetailSummaryRow[];
};

type MetadataItemCard = {
  title: string;
  subtitle?: string | null;
  amount?: string | null;
  rows?: DetailSummaryRow[];
};

type MetadataSection =
  | {
      key: string;
      title: string;
      kind: 'rows';
      rows: DetailSummaryRow[];
    }
  | {
      key: string;
      title: string;
      kind: 'items';
      items: MetadataItemCard[];
    }
  | {
      key: string;
      title: string;
      kind: 'text';
      value: string;
    };

type CrmLeadSource = 'organic' | 'meta';
type QualificationRecipientType = 'borrower' | 'co_borrower' | 'realtor' | 'key_contact';
type QualificationLinkStatus = 'active' | 'revoked' | 'expired' | 'completed';

type LeadScenarioSummary = {
  id: string;
  leadId: string;
  leadSource: CrmLeadSource;
  name: string;
  isPrimary: boolean;
  displayOrder: number | null;
  scenarioData: Record<string, unknown>;
  borrowerInputs: Record<string, unknown>;
  qualificationState: Record<string, unknown>;
  resultSnapshot: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type QualificationLinkSummary = {
  id: string;
  scenarioId: string | null;
  recipientType: QualificationRecipientType;
  recipientKey: string;
  status: QualificationLinkStatus;
  publicUrl: string;
  borrowerName: string | null;
  borrowerEmail: string | null;
  borrowerPhone: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  lockedMonthlyIncome: number;
  openCount: number;
  sentAt: string;
  expiresAt: string;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  lastActivityAt: string | null;
  lastCalculatedAt: string | null;
  revokedAt: string | null;
  completedAt: string | null;
  scenarioData: Record<string, unknown>;
  borrowerInputs: Record<string, unknown>;
  latestResult: Record<string, unknown>;
};

type QualificationSubmissionStatus = 'pending' | 'applied' | 'dismissed';

type QualificationSubmissionChange = {
  key?: string;
  label?: string;
  kind?: 'currency' | 'percent' | 'number' | 'text';
  before?: number | string | null;
  after?: number | string | null;
  beforeLabel?: string;
  afterLabel?: string;
};

type QualificationLinkSubmission = {
  id: string;
  leadId: string;
  leadSource: CrmLeadSource;
  scenarioId: string | null;
  scenarioName?: string | null;
  recipientType: QualificationRecipientType;
  recipientName: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  changedSummary: QualificationSubmissionChange[];
  status: QualificationSubmissionStatus;
  submittedAt: string;
};

type SavedIncomeAnalysisSummary = {
  id: string;
  name: string;
  analysis_type: string | null;
  borrower_label: string | null;
  employer_name: string | null;
  status: 'supported' | 'needs-review' | 'unsupported' | null;
  total_monthly_income: number | string | null;
  updated_at: string;
};

const EXCLUDED_LEAD_METADATA_KEYS = new Set([
  'co_borrowers',
  'loan_originator',
  'has_co_borrower',
  'ad_creative',
  'attribution',
  'raw',
  'va_loan_landing',
  'import_date',
  'import_source',
  'mismo_version',
  'xml_created_date',
]);

const HIDDEN_METADATA_FIELD_KEYS = new Set([
  'accountIdentifier',
  'qualificationField',
]);

const METADATA_SECTION_ORDER = [
  'income_breakdown',
  'housing_expense_summary',
  'liability_summary',
  'liabilities',
  'discount_points_pct',
  'discount_points_amount',
];

const METADATA_LABEL_MAP: Record<string, string> = {
  holderName: 'Creditor',
  liabilityTypeDescription: 'Type',
  liabilityType: 'Type',
  unpaidBalance: 'Balance',
  monthlyPayment: 'Monthly Payment',
  remainingTermMonths: 'Remaining Term',
  includeInQualification: 'Counts Toward Qualifying',
  exclusionReason: 'Exclusion Reason',
  monthlyHoa: 'HOA',
  monthlyInsurance: 'Insurance',
  monthlyRealEstateTax: 'Real Estate Tax',
  totalMonthlyDebt: 'Total Monthly Debt',
  creditCardPayment: 'Credit Card Payments',
  carPayment: 'Auto Payments',
  installmentLoanPayment: 'Installment Payments',
  otherDebtPayment: 'Other Debt',
  studentLoanPayment: 'Student Loans',
  otherMiscDebtPayment: 'Other Misc Debt',
  mortgageRelatedPayment: 'Mortgage-Related Debt',
  includedLiabilityCount: 'Included Liabilities',
  excludedLiabilityCount: 'Excluded Liabilities',
  payoffLiabilityCount: 'Payoff Liabilities',
  amount: 'Amount',
  description: 'Description',
};

const LANDING_METADATA_SECTION_LABEL_MAP: Record<string, string> = {
  va_loan_landing: 'VA Loan Landing',
};

const LANDING_METADATA_LABEL_MAP: Record<string, string> = {
  ad_id: 'Ad ID',
  adset_id: 'Ad Set ID',
  campaign_id: 'Campaign ID',
  branch_of_service: 'Branch of Service',
  service_status: 'Service Status',
  county_interest: 'County Interest',
  preferred_language: 'Preferred Language',
  credit_score: 'Credit Score Range',
  credit_score_range: 'Credit Score Range',
  current_credit_score_range: 'Credit Score Range',
  income_type: 'Income Type',
  monthly_income: 'Monthly Income',
  estimated_sales_price: 'Estimated Sales Price',
  estimated_loan_amount: 'Estimated Loan Amount',
  loan_type: 'Loan Type',
  loan_purpose: 'Loan Purpose',
  looking_to: 'Looking To',
  purpose: 'Purpose',
  price_range: 'Price Range',
  purchase_timeline: 'Purchase Timeline',
  down_payment_saved: 'Down Payment Saved',
  has_realtor: 'Has Realtor',
  phone_verified: 'Phone Verified',
  marketing_sms_consent: 'SMS Consent',
  sms_consent: 'SMS Consent',
  subject_address: 'Property Address',
  subject_city: 'City',
  subject_state: 'State',
  subject_county: 'County',
  zip_code: 'ZIP Code',
  zipcode: 'ZIP Code',
  additional_notes: 'Additional Notes',
  notes: 'Notes',
};

const LANDING_METADATA_BUSINESS_KEYS = new Set([
  'additional_notes',
  'branch_of_service',
  'city',
  'county',
  'county_interest',
  'credit_range',
  'credit_score',
  'credit_score_range',
  'current_credit_score_range',
  'down_payment_saved',
  'estimated_loan_amount',
  'estimated_sales_price',
  'goal',
  'has_realtor',
  'income_type',
  'loan_purpose',
  'loan_type',
  'looking_to',
  'marketing_sms_consent',
  'message',
  'monthly_income',
  'notes',
  'phone_verified',
  'preferred_language',
  'price_range',
  'purchase_timeline',
  'purpose',
  'service_status',
  'sms_consent',
  'state',
  'subject_address',
  'subject_city',
  'subject_county',
  'subject_state',
  'zip_code',
  'zipcode',
]);

const LANDING_METADATA_ATTRIBUTION_KEYS = new Set([
  'ad_id',
  'ad_name',
  'adset_id',
  'ad_set_id',
  'adset_name',
  'campaign',
  'campaign_id',
  'campaign_name',
  'db_source',
  'fbclid',
  'fbc',
  'fbp',
  'form_id',
  'landing_page_url',
  'page_url',
  'platform',
  'referrer',
  'source_detail',
  'submitted_from',
  'url',
  'utm_campaign',
  'utm_content',
  'utm_id',
  'utm_medium',
  'utm_source',
  'utm_term',
  'website_url',
]);

const LANDING_METADATA_DISPLAY_NOISE_KEYS = new Set([
  'ad_id',
  'ad_name',
  'adset_id',
  'ad_set_id',
  'adset_name',
  'browser',
  'campaign',
  'campaign_id',
  'campaign_name',
  'client_ip',
  'client_ip_address',
  'created_time',
  'db_source',
  'device',
  'fbclid',
  'fbc',
  'fbp',
  'form_id',
  'full_url',
  'ip',
  'ip_address',
  'landing_page_url',
  'page_url',
  'referrer',
  'source_detail',
  'submitted_from',
  'url',
  'user_agent',
  'utm_campaign',
  'utm_content',
  'utm_id',
  'utm_medium',
  'utm_source',
  'utm_term',
  'website_url',
]);

const LANDING_METADATA_IDENTITY_KEYS = new Set([
  'email',
  'first_name',
  'full_name',
  'last_name',
  'name',
  'phone',
  'phone_number',
]);

const LANDING_METADATA_NON_CANDIDATE_KEYS = new Set([
  'ad_creative',
  'attribution',
  'co_borrowers',
  'has_co_borrower',
  'import_date',
  'import_source',
  'liabilities',
  'loan_originator',
  'raw',
  'saved_ad_creative',
]);

const LANDING_METADATA_FIELD_ORDER = [
  'branch_of_service',
  'service_status',
  'loan_type',
  'loan_purpose',
  'looking_to',
  'purpose',
  'goal',
  'subject_address',
  'city',
  'subject_city',
  'state',
  'subject_state',
  'county',
  'subject_county',
  'county_interest',
  'zipcode',
  'zip_code',
  'preferred_language',
  'credit_score',
  'credit_score_range',
  'current_credit_score_range',
  'income_type',
  'monthly_income',
  'estimated_sales_price',
  'estimated_loan_amount',
  'price_range',
  'purchase_timeline',
  'down_payment_saved',
  'has_realtor',
  'phone_verified',
  'marketing_sms_consent',
  'sms_consent',
  'additional_notes',
  'notes',
  'message',
];

const LIABILITY_SUMMARY_ORDER = [
  'carPayment',
  'creditCardPayment',
  'installmentLoanPayment',
  'otherDebtPayment',
  'studentLoanPayment',
  'otherMiscDebtPayment',
  'totalMonthlyDebt',
  'mortgageRelatedPayment',
];

const LIABILITY_SUMMARY_LABELS: Record<string, string> = {
  carPayment: 'Auto / Lease',
  creditCardPayment: 'Credit Cards',
  installmentLoanPayment: 'Installment Loans',
  otherDebtPayment: 'Other Debt',
  studentLoanPayment: 'Student Loans',
  otherMiscDebtPayment: 'Other Misc Debt',
  totalMonthlyDebt: 'Counted Monthly Debt',
  mortgageRelatedPayment: 'Mortgage-Related Liabilities',
};

const humanizeMetadataString = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes('@') || /^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed;
  if (trimmed.includes('_') || trimmed.includes('/')) {
    return trimmed
      .split(/[_/]+/)
      .map((part) => {
        if (!part) return part;
        if (/^[A-Z0-9-]+$/.test(part)) return part;
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join(' ');
  }
  if (/^[a-z][a-z\s-]*$/.test(trimmed)) {
    return trimmed.replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return trimmed;
};

const hasDisplayValue = (value?: string | null) => typeof value === 'string' && value.trim().length > 0;

const getTrimmedString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeMetadataLookupKey = (key: string) =>
  key
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

const isLikelyUrlString = (value?: string | null) => {
  const trimmed = value?.trim() || '';
  return /^https?:\/\//i.test(trimmed) || /^[\w.-]+\.[a-z]{2,}\//i.test(trimmed);
};

const hasLandingTrackingQueryText = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase() || '';
  return (
    normalized.includes('fbclid=') ||
    /[?&]utm[_-]?(source|medium|campaign|content|term|id)=/.test(normalized)
  );
};

const formatLandingTitleValue = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > 80 || isLikelyUrlString(trimmed)) return null;
  return trimmed
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getLandingSectionTitle = (key: string, data: Record<string, unknown>) => {
  const normalizedKey = normalizeMetadataLookupKey(key);
  const explicitTitle =
    formatLandingTitleValue(getTrimmedString(data.source_detail)) ||
    formatLandingTitleValue(getTrimmedString(data.submitted_from)) ||
    formatLandingTitleValue(getTrimmedString(data.form_name));

  return explicitTitle || LANDING_METADATA_SECTION_LABEL_MAP[normalizedKey] || formatMetadataKeyLabel(key);
};

const isLandingTrackingIdentifierKey = (key: string) => {
  const normalizedKey = normalizeMetadataLookupKey(key);
  const rawKey = key.trim().toLowerCase();
  return (
    LANDING_METADATA_DISPLAY_NOISE_KEYS.has(normalizedKey) ||
    normalizedKey.startsWith('utm_') ||
    normalizedKey.includes('fbclid') ||
    normalizedKey === 'fb' ||
    normalizedKey.startsWith('fb_') ||
    /^fb[._-]?\d/.test(rawKey)
  );
};

const isLandingMetadataDisplayNoiseKey = (key: string) => {
  const normalizedKey = normalizeMetadataLookupKey(key);
  return (
    isLikelyUrlString(key) ||
    hasLandingTrackingQueryText(key) ||
    isLandingTrackingIdentifierKey(key) ||
    LANDING_METADATA_IDENTITY_KEYS.has(normalizedKey) ||
    normalizedKey.includes('user_agent') ||
    normalizedKey.includes('ip_address') ||
    normalizedKey.endsWith('_url') ||
    normalizedKey === 'url'
  );
};

const isLandingMetadataDisplayNoiseValue = (value: unknown) => {
  const text = getTrimmedString(value);
  if (!text) return false;
  return isLikelyUrlString(text) || hasLandingTrackingQueryText(text) || /^mozilla\/5\.0/i.test(text);
};

const isLandingMetadataPayload = (key: string, value: unknown): value is Record<string, unknown> => {
  if (!isPlainObject(value)) return false;

  const normalizedKey = normalizeMetadataLookupKey(key);
  if (LANDING_METADATA_NON_CANDIDATE_KEYS.has(normalizedKey)) return false;
  if (normalizedKey.includes('landing')) return true;

  const normalizedChildKeys = Object.keys(value).map(normalizeMetadataLookupKey);
  const businessKeyCount = normalizedChildKeys.filter((childKey) => LANDING_METADATA_BUSINESS_KEYS.has(childKey)).length;
  const attributionKeyCount = normalizedChildKeys.filter((childKey) => LANDING_METADATA_ATTRIBUTION_KEYS.has(childKey) || childKey.startsWith('utm_')).length;

  return businessKeyCount >= 2 && attributionKeyCount >= 1;
};

const getLandingMetadataCandidates = (
  metadata?: Record<string, unknown> | null,
  options?: { includeRaw?: boolean }
): LandingMetadataCandidate[] => {
  if (!metadata) return [];

  const candidates: LandingMetadataCandidate[] = [];
  const seen = new Set<string>();

  const addCandidate = (key: string, value: unknown) => {
    if (!isLandingMetadataPayload(key, value)) return;

    const normalizedKey = normalizeMetadataLookupKey(key);
    if (seen.has(normalizedKey)) return;

    seen.add(normalizedKey);
    candidates.push({
      key,
      title: getLandingSectionTitle(key, value),
      data: value,
    });
  };

  for (const [key, value] of Object.entries(metadata)) {
    addCandidate(key, value);
  }

  if (options?.includeRaw && isPlainObject(metadata.raw)) {
    for (const [key, value] of Object.entries(metadata.raw)) {
      addCandidate(key, value);
    }
  }

  return candidates;
};

const getLandingUrlSearchParam = (value: unknown, aliases: Set<string>) => {
  const text = getTrimmedString(value);
  if (!text || !text.includes('?')) return null;

  try {
    const parsedUrl = new URL(text, 'https://www.closewithmario.com');
    for (const alias of aliases) {
      const paramValue = parsedUrl.searchParams.get(alias);
      if (paramValue && paramValue.trim().length > 0) {
        return paramValue.trim();
      }
    }
  } catch {
    return null;
  }

  return null;
};

const getLandingFieldRawValueFromCandidates = (
  candidates: LandingMetadataCandidate[],
  aliases: string[]
): unknown => {
  const aliasSet = new Set(aliases.map(normalizeMetadataLookupKey));

  for (const candidate of candidates) {
    for (const [key, value] of Object.entries(candidate.data)) {
      if (aliasSet.has(normalizeMetadataLookupKey(key)) && hasRenderableMetadataValue(value)) {
        return value;
      }
    }
  }

  for (const candidate of candidates) {
    for (const value of Object.values(candidate.data)) {
      const paramValue = getLandingUrlSearchParam(value, aliasSet);
      if (paramValue) return paramValue;
    }
  }

  return null;
};

const getPositiveNumberValue = (value: unknown): number | null => {
  const numeric = typeof value === 'string' ? Number(value.replace(/[^0-9.]/g, '')) : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const hasRenderableMetadataValue = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
};

const formatMetadataKeyLabel = (key: string) =>
  (METADATA_LABEL_MAP[key] || key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatCurrencyValue = (value?: number | null, options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }) => {
  if (value == null || Number.isNaN(Number(value))) return null;
  const numberValue = Number(value);
  const hasCents = Math.abs(numberValue % 1) > 0.0001;
  const minimumFractionDigits = options?.minimumFractionDigits ?? (hasCents ? 2 : 0);
  const maximumFractionDigits = options?.maximumFractionDigits ?? (hasCents ? 2 : 0);
  return `$${numberValue.toLocaleString(undefined, { minimumFractionDigits, maximumFractionDigits })}`;
};

const formatPercentValue = (value?: number | null) => {
  if (value == null || Number.isNaN(Number(value))) return null;
  return `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
};

const getRecordValue = (value: unknown): Record<string, unknown> | null => {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
};

const getScenarioNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (value == null || value === '') continue;
    const numeric = typeof value === 'string' ? Number(value.replace(/[^0-9.-]/g, '')) : Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
};

const getScenarioCurrencyDisplay = (...values: unknown[]) => {
  const numeric = getScenarioNumber(...values);
  return numeric == null ? null : formatCurrencyValue(numeric);
};

const getScenarioPercentDisplay = (...values: unknown[]) => {
  const numeric = getScenarioNumber(...values);
  return numeric == null ? null : formatPercentValue(numeric);
};

const formatScenarioDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

const formatScenarioDateTime = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatIncomeAnalysisMoney = (value: unknown) => {
  const numeric = typeof value === 'string' ? Number(value.replace(/[^0-9.-]/g, '')) : Number(value);
  if (!Number.isFinite(numeric)) return '$0/mo';
  return `${numeric.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}/mo`;
};

const getIncomeAnalysisStatusLabel = (status: SavedIncomeAnalysisSummary['status']) => {
  if (status === 'supported') return 'Supported';
  if (status === 'needs-review') return 'Needs Review';
  if (status === 'unsupported') return 'Unsupported';
  return 'Draft';
};

const getIncomeAnalysisStatusStyle = (status: SavedIncomeAnalysisSummary['status']) => {
  if (status === 'supported') return incomeAnalysisStyles.statusSupported;
  if (status === 'needs-review') return incomeAnalysisStyles.statusReview;
  if (status === 'unsupported') return incomeAnalysisStyles.statusUnsupported;
  return incomeAnalysisStyles.statusDraft;
};

const formatQualificationSubmitter = (submission: QualificationLinkSubmission) => {
  const role = submission.recipientType === 'co_borrower'
    ? 'Co-borrower'
    : submission.recipientType === 'key_contact'
      ? 'Key contact'
      : submission.recipientType === 'realtor'
        ? 'Realtor'
        : 'Borrower';
  return `${submission.recipientName || 'Shared link recipient'} • ${role}`;
};

const formatQualificationChangeValue = (change: QualificationSubmissionChange, side: 'before' | 'after') => {
  const label = side === 'before' ? change.beforeLabel : change.afterLabel;
  if (label) return label;
  const value = side === 'before' ? change.before : change.after;
  if (value == null || value === '') return 'blank';
  if (change.kind === 'currency') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? formatCurrencyValue(numeric) || String(value) : String(value);
  }
  if (change.kind === 'percent') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${numeric}%` : String(value);
  }
  return String(value);
};

const isScenarioLinkViewingNow = (
  link?: Pick<QualificationLinkSummary, 'status' | 'lastActivityAt'> | null,
  now = Date.now()
) => {
  if (!link || link.status !== 'active' || !link.lastActivityAt) return false;
  const activityAt = new Date(link.lastActivityAt).getTime();
  return Number.isFinite(activityAt) && now - activityAt <= SCENARIO_VIEWING_NOW_WINDOW_MS;
};

const formatScenarioOpenSummary = (
  label: string,
  link: Pick<QualificationLinkSummary, 'openCount' | 'lastOpenedAt' | 'lastActivityAt' | 'status'>,
  now = Date.now()
) => {
  const count = Number(link.openCount || 0);
  const openWord = count === 1 ? 'open' : 'opens';
  const pieces = [`${label}: ${count} total ${openWord}`];
  const lastOpened = formatScenarioDate(link.lastOpenedAt);
  if (lastOpened) {
    pieces.push(`last opened ${lastOpened}`);
  }
  if (isScenarioLinkViewingNow(link, now)) {
    pieces.push('viewing now');
  }
  return pieces.join(' · ');
};

const formatCountValue = (value?: number | null) => {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Number(value).toLocaleString();
};

const formatMetadataDisplayValue = (key: string, value: unknown): string | null => {
  if (!hasRenderableMetadataValue(value)) return null;

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    const normalizedKey = key.toLowerCase();
    if (/(amount|payment|balance|cost|income|tax|insurance|hoa|debt)/.test(normalizedKey)) {
      return formatCurrencyValue(value, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }
    if (/(pct|percent|rate)/.test(normalizedKey)) {
      return `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })}%`;
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  if (typeof value === 'string') {
    return humanizeMetadataString(value);
  }

  return JSON.stringify(value, null, 2);
};

const getSavedMetaAdCreative = (lead?: Lead | MetaLead | null): SavedMetaAdCreative | null => {
  if (!lead) return null;

  const leadWithRaw = lead as (Lead | MetaLead) & { raw?: Record<string, unknown> | null };
  const metadataRaw = isPlainObject(lead.metadata?.raw) ? lead.metadata.raw : null;
  const creativeCandidates = [
    lead.metadata?.ad_creative,
    leadWithRaw.raw?.ad_creative,
    metadataRaw?.ad_creative,
    lead.metadata?.saved_ad_creative,
    lead.metadata?.creative,
  ];
  const creative = creativeCandidates.find(isPlainObject) as Record<string, unknown> | undefined;

  if (!creative) return null;

  const leadAdName = getTrimmedString((lead as MetaLead).ad_name) || getTrimmedString((lead as Lead).ad_name);
  const leadAdsetName = getTrimmedString((lead as MetaLead).adset_name);
  const leadCampaignName = getTrimmedString((lead as MetaLead).campaign_name) || getTrimmedString((lead as Lead).campaign_name);
  const imageUrl = getTrimmedString(creative.image_url);
  const thumbnailUrl = getTrimmedString(creative.thumbnail_url);
  const savedCreative: SavedMetaAdCreative = {
    imageUrl: imageUrl || thumbnailUrl,
    thumbnailUrl,
    headline: getTrimmedString(creative.headline),
    body: getTrimmedString(creative.body),
    adName: getTrimmedString(creative.ad_name) || leadAdName,
    adType: getTrimmedString(creative.ad_type),
    adsetName: getTrimmedString(creative.adset_name) || leadAdsetName,
    campaignName: getTrimmedString(creative.campaign_name) || leadCampaignName,
  };

  return Object.values(savedCreative).some((value) => hasDisplayValue(value)) ? savedCreative : null;
};

const getLandingAdAttribution = (lead?: Lead | MetaLead | null): LandingAdAttribution => {
  if (!lead) {
    return {
      adId: null,
      adName: null,
      adsetId: null,
      campaignId: null,
      campaignName: null,
      platform: null,
      sourceDetail: null,
      dbSource: null,
    };
  }

  const metadata = isPlainObject(lead.metadata) ? lead.metadata : null;
  const attribution = isPlainObject(metadata?.attribution) ? metadata.attribution : null;
  const metadataRaw = isPlainObject(metadata?.raw) ? metadata.raw : null;
  const rawAttribution = isPlainObject(metadataRaw?.attribution) ? metadataRaw.attribution : null;
  const leadWithRaw = lead as (Lead | MetaLead) & { raw?: Record<string, unknown> | null };
  const raw = isPlainObject(leadWithRaw.raw) ? leadWithRaw.raw : null;
  const landingCandidates = getLandingMetadataCandidates(metadata, { includeRaw: true });

  const pickString = (...values: unknown[]) => {
    for (const value of values) {
      const trimmed = getTrimmedString(value);
      if (trimmed) return trimmed;
    }
    return null;
  };

  const pickSourceDetail = (...values: unknown[]) => {
    for (const value of values) {
      const trimmed = getTrimmedString(value);
      if (trimmed && !UUID_PATTERN.test(trimmed) && !isLikelyUrlString(trimmed)) {
        return trimmed;
      }
    }
    return null;
  };

  const getLandingString = (aliases: string[], options?: { numericOnly?: boolean; nonNumericOnly?: boolean }) => {
    const value = getLandingFieldRawValueFromCandidates(landingCandidates, aliases);
    const trimmed = getTrimmedString(value);
    if (!trimmed) return null;
    if (options?.numericOnly && !/^\d{8,}$/.test(trimmed)) return null;
    if (options?.nonNumericOnly && /^\d{8,}$/.test(trimmed)) return null;
    return trimmed;
  };

  const landingSourceTitle = landingCandidates
    .map((candidate) => formatLandingTitleValue(candidate.title))
    .find(Boolean) || null;

  return {
    adId: pickString(
      (lead as MetaLead).ad_id,
      (lead as Lead).ad_id,
      getLandingString(['ad_id', 'utm_content'], { numericOnly: true }),
      attribution?.ad_id,
      rawAttribution?.ad_id,
      raw?.ad_id
    ),
    adName: pickString(
      (lead as MetaLead).ad_name,
      (lead as Lead).ad_name,
      getLandingString(['ad_name']),
      attribution?.ad_name,
      rawAttribution?.ad_name,
      raw?.ad_name
    ),
    adsetId: pickString(
      (lead as Lead).adset_id,
      getLandingString(['adset_id', 'ad_set_id', 'utm_term'], { numericOnly: true }),
      attribution?.adset_id,
      rawAttribution?.adset_id,
      raw?.adset_id
    ),
    campaignId: pickString(
      (lead as Lead).campaign_id,
      getLandingString(['campaign_id', 'utm_id', 'utm_campaign'], { numericOnly: true }),
      attribution?.campaign_id,
      rawAttribution?.campaign_id,
      raw?.campaign_id
    ),
    campaignName: pickString(
      (lead as MetaLead).campaign_name,
      (lead as Lead).campaign_name,
      getLandingString(['campaign_name', 'campaign', 'utm_campaign'], { nonNumericOnly: true }),
      attribution?.campaign_name,
      rawAttribution?.campaign_name,
      raw?.campaign_name
    ),
    platform: pickString(
      (lead as MetaLead).platform,
      (lead as Lead).platform,
      getLandingString(['platform', 'utm_source']),
      attribution?.platform,
      rawAttribution?.platform,
      raw?.platform
    ),
    sourceDetail: pickSourceDetail(
      (lead as Lead).source_detail,
      (lead as MetaLead).source_detail,
      getLandingString(['source_detail', 'submitted_from']),
      attribution?.source_detail,
      rawAttribution?.source_detail,
      landingSourceTitle
    ),
    dbSource: pickString((lead as Lead).db_source, getLandingString(['db_source']), attribution?.db_source, rawAttribution?.db_source),
  };
};

const getMetaAdImageAsset = (adNameRaw?: string | null, campaignNameRaw?: string | null): ImageSourcePropType | null => {
  const adName = adNameRaw?.toLowerCase() || '';
  const normalizedAdName = adName.replace(/[–—]/g, '-').trim();
  const campaignName = campaignNameRaw?.toLowerCase() || '';
  const searchText = `${adName} ${campaignName}`.toLowerCase();

  if (normalizedAdName.includes('florida renter video ad - veterans')) {
    return require('../../assets/FLRenterPoster.jpg');
  } else if (normalizedAdName === 'florida renter video ad') {
    return require('../../assets/Fl_Renter_Ad.png');
  } else if (searchText.includes('florida renter image')) {
    return require('../../assets/FLRenterPoster.jpg');
  } else if (searchText.includes('florida renter')) {
    return require('../../assets/Fl_Renter_Ad.png');
  } else if (searchText.includes('hpa')) {
    return require('../../assets/BrowardHPA_Ad.jpg');
  } else if (searchText.includes('condo')) {
    return require('../../assets/Condo_Ad.jpg');
  } else if (searchText.includes('green acres') || searchText.includes('greenacres')) {
    return require('../../assets/Greenacres_ Ad.png');
  }

  return null;
};

const getAdImageUrl = (lead?: Lead | MetaLead | null): string | null => {
  const savedCreative = getSavedMetaAdCreative(lead);
  return savedCreative?.imageUrl || savedCreative?.thumbnailUrl || null;
};

const getLandingFieldRawValue = (lead: Lead | MetaLead, aliases: string[]): unknown => {
  const metadata = isPlainObject(lead.metadata) ? lead.metadata : null;
  return getLandingFieldRawValueFromCandidates(
    getLandingMetadataCandidates(metadata, { includeRaw: true }),
    aliases
  );
};

const getLandingFieldDisplayValue = (lead: Lead | MetaLead, aliases: string[]): string | null => {
  const value = getLandingFieldRawValue(lead, aliases);
  return formatMetadataDisplayValue(aliases[0], value);
};

const formatLandingMetadataLabel = (key: string) => {
  const normalizedKey = normalizeMetadataLookupKey(key);
  return LANDING_METADATA_LABEL_MAP[normalizedKey] || formatMetadataKeyLabel(key);
};

const formatLandingMetadataSummaryValue = (key: string, value: unknown): string | null => {
  const normalizedKey = normalizeMetadataLookupKey(key);
  const numericValue = getPositiveNumberValue(value);

  if (numericValue != null && /(amount|payment|price|income|loan)/.test(normalizedKey)) {
    return formatCurrencyValue(numericValue);
  }

  return formatMetadataDisplayValue(key, value);
};

const normalizeDisplayText = (value?: string | null) =>
  value?.trim().replace(/\s+/g, ' ').toLowerCase() || null;

const landingSummaryValueDuplicatesLeadField = (lead: Lead, key: string, displayValue: string) => {
  const normalizedKey = normalizeMetadataLookupKey(key);
  const comparisonValue = normalizeDisplayText(displayValue);
  if (!comparisonValue) return false;

  const candidates: Array<string | null | undefined> = [];

  if (['loan_purpose', 'looking_to', 'purpose'].includes(normalizedKey)) {
    candidates.push(lead.loan_purpose);
  }

  if (['city', 'subject_city'].includes(normalizedKey)) {
    candidates.push(lead.subject_city);
  }

  if (['state', 'subject_state'].includes(normalizedKey)) {
    candidates.push(lead.subject_state);
  }

  if (['county', 'subject_county', 'county_interest'].includes(normalizedKey)) {
    candidates.push(lead.subject_county);
  }

  if (['zipcode', 'zip_code', 'subject_zipcode'].includes(normalizedKey)) {
    candidates.push(lead.subject_zipcode);
  }

  if (['message', 'notes', 'additional_notes', 'comments'].includes(normalizedKey)) {
    candidates.push(lead.message);
  }

  if (['credit_score', 'credit_score_range', 'current_credit_score_range', 'credit_range'].includes(normalizedKey)) {
    candidates.push(lead.credit_score != null ? String(lead.credit_score) : null);
  }

  if (['estimated_sales_price', 'sales_price', 'price', 'price_range'].includes(normalizedKey)) {
    candidates.push(formatCurrencyValue(lead.price));
  }

  if (['estimated_loan_amount', 'loan_amount'].includes(normalizedKey)) {
    candidates.push(formatCurrencyValue(lead.loan_amount));
  }

  return candidates.some((candidate) => normalizeDisplayText(candidate) === comparisonValue);
};

const buildLandingMetadataSummarySections = (lead?: Lead | null): LandingSummarySection[] => {
  if (!lead) return [];

  const metadata = isPlainObject(lead.metadata) ? lead.metadata : null;
  const candidates = getLandingMetadataCandidates(metadata);

  return candidates
    .map((candidate) => {
      const seenLabels = new Set<string>();
      const rows = Object.entries(candidate.data)
        .filter(([key, value]) => (
          !isLandingMetadataDisplayNoiseKey(key) &&
          !isLandingMetadataDisplayNoiseValue(value) &&
          hasRenderableMetadataValue(value)
        ))
        .sort(([leftKey], [rightKey]) => {
          const leftIndex = LANDING_METADATA_FIELD_ORDER.indexOf(normalizeMetadataLookupKey(leftKey));
          const rightIndex = LANDING_METADATA_FIELD_ORDER.indexOf(normalizeMetadataLookupKey(rightKey));
          if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
          if (leftIndex !== -1) return -1;
          if (rightIndex !== -1) return 1;
          return formatMetadataKeyLabel(leftKey).localeCompare(formatMetadataKeyLabel(rightKey));
        })
        .reduce<DetailSummaryRow[]>((summaryRows, [key, value]) => {
          const label = formatLandingMetadataLabel(key);
          const displayValue = formatLandingMetadataSummaryValue(key, value);
          if (
            !displayValue ||
            seenLabels.has(label) ||
            landingSummaryValueDuplicatesLeadField(lead, key, displayValue)
          ) {
            return summaryRows;
          }

          seenLabels.add(label);
          summaryRows.push({
            label,
            value: displayValue,
          });
          return summaryRows;
        }, []);

      return rows.length > 0
        ? {
            key: candidate.key,
            title: candidate.title,
            rows,
          }
        : null;
    })
    .filter((section): section is LandingSummarySection => section !== null);
};

const buildMetadataRowsFromObject = (
  objectValue: Record<string, unknown>,
  options?: { omitKeys?: string[] }
): DetailSummaryRow[] => {
  const omitKeys = new Set(options?.omitKeys || []);
  const rows: DetailSummaryRow[] = [];

  for (const [key, value] of Object.entries(objectValue)) {
    if (omitKeys.has(key) || HIDDEN_METADATA_FIELD_KEYS.has(key) || isLandingMetadataDisplayNoiseKey(key)) continue;
    if (key === 'liabilityType' && hasRenderableMetadataValue(objectValue.liabilityTypeDescription)) continue;
    if ((key === 'excluded' || key === 'payoff') && value === false) continue;
    if (key === 'exclusionReason' && (!value || value === 'excluded')) continue;
    if (!hasRenderableMetadataValue(value)) continue;

    const displayValue =
      key === 'remainingTermMonths' && typeof value === 'number'
        ? `${value} months`
        : formatMetadataDisplayValue(key, value);

    if (!displayValue) continue;

    rows.push({
      label: formatMetadataKeyLabel(key),
      value: displayValue,
    });
  }

  return rows;
};

const buildLiabilitySummaryRows = (summaryValue: Record<string, unknown>): DetailSummaryRow[] => {
  const rows: DetailSummaryRow[] = [];

  for (const key of LIABILITY_SUMMARY_ORDER) {
    const rawValue = summaryValue[key];
    if (typeof rawValue !== 'number' || rawValue <= 0) continue;
    const formattedValue = formatCurrencyValue(rawValue);
    if (!formattedValue) continue;
    rows.push({
      label: LIABILITY_SUMMARY_LABELS[key] || formatMetadataKeyLabel(key),
      value: `${formattedValue}/mo`,
    });
  }

  return rows;
};

const buildImportedAccountItems = (liabilities: Array<Record<string, unknown>>): MetadataItemCard[] => {
  const items: MetadataItemCard[] = [];

  for (const item of liabilities) {
    const title =
      typeof item.holderName === 'string' && item.holderName.trim().length > 0
        ? item.holderName.trim()
        : null;
    const paymentValue =
      typeof item.monthlyPayment === 'number' && item.monthlyPayment > 0
        ? formatCurrencyValue(item.monthlyPayment)
        : null;
    const subtitleParts = [
      typeof item.liabilityType === 'string' ? humanizeMetadataString(item.liabilityType) : null,
      typeof item.liabilityTypeDescription === 'string' ? humanizeMetadataString(item.liabilityTypeDescription) : null,
    ].filter((part, index, self): part is string => Boolean(part) && self.indexOf(part) === index);

    if (!title || !paymentValue) continue;

    items.push({
      title,
      subtitle: subtitleParts.length > 0 ? subtitleParts.join(' · ') : null,
      amount: `${paymentValue}/mo`,
    });
  }

  return items;
};

const buildMetadataSections = (metadata?: Record<string, unknown> | null): MetadataSection[] => {
  if (!metadata) return [];

  const entries = Object.entries(metadata)
    .filter(([key, value]) => (
      !EXCLUDED_LEAD_METADATA_KEYS.has(key) &&
      !isLandingMetadataDisplayNoiseKey(key) &&
      !isLandingMetadataPayload(key, value) &&
      hasRenderableMetadataValue(value)
    ))
    .sort(([a], [b]) => {
      const aIndex = METADATA_SECTION_ORDER.indexOf(a);
      const bIndex = METADATA_SECTION_ORDER.indexOf(b);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });

  return entries
    .map(([key, value]) => {
      const title = formatMetadataKeyLabel(key);

      if (key === 'liability_summary' && value && typeof value === 'object' && !Array.isArray(value)) {
        const rows = buildLiabilitySummaryRows(value as Record<string, unknown>);
        return rows.length > 0 ? { key, title: 'Liabilities', kind: 'rows', rows } as MetadataSection : null;
      }

      if (key === 'liabilities' && Array.isArray(value)) {
        return null;
      }

      if (Array.isArray(value)) {
        if (value.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))) {
          const items: MetadataItemCard[] = [];

          value.forEach((entry, index) => {
            const item = entry as Record<string, unknown>;
            const titleSource =
              (typeof item.holderName === 'string' && item.holderName) ||
              (typeof item.name === 'string' && item.name) ||
              (typeof item.type === 'string' && humanizeMetadataString(item.type)) ||
              `${title.slice(0, -1) || title} ${index + 1}`;
            const omitKeys = ['holderName', 'name'];
            if (typeof item.type === 'string') omitKeys.push('type');
            const rows = buildMetadataRowsFromObject(item, { omitKeys });
            if (rows.length > 0) {
              items.push({ title: String(titleSource), rows });
            }
          });

          if (items.length > 0) {
            return { key, title, kind: 'items', items } as MetadataSection;
          }
        }

        const serialized = formatMetadataDisplayValue(key, value);
        return serialized ? { key, title, kind: 'text', value: serialized } as MetadataSection : null;
      }

      if (value && typeof value === 'object') {
        const rows = buildMetadataRowsFromObject(value as Record<string, unknown>);
        return rows.length > 0 ? { key, title, kind: 'rows', rows } as MetadataSection : null;
      }

      const serialized = formatMetadataDisplayValue(key, value);
      return serialized ? { key, title, kind: 'text', value: serialized } as MetadataSection : null;
    })
    .filter((section): section is MetadataSection => section !== null);
};

const getLoanOriginatorInfo = (lead: Lead): LoanOriginatorInfo | null => {
  const metadataOriginator = lead.metadata?.loan_originator;

  const originator: LoanOriginatorInfo = {
    name: lead.originator_name || metadataOriginator?.name || null,
    email: lead.originator_email || metadataOriginator?.email || null,
    phone: metadataOriginator?.phone || null,
    company: lead.originator_company || metadataOriginator?.company || null,
    license: lead.originator_license || metadataOriginator?.license || null,
  };

  return Object.values(originator).some((value) => value != null && String(value).trim().length > 0)
    ? originator
    : null;
};

const LeadSummaryCard = ({
  title,
  rows,
  colors,
}: {
  title: string;
  rows: DetailSummaryRow[];
  colors: DetailThemeColors;
}) => {
  const visibleRows = rows.filter((row) => hasDisplayValue(row.value));
  if (visibleRows.length === 0) return null;

  return (
    <View style={[styles.leadSummaryCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
      <Text style={[styles.leadSummaryHeader, { color: colors.textSecondary }]}>
        {title}
      </Text>
      {visibleRows.map((row, index) => (
        <View
          key={`${title}-${row.label}`}
          style={[
            styles.leadSummaryRow,
            index < visibleRows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
          ]}
        >
          <Text style={[styles.leadSummaryLabel, { color: colors.textSecondary }]}>
            {row.label}
          </Text>
          <Text
            style={[
              styles.leadSummaryValue,
              { color: row.valueColor || colors.textPrimary },
            ]}
            selectable={true}
          >
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
};

const LeadMetadataCard = ({
  sections,
  colors,
}: {
  sections: MetadataSection[];
  colors: DetailThemeColors;
}) => {
  if (sections.length === 0) return null;

  return (
    <View style={[styles.leadSummaryCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
      <Text style={[styles.leadSummaryHeader, { color: colors.textSecondary }]}>
        ADDITIONAL FORM DATA
      </Text>
      {sections.map((section) => {
        if (section.kind === 'rows') {
          return (
            <View
              key={section.key}
              style={[
                styles.leadMetadataBlock,
                {
                  backgroundColor: colors.cardBackground === '#FFFFFF' ? '#F8FAFC' : 'rgba(255,255,255,0.05)',
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.leadMetadataLabel, { color: colors.textSecondary }]}>
                {section.title}
              </Text>
              {section.rows.map((row, index) => (
                <View
                  key={`${section.key}-${row.label}`}
                  style={[
                    styles.leadSummaryRow,
                    index < section.rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <Text style={[styles.leadSummaryLabel, { color: colors.textSecondary }]}>
                    {row.label}
                  </Text>
                  <Text style={[styles.leadSummaryValue, { color: row.valueColor || colors.textPrimary }]} selectable={true}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          );
        }

        if (section.kind === 'items') {
          return (
            <View
              key={section.key}
              style={[
                styles.leadMetadataBlock,
                {
                  backgroundColor: colors.cardBackground === '#FFFFFF' ? '#F8FAFC' : 'rgba(255,255,255,0.05)',
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.leadMetadataLabel, { color: colors.textSecondary }]}>
                {section.title}
              </Text>
              {section.items.map((item, itemIndex) => (
                <View
                  key={`${section.key}-${itemIndex}`}
                  style={[
                    styles.leadMetadataItemCard,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.cardBackground,
                    },
                  ]}
                >
                  <Text style={[styles.leadMetadataItemTitle, { color: colors.textPrimary }]}>
                    {item.title}
                  </Text>
                  {(item.subtitle || item.amount) && (
                    <View style={styles.leadMetadataAccountHeader}>
                      {item.subtitle ? (
                        <Text style={[styles.leadMetadataAccountSubtitle, { color: colors.textSecondary }]}>
                          {item.subtitle}
                        </Text>
                      ) : (
                        <View />
                      )}
                      {item.amount ? (
                        <Text style={[styles.leadMetadataAccountAmount, { color: colors.textPrimary }]}>
                          {item.amount}
                        </Text>
                      ) : null}
                    </View>
                  )}
                  {(item.rows || []).map((row, rowIndex) => (
                    <View
                      key={`${section.key}-${itemIndex}-${row.label}`}
                      style={[
                        styles.leadSummaryRow,
                        rowIndex < (item.rows || []).length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      ]}
                    >
                      <Text style={[styles.leadSummaryLabel, { color: colors.textSecondary }]}>
                        {row.label}
                      </Text>
                      <Text style={[styles.leadSummaryValue, { color: row.valueColor || colors.textPrimary }]} selectable={true}>
                        {row.value}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          );
        }

        const isJsonLike = section.value.includes('\n') || section.value.startsWith('{') || section.value.startsWith('[');
        return (
          <View
            key={section.key}
            style={[
              styles.leadMetadataBlock,
              {
                backgroundColor: colors.cardBackground === '#FFFFFF' ? '#F8FAFC' : 'rgba(255,255,255,0.05)',
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.leadMetadataLabel, { color: colors.textSecondary }]}>
              {section.title}
            </Text>
            <Text
              style={[
                styles.leadMetadataValue,
                isJsonLike && styles.leadMetadataValueMonospace,
                { color: colors.textPrimary },
              ]}
              selectable={true}
            >
              {section.value}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

const MetaAdCreativeCard = ({
  creative,
  colors,
}: {
  creative: SavedMetaAdCreative;
  colors: DetailThemeColors;
}) => {
  const [hideImage, setHideImage] = useState(!hasDisplayValue(creative.imageUrl));
  const [imageAspectRatio, setImageAspectRatio] = useState(1.2);

  useEffect(() => {
    let cancelled = false;
    const imageUrl = creative.imageUrl;

    if (typeof imageUrl !== 'string' || imageUrl.trim().length === 0) {
      setHideImage(true);
      setImageAspectRatio(1.2);
      return () => {
        cancelled = true;
      };
    }

    setHideImage(false);
    Image.getSize(
      imageUrl,
      (width, height) => {
        if (cancelled || width <= 0 || height <= 0) return;
        setImageAspectRatio(width / height);
      },
      () => {
        if (!cancelled) setImageAspectRatio(1.2);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [creative.imageUrl]);

  const metaItems = [
    { label: 'Ad Name', value: creative.adName },
    { label: 'Ad Type', value: creative.adType },
    { label: 'Adset Name', value: creative.adsetName },
    { label: 'Campaign Name', value: creative.campaignName },
  ].filter((item) => hasDisplayValue(item.value));

  const hasImage = !hideImage && hasDisplayValue(creative.imageUrl);
  const hasCopy = hasDisplayValue(creative.headline) || hasDisplayValue(creative.body);

  if (!hasImage && !hasCopy && metaItems.length === 0) return null;

  const imageHeight = Math.min(260, Math.max(150, 320 / Math.max(imageAspectRatio, 0.5)));

  return (
    <View
      style={[
        styles.savedAdCreativeCard,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={[styles.savedAdCreativeLabel, { color: colors.textSecondary }]}>Ad Creative</Text>

      {hasImage ? (
        <View style={[styles.savedAdCreativeImageWrap, { backgroundColor: colors.border }]}>
          <Image
            source={{ uri: creative.imageUrl || undefined }}
            style={[styles.savedAdCreativeImage, { height: imageHeight }]}
            resizeMode="contain"
            onError={() => setHideImage(true)}
          />
        </View>
      ) : null}

      {hasDisplayValue(creative.headline) ? (
        <Text style={[styles.savedAdCreativeHeadline, { color: colors.textPrimary }]}>
          {creative.headline}
        </Text>
      ) : null}

      {hasDisplayValue(creative.body) ? (
        <Text style={[styles.savedAdCreativeBody, { color: colors.textSecondary }]}>
          {creative.body}
        </Text>
      ) : null}

      {metaItems.length > 0 ? (
        <View style={styles.savedAdCreativeMetaGrid}>
          {metaItems.map((item) => (
            <View
              key={item.label}
              style={[
                styles.savedAdCreativeMetaItem,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.savedAdCreativeMetaLabel, { color: colors.textSecondary }]}>
                {item.label}
              </Text>
              <Text
                style={[styles.savedAdCreativeMetaValue, { color: colors.textPrimary }]}
                numberOfLines={2}
              >
                {item.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

export type LeadDetailViewProps = {
  selected: SelectedLeadRef;
  leads: Lead[];
  metaLeads: MetaLead[];
  onBack: () => void;
  onNavigate: (leadRef: SelectedLeadRef) => void;
  onStatusChange: (
    source: 'lead' | 'meta',
    id: string,
    newStatus: string,
    options?: { preserveSelectedLead?: boolean }
  ) => Promise<void>;
  session: Session | null;
  loanOfficers: Array<{ id: string; name: string }>;
  userRole: UserRole;
  onLeadUpdate: (updatedLead: Lead | MetaLead, source: 'lead' | 'meta') => void;
  onDeleteLead?: (leadId: string) => Promise<void>;
  selectedStatusFilter: string;
  searchQuery: string;
  selectedLOFilter: string | null;
  activeTab: 'leads' | 'meta' | 'all';
  initialDetailTab?: 'messages' | 'dm' | null;
  onInitialDetailTabHandled?: () => void;
  onMarkMessagesRead?: (leadId: string) => void;
  onInvalidateAttention?: (leadId: string) => Promise<void>;
  aiAttention?: { needsAttention: boolean; priority: number; badge: string; reason?: string; suggestedAction?: string } | null;
  onNavigateToCapture?: (captureId: string) => void;
};

export function LeadDetailView({
  selected,
  leads,
  metaLeads,
  onBack,
  onNavigate,
  onStatusChange,
  session,
  loanOfficers,
  userRole: propUserRole,
  onLeadUpdate,
  onDeleteLead,
  selectedStatusFilter,
  searchQuery,
  selectedLOFilter,
  activeTab,
  initialDetailTab,
  onInitialDetailTabHandled,
  onMarkMessagesRead,
  onInvalidateAttention,
  aiAttention,
  onNavigateToCapture,
}: LeadDetailViewProps) {
  const { colors, isDark } = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  const [activeDetailTab, setActiveDetailTab] = useState<'details' | 'messages' | 'dm'>('details');
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [dmUnreadCount, setDmUnreadCount] = useState(0);
  const [taskNote, setTaskNote] = useState('');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivityType, setSelectedActivityType] = useState<'call' | 'text' | 'email' | 'note'>('call');
  const [showQuickPhrases, setShowQuickPhrases] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [savingActivity, setSavingActivity] = useState(false);
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null);
  const [showLOPicker, setShowLOPicker] = useState(false);
  const [updatingLO, setUpdatingLO] = useState(false);
  const [showRealtorPicker, setShowRealtorPicker] = useState(false);
  const [updatingRealtor, setUpdatingRealtor] = useState(false);
  const [realtorSearchQuery, setRealtorSearchQuery] = useState('');
  const [availableRealtors, setAvailableRealtors] = useState<Array<{ id: string; first_name: string; last_name: string; brokerage?: string }>>([]);
  const [loadingRealtors, setLoadingRealtors] = useState(false);
  const [currentRealtorName, setCurrentRealtorName] = useState<string | null>(null);
  const [currentRealtorContact, setCurrentRealtorContact] = useState<CurrentRealtorContact | null>(null);
  const [savedContactKeys, setSavedContactKeys] = useState<string[]>([]);
  const [showAdImage, setShowAdImage] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [currentLOInfo, setCurrentLOInfo] = useState<{ firstName: string; lastName: string; phone: string; email: string; aiDraftAccess?: boolean; company?: string } | null>(null);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showCallbackModal, setShowCallbackModal] = useState(false);
  const [callbackDate, setCallbackDate] = useState<Date | null>(null);
  const [callbackNote, setCallbackNote] = useState('');
  const [savingCallback, setSavingCallback] = useState(false);
  const [useSpanishTemplates, setUseSpanishTemplates] = useState(false);
  const [deletingLead, setDeletingLead] = useState(false);
  const [templateMode, setTemplateMode] = useState<'text' | 'email'>('text');
  const [templates, setTemplates] = useState<TextTemplate[]>(TEXT_TEMPLATES);
  const [showCustomMessage, setShowCustomMessage] = useState(false);
  const [customMessageText, setCustomMessageText] = useState('');
  const [showAiRecommendation, setShowAiRecommendation] = useState(false);
  const [showImportDetails, setShowImportDetails] = useState(false);
  const [linkedCaptureId, setLinkedCaptureId] = useState<string | null>(null);
  
  // Tracking state
  const [isTracked, setIsTracked] = useState(false);
  const [trackingReason, setTrackingReason] = useState<TrackingReason>(null);
  const [trackingNote, setTrackingNote] = useState('');
  const [updatingTracking, setUpdatingTracking] = useState(false);
  const [savingTrackingNote, setSavingTrackingNote] = useState(false);
  const [showTrackingInfo, setShowTrackingInfo] = useState(false);
  
  // Partner Update state
  const [showPartnerUpdateModal, setShowPartnerUpdateModal] = useState(false);
  const [partnerUpdateMessage, setPartnerUpdateMessage] = useState('');
  const [sendingPartnerUpdate, setSendingPartnerUpdate] = useState(false);

  // Saved scenario sharing state
  const [leadScenarios, setLeadScenarios] = useState<LeadScenarioSummary[]>([]);
  const [scenarioLinks, setScenarioLinks] = useState<QualificationLinkSummary[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [scenarioActionKey, setScenarioActionKey] = useState<string | null>(null);
  const [qualificationSubmissions, setQualificationSubmissions] = useState<QualificationLinkSubmission[]>([]);
  const [qualificationSubmissionActionKey, setQualificationSubmissionActionKey] = useState<string | null>(null);
  const [scenarioSectionExpanded, setScenarioSectionExpanded] = useState(true);
  const [scenarioActivityClock, setScenarioActivityClock] = useState(Date.now());
  const scenarioSectionTouchedRef = useRef(false);
  const [savedIncomeAnalyses, setSavedIncomeAnalyses] = useState<SavedIncomeAnalysisSummary[]>([]);
  const [loadingIncomeAnalyses, setLoadingIncomeAnalyses] = useState(false);
  
  // Licensed realtor flag (for referral agreements visibility gate)
  const [isLicensedRealtor, setIsLicensedRealtor] = useState(false);
  
  // Docs-received SMS toast state
  const [smsToast, setSmsToast] = useState<{ visible: boolean; message: string; type: 'info' | 'success' | 'error' }>({ visible: false, message: '', type: 'info' });
  const smsToastOpacity = useRef(new Animated.Value(0)).current;
  
  // AI Rewrite refs
  const partnerAiRef = useRef<AiRewriteToolbarRef>(null);
  const customMsgAiRef = useRef<AiRewriteToolbarRef>(null);
  const [partnerCursorPos, setPartnerCursorPos] = useState<number>(0);
  
  // Voice notes state (expo-av)
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [uploadingVoiceNote, setUploadingVoiceNote] = useState(false);
  const [currentSound, setCurrentSound] = useState<Audio.Sound | null>(null);
  const [playingActivityId, setPlayingActivityId] = useState<string | null>(null);
  // Voice note preview state
  const [pendingVoiceNoteUri, setPendingVoiceNoteUri] = useState<string | null>(null);
  const [previewSound, setPreviewSound] = useState<Audio.Sound | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  // Micro animation for "Log Activity" button
  const logButtonScale = useRef(new Animated.Value(1)).current;
  const emailContentWidth = Math.max(windowWidth - 72, 200);
  const emailHtmlBaseStyle = StyleSheet.flatten(styles.emailBodyText) || {};
  const emailHtmlTagStyles = {
    body: emailHtmlBaseStyle,
    p: {
      marginTop: 0,
      marginBottom: 12,
      lineHeight: 18,
    },
    div: {
      marginTop: 0,
      marginBottom: 10,
    },
    span: {
      lineHeight: 18,
    },
    a: {
      color: '#2563EB',
      textDecorationLine: 'underline' as const,
    },
    blockquote: {
      borderLeftColor: '#CBD5E1',
      borderLeftWidth: 3,
      color: '#475569',
      marginLeft: 0,
      marginVertical: 8,
      paddingLeft: 12,
    },
    li: {
      marginBottom: 6,
    },
    table: {
      borderColor: '#CBD5E1',
    },
    td: {
      borderColor: '#CBD5E1',
      padding: 6,
    },
    th: {
      backgroundColor: '#E5E7EB',
      borderColor: '#CBD5E1',
      padding: 6,
    },
  };

  useEffect(() => {
    let isMounted = true;

    const loadTemplates = async () => {
      const remoteTemplates = await fetchLeadTemplates(true);
      if (isMounted && remoteTemplates.length > 0) {
        setTemplates(remoteTemplates);
      }
    };

    loadTemplates();

    return () => {
      isMounted = false;
    };
  }, [selected.id]);

  const animateLogButton = () => {
    Animated.sequence([
      Animated.timing(logButtonScale, {
        toValue: 0.96,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(logButtonScale, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();
  };
  
  const quickPhrases = [
    'Left voicemail',
    'Spoke with client',
    'Sent documents',
    'Scheduled follow-up',
    'No answer',
    'Client requested callback',
    'Discussed rates',
    'Pre-approval sent',
  ];
  
  const isMeta = selected.source === 'meta';
  
  // Helper functions to match the same filters as the list view
  const matchesSearch = (lead: Lead | MetaLead) => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').toLowerCase();
    const email = lead.email?.toLowerCase() || '';
    const phone = lead.phone?.toLowerCase() || '';
    
    return fullName.includes(query) || email.includes(query) || phone.includes(query);
  };

  const matchesLOFilter = (lead: Lead | MetaLead) => {
    // Only apply filter for super admins
    if (propUserRole !== 'super_admin') return true;
    
    // If no LO filter selected (null), show all leads
    if (selectedLOFilter === null) return true;
    
    // If "unassigned" filter, show leads without LO
    if (selectedLOFilter === 'unassigned') {
      return !lead.lo_id;
    }
    
    // Otherwise, filter by specific LO ID
    return lead.lo_id === selectedLOFilter;
  };
  
  const currentList = isMeta ? metaLeads : leads;
  const record = currentList.find((item) => item.id === selected.id);

  // Build the navigable list based on active tab
  let navigableList: Array<(Lead | MetaLead) & { source: 'lead' | 'meta' }>;
  
  if (activeTab === 'all') {
    // Combine both lists when on "all" tab
    const filteredMeta = metaLeads
      .filter(lead => {
        const matchesStatus = selectedStatusFilter === 'all' 
          ? lead.status !== 'unqualified' 
          : lead.status === selectedStatusFilter;
        return matchesStatus && matchesSearch(lead) && matchesLOFilter(lead);
      })
      .map(lead => ({ ...lead, source: 'meta' as const }));
    
    const filteredLeads = leads
      .filter(lead => {
        const matchesStatus = selectedStatusFilter === 'all' 
          ? lead.status !== 'unqualified' 
          : lead.status === selectedStatusFilter;
        return matchesStatus && matchesSearch(lead) && matchesLOFilter(lead);
      })
      .map(lead => ({ ...lead, source: 'lead' as const }));
    
    navigableList = sortLeadsByLastTouchedDesc([...filteredMeta, ...filteredLeads]);
  } else if (activeTab === 'meta') {
    // Only meta leads
    navigableList = sortLeadsByLastTouchedDesc(
      metaLeads
        .filter(lead => {
          const matchesStatus = selectedStatusFilter === 'all' 
            ? lead.status !== 'unqualified' 
            : lead.status === selectedStatusFilter;
          return matchesStatus && matchesSearch(lead) && matchesLOFilter(lead);
        })
        .map(lead => ({ ...lead, source: 'meta' as const }))
    );
  } else {
    // Only regular leads
    navigableList = sortLeadsByLastTouchedDesc(
      leads
        .filter(lead => {
          const matchesStatus = selectedStatusFilter === 'all' 
            ? lead.status !== 'unqualified' 
            : lead.status === selectedStatusFilter;
          return matchesStatus && matchesSearch(lead) && matchesLOFilter(lead);
        })
        .map(lead => ({ ...lead, source: 'lead' as const }))
    );
  }

  if (record && !navigableList.some((item) => item.id === selected.id && item.source === selected.source)) {
    navigableList = [{ ...record, source: selected.source }, ...navigableList];
  }
  
  const currentIndex = navigableList.findIndex((item) => item.id === selected.id && item.source === selected.source);
  
  const landingAdAttribution = getLandingAdAttribution(record);
  const savedMetaAdCreative = getSavedMetaAdCreative(record);
  const previewAdId = landingAdAttribution.adId;
  const previewPlatform = landingAdAttribution.platform;
  const previewAdName = landingAdAttribution.adName;
  const previewCampaignName = landingAdAttribution.campaignName;
  const savedAdImageUrl = getAdImageUrl(record);
  const bundledAdImage = getMetaAdImageAsset(previewAdName, previewCampaignName);
  const adImage: ImageSourcePropType | null = savedAdImageUrl ? { uri: savedAdImageUrl } : bundledAdImage;
  const hasAdAttribution = Boolean(
    record &&
      (
        isMeta ||
        previewAdId ||
        previewAdName ||
        previewCampaignName ||
        previewPlatform ||
        savedAdImageUrl
      )
  );

  // Initialize tracking state from record
  useEffect(() => {
    if (record) {
      setIsTracked(record.is_tracked || false);
      setTrackingReason(record.tracking_reason || null);
      setTrackingNote(record.tracking_note || '');
    }
  }, [record?.id, record?.is_tracked, record?.tracking_reason, record?.tracking_note]);

  // Look up linked quick capture via converted_lead_id / converted_meta_ad_id
  useEffect(() => {
    const lookupLinkedCapture = async () => {
      if (!record) { setLinkedCaptureId(null); return; }
      const col = isMeta ? 'converted_meta_ad_id' : 'converted_lead_id';
      const { data } = await supabase
        .from('quick_captures')
        .select('id')
        .eq(col, record.id)
        .limit(1)
        .maybeSingle();
      setLinkedCaptureId(data?.id ?? null);
    };
    lookupLinkedCapture();
  }, [record?.id, isMeta]);

  // Handle tracking toggle
  const handleToggleTracking = async () => {
    if (!record) return;
    setUpdatingTracking(true);
    const newTracked = !isTracked;
    const result = await toggleLeadTracking(
      record.id,
      isMeta ? 'meta' : 'lead',
      newTracked,
      newTracked ? 'manual' : null
    );
    if (result.success) {
      setIsTracked(newTracked);
      setTrackingReason(newTracked ? 'manual' : null);
      // Update parent state
      const updatedRecord = { ...record, is_tracked: newTracked, tracking_reason: newTracked ? 'manual' : null } as Lead | MetaLead;
      onLeadUpdate(updatedRecord, isMeta ? 'meta' : 'lead');
    } else {
      Alert.alert('Error', result.error || 'Failed to update tracking');
    }
    setUpdatingTracking(false);
  };

  // Handle tracking note save
  const handleSaveTrackingNote = async () => {
    if (!record) return;
    setSavingTrackingNote(true);
    const result = await updateTrackingNote(record.id, isMeta ? 'meta' : 'lead', trackingNote);
    if (result.success) {
      const updatedRecord = { ...record, tracking_note: trackingNote, tracking_note_updated_at: new Date().toISOString() } as Lead | MetaLead;
      onLeadUpdate(updatedRecord, isMeta ? 'meta' : 'lead');
    } else {
      Alert.alert('Error', result.error || 'Failed to save note');
    }
    setSavingTrackingNote(false);
    Keyboard.dismiss();
  };

  // Handle sending partner update
  const handleSendPartnerUpdate = async () => {
    if (!record || !partnerUpdateMessage.trim()) return;
    
    setSendingPartnerUpdate(true);
    try {
      // API base URL (must use www to avoid redirect issues)
      const API_BASE_URL = 'https://www.closewithmario.com';
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      const url = `${API_BASE_URL}/api/leads/partner-update`;
      console.log('📧 Sending partner update:', {
        url,
        leadId: record.id,
        source: isMeta ? 'meta' : 'organic',
        messageLength: partnerUpdateMessage.trim().length
      });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          leadId: record.id,
          message: partnerUpdateMessage.trim(),
          source: isMeta ? 'meta' : 'organic'
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      console.log('📧 Partner update response:', response.status);

      if (response.ok) {
        const now = new Date().toISOString();
        // Update local state
        const updatedRecord = { 
          ...record, 
          last_referral_update_at: now,
          last_referral_update_summary: partnerUpdateMessage.trim()
        } as Lead | MetaLead;
        onLeadUpdate(updatedRecord, isMeta ? 'meta' : 'lead');
        
        Alert.alert('Success', 'Partner update sent successfully!');
        setShowPartnerUpdateModal(false);
        setPartnerUpdateMessage('');
      } else {
        const errorText = await response.text().catch(() => '');
        console.error('📧 Partner update error response:', errorText);
        let errorMessage = 'Failed to send partner update';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {}
        Alert.alert('Error', errorMessage);
      }
    } catch (error: any) {
      console.error('📧 Error sending partner update:', error);
      if (error.name === 'AbortError') {
        Alert.alert('Timeout', 'Request timed out. Please check your connection and try again.');
      } else {
        Alert.alert('Error', `Failed to send partner update: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setSendingPartnerUpdate(false);
    }
  };


  // Check if partner update is available (has referral email or linked realtor)
  const hasPartnerEmail = record?.referral_source_email || (record?.realtor_id && currentRealtorName);
  const partnerName = record?.referral_source_name || currentRealtorName || 'Partner';
  const crmLeadSource: CrmLeadSource = isMeta ? 'meta' : 'organic';

  const fetchCrmApi = useCallback(async (
    path: string,
    init: { method?: string; body?: string; headers?: Record<string, string> } = {}
  ) => {
    const token = session?.access_token;
    if (!token) {
      throw new Error('Sign in again to manage scenario links.');
    }

    const response = await fetch(`${CRM_API_BASE_URL}${path}`, {
      method: init.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
      body: init.body,
    });

    const responseText = await response.text();
    let payload: Record<string, any> = {};
    if (responseText) {
      try {
        payload = JSON.parse(responseText);
      } catch {
        payload = { error: responseText };
      }
    }

    if (!response.ok) {
      throw new Error(payload.error || `CRM request failed (${response.status})`);
    }

    return payload;
  }, [session?.access_token]);

  const loadLeadScenarios = useCallback(async () => {
    if (!record) {
      setLeadScenarios([]);
      setScenarioLinks([]);
      setQualificationSubmissions([]);
      setScenarioSectionExpanded(true);
      scenarioSectionTouchedRef.current = false;
      return;
    }

    if (!session?.access_token) {
      setLeadScenarios([]);
      setScenarioLinks([]);
      setQualificationSubmissions([]);
      setScenarioError('Sign in again to load saved scenarios.');
      setScenarioSectionExpanded(true);
      scenarioSectionTouchedRef.current = false;
      return;
    }

    setLoadingScenarios(true);
    setScenarioError(null);

    try {
      const query = `leadId=${encodeURIComponent(record.id)}&source=${encodeURIComponent(crmLeadSource)}`;
      const [scenarioPayload, linkPayload, submissionPayload] = await Promise.all([
        fetchCrmApi(`/api/leads/scenarios?${query}`),
        fetchCrmApi(`/api/leads/qualification-link?${query}&all=1`),
        fetchCrmApi(`/api/leads/qualification-submissions?${query}`),
      ]);

      const nextScenarios = Array.isArray(scenarioPayload.scenarios) ? scenarioPayload.scenarios : [];
      setLeadScenarios(nextScenarios);
      setScenarioLinks(Array.isArray(linkPayload.links) ? linkPayload.links : []);
      setQualificationSubmissions(Array.isArray(submissionPayload.submissions) ? submissionPayload.submissions : []);
      setScenarioActivityClock(Date.now());
      if (!scenarioSectionTouchedRef.current) {
        setScenarioSectionExpanded(nextScenarios.length <= 2);
      }
    } catch (error: any) {
      console.error('[LeadDetail] Failed to load scenarios:', error);
      setLeadScenarios([]);
      setScenarioLinks([]);
      setQualificationSubmissions([]);
      setScenarioError(error?.message || 'Failed to load saved scenarios.');
    } finally {
      setLoadingScenarios(false);
    }
  }, [crmLeadSource, fetchCrmApi, record?.id, session?.access_token]);

  useEffect(() => {
    scenarioSectionTouchedRef.current = false;
    setScenarioSectionExpanded(true);
  }, [selected.id, selected.source]);

  useEffect(() => {
    if (activeDetailTab !== 'details') {
      return;
    }
    loadLeadScenarios().catch(() => undefined);
  }, [activeDetailTab, loadLeadScenarios]);

  useEffect(() => {
    if (activeDetailTab !== 'details' || scenarioLinks.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      setScenarioActivityClock(Date.now());
    }, 30000);

    return () => clearInterval(interval);
  }, [activeDetailTab, scenarioLinks.length]);

  useEffect(() => {
    if (!record || activeDetailTab !== 'details') {
      setSavedIncomeAnalyses([]);
      return;
    }

    let cancelled = false;
    setLoadingIncomeAnalyses(true);

    (async () => {
      try {
        const { data, error } = await supabase
          .from('lead_income_analyses')
          .select('id, name, analysis_type, borrower_label, employer_name, status, total_monthly_income, updated_at')
          .eq('lead_id', record.id)
          .eq('lead_source', crmLeadSource)
          .eq('analysis_type', 'w2')
          .is('archived_at', null)
          .order('updated_at', { ascending: false })
          .limit(3);

        if (cancelled) return;
        if (error) throw error;
        setSavedIncomeAnalyses((data || []) as SavedIncomeAnalysisSummary[]);
      } catch (error) {
        if (!cancelled) {
          console.error('[LeadDetail] Failed to load saved income analyses:', error);
          setSavedIncomeAnalyses([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingIncomeAnalyses(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeDetailTab, crmLeadSource, record?.id]);

  const getActiveScenarioLink = (scenarioId: string, recipientType: 'borrower' | 'realtor') => {
    return scenarioLinks.find((link) => {
      if (link.scenarioId !== scenarioId || link.status !== 'active') {
        return false;
      }
      return recipientType === 'borrower'
        ? link.recipientType === 'borrower'
        : link.recipientType === 'realtor';
    }) || null;
  };

  const updateTouchedAtFromScenarioResult = (payload: Record<string, any>) => {
    if (!record || typeof payload.touchedAt !== 'string') return;
    onLeadUpdate({ ...record, last_touched_at: payload.touchedAt } as Lead | MetaLead, isMeta ? 'meta' : 'lead');
  };

  const createScenarioLink = async (
    scenario: LeadScenarioSummary,
    recipientType: 'borrower' | 'realtor',
    sendEmail: boolean
  ) => {
    if (!record) {
      Alert.alert('Scenario Link', 'Lead not found.');
      return;
    }

    const leadId = record.id;
    const actionKey = `${sendEmail ? 'email' : 'create'}:${scenario.id}:${recipientType}`;
    setScenarioActionKey(actionKey);
    setScenarioError(null);

    try {
      const payload = await fetchCrmApi('/api/leads/qualification-link', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          leadId,
          source: crmLeadSource,
          scenarioId: scenario.id,
          recipientType,
          recipientKey: recipientType,
          sendEmail,
        }),
      });

      updateTouchedAtFromScenarioResult(payload);
      await loadLeadScenarios();
      Alert.alert('Scenario Link', sendEmail ? 'Scenario link emailed.' : 'Scenario link generated.');
    } catch (error: any) {
      console.error('[LeadDetail] Failed to create scenario link:', error);
      const message = error?.message || 'Failed to create scenario link.';
      setScenarioError(message);
      Alert.alert('Scenario Link', message);
    } finally {
      setScenarioActionKey(null);
    }
  };

  const revokeScenarioLink = async (link: QualificationLinkSummary) => {
    setScenarioActionKey(`revoke:${link.id}`);
    setScenarioError(null);

    try {
      const payload = await fetchCrmApi('/api/leads/qualification-link', {
        method: 'POST',
        body: JSON.stringify({
          action: 'revoke',
          linkId: link.id,
        }),
      });

      updateTouchedAtFromScenarioResult(payload);
      await loadLeadScenarios();
      Alert.alert('Scenario Link', 'Scenario link disabled.');
    } catch (error: any) {
      console.error('[LeadDetail] Failed to disable scenario link:', error);
      const message = error?.message || 'Failed to disable scenario link.';
      setScenarioError(message);
      Alert.alert('Scenario Link', message);
    } finally {
      setScenarioActionKey(null);
    }
  };

  const reviewQualificationSubmission = async (
    submission: QualificationLinkSubmission,
    action: 'apply' | 'dismiss'
  ) => {
    const actionKey = `${action}:${submission.id}`;
    setQualificationSubmissionActionKey(actionKey);
    setScenarioError(null);

    try {
      const payload = await fetchCrmApi('/api/leads/qualification-submissions', {
        method: 'POST',
        body: JSON.stringify({
          action,
          submissionId: submission.id,
        }),
      });

      updateTouchedAtFromScenarioResult(payload);
      await loadLeadScenarios();
      Alert.alert(
        'Scenario Update',
        action === 'apply' ? 'Submitted changes applied.' : 'Submitted changes dismissed.'
      );
    } catch (error: any) {
      console.error('[LeadDetail] Failed to review scenario update:', error);
      const message = error?.message || 'Failed to review submitted update.';
      setScenarioError(message);
      Alert.alert('Scenario Update', message);
    } finally {
      setQualificationSubmissionActionKey(null);
    }
  };

  const copyScenarioLink = (link: QualificationLinkSummary) => {
    Clipboard.setString(link.publicUrl);
    Alert.alert('Copied', 'Scenario link copied.');
  };

  const shareScenarioLink = async (scenario: LeadScenarioSummary, link: QualificationLinkSummary) => {
    const message = `${scenario.name || 'Payment scenario'}\n${link.publicUrl}`;
    try {
      await Share.share({
        title: scenario.name || 'Payment scenario',
        message,
        url: link.publicUrl,
      });
    } catch (error: any) {
      Alert.alert('Share Scenario', error?.message || 'Unable to open the share sheet.');
    }
  };

  const textScenarioLink = (scenario: LeadScenarioSummary, link: QualificationLinkSummary) => {
    const recipientPhone = link.recipientPhone || (link.recipientType === 'borrower' ? record?.phone : null);
    if (!recipientPhone) {
      Alert.alert('Text Scenario', 'This recipient does not have a phone number on file.');
      return;
    }

    const body = `Here is the payment scenario for ${fullName}: ${link.publicUrl}`;
    Linking.openURL(`sms:${recipientPhone}?body=${encodeURIComponent(body)}`);
  };

  const emailScenarioLink = (scenario: LeadScenarioSummary, link: QualificationLinkSummary) => {
    const recipientEmail =
      link.recipientEmail ||
      (link.recipientType === 'borrower' ? record?.email : record?.referral_source_email);
    if (!recipientEmail) {
      Alert.alert('Email Scenario', 'This recipient does not have an email address on file.');
      return;
    }

    const subject = encodeURIComponent(`Payment scenario${fullName ? ` for ${fullName}` : ''}`);
    const body = encodeURIComponent(`Hi,\n\nHere is the payment scenario:\n${link.publicUrl}\n\nThis is an estimate only and does not guarantee loan approval.`);
    Linking.openURL(`mailto:${recipientEmail}?subject=${subject}&body=${body}`);
  };

  const showScenarioRecipientActions = (
    scenario: LeadScenarioSummary,
    recipientType: 'borrower' | 'realtor'
  ) => {
    const link = getActiveScenarioLink(scenario.id, recipientType);
    const label = recipientType === 'borrower' ? 'Buyer' : 'Partner/Realtor';

    if (!link) {
      Alert.alert(`${label} Scenario Link`, 'Create a tracked share link for this saved scenario.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Generate Link', onPress: () => createScenarioLink(scenario, recipientType, false) },
        { text: 'Email Link', onPress: () => createScenarioLink(scenario, recipientType, true) },
      ]);
      return;
    }

    const actions: Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }> = [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Copy Link', onPress: () => copyScenarioLink(link) },
      { text: 'Share Link', onPress: () => shareScenarioLink(scenario, link) },
      { text: 'Open Link', onPress: () => Linking.openURL(link.publicUrl) },
    ];

    if (link.recipientPhone || (recipientType === 'borrower' && record?.phone)) {
      actions.push({ text: 'Text Link', onPress: () => textScenarioLink(scenario, link) });
    }

    if (link.recipientEmail || (recipientType === 'borrower' ? record?.email : record?.referral_source_email)) {
      actions.push({ text: 'Email Link', onPress: () => emailScenarioLink(scenario, link) });
    }

    actions.push({ text: 'Disable Link', style: 'destructive', onPress: () => revokeScenarioLink(link) });

    Alert.alert(`${label} Scenario Link`, scenario.name || 'Saved scenario', actions);
  };

  const renderScenarioSharingSection = () => {
    const scenarioCountLabel = leadScenarios.length === 1 ? '1 saved scenario' : `${leadScenarios.length} saved scenarios`;
    const hasCollapsibleScenarios = leadScenarios.length > 2;
    const showScenarioList = !hasCollapsibleScenarios || scenarioSectionExpanded;
    const featuredScenario = leadScenarios.find((scenario) => scenario.isPrimary) || leadScenarios[0] || null;
    const featuredSnapshot = featuredScenario ? getRecordValue(featuredScenario.resultSnapshot) || {} : {};
    const featuredScenarioData = featuredScenario ? getRecordValue(featuredScenario.scenarioData) || {} : {};
    const featuredPaymentBreakdown = getRecordValue(featuredSnapshot.paymentBreakdown) || {};
    const featuredCashToCloseDetails = getRecordValue(featuredSnapshot.cashToCloseDetails) || {};
    const featuredPayment = getScenarioCurrencyDisplay(featuredSnapshot.totalPayment, featuredPaymentBreakdown.totalPayment);
    const featuredCashToClose = getScenarioCurrencyDisplay(featuredCashToCloseDetails.cashToClose, featuredSnapshot.cashToClose);
    const featuredSalesPrice = getScenarioCurrencyDisplay(featuredSnapshot.salesPrice, featuredScenarioData.salesPrice);
    const scenarioNow = scenarioActivityClock;
    const buyerViewingNow = scenarioLinks.some((link) => (
      link.recipientType === 'borrower' && isScenarioLinkViewingNow(link, scenarioNow)
    ));
    const partnerViewingNow = scenarioLinks.some((link) => (
      link.recipientType === 'realtor' && isScenarioLinkViewingNow(link, scenarioNow)
    ));
    const hasViewingNow = buyerViewingNow || partnerViewingNow;
    const pendingSubmissions = qualificationSubmissions.filter((submission) => submission.status === 'pending');

    const toggleScenarioSection = () => {
      if (!hasCollapsibleScenarios) return;
      scenarioSectionTouchedRef.current = true;
      setScenarioSectionExpanded((expanded) => !expanded);
    };

    return (
      <View style={scenarioShareStyles.container}>
        <View style={scenarioShareStyles.headerRow}>
          <TouchableOpacity
            style={scenarioShareStyles.headerTitleRow}
            onPress={toggleScenarioSection}
            disabled={!hasCollapsibleScenarios}
            activeOpacity={0.75}
          >
            <Ionicons name="albums-outline" size={17} color={PLUM} />
            <Text style={[scenarioShareStyles.title, { color: colors.textPrimary }]}>
              {leadScenarios.length > 0 ? `Scenarios (${leadScenarios.length})` : 'Scenarios'}
            </Text>
            {hasCollapsibleScenarios && (
              <Ionicons
                name={scenarioSectionExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={PLUM}
              />
            )}
          </TouchableOpacity>
          <View style={scenarioShareStyles.headerActions}>
            <TouchableOpacity
              style={scenarioShareStyles.iconButton}
              onPress={loadLeadScenarios}
              disabled={loadingScenarios}
            >
              {loadingScenarios ? (
                <ActivityIndicator size="small" color={PLUM} />
              ) : (
                <Ionicons name="refresh" size={16} color={PLUM} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[scenarioShareStyles.subtitle, { color: colors.textSecondary }]}>
          {leadScenarios.length > 0
            ? `${scenarioCountLabel}. ${hasCollapsibleScenarios && !scenarioSectionExpanded ? 'Expand to manage tracked borrower or partner links.' : 'Generate and manage tracked borrower or partner links from the saved web scenarios.'}`
            : 'Saved scenarios are created from the desktop CRM calculator.'}
        </Text>

        {hasViewingNow && (
          <View style={scenarioShareStyles.viewingNowRow}>
            {buyerViewingNow && (
              <View style={scenarioShareStyles.viewingNowPill}>
                <View style={scenarioShareStyles.viewingNowDot} />
                <Text style={scenarioShareStyles.viewingNowText}>Buyer viewing now</Text>
              </View>
            )}
            {partnerViewingNow && (
              <View style={scenarioShareStyles.viewingNowPill}>
                <View style={scenarioShareStyles.viewingNowDot} />
                <Text style={scenarioShareStyles.viewingNowText}>Partner viewing now</Text>
              </View>
            )}
          </View>
        )}

        {pendingSubmissions.length > 0 && (
          <View style={scenarioShareStyles.pendingUpdatesBox}>
            <View style={scenarioShareStyles.pendingUpdatesHeader}>
              <View style={scenarioShareStyles.pendingUpdatesTitleRow}>
                <Ionicons name="calculator-outline" size={16} color="#B45309" />
                <Text style={scenarioShareStyles.pendingUpdatesTitle}>
                  {pendingSubmissions.length} pending scenario update{pendingSubmissions.length === 1 ? '' : 's'}
                </Text>
              </View>
              <TouchableOpacity onPress={loadLeadScenarios} disabled={loadingScenarios}>
                <Ionicons name="refresh" size={15} color="#B45309" />
              </TouchableOpacity>
            </View>

            {pendingSubmissions.map((submission) => {
              const actionBusy =
                qualificationSubmissionActionKey === `apply:${submission.id}` ||
                qualificationSubmissionActionKey === `dismiss:${submission.id}`;

              return (
                <View key={submission.id} style={scenarioShareStyles.pendingUpdateCard}>
                  <View style={scenarioShareStyles.pendingUpdateHeader}>
                    <View style={scenarioShareStyles.pendingUpdateTitleBlock}>
                      <Text style={scenarioShareStyles.pendingUpdateSubmitter} numberOfLines={1}>
                        {formatQualificationSubmitter(submission)}
                      </Text>
                      <Text style={scenarioShareStyles.pendingUpdateMeta} numberOfLines={2}>
                        {[submission.scenarioName || 'Saved scenario', formatScenarioDateTime(submission.submittedAt)].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <View style={scenarioShareStyles.pendingPill}>
                      <Text style={scenarioShareStyles.pendingPillText}>Pending</Text>
                    </View>
                  </View>

                  <View style={scenarioShareStyles.pendingChangeList}>
                    {submission.changedSummary.length > 0 ? (
                      submission.changedSummary.map((change, changeIndex) => (
                        <View key={`${submission.id}:${change.key || changeIndex}`} style={scenarioShareStyles.pendingChangeRow}>
                          <Text style={scenarioShareStyles.pendingChangeLabel} numberOfLines={1}>
                            {change.label || change.key || 'Changed field'}
                          </Text>
                          <Text style={scenarioShareStyles.pendingChangeValue} numberOfLines={2}>
                            {formatQualificationChangeValue(change, 'before')} → {formatQualificationChangeValue(change, 'after')}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={scenarioShareStyles.pendingUpdateMeta}>No field summary was included.</Text>
                    )}
                  </View>

                  <View style={scenarioShareStyles.pendingActionRow}>
                    <TouchableOpacity
                      style={[scenarioShareStyles.dismissButton, actionBusy && scenarioShareStyles.actionButtonDisabled]}
                      onPress={() => reviewQualificationSubmission(submission, 'dismiss')}
                      disabled={Boolean(qualificationSubmissionActionKey)}
                    >
                      <Text style={scenarioShareStyles.dismissButtonText}>Dismiss</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[scenarioShareStyles.applyButton, actionBusy && scenarioShareStyles.actionButtonDisabled]}
                      onPress={() => reviewQualificationSubmission(submission, 'apply')}
                      disabled={Boolean(qualificationSubmissionActionKey)}
                    >
                      {qualificationSubmissionActionKey === `apply:${submission.id}` ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={scenarioShareStyles.applyButtonText}>Apply</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {scenarioError && (
          <View style={scenarioShareStyles.errorBox}>
            <Ionicons name="alert-circle-outline" size={15} color="#B91C1C" />
            <Text style={scenarioShareStyles.errorText}>{scenarioError}</Text>
          </View>
        )}

        {loadingScenarios && leadScenarios.length === 0 ? (
          <View style={scenarioShareStyles.emptyBox}>
            <ActivityIndicator size="small" color={PLUM} />
            <Text style={[scenarioShareStyles.emptyText, { color: colors.textSecondary }]}>
              Loading saved scenarios...
            </Text>
          </View>
        ) : leadScenarios.length === 0 ? (
          <View style={scenarioShareStyles.emptyBox}>
            <Ionicons name="calculator-outline" size={18} color="#64748B" />
            <Text style={[scenarioShareStyles.emptyText, { color: colors.textSecondary }]}>
              No saved scenarios yet. Create one from the desktop CRM, then refresh this section.
            </Text>
          </View>
        ) : !showScenarioList && featuredScenario ? (
          <TouchableOpacity
            style={[
              scenarioShareStyles.scenarioCard,
              scenarioShareStyles.collapsedScenarioCard,
              { backgroundColor: colors.cardBackground, borderColor: colors.border },
            ]}
            onPress={toggleScenarioSection}
            activeOpacity={0.75}
          >
            <View style={scenarioShareStyles.scenarioHeader}>
              <View style={scenarioShareStyles.scenarioTitleBlock}>
                <View style={scenarioShareStyles.scenarioNameRow}>
                  <Text style={[scenarioShareStyles.scenarioIndex, { color: colors.textSecondary }]}>
                    {featuredScenario.isPrimary ? 'Primary Scenario' : 'Latest Scenario'}
                  </Text>
                  {featuredScenario.isPrimary && (
                    <View style={scenarioShareStyles.primaryPill}>
                      <Text style={scenarioShareStyles.primaryPillText}>Primary</Text>
                    </View>
                  )}
                </View>
                <Text style={[scenarioShareStyles.scenarioName, { color: colors.textPrimary }]} numberOfLines={2}>
                  {featuredScenario.name || 'Saved scenario'}
                </Text>
                {formatScenarioDateTime(featuredScenario.updatedAt) && (
                  <Text style={[scenarioShareStyles.scenarioUpdated, { color: colors.textSecondary }]}>
                    Updated {formatScenarioDateTime(featuredScenario.updatedAt)}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-down" size={18} color={PLUM} />
            </View>

            <View style={scenarioShareStyles.metricGrid}>
              <View style={scenarioShareStyles.metricItem}>
                <Text style={[scenarioShareStyles.metricLabel, { color: colors.textSecondary }]}>Payment</Text>
                <Text style={[scenarioShareStyles.metricValue, { color: colors.textPrimary }]}>
                  {featuredPayment || '-'}
                </Text>
              </View>
              <View style={scenarioShareStyles.metricItem}>
                <Text style={[scenarioShareStyles.metricLabel, { color: colors.textSecondary }]}>Cash to Close</Text>
                <Text style={[scenarioShareStyles.metricValue, { color: colors.textPrimary }]}>
                  {featuredCashToClose || '-'}
                </Text>
              </View>
              <View style={scenarioShareStyles.metricItem}>
                <Text style={[scenarioShareStyles.metricLabel, { color: colors.textSecondary }]}>Price</Text>
                <Text style={[scenarioShareStyles.metricValue, { color: colors.textPrimary }]}>
                  {featuredSalesPrice || '-'}
                </Text>
              </View>
            </View>
            <Text style={[scenarioShareStyles.collapsedHint, { color: colors.textSecondary }]}>
              Tap to show all scenarios.
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={scenarioShareStyles.scenarioList}>
            {leadScenarios.map((scenario, index) => {
              const snapshot = getRecordValue(scenario.resultSnapshot) || {};
              const scenarioData = getRecordValue(scenario.scenarioData) || {};
              const paymentBreakdown = getRecordValue(snapshot.paymentBreakdown) || {};
              const cashToCloseDetails = getRecordValue(snapshot.cashToCloseDetails) || {};
              const qualification = getRecordValue(snapshot.qualification) || {};
              const borrowerLink = getActiveScenarioLink(scenario.id, 'borrower');
              const realtorLink = getActiveScenarioLink(scenario.id, 'realtor');
              const borrowerViewingNow = isScenarioLinkViewingNow(borrowerLink, scenarioNow);
              const realtorViewingNow = isScenarioLinkViewingNow(realtorLink, scenarioNow);
              const payment = getScenarioCurrencyDisplay(snapshot.totalPayment, paymentBreakdown.totalPayment);
              const cashToClose = getScenarioCurrencyDisplay(cashToCloseDetails.cashToClose, snapshot.cashToClose);
              const salesPrice = getScenarioCurrencyDisplay(snapshot.salesPrice, scenarioData.salesPrice);
              const rate = getScenarioPercentDisplay(snapshot.interestRate, scenarioData.interestRate);
              const loanType = typeof snapshot.loanType === 'string'
                ? snapshot.loanType
                : typeof scenarioData.loanType === 'string'
                  ? scenarioData.loanType
                  : null;
              const housingRatio = getScenarioPercentDisplay(qualification.housingRatio);
              const dtiRatio = getScenarioPercentDisplay(qualification.dtiRatio);
              const hasQualificationResult = typeof qualification.overallWithinLimit === 'boolean';
              const actionBusy = scenarioActionKey?.includes(`:${scenario.id}:`) || false;

              return (
                <View
                  key={scenario.id}
                  style={[
                    scenarioShareStyles.scenarioCard,
                    { backgroundColor: colors.cardBackground, borderColor: colors.border },
                  ]}
                >
                  <View style={scenarioShareStyles.scenarioHeader}>
                    <View style={scenarioShareStyles.scenarioTitleBlock}>
                      <View style={scenarioShareStyles.scenarioNameRow}>
                        <Text style={[scenarioShareStyles.scenarioIndex, { color: colors.textSecondary }]}>
                          {`Scenario ${index + 1}`}
                        </Text>
                        {scenario.isPrimary && (
                          <View style={scenarioShareStyles.primaryPill}>
                            <Text style={scenarioShareStyles.primaryPillText}>Primary</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[scenarioShareStyles.scenarioName, { color: colors.textPrimary }]} numberOfLines={2}>
                        {scenario.name || 'Saved scenario'}
                      </Text>
                      {formatScenarioDateTime(scenario.updatedAt) && (
                        <Text style={[scenarioShareStyles.scenarioUpdated, { color: colors.textSecondary }]}>
                          Updated {formatScenarioDateTime(scenario.updatedAt)}
                        </Text>
                      )}
                    </View>
                    {hasQualificationResult && (
                      <View
                        style={[
                          scenarioShareStyles.qualificationPill,
                          qualification.overallWithinLimit
                            ? scenarioShareStyles.qualificationPillOk
                            : scenarioShareStyles.qualificationPillWarn,
                        ]}
                      >
                        <Text
                          style={[
                            scenarioShareStyles.qualificationPillText,
                            qualification.overallWithinLimit
                              ? scenarioShareStyles.qualificationPillTextOk
                              : scenarioShareStyles.qualificationPillTextWarn,
                          ]}
                        >
                          {qualification.overallWithinLimit ? 'OK' : 'Review'}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={scenarioShareStyles.metricGrid}>
                    <View style={scenarioShareStyles.metricItem}>
                      <Text style={[scenarioShareStyles.metricLabel, { color: colors.textSecondary }]}>Payment</Text>
                      <Text style={[scenarioShareStyles.metricValue, { color: colors.textPrimary }]}>
                        {payment || '-'}
                      </Text>
                    </View>
                    <View style={scenarioShareStyles.metricItem}>
                      <Text style={[scenarioShareStyles.metricLabel, { color: colors.textSecondary }]}>Cash to Close</Text>
                      <Text style={[scenarioShareStyles.metricValue, { color: colors.textPrimary }]}>
                        {cashToClose || '-'}
                      </Text>
                    </View>
                    <View style={scenarioShareStyles.metricItem}>
                      <Text style={[scenarioShareStyles.metricLabel, { color: colors.textSecondary }]}>Price</Text>
                      <Text style={[scenarioShareStyles.metricValue, { color: colors.textPrimary }]}>
                        {salesPrice || '-'}
                      </Text>
                    </View>
                    <View style={scenarioShareStyles.metricItem}>
                      <Text style={[scenarioShareStyles.metricLabel, { color: colors.textSecondary }]}>Rate</Text>
                      <Text style={[scenarioShareStyles.metricValue, { color: colors.textPrimary }]}>
                        {rate || '-'}
                      </Text>
                    </View>
                  </View>

                  {(loanType || housingRatio || dtiRatio) && (
                    <Text style={[scenarioShareStyles.scenarioMeta, { color: colors.textSecondary }]}>
                      {[loanType, housingRatio ? `Housing ${housingRatio}` : null, dtiRatio ? `DTI ${dtiRatio}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  )}

                  <View style={scenarioShareStyles.linkStatusRow}>
                    <View
                      style={[
                        scenarioShareStyles.linkPill,
                        borrowerLink ? scenarioShareStyles.linkPillActive : scenarioShareStyles.linkPillInactive,
                      ]}
                    >
                      <Ionicons
                        name={borrowerLink ? 'checkmark-circle' : 'ellipse-outline'}
                        size={13}
                        color={borrowerLink ? '#047857' : '#64748B'}
                      />
                      <Text
                        style={[
                          scenarioShareStyles.linkPillText,
                          borrowerLink ? scenarioShareStyles.linkPillTextActive : scenarioShareStyles.linkPillTextInactive,
                        ]}
                      >
                        Buyer {borrowerLink ? (borrowerViewingNow ? 'viewing now' : 'link live') : 'not sent'}
                      </Text>
                    </View>
                    <View
                      style={[
                        scenarioShareStyles.linkPill,
                        realtorLink ? scenarioShareStyles.linkPillActive : scenarioShareStyles.linkPillInactive,
                      ]}
                    >
                      <Ionicons
                        name={realtorLink ? 'checkmark-circle' : 'ellipse-outline'}
                        size={13}
                        color={realtorLink ? '#047857' : '#64748B'}
                      />
                      <Text
                        style={[
                          scenarioShareStyles.linkPillText,
                          realtorLink ? scenarioShareStyles.linkPillTextActive : scenarioShareStyles.linkPillTextInactive,
                        ]}
                      >
                        Partner {realtorLink ? (realtorViewingNow ? 'viewing now' : 'link live') : 'not sent'}
                      </Text>
                    </View>
                  </View>

                  {(borrowerLink || realtorLink) && (
                    <View style={scenarioShareStyles.activityRow}>
                      {borrowerLink && (
                        <Text style={[scenarioShareStyles.activityText, { color: colors.textSecondary }]}>
                          {formatScenarioOpenSummary('Buyer', borrowerLink, scenarioNow)}
                        </Text>
                      )}
                      {realtorLink && (
                        <Text style={[scenarioShareStyles.activityText, { color: colors.textSecondary }]}>
                          {formatScenarioOpenSummary('Partner', realtorLink, scenarioNow)}
                        </Text>
                      )}
                    </View>
                  )}

                  <View style={scenarioShareStyles.actionRow}>
                    <TouchableOpacity
                      style={[
                        scenarioShareStyles.actionButton,
                        scenarioShareStyles.borrowerButton,
                        (scenarioActionKey !== null || actionBusy) && scenarioShareStyles.actionButtonDisabled,
                      ]}
                      onPress={() => showScenarioRecipientActions(scenario, 'borrower')}
                      disabled={scenarioActionKey !== null}
                    >
                      <Ionicons name="person-outline" size={14} color={PLUM} />
                      <Text style={scenarioShareStyles.borrowerButtonText}>
                        {borrowerLink ? 'Buyer Link' : 'Share Buyer'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        scenarioShareStyles.actionButton,
                        scenarioShareStyles.partnerButton,
                        (!hasPartnerEmail || scenarioActionKey !== null || actionBusy) && scenarioShareStyles.actionButtonDisabled,
                      ]}
                      onPress={() => showScenarioRecipientActions(scenario, 'realtor')}
                      disabled={!hasPartnerEmail || scenarioActionKey !== null}
                    >
                      <Ionicons name="people-outline" size={14} color="#FFFFFF" />
                      <Text style={scenarioShareStyles.partnerButtonText}>
                        {realtorLink ? 'Partner Link' : 'Share Partner'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderIncomeAnalysisSection = () => {
    const latestIncomeAnalysis = savedIncomeAnalyses[0] || null;

    return (
      <View style={incomeAnalysisStyles.container}>
        <View style={incomeAnalysisStyles.headerRow}>
          <View style={incomeAnalysisStyles.titleRow}>
            <View style={incomeAnalysisStyles.iconWrap}>
              <Ionicons name="cash-outline" size={16} color="#047857" />
            </View>
            <View style={incomeAnalysisStyles.titleBlock}>
              <Text style={[incomeAnalysisStyles.title, { color: colors.textPrimary }]}>Income Analysis</Text>
              <Text style={[incomeAnalysisStyles.subtitle, { color: colors.textSecondary }]}>
                {loadingIncomeAnalyses
                  ? 'Checking saved W-2 calculations...'
                  : latestIncomeAnalysis
                    ? `Updated ${formatScenarioDateTime(latestIncomeAnalysis.updated_at) || 'recently'}`
                    : 'No saved income analysis yet.'}
              </Text>
            </View>
          </View>

          {latestIncomeAnalysis && (
            <View style={[incomeAnalysisStyles.statusPill, getIncomeAnalysisStatusStyle(latestIncomeAnalysis.status)]}>
              <Text style={incomeAnalysisStyles.statusPillText}>
                {getIncomeAnalysisStatusLabel(latestIncomeAnalysis.status)}
              </Text>
            </View>
          )}
        </View>

        {loadingIncomeAnalyses ? (
          <View style={incomeAnalysisStyles.emptyBox}>
            <ActivityIndicator size="small" color="#047857" />
            <Text style={[incomeAnalysisStyles.emptyText, { color: colors.textSecondary }]}>Loading saved income...</Text>
          </View>
        ) : latestIncomeAnalysis ? (
          <>
            <View style={incomeAnalysisStyles.metricGrid}>
              <View style={incomeAnalysisStyles.metricItem}>
                <Text style={incomeAnalysisStyles.metricLabel}>Monthly Total</Text>
                <Text style={[incomeAnalysisStyles.metricValue, { color: colors.textPrimary }]}>
                  {formatIncomeAnalysisMoney(latestIncomeAnalysis.total_monthly_income)}
                </Text>
              </View>
              <View style={incomeAnalysisStyles.metricItem}>
                <Text style={incomeAnalysisStyles.metricLabel}>Type</Text>
                <Text style={[incomeAnalysisStyles.metricValue, { color: colors.textPrimary }]}>W-2 Income</Text>
              </View>
            </View>

            <View style={incomeAnalysisStyles.detailList}>
              <View style={incomeAnalysisStyles.detailRow}>
                <Text style={[incomeAnalysisStyles.detailLabel, { color: colors.textSecondary }]}>Name</Text>
                <Text style={[incomeAnalysisStyles.detailValue, { color: colors.textPrimary }]} numberOfLines={1}>
                  {latestIncomeAnalysis.name || 'Saved analysis'}
                </Text>
              </View>
              {(latestIncomeAnalysis.borrower_label || latestIncomeAnalysis.employer_name) && (
                <View style={incomeAnalysisStyles.detailRow}>
                  <Text style={[incomeAnalysisStyles.detailLabel, { color: colors.textSecondary }]}>Borrower / Employer</Text>
                  <Text style={[incomeAnalysisStyles.detailValue, { color: colors.textPrimary }]} numberOfLines={1}>
                    {[latestIncomeAnalysis.borrower_label, latestIncomeAnalysis.employer_name].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              )}
              {savedIncomeAnalyses.length > 1 && (
                <View style={incomeAnalysisStyles.detailRow}>
                  <Text style={[incomeAnalysisStyles.detailLabel, { color: colors.textSecondary }]}>Saved analyses</Text>
                  <Text style={[incomeAnalysisStyles.detailValue, { color: colors.textPrimary }]}>
                    {savedIncomeAnalyses.length}
                  </Text>
                </View>
              )}
            </View>
          </>
        ) : (
          <View style={incomeAnalysisStyles.emptyBox}>
            <Ionicons name="document-text-outline" size={16} color="#64748B" />
            <Text style={[incomeAnalysisStyles.emptyText, { color: colors.textSecondary }]}>No saved income analysis yet.</Text>
          </View>
        )}
      </View>
    );
  };

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < navigableList.length - 1;

  const handlePrevious = () => {
    if (hasPrevious) {
      const prevLead = navigableList[currentIndex - 1];
      onNavigate({ source: prevLead.source, id: prevLead.id });
    }
  };

  const handleNext = () => {
    if (hasNext) {
      const nextLead = navigableList[currentIndex + 1];
      onNavigate({ source: nextLead.source, id: nextLead.id });
    }
  };

  const fullName =
    record
      ? [record.first_name, record.last_name].filter(Boolean).join(' ') || '(No name)'
      : '(No name)';
  const status = record?.status || 'No status';
  const email = record?.email || '';
  const phone = record?.phone || '';
  const contactCandidates = buildLeadContactCandidates({
    record,
    isMeta,
    phone,
    email,
    currentRealtorName,
    currentRealtorContact,
  });
  const callableContactCandidates = contactCandidates.filter((contact) => !!contact.phone.trim());
  const hasCallableContacts = callableContactCandidates.length > 0;
  const hasSavableContacts = contactCandidates.length > 0;
  const metaPlatform = isMeta ? (record as MetaLead | undefined)?.platform ?? null : null;
  const metaDmTabIcon = getMetaDmTabIcon(metaPlatform);
  const showMessagesTab = !!phone;
  const showDmTab = isMeta;
  const hasDetailTabs = showMessagesTab || showDmTab;
  const sourceDetail = !isMeta ? (record as Lead | undefined)?.source_detail || null : (record as MetaLead | undefined)?.source_detail || null;
  const dealSnapshotSourceLabel = record ? getDealSnapshotSourceLabel(record, isMeta, previewPlatform) : null;
  const formatTabBadgeCount = (count: number) => (count > 99 ? '99+' : String(count));

  const loadDetailMessageIndicators = useCallback(async () => {
    let nextMessageUnreadCount = 0;
    let nextDmUnreadCount = 0;

    if (showMessagesTab) {
      const { count, error } = await supabase
        .from('sms_messages')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', selected.id)
        .eq('direction', 'inbound')
        .is('read_at', null);

      if (error) {
        console.error('[LeadDetailView] Failed to load unread SMS count', error);
      } else {
        nextMessageUnreadCount = count ?? 0;
      }
    }

    if (showDmTab) {
      const { count, error } = await supabase
        .from('meta_dm_messages')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', selected.id)
        .eq('lead_source', 'meta')
        .eq('direction', 'inbound')
        .is('read_at', null);

      if (error) {
        console.error('[LeadDetailView] Failed to load unread DM count', error);
      } else {
        nextDmUnreadCount = count ?? 0;
      }
    }

    return {
      messageUnreadCount: nextMessageUnreadCount,
      dmUnreadCount: nextDmUnreadCount,
    };
  }, [selected.id, showDmTab, showMessagesTab]);

  useEffect(() => {
    let cancelled = false;

    const loadIndicators = async () => {
      const counts = await loadDetailMessageIndicators();
      if (cancelled) return;

      setMessageUnreadCount(counts.messageUnreadCount);
      setDmUnreadCount(counts.dmUnreadCount);
    };

    void loadIndicators();

    return () => {
      cancelled = true;
    };
  }, [loadDetailMessageIndicators]);

  useEffect(() => {
    let cancelled = false;

    const loadSavedContactKeys = async () => {
      try {
        const stored = await AsyncStorage.getItem(getSavedContactsStorageKey(selected.source, selected.id));
        if (cancelled) return;

        if (!stored) {
          setSavedContactKeys([]);
          return;
        }

        const parsed = JSON.parse(stored);
        setSavedContactKeys(
          Array.isArray(parsed)
            ? parsed.filter((entry): entry is string => typeof entry === 'string')
            : []
        );
      } catch (error) {
        console.error('[Contacts] Failed to load saved contact selections:', error);
        if (!cancelled) {
          setSavedContactKeys([]);
        }
      }
    };

    void loadSavedContactKeys();

    return () => {
      cancelled = true;
    };
  }, [selected.id, selected.source]);

  // Open to the notification tab when a lead is opened from a message push.
  useEffect(() => {
    console.log('📱 LeadDetailView initialDetailTab effect:', {
      initialDetailTab,
      source: selected.source,
      id: selected.id,
      isMeta,
    });

    if (initialDetailTab === 'messages') {
      if (phone) {
        setActiveDetailTab('messages');
        setMessageUnreadCount(0);
        onMarkMessagesRead?.(selected.id);
      }
      onInitialDetailTabHandled?.();
      return;
    }

    if (initialDetailTab === 'dm') {
      if (isMeta) {
        setActiveDetailTab('dm');
      }
      onInitialDetailTabHandled?.();
    }
  }, [initialDetailTab, isMeta, onInitialDetailTabHandled, onMarkMessagesRead, phone, selected.id, selected.source]);
  const displayReferralSource =
    record?.referral_source_name ||
    (
      sourceDetail &&
      sourceDetail !== linkedCaptureId &&
      !UUID_PATTERN.test(sourceDetail)
        ? sourceDetail
        : null
    );
  const leadRecord = !isMeta ? (record as Lead | undefined) : undefined;
  const loanOriginator = leadRecord ? getLoanOriginatorInfo(leadRecord) : null;
  const leadSummaryColors: DetailThemeColors = {
    cardBackground: colors.cardBackground,
    border: colors.border,
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
  };
  const landingPurpose = leadRecord ? getLandingFieldDisplayValue(leadRecord, ['loan_purpose', 'looking_to', 'purpose']) : null;
  const landingCredit = leadRecord ? getLandingFieldDisplayValue(leadRecord, ['credit_score', 'credit_score_range', 'current_credit_score_range', 'credit_range']) : null;
  const landingSalesPrice = leadRecord ? getLandingFieldDisplayValue(leadRecord, ['estimated_sales_price', 'sales_price', 'price', 'price_range']) : null;
  const landingLoanAmount = leadRecord ? getLandingFieldDisplayValue(leadRecord, ['estimated_loan_amount', 'loan_amount']) : null;
  const landingCity = leadRecord ? getLandingFieldDisplayValue(leadRecord, ['subject_city', 'city']) : null;
  const landingState = leadRecord ? getLandingFieldDisplayValue(leadRecord, ['subject_state', 'state']) : null;
  const landingCounty = leadRecord ? getLandingFieldDisplayValue(leadRecord, ['subject_county', 'county', 'county_interest']) : null;
  const landingZip = leadRecord ? getLandingFieldDisplayValue(leadRecord, ['subject_zipcode', 'zipcode', 'zip_code']) : null;
  const leadMessage = leadRecord
    ? leadRecord.message || getLandingFieldDisplayValue(leadRecord, ['message', 'notes', 'additional_notes', 'comments'])
    : null;
  const leadLoanDetailsRows: DetailSummaryRow[] = leadRecord ? [
    { label: 'Sales Price', value: formatCurrencyValue(leadRecord.price) || landingSalesPrice },
    { label: 'Loan Amount', value: formatCurrencyValue(leadRecord.loan_amount) || landingLoanAmount },
    { label: 'Purpose', value: leadRecord.loan_purpose || landingPurpose },
    { label: 'Credit', value: leadRecord.credit_score != null ? String(leadRecord.credit_score) : landingCredit },
    { label: 'LTV', value: formatPercentValue(leadRecord.ltv) },
    { label: 'Interest Rate', value: formatPercentValue(leadRecord.interest_rate) },
  ] : [];
  const leadPropertyDetailsRows: DetailSummaryRow[] = leadRecord ? [
    {
      label: 'City / State',
      value: [leadRecord.subject_city || landingCity, leadRecord.subject_state || landingState].filter(Boolean).join(', ') || null,
    },
    { label: 'County', value: leadRecord.subject_county || landingCounty },
    { label: 'ZIP Code', value: leadRecord.subject_zipcode || landingZip },
    { label: 'Property Type', value: leadRecord.xml_property_type || null },
    { label: 'Occupancy', value: leadRecord.occupancy_type || null },
  ] : [];
  const leadLoanSpecificRows: DetailSummaryRow[] = leadRecord ? [
    { label: 'Mortgage Type', value: leadRecord.mortgage_type || null },
    { label: 'Amortization', value: leadRecord.amortization_type || null },
    {
      label: 'Loan Term',
      value: leadRecord.loan_term_months != null ? `${leadRecord.loan_term_months} months` : null,
    },
    { label: 'Loan #', value: leadRecord.lender_loan_number || null },
    { label: 'Est. Closing Costs', value: formatCurrencyValue(leadRecord.estimated_closing_costs) },
  ] : [];
  const leadEmploymentRows: DetailSummaryRow[] = leadRecord ? [
    { label: 'Employer', value: leadRecord.employer_name || null },
    { label: 'Title', value: leadRecord.employment_title || null },
    { label: 'Start Date', value: leadRecord.employment_start_date || null },
    { label: 'Monthly Income', value: formatCurrencyValue(leadRecord.employment_monthly_income) },
    {
      label: 'Self-Employed',
      value: leadRecord.self_employed == null ? null : leadRecord.self_employed ? 'Yes' : 'No',
      valueColor: leadRecord.self_employed ? '#16A34A' : undefined,
    },
  ] : [];
  const leadDemographicRows: DetailSummaryRow[] = leadRecord ? [
    { label: 'Marital Status', value: leadRecord.marital_status || null },
    { label: 'Dependents', value: formatCountValue(leadRecord.dependent_count) },
    { label: 'Citizenship', value: leadRecord.citizenship_status || null },
    { label: 'Housing', value: leadRecord.current_housing_type || null },
    { label: 'Housing Payment', value: formatCurrencyValue(leadRecord.current_housing_payment) },
  ] : [];
  const leadOriginatorRows: DetailSummaryRow[] = loanOriginator ? [
    { label: 'Name', value: loanOriginator.name || null },
    { label: 'Company', value: loanOriginator.company || null },
    { label: 'License', value: loanOriginator.license || null },
    { label: 'Email', value: loanOriginator.email || null },
    { label: 'Phone', value: loanOriginator.phone ? formatPhoneNumber(loanOriginator.phone) : null },
  ] : [];
  const recordMetadata = record?.metadata || null;
  const metadataSections = buildMetadataSections(recordMetadata as Record<string, unknown> | null);
  const metaRecord = isMeta ? (record as MetaLead | undefined) : undefined;
  const hasLiveMetaPreview = Boolean(previewAdId);
  const landingSummarySections = buildLandingMetadataSummarySections(leadRecord);
  const adAttributionRows: DetailSummaryRow[] = hasAdAttribution ? [
    { label: 'Platform', value: getMetaPlatformLabel(previewPlatform) || previewPlatform },
    { label: 'Source Detail', value: landingAdAttribution.sourceDetail },
    { label: 'Campaign', value: previewCampaignName },
    { label: 'Campaign ID', value: landingAdAttribution.campaignId },
    { label: 'Ad Set ID', value: landingAdAttribution.adsetId },
    { label: 'Ad Name', value: previewAdName },
    { label: 'Ad ID', value: landingAdAttribution.adId },
  ] : [];
  const isImportedMetaLead = Boolean(
    metaRecord &&
      (
        hasDisplayValue(getTrimmedString(metaRecord.metadata?.import_source)) ||
        hasDisplayValue(getTrimmedString(metaRecord.metadata?.import_date)) ||
        isPlainObject(metaRecord.metadata?.raw_fields) ||
        !hasLiveMetaPreview
      )
  );
  const shouldShowSavedAdCreativeCard = Boolean(savedMetaAdCreative && (!isMeta || isImportedMetaLead || !hasLiveMetaPreview));
  const shouldHideImportedMetaMetadata = Boolean(isMeta && isImportedMetaLead);
  
  // Use AI attention badge if available, otherwise fall back to rule-based
  // Show AI badge if we have AI data (even if needsAttention is false - shows "No Action Needed")
  const ruleBadge = record ? getLeadAlert(record) : null;
  const getAiPriorityColor = (p: number) => {
    if (p <= 1) return { dot: '#EF4444', bg: '#FEF2F2', border: '#EF4444' }; // red
    if (p <= 2) return { dot: '#F97316', bg: '#FFF7ED', border: '#F97316' }; // orange
    if (p <= 3) return { dot: '#EAB308', bg: '#FEFCE8', border: '#EAB308' }; // yellow
    return { dot: '#22C55E', bg: '#F0FDF4', border: '#22C55E' }; // green (priority 4 and 5 = "On Track")
  };
  const aiPriorityColors = aiAttention?.badge ? getAiPriorityColor(aiAttention.priority) : null;
  const attentionBadge = aiAttention?.badge && aiPriorityColors
    ? { label: aiAttention.badge, color: aiPriorityColors.dot }
    : ruleBadge;
  
  console.log('🔍 LeadDetailView render:', { 
    leadId: record?.id, 
    last_contact_date: record?.last_contact_date,
    attentionBadge: attentionBadge ? attentionBadge.label : 'none',
    aiAttention: aiAttention ? { badge: aiAttention.badge, priority: aiAttention.priority } : 'none'
  });

  const handleDetailStatusChange = async (newStatus: string) => {
    if (!record) return;

    await onStatusChange(selected.source, record.id, newStatus, {
      preserveSelectedLead: true,
    });
  };

  // Auto-update status from 'new' to 'attempting_contact' when user initiates contact
  // Returns true if status was advanced (so callers can include it in subsequent updates)
  const autoAdvanceStatus = async (): Promise<boolean> => {
    if (record?.status === 'new') {
      await handleDetailStatusChange('attempting_contact');
      return true;
    }
    return false;
  };

  const callSelectedContact = async (contact: LeadContactCandidate) => {
    const rawPhone = String(contact.phone || '').trim();
    const sanitizedPhone = rawPhone.replace(/[^\d+]/g, '');
    if (!sanitizedPhone || sanitizedPhone === '+') {
      Alert.alert('Invalid phone number', 'This contact does not have a valid phone number to call.');
      return;
    }

    // Auto-advance status from 'new' to 'attempting_contact'
    const statusAdvanced = await autoAdvanceStatus();
    
    // Log the call activity automatically
    try {
      const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
      const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';
      const leadTableName = isMeta ? 'meta_ads' : 'leads';
      
      const activityData = {
        [foreignKeyColumn]: record!.id,
        activity_type: 'call',
        notes: `Called ${contact.label} at ${rawPhone}`,
        created_by: session?.user?.id || null,
        user_email: session?.user?.email || 'Mobile App User',
      };

      const { error } = await supabase
        .from(tableName)
        .insert([activityData]);

      if (error) {
        console.error('Error logging call activity:', error);
      } else {
        // Update last_contact_date on the lead
        const now = new Date().toISOString();
        await supabase
          .from(leadTableName)
          .update({ last_contact_date: now })
          .eq('id', record!.id);
        
        // Update the lead in parent component state (preserve status if it was advanced)
        const updatedLead = { ...record!, last_contact_date: now, ...(statusAdvanced ? { status: 'attempting_contact' } : {}) };
        console.log('📞 CALL: Updating lead', { id: updatedLead.id, last_contact_date: now, source: isMeta ? 'meta' : 'lead' });
        onLeadUpdate(updatedLead, isMeta ? 'meta' : 'lead');
        
        // Invalidate AI attention cache to get fresh analysis
        if (onInvalidateAttention) {
          onInvalidateAttention(record!.id);
        }
        
        // Refresh activities to show the new log
        const { data } = await supabase
          .from(tableName)
          .select('*')
          .eq(foreignKeyColumn, record!.id)
          .order('created_at', { ascending: false });
        
        if (data) {
          setActivities(data);
        }
      }
    } catch (e) {
      console.error('Error logging call activity:', e);
    }
    
    // Open phone dialer
    const telUrl = `tel:${sanitizedPhone}`;
    try {
      const canOpen = await Linking.canOpenURL(telUrl);
      if (!canOpen) {
        Alert.alert('Unable to place call', 'Your device cannot open the phone dialer for this number.');
        return;
      }
      await Linking.openURL(telUrl);
    } catch (e) {
      console.log('Error opening dialer:', e);
      Alert.alert('Unable to place call', 'There was a problem opening the phone dialer.');
    }
  };

  const handleCall = async () => {
    if (callableContactCandidates.length === 0) return;

    if (callableContactCandidates.length === 1) {
      await callSelectedContact(callableContactCandidates[0]);
      return;
    }

    const getCallOptionLabel = (contact: LeadContactCandidate) =>
      `${contact.label} - ${formatPhoneNumber(contact.phone)}`;

    if (Platform.OS === 'ios') {
      const options = [...callableContactCandidates.map(getCallOptionLabel), 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Call Contact',
          message: 'Which contact do you want to call?',
          options,
          cancelButtonIndex: options.length - 1,
        },
        (buttonIndex) => {
          if (buttonIndex === options.length - 1) return;
          const chosen = callableContactCandidates[buttonIndex];
          if (chosen) {
            void callSelectedContact(chosen);
          }
        }
      );
    } else {
      Alert.alert(
        'Call Contact',
        'Which contact do you want to call?',
        [
          ...callableContactCandidates.map((contact) => ({
            text: getCallOptionLabel(contact),
            onPress: () => {
              void callSelectedContact(contact);
            },
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ]
      );
    }
  };

  const handleText = () => {
    if (!phone) return;
    setTemplateMode('text');
    setShowTemplateModal(true);
  };

  const handleTemplateSelect = async (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    if (!record) return;
    const r = record;

    console.log('Current LO Info when creating template:', currentLOInfo);

    // Helper function to format callback date/time
    const formatCallbackDateTime = (date: Date): string => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const callbackDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      
      const timeStr = date.toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      
      if (callbackDay.getTime() === today.getTime()) {
        return `today at ${timeStr}`;
      } else if (callbackDay.getTime() === tomorrow.getTime()) {
        return `tomorrow at ${timeStr}`;
      } else {
        const dateStr = date.toLocaleString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
        });
        return `${dateStr} at ${timeStr}`;
      }
    };

    // Determine callback time for the callback_confirmation template
    let callbackTime = '';
    if (templateId === 'callback_confirmation') {
      try {
        // Prefer the currently selected callbackDate from state if available
        if (callbackDate) {
          callbackTime = ` ${formatCallbackDateTime(callbackDate)}`;
        } else {
          const now = new Date();
          const { data: callbacks } = await supabase
            .from('lead_callbacks')
            .select('scheduled_for')
            .or(isMeta ? `meta_ad_id.eq.${r.id}` : `lead_id.eq.${r.id}`)
            .gte('scheduled_for', now.toISOString()) // Only get future callbacks
            .order('scheduled_for', { ascending: true }) // Get the soonest upcoming callback
            .limit(1);
          
          if (callbacks && callbacks.length > 0) {
            const scheduledDate = new Date(callbacks[0].scheduled_for);
            callbackTime = ` ${formatCallbackDateTime(scheduledDate)}`; // Add space before the time
          }
        }
      } catch (error) {
        console.error('Error fetching callback:', error);
      }
    }

    // Format ad created date (e.g. "Dec 3")
    const formatAdDate = (dateStr: string) => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // Extract credit range and county from hardcoded columns or form_data
    const metaR = r as MetaLead;
    const fd = metaR.form_data || {};
    const creditRange = metaR.credit_range
      || fd.credit_range
      || Object.entries(fd).find(([k]) => k.toLowerCase().includes('credit'))?.[1]
      || '';
    const county = metaR.county_interest
      || fd.county_interest
      || Object.entries(fd).find(([k]) => k.toLowerCase().includes('county') && !k.toLowerCase().includes('credit'))?.[1]
      || '';

    const variables: TemplateVariables = {
      fname: r.first_name || 'there',
      loFullname: currentLOInfo 
        ? `${currentLOInfo.firstName} ${currentLOInfo.lastName}`.trim() 
        : 'Mario',
      loFname: currentLOInfo?.firstName || 'Mario',
      loPhone: currentLOInfo?.phone || '[Phone]',
      loEmail: currentLOInfo?.email || '[Email]',
      company: currentLOInfo?.company || '[Company]',
      platform: isMeta ? (r as MetaLead).platform || 'Facebook' : 'our website',
      callbackTime: callbackTime,
      adDate: formatAdDate(r.created_at),
      creditRange,
      county,
    };

    console.log('Template variables:', variables);

    // Use the correct language template
    const templateText = getTemplateText(template, useSpanishTemplates);
    const messageBody = fillTemplate(templateText, variables);
    console.log('Final message body:', messageBody);
    
    setShowTemplateModal(false);

    if (templateMode === 'text') {
      const encodedBody = encodeURIComponent(messageBody);

      // Auto-advance status from 'new' to 'attempting_contact'
      const statusAdvanced = await autoAdvanceStatus();

      // Log the text activity automatically
      try {
        const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
        const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';
        const leadTableName = isMeta ? 'meta_ads' : 'leads';
        
        const activityData = {
          [foreignKeyColumn]: r.id,
          activity_type: 'text',
          notes: `Sent: "${template.name}"\n\n${messageBody}`,
          created_by: session?.user?.id || null,
          user_email: session?.user?.email || 'Mobile App User',
        };

        const { error } = await supabase
          .from(tableName)
          .insert([activityData]);

        if (error) {
          console.error('Error logging text activity:', error);
        } else {
          // Update last_contact_date on the lead
          const now = new Date().toISOString();
          await supabase
            .from(leadTableName)
            .update({ last_contact_date: now })
            .eq('id', r.id);
          
          // Update the lead in parent component state (preserve status if advanced)
          const updatedLead = { ...r, last_contact_date: now, ...(statusAdvanced ? { status: 'attempting_contact' } : {}) };
          onLeadUpdate(updatedLead, isMeta ? 'meta' : 'lead');
          
          // Refresh activities to show the new log
          const { data } = await supabase
            .from(tableName)
            .select('*')
            .eq(foreignKeyColumn, r.id)
            .order('created_at', { ascending: false });
          
          if (data) {
            setActivities(data);
          }
        }
      } catch (e) {
        console.error('Error logging text activity:', e);
      }
      
      // Open SMS app with pre-filled message
      Linking.openURL(`sms:${phone}?body=${encodedBody}`);
    } else if (templateMode === 'email') {
      if (!email) return;

      const subject = encodeURIComponent(getTemplateSubject(template, useSpanishTemplates));
      const body = encodeURIComponent(messageBody);

      try {
        const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
        const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';
        const leadTableName = isMeta ? 'meta_ads' : 'leads';

        const activityData = {
          [foreignKeyColumn]: r.id,
          activity_type: 'email',
          notes: `Sent email: "${template.name}"\n\n${messageBody}`,
          created_by: session?.user?.id || null,
          user_email: session?.user?.email || 'Mobile App User',
        };

        const { data, error } = await supabase
          .from(tableName)
          .insert([activityData])
          .select()
          .single();

        if (error) {
          console.error('Error logging email activity:', error);
        } else if (data) {
          // Update last_contact_date on the lead
          const now = new Date().toISOString();
          await supabase
            .from(leadTableName)
            .update({ last_contact_date: now })
            .eq('id', record.id);
          
          // Update the lead in parent component state
          const updatedLead = { ...record, last_contact_date: now };
          onLeadUpdate(updatedLead, isMeta ? 'meta' : 'lead');
          
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setActivities([data, ...activities]);
        }
      } catch (e) {
        console.error('Error logging email activity:', e);
      }

      const outlookUrl = `ms-outlook://compose?to=${email}&subject=${subject}&body=${body}`;
      const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;

      try {
        const canOpenOutlook = await Linking.canOpenURL(outlookUrl);
        if (canOpenOutlook) {
          await Linking.openURL(outlookUrl);
        } else {
          await Linking.openURL(mailtoUrl);
        }
      } catch (error) {
        console.error('Error opening email client:', error);
        try {
          await Linking.openURL(mailtoUrl);
        } catch (e) {
          console.error('Error opening mailto:', e);
        }
      }
    }
  };

  const handleCustomMessageSend = async () => {
    if (!customMessageText.trim()) return;
    if (!record) return;
    const r = record;

    const fname = r.first_name || 'there';
    const loPhone = currentLOInfo?.phone || '[Phone]';
    const loEmail = currentLOInfo?.email || '[Email]';

    // Build the message with greeting, custom text, and signature
    const messageBody = `Hi ${fname} 👋\n\n${customMessageText.trim()}\n\nYou can reach me at:\n📞 ${loPhone}\n📧 ${loEmail}`;
    
    setShowTemplateModal(false);
    setShowCustomMessage(false);
    setCustomMessageText('');

    if (templateMode === 'text') {
      const encodedBody = encodeURIComponent(messageBody);

      // Auto-advance status from 'new' to 'attempting_contact'
      const statusAdvanced = await autoAdvanceStatus();

      // Log the text activity automatically
      try {
        const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
        const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';
        const leadTableName = isMeta ? 'meta_ads' : 'leads';
        
        const activityData = {
          [foreignKeyColumn]: r.id,
          activity_type: 'text',
          notes: `Sent text: Custom Message\n\n${messageBody}`,
          created_by: session?.user?.id || null,
          user_email: session?.user?.email || 'Mobile App User',
        };

        const { data, error } = await supabase
          .from(tableName)
          .insert([activityData])
          .select()
          .single();

        if (error) {
          console.error('Error logging text activity:', error);
        } else if (data) {
          // Update last_contact_date on the lead
          const now = new Date().toISOString();
          await supabase
            .from(leadTableName)
            .update({ last_contact_date: now })
            .eq('id', record.id);
          
          // Update the lead in parent component state (preserve status if advanced)
          const updatedLead = { ...record, last_contact_date: now, ...(statusAdvanced ? { status: 'attempting_contact' } : {}) };
          onLeadUpdate(updatedLead, isMeta ? 'meta' : 'lead');
          
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setActivities([data, ...activities]);
        }
      } catch (e) {
        console.error('Error logging text activity:', e);
      }

      const smsUrl = `sms:${phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodedBody}`;
      try {
        await Linking.openURL(smsUrl);
      } catch (error) {
        console.error('Error opening SMS:', error);
      }
    }
  };

  const handleEmail = () => {
    if (!email) return;
    setTemplateMode('email');
    setShowTemplateModal(true);
  };

  // Handle AI-suggested text action - extracts message from suggestion and sends with proper formatting
  const handleAiSuggestedText = async () => {
    if (!phone || !aiAttention?.suggestedAction) return;
    if (!record) return;
    const r = record;
    
    // Extract the quoted message from the AI suggestion
    // Format: "Send a text: 'Hi Andres and Maria, just checking in...'"
    const suggestion = aiAttention.suggestedAction;
    const quoteMatch = suggestion.match(/['"]([^'"]+)['"]/);
    const aiMessage = quoteMatch ? quoteMatch[1] : suggestion.replace(/^Send a text:\s*/i, '').trim();
    
    const fname = record.first_name || 'there';
    const loFullname = currentLOInfo 
      ? `${currentLOInfo.firstName} ${currentLOInfo.lastName}`.trim() 
      : 'Mario';
    const loPhone = currentLOInfo?.phone || '[Phone]';
    const loEmail = currentLOInfo?.email || '[Email]';

    // Build the full message with AI suggestion + signature
    const messageBody = `${aiMessage}\n\n- ${loFullname}\n📞 ${loPhone}\n📧 ${loEmail}`;
    
    setShowAiRecommendation(false);

    const encodedBody = encodeURIComponent(messageBody);

    // Log the text activity automatically
    try {
      const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
      const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';
      const leadTableName = isMeta ? 'meta_ads' : 'leads';
      
      const activityData = {
        [foreignKeyColumn]: r.id,
        activity_type: 'text',
        notes: `Sent AI-suggested text:\n\n${messageBody}`,
        created_by: session?.user?.id || null,
        user_email: session?.user?.email || 'Mobile App User',
      };

      const { data, error } = await supabase
        .from(tableName)
        .insert([activityData])
        .select()
        .single();

      if (error) {
        console.error('Error logging AI text activity:', error);
      } else if (data) {
        // Update last_contact_date on the lead
        const now = new Date().toISOString();
        await supabase
          .from(leadTableName)
          .update({ last_contact_date: now })
          .eq('id', r.id);
        
        // Update the lead in parent component state
        const updatedLead = { ...r, last_contact_date: now };
        onLeadUpdate(updatedLead, isMeta ? 'meta' : 'lead');
        
        // Invalidate AI attention cache since we just took action
        if (onInvalidateAttention) {
          onInvalidateAttention(r.id);
        }
        
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setActivities([data, ...activities]);
      }
    } catch (e) {
      console.error('Error logging AI text activity:', e);
    }

    // Open SMS app with pre-filled message
    const smsUrl = `sms:${phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodedBody}`;
    try {
      await Linking.openURL(smsUrl);
    } catch (error) {
      console.error('Error opening SMS:', error);
    }
  };

  // Check if AI suggestion is a "Send a text" recommendation
  const isTextSuggestion = aiAttention?.suggestedAction?.toLowerCase().includes('send a text');

  // Load current loan officer info
  useEffect(() => {
    const loadLOInfo = async () => {
      if (!session?.user?.id || !session?.user?.email) return;
      
      try {
        // Hardcoded contact info for super admins
        const superAdminContacts: Record<string, { firstName: string; lastName: string; phone: string; email: string; aiDraftAccess: boolean; company: string }> = {
          'mario@closewithmario.com': { firstName: 'Mario', lastName: 'Cerrato', phone: '3052192788', email: 'mcerrato@loandepot.com', aiDraftAccess: true, company: 'loanDepot' },
          'mario@regallending.com': { firstName: 'Mario', lastName: 'Cerrato', phone: '3052192788', email: 'mario@regallending.com', aiDraftAccess: true, company: 'Regal Lending' },
        };
        
        const emailLower = session.user.email.toLowerCase();
        
        // Check if this is a super admin with hardcoded contact info
        if (superAdminContacts[emailLower]) {
          console.log('Using hardcoded super admin contact info');
          setCurrentLOInfo(superAdminContacts[emailLower]);
          setIsLicensedRealtor(true);
          return;
        }
        
        // First try to get by user_id (for regular loan officers)
        let memberId = await getUserTeamMemberId(session.user.id, 'loan_officer');
        console.log('LO Member ID by user_id:', memberId);
        
        // If no member ID found, try to find by email (for super admins who might be LOs)
        if (!memberId) {
          const { data: loByEmail } = await supabase
            .from('loan_officers')
            .select('id')
            .eq('email', emailLower)
            .eq('active', true)
            .maybeSingle();
          
          memberId = loByEmail?.id || null;
          console.log('LO Member ID by email:', memberId);
        }
        
        if (memberId) {
          const { data, error } = await supabase
            .from('loan_officers')
            .select('first_name, last_name, phone, email, ai_draft_access, company, is_licensed_realtor')
            .eq('id', memberId)
            .single();
          
          console.log('LO Data fetched:', data);
          console.log('LO Fetch error:', error);
          
          if (data && !error) {
            const loInfo = { 
              firstName: data.first_name, 
              lastName: data.last_name,
              phone: data.phone || '',
              email: data.email || '',
              aiDraftAccess: !!(data as any).ai_draft_access,
              company: (data as any).company || '',
            };
            console.log('Setting LO Info:', loInfo);
            setCurrentLOInfo(loInfo);
            setIsLicensedRealtor(!!(data as any).is_licensed_realtor);
          }
        } else {
          // No LO record found - check if user is a realtor
          console.log('No LO record found, checking realtors table');
          const realtorMemberId = await getUserTeamMemberId(session.user.id, 'realtor');
          
          if (realtorMemberId) {
            const { data: realtorData, error: realtorError } = await supabase
              .from('realtors')
              .select('first_name, last_name, phone, email, brokerage')
              .eq('id', realtorMemberId)
              .single();
            
            if (realtorData && !realtorError) {
              const realtorInfo = {
                firstName: realtorData.first_name || '',
                lastName: realtorData.last_name || '',
                phone: realtorData.phone || '',
                email: realtorData.email || '',
                aiDraftAccess: false,
                company: realtorData.brokerage || '',
              };
              console.log('Setting Realtor Info as current user info:', realtorInfo);
              setCurrentLOInfo(realtorInfo);
            }
          } else {
            console.log('No realtor record found either');
          }
        }
      } catch (e) {
        console.error('Error loading LO info:', e);
      }
    };

    loadLOInfo();
  }, [session?.user?.id, session?.user?.email]);

  // Load activities from Supabase
  useEffect(() => {
    const loadActivities = async () => {
      if (!record) return;
      
      try {
        setLoadingActivities(true);
        
        // Use correct table based on lead source
        const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
        const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';
        
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .eq(foreignKeyColumn, record.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error loading activities:', error);
        } else {
          setActivities(data || []);
          setDocsReceivedLogged((data || []).some((a: any) => a.activity_type === 'docs_received'));
        }
      } catch (e) {
        console.error('Unexpected error loading activities:', e);
      } finally {
        setLoadingActivities(false);
      }
    };

    loadActivities();
  }, [record?.id, isMeta]);

  // Set default callback date when record changes
  useEffect(() => {
    if (record) {
      // Default: 2 hours from now
      const now = new Date();
      const later = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      setCallbackDate(later);
      setCallbackNote(`Call ${fullName}`);
    }
  }, [record?.id, fullName]);

  // Reset to Details tab when navigating to a different lead unless a notification targets a tab.
  useEffect(() => {
    if (!initialDetailTab) {
      setActiveDetailTab('details');
    }
  }, [initialDetailTab, record?.id]);

  // Set language preference based on lead's preferred_language
  useEffect(() => {
    if (record && isMeta) {
      const preferredLanguage = (record as MetaLead).preferred_language?.toLowerCase();
      setUseSpanishTemplates(preferredLanguage === 'spanish');
    } else {
      // Default to English for non-meta leads
      setUseSpanishTemplates(false);
    }
  }, [record?.id, isMeta]);

  // Cleanup current sound when component unmounts or sound changes
  useEffect(() => {
    return () => {
      if (currentSound) {
        currentSound.unloadAsync();
      }
    };
  }, [currentSound]);

  // Pre-request microphone permissions on mount
  useEffect(() => {
    const prepareMicPermissions = async () => {
      try {
        const current = await Audio.getPermissionsAsync();

        if (!current.granted) {
          const requested = await Audio.requestPermissionsAsync();

          if (!requested.granted) {
            alert('Please enable microphone access in Settings to record voice notes.');
          }
        }
      } catch (err) {
        console.error('Error preparing microphone permissions', err);
      }
    };

    prepareMicPermissions();
  }, []);

  const startVoiceRecording = async () => {
    console.log('🔴 Button pressed! isRecording:', isRecording, 'appState:', AppState.currentState);

    if (isRecording) {
      return;
    }

    try {
      const { granted } = await Audio.getPermissionsAsync();
      if (!granted) {
        alert('Microphone access is required to record voice notes.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        staysActiveInBackground: false,
      });

      console.log('▶️ Starting recording...');

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
      setIsRecording(true);
    } catch (error: any) {
      // Use log instead of error to prevent RedBox
      console.log('Failed to start recording', error);

      const errorMessage = error?.message || '';
      if (errorMessage.includes('Session activation failed') || errorMessage.includes('561017449')) {
        alert('Microphone is currently in use by another app (like a phone call). Please hang up and try again.');
      } else {
        alert('Could not start recording. Please check your microphone settings and try again.');
      }
    }
  };

  // Stop recording and show preview (don't save yet)
  const stopRecordingForPreview = async () => {
    if (!recording) return;

    setIsRecording(false);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        setPendingVoiceNoteUri(uri);
        console.log('🎤 Recording stopped, URI saved for preview:', uri);
      }
    } catch (error) {
      console.error('Error stopping recording', error);
      alert('Failed to stop recording. Please try again.');
    }
  };

  // Play/pause preview of pending voice note
  const togglePreviewPlayback = async () => {
    if (!pendingVoiceNoteUri) return;

    try {
      if (isPlayingPreview && previewSound) {
        await previewSound.stopAsync();
        await previewSound.unloadAsync();
        setPreviewSound(null);
        setIsPlayingPreview(false);
      } else {
        // Stop any existing preview sound
        if (previewSound) {
          await previewSound.unloadAsync();
        }
        
        const { sound } = await Audio.Sound.createAsync(
          { uri: pendingVoiceNoteUri },
          { shouldPlay: true }
        );
        setPreviewSound(sound);
        setIsPlayingPreview(true);
        
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setIsPlayingPreview(false);
          }
        });
      }
    } catch (error) {
      console.error('Error playing preview', error);
    }
  };

  // Discard pending voice note
  const discardVoiceNote = async () => {
    if (previewSound) {
      await previewSound.unloadAsync();
      setPreviewSound(null);
    }
    setPendingVoiceNoteUri(null);
    setIsPlayingPreview(false);
    console.log('🗑️ Voice note discarded');
  };

  // Confirm and save voice note
  const confirmAndSaveVoiceNote = async () => {
    if (!pendingVoiceNoteUri || !record) return;

    setUploadingVoiceNote(true);

    try {
      // Stop preview if playing
      if (previewSound) {
        await previewSound.unloadAsync();
        setPreviewSound(null);
        setIsPlayingPreview(false);
      }

      const response = await fetch(pendingVoiceNoteUri);
      const arrayBuffer = await response.arrayBuffer();

      const fileExt = 'm4a';
      const fileName = `voice-${record.id}-${Date.now()}.${fileExt}`;
      const filePath = `${record.id}/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('activity-voice-notes')
        .upload(filePath, arrayBuffer, {
          contentType: 'audio/m4a',
        });

      if (uploadError || !uploadData) {
        console.error('Upload error', uploadError);
        throw uploadError || new Error('Upload failed');
      }

      const { data: publicUrlData } = supabase.storage
        .from('activity-voice-notes')
        .getPublicUrl(uploadData.path);

      const audioUrl = publicUrlData?.publicUrl;
      if (!audioUrl) {
        throw new Error('No public URL returned for voice note');
      }

      // Insert activity (note + audio_url)
      const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
      const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';
      const leadTable = isMeta ? 'meta_ads' : 'leads';

      const activityPayload: any = {
        [foreignKeyColumn]: record.id,
        activity_type: 'note',
        notes: taskNote.trim() || 'Voice note',
        created_by: session?.user?.id ?? null,
        user_email: session?.user?.email ?? 'Mobile App User',
        audio_url: audioUrl,
      };

      const { data: inserted, error: insertError } = await supabase
        .from(tableName)
        .insert([activityPayload])
        .select()
        .single();

      if (insertError) {
        console.error('Insert activity error', insertError);
        throw insertError;
      }

      const now = new Date().toISOString();

      const { error: updateLeadError } = await supabase
        .from(leadTable)
        .update({ last_contact_date: now })
        .eq('id', record.id);

      if (updateLeadError) {
        console.error('Update lead last_contact_date error', updateLeadError);
      }

      const updatedLead = { ...record, last_contact_date: now };
      onLeadUpdate(updatedLead, isMeta ? 'meta' : 'lead');

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setActivities([inserted, ...activities]);
      setTaskNote('');
      setPendingVoiceNoteUri(null);
      console.log('✅ Voice note saved successfully');
    } catch (error) {
      console.error('Error saving voice note', error);
      alert('Failed to save voice note. Please try again.');
    } finally {
      setUploadingVoiceNote(false);
    }
  };

  const handlePlayVoiceNote = async (activity: Activity, recordingUrl?: string) => {
    // Support both audio_url (voice notes) and recording URLs (call recordings)
    const audioUrl = recordingUrl || activity.audio_url;
    if (!audioUrl) return;

    try {
      if (playingActivityId === activity.id && currentSound) {
        await currentSound.stopAsync();
        await currentSound.unloadAsync();
        setCurrentSound(null);
        setPlayingActivityId(null);
        return;
      }

      if (currentSound) {
        await currentSound.stopAsync();
        await currentSound.unloadAsync();
        setCurrentSound(null);
      }

      // Set audio mode to play through speaker (not receiver)
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
      });

      const { sound } = await Audio.Sound.createAsync({ uri: audioUrl });
      setCurrentSound(sound);
      setPlayingActivityId(activity.id);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          sound.unloadAsync();
          setCurrentSound(null);
          setPlayingActivityId(null);
        }
      });

      await sound.playAsync();
    } catch (error) {
      console.error('Error playing audio', error);
      alert('Could not play audio. The recording may not be available.');
      setPlayingActivityId(null);
    }
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleString();
  };

  const handleAddTask = async () => {
    if (!taskNote.trim() || !record) return;
    
    try {
      setSavingActivity(true);
      
      // Use correct table based on lead source
      const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
      const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';
      const leadTableName = isMeta ? 'meta_ads' : 'leads';
      
      const activityData = {
        [foreignKeyColumn]: record.id,
        activity_type: selectedActivityType,
        notes: taskNote.trim(),
        created_by: session?.user?.id || null,
        user_email: session?.user?.email || 'Mobile App User',
      };

      const { data, error } = await supabase
        .from(tableName)
        .insert([activityData])
        .select()
        .single();

      if (error) {
        console.error('Error saving activity:', error);
        alert('Failed to save activity. Please try again.');
      } else {
        // Update last_contact_date on the lead
        const now = new Date().toISOString();
        await supabase
          .from(leadTableName)
          .update({ last_contact_date: now })
          .eq('id', record.id);
        
        // Update the lead in parent component state
        const updatedLead = { ...record, last_contact_date: now };
        onLeadUpdate(updatedLead, isMeta ? 'meta' : 'lead');
        
        // Invalidate AI attention cache to get fresh analysis
        if (onInvalidateAttention) {
          onInvalidateAttention(record.id);
        }
        
        setActivities([data, ...activities]);
        setTaskNote('');
      }
    } catch (e) {
      console.error('Unexpected error saving activity:', e);
      alert('Failed to save activity. Please try again.');
    } finally {
      setSavingActivity(false);
    }
  };

  const handleQuickPhrase = (phrase: string) => {
    setTaskNote(phrase);
    setShowQuickPhrases(false);
  };

  const [savingDocsReceived, setSavingDocsReceived] = useState(false);
  const [docsReceivedLogged, setDocsReceivedLogged] = useState(false);

  // Show/auto-dismiss the SMS toast banner
  const showSmsToast = (message: string, type: 'info' | 'success' | 'error') => {
    setSmsToast({ visible: true, message, type });
    Animated.timing(smsToastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    const dismissDelay = type === 'info' ? 3000 : 4000;
    setTimeout(() => {
      Animated.timing(smsToastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setSmsToast(prev => ({ ...prev, visible: false }));
      });
    }, dismissDelay);
  };

  // Call the docs-received SMS API
  const sendDocsReceivedSms = async (docsActivityId?: string) => {
    if (!record) return;

    const firstName = record.first_name || 'client';
    showSmsToast(`Sending text to ${firstName}...`, 'info');

    try {
      const API_BASE_URL = 'https://www.closewithmario.com';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${API_BASE_URL}/api/send-docs-received-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: record.id,
          leadTable: isMeta ? 'meta_ads' : 'leads',
          docsActivityId: docsActivityId || null,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result = await response.json().catch(() => ({ success: false, status: 'error' }));

      if (result.success && result.status === 'sent') {
        showSmsToast(`Gio sent docs-received text to ${firstName}`, 'success');
      } else if (result.status === 'skipped') {
        showSmsToast(`SMS not sent: ${result.skipReason || 'skipped'}`, 'error');
      } else {
        showSmsToast('Failed to send docs-received SMS', 'error');
      }
    } catch (error: any) {
      console.error('Error sending docs-received SMS:', error);
      showSmsToast('Failed to send docs-received SMS', 'error');
    }
  };

  const handleDocsReceived = async () => {
    if (!record) return;

    setSavingDocsReceived(true);
    try {
      const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
      const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';

      const activityData = {
        [foreignKeyColumn]: record.id,
        activity_type: 'docs_received',
        notes: 'Documents received — under review',
        created_by: session?.user?.id || null,
        user_email: session?.user?.email || 'Mobile App User',
      };

      const { data: newActivity, error } = await supabase
        .from(tableName)
        .insert([activityData])
        .select()
        .single();

      if (error) {
        console.error('Error logging docs received:', error);
        Alert.alert('Error', 'Failed to log docs received. Please try again.');
        return;
      }

      // Add to activity timeline immediately
      if (newActivity) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setActivities([newActivity, ...activities]);
        setDocsReceivedLogged(true);
      }

      // Invalidate AI attention badge cache
      if (onInvalidateAttention) {
        onInvalidateAttention(record.id);
      }

      const isSmsOptedOut = !!record.sms_opted_out || record.sms_opt_in === false;

      // If lead has a phone number, prompt to send docs-received SMS via Gio
      const firstName = record.first_name || 'client';
      if (phone && !isSmsOptedOut) {
        Alert.alert(
          `Text ${firstName}?`,
          `Would you like Gio to send ${firstName} a quick text confirming their documents were received and are under review?\n\nvia Gio, your AI assistant`,
          [
            { text: 'No thanks', style: 'cancel' },
            {
              text: 'Yes, send text',
              onPress: () => sendDocsReceivedSms(newActivity?.id),
            },
          ]
        );
      } else if (phone && isSmsOptedOut) {
        showSmsToast(`${firstName} has opted out of SMS, so no confirmation text will be sent`, 'info');
      }
    } catch (e) {
      console.error('Unexpected error logging docs received:', e);
      Alert.alert('Error', 'Failed to log docs received. Please try again.');
    } finally {
      setSavingDocsReceived(false);
    }
  };

  type ActivityType = 'call' | 'text' | 'email' | 'note' | 'docs_received';

  const getActivityIconName = (
    type: ActivityType
  ): React.ComponentProps<typeof Ionicons>['name'] => {
    switch (type) {
      case 'call':
        return 'call-outline';
      case 'text':
        return 'chatbubble-ellipses-outline';
      case 'email':
        return 'mail-outline';
      case 'docs_received':
        return 'folder-open-outline';
      case 'note':
      default:
        return 'document-text-outline';
    }
  };

  const getActivityLabel = (type: ActivityType) => {
    switch (type) {
      case 'call': return 'Call';
      case 'text': return 'Text';
      case 'email': return 'Email';
      case 'docs_received': return 'Docs Received';
      case 'note': return 'Note';
    }
  };

  const handleDeleteActivity = async (activityId: string) => {
    // Check permissions:
    // 1. Super admins can delete any activity
    // 2. LOs can delete activities on their own "My Lead" organic leads (not meta leads)
    const isSuperAdmin = propUserRole === 'super_admin';
    const isMyLead = !isMeta && (record as Lead).source === 'My Lead';
    
    if (!isSuperAdmin && !isMyLead) {
      alert('You can only delete activities on your own leads.');
      return;
    }

    try {
      setDeletingActivityId(activityId);
      
      // Use correct table based on lead source
      const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
      
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', activityId);

      if (error) {
        console.error('Error deleting activity:', error);
        alert('Failed to delete activity. Please try again.');
      } else {
        // Remove from local state
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setActivities(activities.filter(a => a.id !== activityId));
        // Invalidate AI attention cache after deleting activity
        if (onInvalidateAttention && record) {
          onInvalidateAttention(record.id);
        }
      }
    } catch (e) {
      console.error('Unexpected error deleting activity:', e);
      alert('Failed to delete activity. Please try again.');
    } finally {
      setDeletingActivityId(null);
    }
  };

  // Fetch realtors for the picker with server-side search
  const fetchRealtorsForPicker = async (searchQuery: string = '') => {
    setLoadingRealtors(true);
    try {
      let query = supabase
        .from('realtors')
        .select('id, first_name, last_name, brokerage')
        .eq('active', true)
        .order('last_name', { ascending: true })
        .limit(50);

      // Apply server-side search if query provided
      if (searchQuery.trim()) {
        const search = searchQuery.trim().toLowerCase();
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,brokerage.ilike.%${search}%`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching realtors:', error);
      } else {
        setAvailableRealtors(data || []);
      }
    } catch (e) {
      console.error('Unexpected error fetching realtors:', e);
    } finally {
      setLoadingRealtors(false);
    }
  };

  // Fetch current realtor contact details when record changes
  useEffect(() => {
    const fetchCurrentRealtor = async () => {
      if (record?.realtor_id) {
        const { data } = await supabase
          .from('realtors')
          .select('first_name, last_name, phone, email')
          .eq('id', record.realtor_id)
          .single();
        
        if (data) {
          const realtorName = `${data.first_name || ''} ${data.last_name || ''}`.trim();
          setCurrentRealtorName(realtorName || null);
          setCurrentRealtorContact({
            name: realtorName || 'Realtor',
            phone: data.phone || '',
            email: data.email || '',
          });
        } else {
          setCurrentRealtorName(null);
          setCurrentRealtorContact(null);
        }
      } else {
        setCurrentRealtorName(null);
        setCurrentRealtorContact(null);
      }
    };
    fetchCurrentRealtor();
  }, [record?.realtor_id]);

  // Handle realtor assignment
  const handleUpdateRealtor = async (newRealtorId: string | null) => {
    if (!record) {
      alert('Unable to update: lead not found.');
      return;
    }

    try {
      setUpdatingRealtor(true);
      
      const tableName = isMeta ? 'meta_ads' : 'leads';
      
      const { data, error } = await supabase
        .from(tableName)
        .update({ realtor_id: newRealtorId })
        .eq('id', record.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating realtor:', error);
        alert('Failed to update realtor assignment. Please try again.');
      } else if (data) {
        onLeadUpdate(data, isMeta ? 'meta' : 'lead');
        setShowRealtorPicker(false);
        setRealtorSearchQuery('');
      }
    } catch (e) {
      console.error('Unexpected error updating realtor:', e);
      alert('Failed to update realtor assignment. Please try again.');
    } finally {
      setUpdatingRealtor(false);
    }
  };

  const handleUpdateLO = async (newLOId: string | null) => {
    if (!propUserRole || (propUserRole !== 'super_admin' && propUserRole !== 'realtor')) {
      alert('You do not have permission to change LO assignments.');
      return;
    }

    if (!record) {
      alert('Unable to update: lead not found.');
      return;
    }

    const r = record;

    try {
      setUpdatingLO(true);
      
      // Use correct table based on lead source
      const tableName = isMeta ? 'meta_ads' : 'leads';
      
      const { data, error } = await supabase
        .from(tableName)
        .update({ lo_id: newLOId })
        .eq('id', r.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating LO:', error);
        alert('Failed to update LO assignment. Please try again.');
      } else if (data) {
        // Update parent state
        onLeadUpdate(data, isMeta ? 'meta' : 'lead');
        setShowLOPicker(false);
      }
    } catch (e) {
      console.error('Unexpected error updating LO:', e);
      alert('Failed to update LO assignment. Please try again.');
    } finally {
      setUpdatingLO(false);
    }
  };

  const buildLeadNotes = (): string => {
    if (!record) return '';
    const r = record;
    const notesLines: string[] = [];

      if (!isMeta && (r as any).source) {
        notesLines.push(`Source: ${(r as any).source}`);
      }

      if (isMeta) {
        const metaRecord = r as any;
        if (metaRecord.ad_name) notesLines.push(`Ad: ${metaRecord.ad_name}`);
        if (metaRecord.subject_address) notesLines.push(`Address: ${metaRecord.subject_address}`);
        if (metaRecord.price_range) notesLines.push(`Price Range: ${metaRecord.price_range}`);
        if (metaRecord.credit_range) notesLines.push(`Credit: ${metaRecord.credit_range}`);
        if (metaRecord.purchase_timeline) notesLines.push(`Timeline: ${metaRecord.purchase_timeline}`);
        if (metaRecord.down_payment_saved) notesLines.push(`Down Payment: ${metaRecord.down_payment_saved}`);
        if (metaRecord.monthly_income) notesLines.push(`Income: ${metaRecord.monthly_income}`);
        if (metaRecord.meta_ad_notes) notesLines.push(`Notes: ${metaRecord.meta_ad_notes}`);
      } else {
        const leadRecord = r as any;

        if (leadRecord.loan_purpose) {
          notesLines.push(`Loan Purpose: ${leadRecord.loan_purpose}`);
        }

        const priceNum = leadRecord.price != null ? Number(leadRecord.price) : null;
        if (!Number.isNaN(priceNum) && priceNum != null) {
          notesLines.push(`Price: $${priceNum.toLocaleString()}`);
        }

        const dpNum = leadRecord.down_payment != null ? Number(leadRecord.down_payment) : null;
        if (!Number.isNaN(dpNum) && dpNum != null) {
          notesLines.push(`Down Payment: $${dpNum.toLocaleString()}`);
        }

        if (leadRecord.credit_score != null) {
          notesLines.push(`Credit Score: ${leadRecord.credit_score}`);
        }

        if (leadRecord.message) {
          notesLines.push(`Message: ${leadRecord.message}`);
        }
      }

      const createdDate = new Date(r.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      notesLines.push(`Lead Date: ${createdDate}`);

      return notesLines.join('\n');
  };

  const markContactAsSaved = async (contact: LeadContactCandidate) => {
    if (savedContactKeys.includes(contact.key)) return;

    const nextKeys = [...savedContactKeys, contact.key];
    setSavedContactKeys(nextKeys);

    try {
      await AsyncStorage.setItem(getSavedContactsStorageKey(selected.source, selected.id), JSON.stringify(nextKeys));
    } catch (error) {
      console.error('[Contacts] Failed to remember saved contact:', error);
    }
  };

  const getSaveOptionLabel = (contact: LeadContactCandidate) =>
    savedContactKeys.includes(contact.key) ? `${contact.label} (Saved)` : contact.label;

  const saveSelectedContact = async (contact: LeadContactCandidate) => {
    if (!record) return;
    if (!contact.phone && !contact.email) {
      Alert.alert('Missing Info', 'This contact has no phone or email to save.');
      return;
    }

    try {
      const company = contact.company || (isMeta ? 'Mortgage Meta' : 'Mortgage');
      const baseNotes = buildLeadNotes();
      const notes = contact.extraNotes
        ? `${contact.extraNotes}\n${baseNotes}`.trim()
        : baseNotes;

      const payload = {
        firstName: contact.firstName || 'Lead',
        lastName: contact.lastName || '',
        phone: contact.phone || '',
        email: contact.email || '',
        company,
        notes,
      };

      console.log('[Contacts] Calling saveContact with payload:', payload);

      const saved = await saveContact(payload);
      if (saved) {
        await markContactAsSaved(contact);
      }

      console.log('[Contacts] saveContact completed successfully', { saved });
    } catch (error) {
      console.error('[Contacts] Failed to save contact:', error);
      Alert.alert('Error', 'Could not save contact. Please try again.');
    }
  };

  const handleSaveContact = async () => {
    if (!record) {
      console.log('[Contacts] No record, skipping save');
      return;
    }

    const candidates = contactCandidates;

    if (candidates.length === 0) {
      console.log('[Contacts] No savable contacts (no phone/email)');
      Alert.alert('Missing Info', 'This lead has no contacts with phone or email to save.');
      return;
    }

    // Single contact - save directly with no prompt.
    if (candidates.length === 1) {
      await saveSelectedContact(candidates[0]);
      return;
    }

    // Multiple contacts - ask which one to save.
    if (Platform.OS === 'ios') {
      const options = [...candidates.map(getSaveOptionLabel), 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Save Contact',
          message: 'Which contact do you want to save?',
          options,
          cancelButtonIndex: options.length - 1,
        },
        (buttonIndex) => {
          if (buttonIndex === options.length - 1) return;
          const chosen = candidates[buttonIndex];
          if (chosen) {
            void saveSelectedContact(chosen);
          }
        }
      );
    } else {
      Alert.alert(
        'Save Contact',
        'Which contact do you want to save?',
        [
          ...candidates.map((c) => ({
            text: getSaveOptionLabel(c),
            onPress: () => {
              void saveSelectedContact(c);
            },
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ]
      );
    }
  };

  if (!record) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.detailHeaderTitle}>Lead not found</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContent}>
          <Text>We couldn&apos;t find this lead in memory.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Unified Header — Name + Status + Navigation */}
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.detailHeaderCenter}>
          <Text style={styles.detailHeaderTitle} numberOfLines={1}>{fullName}</Text>
          {phone ? (
            <Text style={styles.detailHeaderSubtitle}>
              {formatPhoneNumber(phone)}
            </Text>
          ) : null}
        </View>
        <View style={styles.navButtons}>
          <TouchableOpacity 
            onPress={handlePrevious} 
            style={[styles.navButton, !hasPrevious && styles.navButtonDisabled]}
            disabled={!hasPrevious}
          >
            <Text style={[styles.navButtonText, !hasPrevious && styles.navButtonTextDisabled]}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.detailHeaderCount}>{currentIndex + 1}/{navigableList.length}</Text>
          <TouchableOpacity 
            onPress={handleNext} 
            style={[styles.navButton, !hasNext && styles.navButtonDisabled]}
            disabled={!hasNext}
          >
            <Text style={[styles.navButtonText, !hasNext && styles.navButtonTextDisabled]}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Status + Deal Snapshot Bar */}
      <View style={[styles.dealSnapshotBar, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dealSnapshotRow}>
          <TouchableOpacity onPress={() => setShowStatusPicker(true)} activeOpacity={0.7}>
            <View style={[
              styles.dealChip,
              { backgroundColor: STATUS_COLOR_MAP[status || 'new']?.bg || '#F5F5F5', borderColor: STATUS_COLOR_MAP[status || 'new']?.border || '#E2E8F0' }
            ]}>
              <Text style={[styles.dealChipText, { color: STATUS_COLOR_MAP[status || 'new']?.text || '#666' }]}>
                {status ? formatStatus(status) : 'N/A'}
              </Text>
              <Text style={{ fontSize: 10, color: STATUS_COLOR_MAP[status || 'new']?.text || '#666', marginLeft: 2 }}>▼</Text>
            </View>
          </TouchableOpacity>
          {(() => {
            const chips: Array<{ label: string; value: string }> = [];
            if (!isMeta) {
              const lead = record as Lead;
              if (lead.loan_purpose) chips.push({ label: '', value: lead.loan_purpose });
              if (lead.price != null) chips.push({ label: '', value: `$${lead.price.toLocaleString()}` });
              if (lead.credit_score != null) chips.push({ label: '', value: `Credit: ${lead.credit_score}` });
            } else {
              const meta = record as MetaLead;
              const fd = meta.form_data || {};
              if (meta.loan_purpose) chips.push({ label: '', value: meta.loan_purpose });
              else if (fd.loan_purpose) chips.push({ label: '', value: fd.loan_purpose });
              const priceRange = meta.price_range || fd.price_range || Object.entries(fd).find(([k]) => k.toLowerCase().includes('price'))?.[1];
              const creditRange = meta.credit_range || fd.credit_range || Object.entries(fd).find(([k]) => k.toLowerCase().includes('credit'))?.[1];
              if (priceRange) chips.push({ label: '', value: priceRange });
              if (creditRange) chips.push({ label: '', value: `Credit: ${creditRange}` });
            }
            return chips.map((chip, i) => (
              <View key={i} style={[styles.dealChip, { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }]}>
                {chip.label ? <Text style={styles.dealChipLabel}>{chip.label}</Text> : null}
                <Text style={styles.dealChipValue} numberOfLines={1}>{chip.value}</Text>
              </View>
            ));
          })()}
        </ScrollView>
        <Text style={styles.dealSnapshotTimestamp}>
          {dealSnapshotSourceLabel ? (
            <>
              <Ionicons
                name={getDealSnapshotSourceIcon(dealSnapshotSourceLabel)}
                size={12}
                color={colors.textPrimary}
              />
              {' '}
              <Text style={{ fontWeight: '700', color: colors.textPrimary }}>
                {dealSnapshotSourceLabel}
              </Text>
            </>
          ) : null}
          {dealSnapshotSourceLabel ? ' • ' : ''}
          {new Date(record.created_at).toLocaleDateString('en-US', {
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
          })} • {new Date(record.created_at).toLocaleTimeString('en-US', { 
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })}
        </Text>
      </View>

      {/* Pipeline Stepper */}
      {(() => {
        const PIPELINE_STAGES = [
          { key: 'new', label: 'New' },
          { key: 'attempting_contact', label: 'Contact' },
          { key: 'contacted', label: 'Talked' },
          { key: 'gathering_docs', label: 'Docs' },
          { key: 'qualified', label: 'Pre-Appr' },
          { key: 'in_process', label: 'In Proc' },
          { key: 'closed', label: 'Closed' },
        ];
        const SIDE_STATUSES: Record<string, { label: string; color: string; icon: string }> = {
          working_on_credit: { label: 'Working on Credit', color: '#DC2626', icon: 'build-outline' },
          nurturing: { label: 'Nurturing', color: '#F9A825', icon: 'leaf-outline' },
          unqualified: { label: 'Unqualified', color: '#C62828', icon: 'remove-circle-outline' },
          lost_deal: { label: 'Lost Deal', color: '#616161', icon: 'close-circle-outline' },
        };
        const currentStatus = record.status || 'new';
        const currentIdx = PIPELINE_STAGES.findIndex(s => s.key === currentStatus);
        const isOnPipeline = currentIdx >= 0;
        const sideInfo = SIDE_STATUSES[currentStatus];

        return (
          <View style={[styles.pipelineStepper, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
            <View style={styles.pipelineTrack}>
              {PIPELINE_STAGES.map((stage, idx) => {
                const isCompleted = isOnPipeline && idx < currentIdx;
                const isCurrent = isOnPipeline && idx === currentIdx;
                const isFuture = !isOnPipeline || idx > currentIdx;
                const stageColors = STATUS_COLOR_MAP[stage.key] || STATUS_COLOR_MAP['new'];

                return (
                  <React.Fragment key={stage.key}>
                    {idx > 0 && (
                      <View style={[
                        styles.pipelineLine,
                        { backgroundColor: isCompleted ? (STATUS_COLOR_MAP[PIPELINE_STAGES[idx - 1].key]?.text || PLUM) : (isDark ? '#334155' : '#E2E8F0') },
                      ]} />
                    )}
                    <TouchableOpacity
                      style={styles.pipelineStage}
                      onPress={() => {
                        void handleDetailStatusChange(stage.key);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[
                        styles.pipelineDot,
                        isCurrent && { backgroundColor: stageColors.text, borderColor: stageColors.text },
                        isCompleted && { backgroundColor: stageColors.text, borderColor: stageColors.text },
                        isFuture && { backgroundColor: 'transparent', borderColor: isDark ? '#475569' : '#CBD5E1' },
                      ]}>
                        {isCompleted && (
                          <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                        )}
                        {isCurrent && (
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' }} />
                        )}
                      </View>
                      <Text style={[
                        styles.pipelineLabel,
                        isCurrent && { color: stageColors.text, fontWeight: '700' },
                        isCompleted && { color: stageColors.text },
                        isFuture && { color: isDark ? '#64748B' : '#94A3B8' },
                      ]} numberOfLines={1}>{stage.label}</Text>
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </View>
            {!isOnPipeline && sideInfo && (
              <View style={[styles.pipelineSideBadge, { backgroundColor: sideInfo.color + '18', borderColor: sideInfo.color + '40' }]}>
                <Ionicons name={sideInfo.icon as any} size={14} color={sideInfo.color} style={{ marginRight: 6 }} />
                <Text style={[styles.pipelineSideLabel, { color: sideInfo.color }]}>{sideInfo.label}</Text>
              </View>
            )}
          </View>
        );
      })()}

      {/* Fixed Action Bar — always visible */}
      <View style={[styles.actionBar, { backgroundColor: colors.cardBackground, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.actionBarItem, !hasCallableContacts && styles.actionBarItemDisabled]}
          onPress={handleCall}
          disabled={!hasCallableContacts}
          activeOpacity={0.7}
        >
          <View style={[styles.actionBarIcon, !hasCallableContacts && styles.actionBarIconDisabled]}>
            <Ionicons name="call-outline" size={20} color={hasCallableContacts ? PLUM : '#94A3B8'} />
          </View>
          <Text style={[styles.actionBarLabel, !hasCallableContacts && styles.actionBarLabelDisabled]}>Call</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBarItem, !phone && styles.actionBarItemDisabled]}
          onPress={handleText}
          disabled={!phone}
          activeOpacity={0.7}
        >
          <View style={[styles.actionBarIcon, !phone && styles.actionBarIconDisabled]}>
            <Ionicons name="chatbubble-outline" size={20} color={phone ? PLUM : '#94A3B8'} />
          </View>
          <Text style={[styles.actionBarLabel, !phone && styles.actionBarLabelDisabled]}>Text</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBarItem]}
          onPress={() => setShowCallbackModal(true)}
          activeOpacity={0.7}
        >
          <View style={styles.actionBarIcon}>
            <Ionicons name="calendar-outline" size={20} color={PLUM} />
          </View>
          <Text style={styles.actionBarLabel}>Schedule</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBarItem, !email && styles.actionBarItemDisabled]}
          onPress={handleEmail}
          disabled={!email}
          activeOpacity={0.7}
        >
          <View style={[styles.actionBarIcon, !email && styles.actionBarIconDisabled]}>
            <Ionicons name="mail-outline" size={20} color={email ? PLUM : '#94A3B8'} />
          </View>
          <Text style={[styles.actionBarLabel, !email && styles.actionBarLabelDisabled]}>Email</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBarItem, !hasSavableContacts && styles.actionBarItemDisabled]}
          onPress={handleSaveContact}
          disabled={!hasSavableContacts}
          activeOpacity={0.7}
        >
          <View style={[styles.actionBarIcon, !hasSavableContacts && styles.actionBarIconDisabled]}>
            <Ionicons name="person-add-outline" size={20} color={hasSavableContacts ? PLUM : '#94A3B8'} />
          </View>
          <Text style={[styles.actionBarLabel, !hasSavableContacts && styles.actionBarLabelDisabled]}>Save</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Bar - Details / Messages / DM */}
      {hasDetailTabs && (
        <View style={detailTabStyles.tabBar}>
          <TouchableOpacity
            style={[
              detailTabStyles.tab,
              activeDetailTab === 'details' && detailTabStyles.tabActive,
            ]}
            onPress={() => setActiveDetailTab('details')}
          >
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={activeDetailTab === 'details' ? PLUM : '#64748B'}
            />
            <Text
              style={[
                detailTabStyles.tabText,
                activeDetailTab === 'details' && detailTabStyles.tabTextActive,
              ]}
            >
              Details
            </Text>
          </TouchableOpacity>

          {showMessagesTab && (
            <TouchableOpacity
              style={[
                detailTabStyles.tab,
                activeDetailTab === 'messages' && detailTabStyles.tabActive,
              ]}
              onPress={() => {
                setActiveDetailTab('messages');
                setMessageUnreadCount(0);
                onMarkMessagesRead?.(selected.id);
              }}
            >
              <Ionicons
                name="chatbubbles-outline"
                size={18}
                color={activeDetailTab === 'messages' ? PLUM : '#64748B'}
              />
              <Text
                style={[
                  detailTabStyles.tabText,
                  activeDetailTab === 'messages' && detailTabStyles.tabTextActive,
                ]}
              >
                Messages
              </Text>
              {messageUnreadCount > 0 && (
                <View
                  style={[
                    detailTabStyles.tabBadge,
                    activeDetailTab === 'messages' && detailTabStyles.tabBadgeActive,
                  ]}
                >
                  <Text
                    style={[
                      detailTabStyles.tabBadgeText,
                      activeDetailTab === 'messages' && detailTabStyles.tabBadgeTextActive,
                    ]}
                  >
                    {formatTabBadgeCount(messageUnreadCount)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {showDmTab && (
            <TouchableOpacity
              style={[
                detailTabStyles.tab,
                activeDetailTab === 'dm' && detailTabStyles.tabActive,
              ]}
              onPress={() => setActiveDetailTab('dm')}
            >
              <Ionicons
                name={metaDmTabIcon}
                size={18}
                color={activeDetailTab === 'dm' ? PLUM : '#64748B'}
              />
              <Text
                style={[
                  detailTabStyles.tabText,
                  activeDetailTab === 'dm' && detailTabStyles.tabTextActive,
                ]}
              >
                DM
              </Text>
              {dmUnreadCount > 0 && (
                <View
                  style={[
                    detailTabStyles.tabBadge,
                    activeDetailTab === 'dm' && detailTabStyles.tabBadgeActive,
                  ]}
                >
                  <Text
                    style={[
                      detailTabStyles.tabBadgeText,
                      activeDetailTab === 'dm' && detailTabStyles.tabBadgeTextActive,
                    ]}
                  >
                    {formatTabBadgeCount(dmUnreadCount)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Messages / DM Tab Content */}
      {activeDetailTab === 'messages' && phone ? (
        <View style={{ flex: 1 }}>
          <SmsMessaging
            leadId={record.id}
            leadPhone={phone}
            leadName={fullName}
            leadSource={isMeta ? 'meta_ads' : 'leads'}
            initialSmsOptIn={record.sms_opt_in}
            initialSmsOptedOut={record.sms_opted_out}
            onMessageSent={() => {
              if (onInvalidateAttention && record) {
                onInvalidateAttention(record.id);
              }
            }}
          />
        </View>
      ) : activeDetailTab === 'dm' && isMeta ? (
        <View style={{ flex: 1 }}>
          <MetaDmMessaging
            leadId={record.id}
            leadSource="meta"
            leadName={fullName}
            leadPhone={phone || null}
            leadEmail={email || null}
            onConversationRead={() => {
              void loadDetailMessageIndicators().then((counts) => {
                setMessageUnreadCount(counts.messageUnreadCount);
                setDmUnreadCount(counts.dmUnreadCount);
              });
            }}
            onMessageSent={() => {
              if (onInvalidateAttention && record) {
                onInvalidateAttention(record.id);
              }
            }}
          />
        </View>
      ) : (
        /* Details Tab Content */
        <ScrollView contentContainerStyle={{ paddingBottom: 32, backgroundColor: colors.background }} showsVerticalScrollIndicator={false}>
          <View style={[styles.detailCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>

            {/* AI Attention Card */}
            {attentionBadge && (() => {
              const priorityColors = aiPriorityColors || { dot: attentionBadge.color, bg: '#FEF2F2', border: attentionBadge.color };
              const stripEmoji = (s: string) => s.replace(/^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Component}\u200d\ufe0f\s]+/u, '').trim();
              return (
                <TouchableOpacity
                  style={{
                    backgroundColor: priorityColors.bg,
                    borderLeftWidth: 4,
                    borderLeftColor: priorityColors.border,
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 10,
                  }}
                  onPress={() => aiAttention?.reason && setShowAiRecommendation(true)}
                  activeOpacity={aiAttention?.reason ? 0.7 : 1}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: aiAttention?.reason ? 6 : 0 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: priorityColors.dot, marginRight: 8 }} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B', flex: 1 }}>
                      {stripEmoji(attentionBadge.label)}
                    </Text>
                  </View>
                  {aiAttention?.reason && (
                    <Text style={{ fontSize: 12, color: '#475569', marginLeft: 18, marginBottom: 4, lineHeight: 17 }}>
                      {aiAttention.reason}
                    </Text>
                  )}
                  {aiAttention?.suggestedAction && (() => {
                    const sugAction = aiAttention.suggestedAction || '';
                    const isTextSug = sugAction.toLowerCase().includes('send a text') || sugAction.toLowerCase().includes('text:');
                    if (isTextSug && phone) {
                      return (
                        <TouchableOpacity
                          onPress={() => {
                            // Extract quoted message from AI suggestion
                            const quoteMatch = sugAction.match(/['"]([^'"]+)['"]/);
                            const aiMessage = quoteMatch ? quoteMatch[1] : sugAction.replace(/^Send a text:\s*/i, '').trim();
                            // Pre-fill custom message and open template modal
                            setCustomMessageText(aiMessage);
                            setShowCustomMessage(true);
                            setTemplateMode('text');
                            setShowTemplateModal(true);
                          }}
                          activeOpacity={0.6}
                          style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 18, backgroundColor: '#F3E8FF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, marginTop: 2 }}
                        >
                          <Ionicons name="chatbubble-ellipses-outline" size={13} color="#6D28D9" style={{ marginRight: 5 }} />
                          <Text style={{ fontSize: 12, color: '#6D28D9', fontWeight: '600', lineHeight: 17, flex: 1 }}>
                            Tap to send: {aiAttention.suggestedAction.replace(/^Send a text:\s*/i, '').replace(/^['"]|['"]$/g, '').substring(0, 60)}…
                          </Text>
                        </TouchableOpacity>
                      );
                    }
                    return (
                      <Text style={{ fontSize: 12, color: '#6D28D9', fontWeight: '600', marginLeft: 18, lineHeight: 17 }}>
                        Suggested: {aiAttention.suggestedAction}
                      </Text>
                    );
                  })()}
                </TouchableOpacity>
              );
            })()}
          
          {/* Status Picker Modal */}
          <Modal
            visible={showStatusPicker}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowStatusPicker(false)}
          >
            <TouchableOpacity 
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setShowStatusPicker(false)}
            >
              <View style={styles.statusPickerContainer}>
                <View style={styles.statusPickerHeader}>
                  <Text style={styles.statusPickerTitle}>Change Status</Text>
                  <TouchableOpacity onPress={() => setShowStatusPicker(false)}>
                    <Text style={styles.statusPickerClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.statusPickerScroll}>
                  {STATUSES.map((s) => {
                    const active = s === status;
                    const colors = STATUS_COLOR_MAP[s] || STATUS_COLOR_MAP['new'];
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[
                          styles.statusPickerOption,
                          active && styles.statusPickerOptionActive,
                        ]}
                        onPress={async () => {
                          setShowStatusPicker(false);
                          await handleDetailStatusChange(s);
                        }}
                      >
                        <View style={[styles.statusPickerBadge, { backgroundColor: colors.bg }]}>
                          <Text style={[styles.statusPickerBadgeText, { color: colors.text }]}>
                            {formatStatus(s)}
                          </Text>
                        </View>
                        {active && <Text style={styles.statusPickerCheck}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Mark Docs Received Button - shown when status is gathering_docs and not already logged */}
          {status === 'gathering_docs' && !docsReceivedLogged && (
            <View style={{ marginTop: 12 }}>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#F5F0FF',
                  borderRadius: 12,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: '#E9D5FF',
                }}
                onPress={handleDocsReceived}
                disabled={savingDocsReceived}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark-circle-outline" size={22} color={PLUM} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: PLUM }}>
                    {savingDocsReceived ? 'Saving…' : 'Mark Docs Received'}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#A78BFA', marginTop: 2 }}>
                    Logs activity & stops AI doc reminders
                  </Text>
                </View>
                {savingDocsReceived && <ActivityIndicator size="small" color={PLUM} />}
              </TouchableOpacity>
            </View>
          )}

          {/* Divider */}
          <View style={styles.sectionDivider} />

          {/* LO Picker Modal (used by inline LO dropdown) */}
          {(propUserRole === 'super_admin' || propUserRole === 'realtor') && (
            <Modal
                visible={showLOPicker}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowLOPicker(false)}
              >
                <TouchableOpacity 
                  style={styles.modalOverlay}
                  activeOpacity={1}
                  onPress={() => setShowLOPicker(false)}
                >
                  <View style={styles.statusPickerContainer}>
                    <View style={styles.statusPickerHeader}>
                      <Text style={styles.statusPickerTitle}>Assign Loan Officer</Text>
                      <TouchableOpacity onPress={() => setShowLOPicker(false)}>
                        <Text style={styles.statusPickerClose}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.statusPickerScroll}>
                      <TouchableOpacity
                        style={[
                          styles.statusPickerItem,
                          !record.lo_id && styles.statusPickerItemActive,
                        ]}
                        onPress={() => handleUpdateLO(null)}
                        disabled={updatingLO}
                      >
                        <Text style={[
                          styles.statusPickerItemText,
                          !record.lo_id && styles.statusPickerItemTextActive,
                        ]}>Unassigned</Text>
                        {!record.lo_id && (
                          <Text style={styles.statusPickerCheck}>✓</Text>
                        )}
                      </TouchableOpacity>
                      {loanOfficers.map((lo) => (
                        <TouchableOpacity
                          key={lo.id}
                          style={[
                            styles.statusPickerItem,
                            record.lo_id === lo.id && styles.statusPickerItemActive,
                          ]}
                          onPress={() => handleUpdateLO(lo.id)}
                          disabled={updatingLO}
                        >
                          <Text style={[
                            styles.statusPickerItemText,
                            record.lo_id === lo.id && styles.statusPickerItemTextActive,
                          ]}>{lo.name}</Text>
                          {record.lo_id === lo.id && (
                            <Text style={styles.statusPickerCheck}>✓</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </TouchableOpacity>
              </Modal>
          )}

          {/* Realtor Picker Modal */}
          <Modal
            visible={showRealtorPicker}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {
              setShowRealtorPicker(false);
              setRealtorSearchQuery('');
            }}
          >
            <TouchableOpacity 
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => {
                setShowRealtorPicker(false);
                setRealtorSearchQuery('');
              }}
            >
              <View style={[styles.statusPickerContainer, { maxHeight: '70%' }]}>
                <View style={styles.statusPickerHeader}>
                  <Text style={styles.statusPickerTitle}>Assign Realtor</Text>
                  <TouchableOpacity onPress={() => {
                    setShowRealtorPicker(false);
                    setRealtorSearchQuery('');
                  }}>
                    <Text style={styles.statusPickerClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                
                {/* Search Input */}
                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                  <TextInput
                    style={{
                      backgroundColor: '#F5F5F5',
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      fontSize: 15,
                    }}
                    placeholder="Type to search realtors..."
                    value={realtorSearchQuery}
                    onChangeText={(text) => {
                      setRealtorSearchQuery(text);
                      // Debounced server-side search
                      if (text.trim().length >= 2) {
                        fetchRealtorsForPicker(text);
                      } else if (text.trim().length === 0) {
                        fetchRealtorsForPicker('');
                      }
                    }}
                    autoCapitalize="none"
                  />
                </View>

                {loadingRealtors ? (
                  <ActivityIndicator size="small" color={PLUM} style={{ padding: 20 }} />
                ) : availableRealtors.length === 0 && realtorSearchQuery.trim().length < 2 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ color: '#888', textAlign: 'center' }}>
                      Type at least 2 characters to search realtors
                    </Text>
                  </View>
                ) : (
                  <ScrollView style={styles.statusPickerScroll}>
                    {/* None option */}
                    <TouchableOpacity
                      style={[
                        styles.statusPickerItem,
                        !record.realtor_id && styles.statusPickerItemActive,
                      ]}
                      onPress={() => handleUpdateRealtor(null)}
                      disabled={updatingRealtor}
                    >
                      <Text style={[
                        styles.statusPickerItemText,
                        !record.realtor_id && styles.statusPickerItemTextActive,
                      ]}>None</Text>
                      {!record.realtor_id && (
                        <Text style={styles.statusPickerCheck}>✓</Text>
                      )}
                    </TouchableOpacity>
                    
                    {/* Realtors from server search */}
                    {availableRealtors.map((realtor) => (
                      <TouchableOpacity
                        key={realtor.id}
                        style={[
                          styles.statusPickerItem,
                          record.realtor_id === realtor.id && styles.statusPickerItemActive,
                        ]}
                        onPress={() => handleUpdateRealtor(realtor.id)}
                        disabled={updatingRealtor}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[
                            styles.statusPickerItemText,
                            record.realtor_id === realtor.id && styles.statusPickerItemTextActive,
                          ]}>
                            {realtor.first_name} {realtor.last_name}
                          </Text>
                          {realtor.brokerage && (
                            <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                              {realtor.brokerage}
                            </Text>
                          )}
                        </View>
                        {record.realtor_id === realtor.id && (
                          <Text style={styles.statusPickerCheck}>✓</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Basic fields */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>ℹ️ Details</Text>
            {hasAdAttribution && (previewAdId || adImage) ? (
              <TouchableOpacity
                style={[styles.viewAdButton, { marginBottom: 0, marginTop: 0, paddingHorizontal: 12, paddingVertical: 7 }]}
                onPress={() => setShowAdImage(true)}
              >
                <Text style={styles.viewAdButtonText}>📸 View Ad</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={[styles.detailFieldBlock, { color: colors.textPrimary }]} selectable={true}>
            Email: {email || 'N/A'}{'\n'}
            Phone: {phone ? formatPhoneNumber(phone) : 'N/A'}
          </Text>

          {!isMeta && (record as Lead).source && (
            <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
              Source: {(record as Lead).source}
            </Text>
          )}

          {!isMeta && (
            <>
              {(record as Lead).source === 'My Lead' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#DCFCE7',
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#86EFAC',
                  }}>
                    <Ionicons name="person-add-outline" size={14} color="#16A34A" />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#16A34A', marginLeft: 6 }}>
                      My Lead
                    </Text>
                  </View>
                  {onDeleteLead && (
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#FEE2E2',
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#FECACA',
                      }}
                      onPress={() => {
                        Alert.alert(
                          'Delete Lead',
                          'Are you sure you want to delete this lead? This action cannot be undone.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: async () => {
                                setDeletingLead(true);
                                try {
                                  await onDeleteLead(record.id);
                                  onBack();
                                } catch (e) {
                                  Alert.alert('Error', 'Failed to delete lead');
                                } finally {
                                  setDeletingLead(false);
                                }
                              },
                            },
                          ]
                        );
                      }}
                      disabled={deletingLead}
                    >
                      {deletingLead ? (
                        <ActivityIndicator size="small" color="#DC2626" />
                      ) : (
                        <>
                          <Ionicons name="trash-outline" size={14} color="#DC2626" />
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#DC2626', marginLeft: 6 }}>
                            Delete
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {linkedCaptureId && onNavigateToCapture && (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#F5F3FF',
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#DDD6FE',
                    marginBottom: 8,
                  }}
                  onPress={() => onNavigateToCapture(linkedCaptureId)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="camera-outline" size={18} color={PLUM} style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: PLUM, flex: 1 }}>
                    View Quick Capture & Photos
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={PLUM} />
                </TouchableOpacity>
              )}
              {displayReferralSource && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Ionicons name="megaphone-outline" size={16} color="#16A34A" style={{ marginRight: 8 }} />
                  <Text style={[styles.detailField, { color: '#16A34A', marginBottom: 0 }]} selectable={true}>
                    Referral: {displayReferralSource}
                  </Text>
                </View>
              )}
              {(record as Lead).down_payment != null && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Down Payment: ${(record as Lead).down_payment?.toLocaleString()}
                </Text>
              )}
              {landingSummarySections.map((section) => (
                <LeadSummaryCard
                  key={section.key}
                  title={section.title}
                  rows={section.rows}
                  colors={leadSummaryColors}
                />
              ))}
              <LeadSummaryCard
                title="LOAN DETAILS"
                rows={leadLoanDetailsRows}
                colors={leadSummaryColors}
              />
              <LeadSummaryCard
                title="PROPERTY DETAILS"
                rows={leadPropertyDetailsRows}
                colors={leadSummaryColors}
              />
              <LeadSummaryCard
                title="META ATTRIBUTION"
                rows={adAttributionRows}
                colors={leadSummaryColors}
              />
              {shouldShowSavedAdCreativeCard && savedMetaAdCreative ? (
                <MetaAdCreativeCard
                  creative={savedMetaAdCreative}
                  colors={leadSummaryColors}
                />
              ) : null}
              <LeadSummaryCard
                title="LOAN SPECIFICS"
                rows={leadLoanSpecificRows}
                colors={leadSummaryColors}
              />
              <LeadSummaryCard
                title="EMPLOYMENT & INCOME"
                rows={leadEmploymentRows}
                colors={leadSummaryColors}
              />
              <LeadSummaryCard
                title="DEMOGRAPHICS"
                rows={leadDemographicRows}
                colors={leadSummaryColors}
              />
              {leadMessage && (() => {
                const msg = leadMessage;
                const isXmlImport = msg.includes('IMPORTED FROM XML');
                if (isXmlImport) {
                  return (
                    <View style={[styles.importAccordion, { borderColor: colors.border }]}>
                      <TouchableOpacity
                        style={styles.importAccordionHeader}
                        onPress={() => setShowImportDetails(!showImportDetails)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="document-text-outline" size={16} color="#64748B" style={{ marginRight: 8 }} />
                        <Text style={[styles.importAccordionTitle, { color: colors.textSecondary }]}>
                          Import Details
                        </Text>
                        <Ionicons
                          name={showImportDetails ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color="#94A3B8"
                        />
                      </TouchableOpacity>
                      {showImportDetails && (
                        <Text style={[styles.importAccordionBody, { color: colors.textSecondary }]} selectable={true}>
                          {msg.replace(/^📋\s*IMPORTED FROM XML:\n?/, '')}
                        </Text>
                      )}
                    </View>
                  );
                }
                return (
                  <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                    Message: {msg}
                  </Text>
                );
              })()}

              {/* Co-Borrowers Section */}
              {(() => {
                const coBorrowers = (record as Lead).metadata?.co_borrowers;
                if (!coBorrowers || coBorrowers.length === 0) return null;
                return (
                  <View style={[styles.coBorrowerCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    <Text style={[styles.coBorrowerHeader, { color: colors.textPrimary }]}>
                      CO-BORROWERS ({coBorrowers.length})
                    </Text>
                    {coBorrowers.map((cb: CoBorrowerInfo, idx: number) => (
                      <View key={idx} style={[styles.coBorrowerItem, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 10 }]}>
                        <Text style={[styles.coBorrowerName, { color: colors.textPrimary }]}>
                          {`${cb.first_name} ${cb.last_name}`.trim()}
                        </Text>
                        {cb.phone ? (
                          <TouchableOpacity onPress={() => Linking.openURL(`tel:${cb.phone}`)} style={styles.coBorrowerRow}>
                            <Ionicons name="call-outline" size={14} color={PLUM} style={{ marginRight: 6 }} />
                            <Text style={[styles.coBorrowerLink, { color: PLUM }]}>{formatPhoneNumber(cb.phone)}</Text>
                          </TouchableOpacity>
                        ) : null}
                        {cb.email ? (
                          <TouchableOpacity onPress={() => Linking.openURL(`mailto:${cb.email}`)} style={styles.coBorrowerRow}>
                            <Ionicons name="mail-outline" size={14} color={PLUM} style={{ marginRight: 6 }} />
                            <Text style={[styles.coBorrowerLink, { color: PLUM }]}>{cb.email}</Text>
                          </TouchableOpacity>
                        ) : null}
                        {cb.employer_name ? (
                          <View style={styles.coBorrowerRow}>
                            <Ionicons name="business-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
                            <Text style={[styles.coBorrowerDetail, { color: colors.textSecondary }]}>
                              {cb.employer_name}{cb.job_title ? ` — ${cb.job_title}` : ''}
                            </Text>
                          </View>
                        ) : null}
                        {cb.total_monthly_income != null && cb.total_monthly_income > 0 ? (
                          <View style={styles.coBorrowerRow}>
                            <Ionicons name="cash-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
                            <Text style={[styles.coBorrowerDetail, { color: colors.textSecondary }]}>
                              ${cb.total_monthly_income.toLocaleString()}/mo
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                );
              })()}
              <LeadSummaryCard
                title="LOAN ORIGINATOR"
                rows={leadOriginatorRows}
                colors={leadSummaryColors}
              />
              {!shouldShowSavedAdCreativeCard && (
                <LeadMetadataCard
                  sections={metadataSections}
                  colors={leadSummaryColors}
                />
              )}
            </>
          )}

          {isMeta && (
            <>
              {linkedCaptureId && onNavigateToCapture && (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#F5F3FF',
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#DDD6FE',
                    marginBottom: 8,
                  }}
                  onPress={() => onNavigateToCapture(linkedCaptureId)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="camera-outline" size={18} color={PLUM} style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: PLUM, flex: 1 }}>
                    View Quick Capture & Photos
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={PLUM} />
                </TouchableOpacity>
              )}
              {getMetaPlatformLabel((record as MetaLead).platform) && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Platform: <Text style={{ fontWeight: '700' }}>{getMetaPlatformLabel((record as MetaLead).platform)}</Text>
                </Text>
              )}
              <LeadSummaryCard
                title="META ATTRIBUTION"
                rows={adAttributionRows}
                colors={leadSummaryColors}
              />
              {!shouldShowSavedAdCreativeCard && (record as MetaLead).campaign_name && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Campaign: {(record as MetaLead).campaign_name}
                </Text>
              )}
              {!shouldShowSavedAdCreativeCard && (record as MetaLead).ad_name && (
                <>
                  <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                    Ad Name: {(record as MetaLead).ad_name}
                  </Text>
                </>
              )}
              {shouldShowSavedAdCreativeCard && savedMetaAdCreative ? (
                <MetaAdCreativeCard
                  creative={savedMetaAdCreative}
                  colors={leadSummaryColors}
                />
              ) : null}
              {(record as MetaLead).subject_address && (
                <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                  Address: {(record as MetaLead).subject_address}
                </Text>
              )}
              {/* Form answers: use form_data when available, fall back to hardcoded columns for old leads */}
              {(() => {
                const meta = record as MetaLead;
                const formData = meta.form_data;
                const hasFormData = formData && Object.keys(formData).length > 0;

                if (hasFormData) {
                  // form_data is the source of truth — exclude identity, campaign & internal keys
                  const excludeKeys = new Set([
                    'first_name', 'last_name', 'email', 'phone_number', 'phone', 'full_name', 'name',
                    'campaign_name', 'ad_name', 'platform', 'ad_set',
                    'inbox_url', 'leadgen_id', 'created_time', 'id', 'form_id',
                    'meta_ad_notes', 'notes',
                    ...(meta.loan_purpose ? ['loan_purpose'] : []),
                  ]);
                  // Normalize long question-style keys to clean short labels
                  const labelMap: Record<string, string> = {
                    'are_you_working_with_a_realtor': 'Has Realtor',
                    'are_you_working_with_a_realtor_': 'Has Realtor',
                    'do_you_currently_work_with_a_realtor': 'Has Realtor',
                    'what_type_of_income_do_you_earn': 'Income Type',
                    'what_type_of_income_do_you_earn_': 'Income Type',
                    'what_price_range_are_you_shopping_in': 'Price Range',
                    'what_price_range_are_you_shopping_in_': 'Price Range',
                    'when_are_you_looking_to_buy_your_home': 'Purchase Timeline',
                    'when_are_you_looking_to_buy_your_home_': 'Purchase Timeline',
                    'which_county_you_are_looking_to_buy_in': 'County Interest',
                    'which_county_are_you_looking_to_buy_in': 'County Interest',
                    'what_is_your_current_credit_score_range': 'Credit Range',
                    'what_is_your_current_credit_score_range_': 'Credit Range',
                    'how_much_have_you_saved_or_plan_to_save_for_your_home_purchase': 'Down Payment Saved',
                    'how_much_have_you_saved__or_plan_to_save_for_your_home_purchase': 'Down Payment Saved',
                    'how_much_have_you_saved__or_plan_to_save__for_your_home_purchase_': 'Down Payment Saved',
                    'monthly_income': 'Monthly Income',
                    'county_interest': 'County Interest',
                    'preferred_language': 'Preferred Language',
                    'has_realtor': 'Has Realtor',
                    'income_type': 'Income Type',
                    'price_range': 'Price Range',
                    'credit_range': 'Credit Range',
                    'purchase_timeline': 'Purchase Timeline',
                    'down_payment_saved': 'Down Payment Saved',
                    'loan_purpose': 'Loan Purpose',
                    'subject_address': 'Property Address',
                    'do_you_have_a_va_certificate': 'VA Certificate',
                    'how_did_you_hear_about_us': 'How Did You Hear About Us',
                    'additional_notes': 'Additional Notes',
                  };
                  // Preferred display order — fields not listed appear at the end
                  const fieldOrder = [
                    'county_interest', 'which_county_you_are_looking_to_buy_in', 'which_county_are_you_looking_to_buy_in',
                    'preferred_language',
                    'has_realtor', 'are_you_working_with_a_realtor', 'are_you_working_with_a_realtor_', 'do_you_currently_work_with_a_realtor',
                    'income_type', 'what_type_of_income_do_you_earn', 'what_type_of_income_do_you_earn_',
                    'monthly_income',
                    'price_range', 'what_price_range_are_you_shopping_in', 'what_price_range_are_you_shopping_in_',
                    'purchase_timeline', 'when_are_you_looking_to_buy_your_home', 'when_are_you_looking_to_buy_your_home_',
                    'credit_range', 'what_is_your_current_credit_score_range', 'what_is_your_current_credit_score_range_',
                    'down_payment_saved', 'how_much_have_you_saved_or_plan_to_save_for_your_home_purchase', 'how_much_have_you_saved__or_plan_to_save_for_your_home_purchase', 'how_much_have_you_saved__or_plan_to_save__for_your_home_purchase_',
                    'do_you_have_a_va_certificate',
                    'loan_purpose',
                    'subject_address',
                    'how_did_you_hear_about_us',
                    'additional_notes',
                  ];
                  const formatLabel = (key: string) =>
                    labelMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                  const formatValue = (s: string) =>
                    s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                  // Sort by preferred order, filter excluded keys, then deduplicate by resolved label
                  const seenLabels = new Set<string>();
                  const entries = Object.entries(formData)
                    .filter(([key]) => !excludeKeys.has(key))
                    .sort((a, b) => {
                      const ai = fieldOrder.indexOf(a[0]);
                      const bi = fieldOrder.indexOf(b[0]);
                      if (ai !== -1 && bi !== -1) return ai - bi;
                      if (ai !== -1) return -1;
                      if (bi !== -1) return 1;
                      return 0;
                    })
                    .filter(([key]) => {
                      const label = formatLabel(key);
                      if (seenLabels.has(label)) return false;
                      seenLabels.add(label);
                      return true;
                    });
                  if (entries.length === 0) return null;
                  return (
                    <View style={{ marginTop: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: PLUM, marginBottom: 8, letterSpacing: 0.3 }}>
                        FORM ANSWERS
                      </Text>
                      {entries.map(([key, value]) => (
                        <View
                          key={key}
                          style={{
                            backgroundColor: colors.cardBackground === '#FFFFFF' ? '#F8FAFC' : 'rgba(255,255,255,0.05)',
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            marginBottom: 6,
                            borderWidth: 1,
                            borderColor: colors.border || '#E2E8F0',
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#94A3B8', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                            {formatLabel(key)}
                          </Text>
                          <Text style={{ fontSize: 14, color: colors.textPrimary, fontWeight: '500' }} selectable={true}>
                            {formatValue(value)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  );
                }

                // Legacy fallback: no form_data, show hardcoded columns
                return (
                  <>
                    {meta.loan_purpose && (
                      <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                        Loan Purpose: {meta.loan_purpose}
                      </Text>
                    )}
                    {meta.preferred_language && (
                      <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                        Language: {meta.preferred_language}
                      </Text>
                    )}
                    {meta.credit_range && (
                      <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                        Credit Range: {meta.credit_range}
                      </Text>
                    )}
                    {meta.income_type && (
                      <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                        Income Type: {meta.income_type}
                      </Text>
                    )}
                    {meta.purchase_timeline && (
                      <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                        Purchase Timeline: {meta.purchase_timeline}
                      </Text>
                    )}
                    {meta.price_range && (
                      <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                        Price Range: {meta.price_range}
                      </Text>
                    )}
                    {meta.down_payment_saved && (
                      <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                        Down Payment Saved: {meta.down_payment_saved}
                      </Text>
                    )}
                    {meta.has_realtor != null && (
                      <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                        Has Realtor: {meta.has_realtor ? 'Yes' : 'No'}
                      </Text>
                    )}
                    {meta.county_interest && (
                      <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                        County Interest: {meta.county_interest}
                      </Text>
                    )}
                    {meta.monthly_income && (
                      <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                        Monthly Income: {meta.monthly_income}
                      </Text>
                    )}
                    {(meta.meta_ad_notes || meta.additional_notes) && (
                      <Text style={[styles.detailField, { color: colors.textPrimary }]} selectable={true}>
                        Notes: {meta.meta_ad_notes || meta.additional_notes}
                      </Text>
                    )}
                  </>
                );
              })()}
              {!shouldHideImportedMetaMetadata && (
                <LeadMetadataCard
                  sections={metadataSections}
                  colors={leadSummaryColors}
                />
              )}
            </>
          )}

          <View style={styles.sectionDivider} />
          <ApprovalRecipeSection
            leadId={record.id}
            leadSource={isMeta ? 'meta' : 'organic'}
          />

          {/* LO & Realtor Assignment */}
          <View style={styles.statusLORow}>
            {/* LO Assignment (Super Admin & Realtor) */}
            {(propUserRole === 'super_admin' || propUserRole === 'realtor') && (
              <TouchableOpacity
                style={styles.loDropdownButton}
                onPress={() => setShowLOPicker(true)}
                disabled={updatingLO}
              >
                <Ionicons name="person-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
                <Text style={styles.loDropdownLabel}>LO:</Text>
                <Text style={styles.loDropdownValue} numberOfLines={1}>
                  {record.lo_id 
                    ? loanOfficers.find(lo => lo.id === record.lo_id)?.name || 'Unknown'
                    : 'Unassigned'
                  }
                </Text>
                <Text style={styles.statusDropdownArrow}>▼</Text>
              </TouchableOpacity>
            )}

            {/* Realtor Assignment (hide for realtors - they ARE the realtor) */}
            {propUserRole !== 'realtor' && (
              <TouchableOpacity
                style={styles.loDropdownButton}
                onPress={() => {
                  fetchRealtorsForPicker();
                  setShowRealtorPicker(true);
                }}
                disabled={updatingRealtor}
              >
                <Ionicons name="home-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
                <Text style={styles.loDropdownLabel}>Realtor:</Text>
                <Text style={styles.loDropdownValue} numberOfLines={1}>
                  {currentRealtorName || 'None'}
                </Text>
                <Text style={styles.statusDropdownArrow}>▼</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Tracking Section */}
          <View style={trackingStyles.container}>
            <View style={trackingStyles.headerRow}>
              <TouchableOpacity 
                style={[
                  trackingStyles.trackButton,
                  isTracked && trackingStyles.trackButtonActive
                ]}
                onPress={handleToggleTracking}
                disabled={updatingTracking}
              >
                {updatingTracking ? (
                  <ActivityIndicator size="small" color={isTracked ? '#FFFFFF' : PLUM} />
                ) : (
                  <>
                    <Ionicons 
                      name={isTracked ? 'pin' : 'pin-outline'} 
                      size={16} 
                      color={isTracked ? '#FFFFFF' : PLUM}
                    />
                    <Text style={[
                      trackingStyles.trackButtonText,
                      isTracked && trackingStyles.trackButtonTextActive
                    ]}>
                      {isTracked ? 'Tracked' : 'Track'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity 
                style={trackingStyles.infoButton}
                onPress={() => setShowTrackingInfo(true)}
              >
                <Ionicons name="information-circle-outline" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            {isTracked && trackingReason && (
              <Text style={trackingStyles.reasonText}>
                {getTrackingReasonLabel(trackingReason)}
              </Text>
            )}
            {isTracked && (
              <View style={trackingStyles.noteContainer}>
                <TextInput
                  style={[trackingStyles.noteInput, { color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="Add a tracking note..."
                  placeholderTextColor="#94A3B8"
                  value={trackingNote}
                  onChangeText={setTrackingNote}
                  multiline
                  numberOfLines={2}
                />
                <TouchableOpacity 
                  style={[
                    trackingStyles.saveNoteButton,
                    savingTrackingNote && trackingStyles.saveNoteButtonDisabled
                  ]}
                  onPress={handleSaveTrackingNote}
                  disabled={savingTrackingNote}
                >
                  {savingTrackingNote ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={trackingStyles.saveNoteButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Partner Update Section */}
          {hasPartnerEmail && (
            <View style={partnerUpdateStyles.container}>
              <View style={partnerUpdateStyles.headerRow}>
                <View style={partnerUpdateStyles.labelRow}>
                  <Ionicons name="people-outline" size={16} color={PLUM} />
                  <Text style={[partnerUpdateStyles.label, { color: colors.textPrimary }]}>
                    Partner: {partnerName}
                  </Text>
                </View>
                <TouchableOpacity 
                  style={partnerUpdateStyles.sendButton}
                  onPress={() => setShowPartnerUpdateModal(true)}
                >
                  <Ionicons name="mail-outline" size={16} color="#FFFFFF" />
                  <Text style={partnerUpdateStyles.sendButtonText}>Send Update</Text>
                </TouchableOpacity>
              </View>
              {record?.last_referral_update_at && (
                <Text style={[partnerUpdateStyles.lastUpdate, { color: colors.textSecondary }]}>
                  Last update: {new Date(record.last_referral_update_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </Text>
              )}
            </View>
          )}

          {renderScenarioSharingSection()}

          {renderIncomeAnalysisSection()}


          {/* Referral Agreements Section (read-only, gated by is_licensed_realtor) */}
          {isLicensedRealtor && record && (
            <>
              <View style={styles.sectionDivider} />
              <ReferralAgreementsSection
                leadId={record.id}
                leadSource={isMeta ? 'meta_ads' : 'leads'}
              />
            </>
          )}

          {/* Divider */}
          <View style={styles.sectionDivider} />

          {/* Tasks / Logging Section */}
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>✍️ Log Activity</Text>
          
          {/* Activity Type Buttons */}
          <View style={styles.activityTypeRow}>
            <TouchableOpacity
              style={[
                styles.activityTypeButton,
                selectedActivityType === 'call' && styles.activityTypeButtonActive,
              ]}
              onPress={() => setSelectedActivityType('call')}
            >
              <Text style={[
                styles.activityTypeText,
                selectedActivityType === 'call' && styles.activityTypeTextActive,
              ]}>
                <Ionicons
                  name="call-outline"
                  size={14}
                  color={selectedActivityType === 'call' ? '#059669' : '#64748B'}
                />{' '}
                Call
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.activityTypeButton,
                selectedActivityType === 'text' && styles.activityTypeButtonActive,
              ]}
              onPress={() => setSelectedActivityType('text')}
            >
              <Text style={[
                styles.activityTypeText,
                selectedActivityType === 'text' && styles.activityTypeTextActive,
              ]}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={14}
                  color={selectedActivityType === 'text' ? '#059669' : '#64748B'}
                />{' '}
                Text
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.activityTypeButton,
                selectedActivityType === 'email' && styles.activityTypeButtonActive,
              ]}
              onPress={() => setSelectedActivityType('email')}
            >
              <Text style={[
                styles.activityTypeText,
                selectedActivityType === 'email' && styles.activityTypeTextActive,
              ]}>
                <Ionicons
                  name="mail-outline"
                  size={14}
                  color={selectedActivityType === 'email' ? '#059669' : '#64748B'}
                />{' '}
                Email
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.activityTypeButton,
                selectedActivityType === 'note' && styles.activityTypeButtonActive,
              ]}
              onPress={() => setSelectedActivityType('note')}
            >
              <Text style={[
                styles.activityTypeText,
                selectedActivityType === 'note' && styles.activityTypeTextActive,
              ]}>
                <Ionicons
                  name="document-text-outline"
                  size={14}
                  color={selectedActivityType === 'note' ? '#059669' : '#64748B'}
                />{' '}
                Note
              </Text>
            </TouchableOpacity>
          </View>

          {/* Quick Phrases Button */}
          <TouchableOpacity
            style={styles.quickPhrasesButton}
            onPress={() => setShowQuickPhrases(!showQuickPhrases)}
          >
            <Text style={styles.quickPhrasesButtonText}>
              <Ionicons name="list-circle-outline" size={16} color="#0F172A" />{' '}
              Quick Phrases {showQuickPhrases ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>

          {/* Quick Phrases List */}
          {showQuickPhrases && (
            <View style={styles.quickPhrasesList}>
              {quickPhrases.map((phrase, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.quickPhraseItem}
                  onPress={() => handleQuickPhrase(phrase)}
                >
                  <Text style={styles.quickPhraseText}>{phrase}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          {/* Activity Input */}
          <View style={[styles.activityInputCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <TextInput
              style={styles.activityInput}
              placeholder={`Enter ${selectedActivityType} details...`}
              placeholderTextColor="#999"
              value={taskNote}
              onChangeText={setTaskNote}
              multiline
            />
            
            {/* Voice Note Section */}
            {pendingVoiceNoteUri ? (
              // Preview UI - after recording, before saving
              <View style={styles.voiceNotePreviewContainer}>
                <View style={styles.voiceNotePreviewRow}>
                  <TouchableOpacity
                    style={styles.voiceNotePlayButton}
                    onPress={togglePreviewPlayback}
                  >
                    <Ionicons 
                      name={isPlayingPreview ? 'pause' : 'play'} 
                      size={20} 
                      color={PLUM}
                    />
                  </TouchableOpacity>
                  <Text style={styles.voiceNotePreviewText}>
                    {isPlayingPreview ? 'Playing...' : 'Voice note ready'}
                  </Text>
                </View>
                <View style={styles.voiceNotePreviewActions}>
                  <TouchableOpacity
                    style={styles.voiceNoteDiscardButton}
                    onPress={discardVoiceNote}
                  >
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    <Text style={styles.voiceNoteDiscardText}>Discard</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.voiceNoteSaveButton,
                      uploadingVoiceNote && { opacity: 0.6 },
                    ]}
                    onPress={confirmAndSaveVoiceNote}
                    disabled={uploadingVoiceNote}
                  >
                    <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                    <Text style={styles.voiceNoteSaveText}>
                      {uploadingVoiceNote ? 'Saving...' : 'Log Voice Note'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              // Recording UI
              <View style={styles.voiceNoteRow}>
                <TouchableOpacity
                  style={[
                    styles.voiceNoteRecordButton,
                    isRecording && styles.voiceNoteRecordButtonActive,
                  ]}
                  onPress={() => {
                    if (isRecording) {
                      stopRecordingForPreview();
                    } else {
                      startVoiceRecording();
                    }
                  }}
                  disabled={uploadingVoiceNote}
                >
                  <Ionicons 
                    name={isRecording ? 'stop-circle' : 'mic'} 
                    size={18} 
                    color="#FFFFFF" 
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.voiceNoteRecordButtonText}>
                    {isRecording ? 'Stop' : 'Voice Note'}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.voiceNoteHint}>
                  {isRecording
                    ? 'Recording… tap to stop'
                    : 'Optional: log a quick voice note'}
                </Text>
              </View>
            )}
            
            <Animated.View style={{ transform: [{ scale: logButtonScale }] }}>
              <TouchableOpacity
                style={[
                  styles.logActivityButton,
                  (!taskNote.trim() || savingActivity) && styles.logActivityButtonDisabled,
                ]}
                onPress={() => {
                  if (!taskNote.trim() || savingActivity) return;
                  animateLogButton();
                  handleAddTask();
                }}
                disabled={!taskNote.trim() || savingActivity}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  {!savingActivity && (
                    <Ionicons
                      name={getActivityIconName(selectedActivityType)}
                      size={16}
                      color="#FFFFFF"
                      style={{ marginRight: 6 }}
                    />
                  )}
                  <Text style={styles.logActivityButtonText}>
                    {savingActivity
                      ? 'Saving...'
                      : `Log ${getActivityLabel(selectedActivityType)}`}
                  </Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Divider */}
          <View style={styles.sectionDivider} />

          {/* Activity History */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Ionicons
              name="time-outline"
              size={16}
              color={colors.textPrimary}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Activity History</Text>
          </View>

          {loadingActivities ? (
            <ActivityIndicator size="small" color="#007aff" style={{ marginTop: 12 }} />
          ) : activities.length > 0 ? (
            <View style={styles.tasksList}>
              {activities.map((activity) => (
                <View key={activity.id} style={[styles.activityHistoryItem, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                  <View style={styles.activityHistoryHeader}>
                    <View style={styles.activityHistoryHeaderLeft}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons
                          name={activity.audio_url ? 'mic-outline' : getActivityIconName(activity.activity_type)}
                          size={14}
                          color={colors.textPrimary}
                          style={{ marginRight: 6 }}
                        />
                        <Text style={styles.activityHistoryType}>
                          {activity.audio_url
                            ? 'Voice note'
                            : getActivityLabel(activity.activity_type)}
                        </Text>
                      </View>
                      <Text style={styles.activityHistoryTimestamp}>
                        {formatTime(activity.created_at)}
                      </Text>
                    </View>
                    {/* Delete button: super_admin always, or LO for their own "My Lead" leads */}
                    {(propUserRole === 'super_admin' || (!isMeta && (record as Lead).source === 'My Lead')) && (
                      <TouchableOpacity
                        onPress={() => handleDeleteActivity(activity.id)}
                        disabled={deletingActivityId === activity.id}
                        style={styles.deleteActivityButton}
                      >
                        {deletingActivityId === activity.id ? (
                          <ActivityIndicator size="small" color="#DC2626" />
                        ) : (
                          <Ionicons
                            name="trash-outline"
                            size={16}
                            color="#DC2626"
                          />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  {activity.notes && activity.activity_type !== 'email' ? (
                    <Text style={styles.activityHistoryNote}>{activity.notes}</Text>
                  ) : null}
                  
                  {activity.activity_type === 'email' && (() => {
                    const toRecipients = formatEmailRecipientList(getActivityRecipientList(activity, 'to'));
                    const ccRecipients = formatEmailRecipientList(getActivityRecipientList(activity, 'cc'));
                    const emailBody = getEmailBodyContent(activity);
                    const hasHtmlBody = Boolean(activity.body && HTML_TAG_PATTERN.test(activity.body));
                    const hasTableHtml = Boolean(activity.body && HTML_TABLE_PATTERN.test(activity.body));
                    const showScrollHint = Boolean(
                      emailBody && (hasHtmlBody || emailBody.length > 220)
                    );
                    const hasHeaders = Boolean(
                      activity.subject ||
                      activity.from_email ||
                      toRecipients ||
                      ccRecipients
                    );

                    if (!hasHeaders && !emailBody) return null;

                    return (
                      <>
                        {hasHeaders ? (
                          <View style={styles.emailHeaderContainer}>
                            {activity.subject ? (
                              <Text style={styles.emailHeaderText}>
                                <Text style={styles.emailHeaderLabel}>Subject:</Text> {activity.subject}
                              </Text>
                            ) : null}
                            {activity.from_email ? (
                              <Text style={styles.emailHeaderText}>
                                <Text style={styles.emailHeaderLabel}>From:</Text> {activity.from_email}
                              </Text>
                            ) : null}
                            {toRecipients ? (
                              <Text style={styles.emailHeaderText}>
                                <Text style={styles.emailHeaderLabel}>To:</Text> {toRecipients}
                              </Text>
                            ) : null}
                            {ccRecipients ? (
                              <Text style={styles.emailHeaderText}>
                                <Text style={styles.emailHeaderLabel}>Cc:</Text> {ccRecipients}
                              </Text>
                            ) : null}
                          </View>
                        ) : null}

                        {emailBody ? (
                          hasTableHtml ? (
                            <>
                              <View style={styles.emailWebViewContainer}>
                                <WebView
                                  style={styles.emailWebView}
                                  originWhitelist={['*']}
                                  source={{ html: buildEmailHtmlDocument(activity.body || '') }}
                                  javaScriptEnabled={false}
                                  scrollEnabled={true}
                                  showsVerticalScrollIndicator={true}
                                  setSupportMultipleWindows={false}
                                  onShouldStartLoadWithRequest={(request) => {
                                    if (request.url === 'about:blank') {
                                      return true;
                                    }

                                    Linking.openURL(request.url).catch((error) => {
                                      console.error('Error opening email link:', error);
                                    });
                                    return false;
                                  }}
                                />
                              </View>
                              {showScrollHint ? (
                                <Text style={styles.emailScrollHint}>Scroll for more</Text>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <ScrollView
                                style={styles.emailBodyContainer}
                                contentContainerStyle={styles.emailBodyContent}
                                nestedScrollEnabled={true}
                              >
                                {hasHtmlBody ? (
                                <RenderHTML
                                  contentWidth={emailContentWidth}
                                  source={{ html: sanitizeEmailHtml(activity.body || '') }}
                                  ignoredDomTags={EMAIL_HTML_IGNORED_TAGS}
                                  baseStyle={emailHtmlBaseStyle}
                                  tagsStyles={emailHtmlTagStyles}
                                />
                                ) : (
                                  <Text style={styles.emailBodyText}>{emailBody}</Text>
                                )}
                              </ScrollView>
                              {showScrollHint ? (
                                <Text style={styles.emailScrollHint}>Scroll for more</Text>
                              ) : null}
                            </>
                          )
                        ) : null}
                      </>
                    );
                  })()}
                  
                  {/* Voice note playback button */}
                  {activity.audio_url && (
                    <TouchableOpacity
                      style={[
                        styles.voiceNoteButton,
                        playingActivityId === activity.id && styles.voiceNoteButtonActive,
                      ]}
                      onPress={() => handlePlayVoiceNote(activity)}
                    >
                      <Text style={styles.voiceNoteButtonText}>
                        {playingActivityId === activity.id ? '▶ Playing…' : '▶ Play voice note'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  
                  {/* Call recording playback button (parsed from notes) */}
                  {!activity.audio_url && activity.activity_type === 'call' && (() => {
                    const recordingUrl = parseRecordingUrl(activity.notes);
                    if (!recordingUrl) return null;
                    return (
                      <TouchableOpacity
                        style={[
                          styles.callRecordingButton,
                          playingActivityId === activity.id && styles.callRecordingButtonActive,
                        ]}
                        onPress={() => handlePlayVoiceNote(activity, recordingUrl)}
                      >
                        <Ionicons 
                          name={playingActivityId === activity.id ? 'pause-circle' : 'play-circle'} 
                          size={20} 
                          color="#FFFFFF" 
                          style={{ marginRight: 8 }}
                        />
                        <Text style={styles.callRecordingButtonText}>
                          {playingActivityId === activity.id ? 'Playing Call Recording…' : 'Play Call Recording'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })()}
                  
                  {activity.user_email && (
                    <Text style={styles.activityUserEmail}>by {activity.user_email}</Text>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.noTasksText}>No activity logged yet</Text>
          )}
        </View>
      </ScrollView>
      )}

      <MetaAdPreviewModal
        visible={showAdImage}
        onClose={() => setShowAdImage(false)}
        accessToken={session?.access_token}
        adId={previewAdId}
        platform={previewPlatform}
        adName={previewAdName}
        campaignName={previewCampaignName}
        fallbackImage={adImage}
        fallbackHeadline={savedMetaAdCreative?.headline ?? null}
        fallbackBody={savedMetaAdCreative?.body ?? null}
      />

      {/* Text Template Modal */}
      <Modal
        visible={showTemplateModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowTemplateModal(false);
          setShowCustomMessage(false);
          setCustomMessageText('');
        }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.templateModalContent}>
                <View style={styles.templateModalHeader}>
                  <Text style={styles.templateModalTitle}>
                    {showCustomMessage
                      ? 'Write Custom Message'
                      : templateMode === 'text'
                        ? (useSpanishTemplates ? 'Elegir Plantilla de Texto' : 'Choose a Text Template')
                        : (useSpanishTemplates ? 'Elegir Plantilla de Correo' : 'Choose an Email Template')}
                  </Text>
                  <TouchableOpacity 
                    onPress={() => {
                      setShowTemplateModal(false);
                      setShowCustomMessage(false);
                      setCustomMessageText('');
                    }}
                    style={styles.templateModalClose}
                  >
                    <Text style={styles.templateModalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

            {!showCustomMessage ? (
              <>
                {/* Custom Message Button */}
                <TouchableOpacity
                  style={styles.customMessageButton}
                  onPress={() => setShowCustomMessage(true)}
                >
                  <Text style={styles.customMessageButtonText}>✏️ Write Custom Message</Text>
                </TouchableOpacity>

                {/* Language Toggle */}
                <View style={styles.languageToggleContainer}>
                  <TouchableOpacity
                    style={[
                      styles.languageToggleButton,
                      !useSpanishTemplates && styles.languageToggleButtonActive
                    ]}
                    onPress={() => setUseSpanishTemplates(false)}
                  >
                    <Text style={[
                      styles.languageToggleText,
                      !useSpanishTemplates && styles.languageToggleTextActive
                    ]}>🇺🇸 English</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.languageToggleButton,
                      useSpanishTemplates && styles.languageToggleButtonActive
                    ]}
                    onPress={() => setUseSpanishTemplates(true)}
                  >
                    <Text style={[
                      styles.languageToggleText,
                      useSpanishTemplates && styles.languageToggleTextActive
                    ]}>🇪🇸 Español</Text>
                  </TouchableOpacity>
                </View>
                
                <ScrollView style={styles.templateList} showsVerticalScrollIndicator={false}>
                  {templates.map((template) => {
                    const metaRec = record as MetaLead;
                    const fdPrev = metaRec.form_data || {};
                    const crPrev = metaRec.credit_range
                      || fdPrev.credit_range
                      || Object.entries(fdPrev).find(([k]) => k.toLowerCase().includes('credit'))?.[1]
                      || '';
                    const countyPrev = metaRec.county_interest
                      || fdPrev.county_interest
                      || Object.entries(fdPrev).find(([k]) => k.toLowerCase().includes('county') && !k.toLowerCase().includes('credit'))?.[1]
                      || '';
                    const variables: TemplateVariables = {
                      fname: record.first_name || 'there',
                      loFullname: currentLOInfo 
                        ? `${currentLOInfo.firstName} ${currentLOInfo.lastName}`.trim() 
                        : 'Mario',
                      loFname: currentLOInfo?.firstName || 'Mario',
                      loPhone: currentLOInfo?.phone || '[Phone]',
                      loEmail: currentLOInfo?.email || '[Email]',
                      company: currentLOInfo?.company || '[Company]',
                      platform: isMeta ? (record as MetaLead).platform || 'Facebook' : 'our website',
                      creditRange: crPrev,
                      county: countyPrev,
                    };
                    const templateText = getTemplateText(template, useSpanishTemplates);
                    const preview = fillTemplate(templateText, variables);

                    return (
                      <TouchableOpacity
                        key={template.id}
                        style={styles.templateItem}
                        onPress={() => handleTemplateSelect(template.id)}
                      >
                        <Text style={styles.templateName}>{getTemplateName(template, useSpanishTemplates)}</Text>
                        <Text style={styles.templatePreview} numberOfLines={8}>
                          {preview}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            ) : (
              <ScrollView style={{ maxHeight: 600 }} contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={true}>
                <TouchableOpacity
                  style={styles.backToTemplatesButton}
                  onPress={() => {
                    setShowCustomMessage(false);
                    setCustomMessageText('');
                  }}
                >
                  <Text style={styles.backToTemplatesButtonText}>← Back to Templates</Text>
                </TouchableOpacity>

                <Text style={styles.customMessagePreview}>
                  Hi {record.first_name || 'there'} 👋{'\n\n'}
                </Text>

                <TextInput
                  style={styles.customMessageInput}
                  placeholder="Type your message here..."
                  placeholderTextColor="#999"
                  value={customMessageText}
                  onChangeText={(text) => {
                    setCustomMessageText(text);
                    customMsgAiRef.current?.resetBadge();
                  }}
                  multiline
                  autoFocus
                />

                <AiRewriteToolbar
                  ref={customMsgAiRef}
                  text={customMessageText}
                  onTextRewritten={setCustomMessageText}
                  context="custom_sms"
                  hasAccess={!!currentLOInfo?.aiDraftAccess}
                />

                <Text style={styles.customMessagePreview}>
                  {'\n'}You can reach me at:{'\n'}
                  📞 {currentLOInfo?.phone || '[Phone]'}{'\n'}
                  📧 {currentLOInfo?.email || '[Email]'}
                </Text>

                <TouchableOpacity
                  style={[
                    styles.sendCustomMessageButton,
                    !customMessageText.trim() && styles.sendCustomMessageButtonDisabled
                  ]}
                  onPress={handleCustomMessageSend}
                  disabled={!customMessageText.trim()}
                >
                  <Text style={styles.sendCustomMessageButtonText}>Send</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Callback Reminder Modal */}
      <Modal
        visible={showCallbackModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCallbackModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.callbackModalContent}>
                <View style={styles.templateModalHeader}>
                  <Text style={styles.templateModalTitle}>Schedule Callback</Text>
                  <TouchableOpacity
                    onPress={() => setShowCallbackModal(false)}
                    style={styles.templateModalClose}
                  >
                    <Text style={styles.templateModalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.callbackLeadName}>
                  Lead: {fullName}
                </Text>

                {callbackDate && (
                  <View style={styles.callbackPickerWrapper}>
                    <DateTimePicker
                      value={callbackDate}
                      mode="datetime"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(_event, date) => {
                        if (date) setCallbackDate(date);
                      }}
                    />
                  </View>
                )}

                {isMeta && 'platform' in record && 'ad_name' in record && record.platform && record.ad_name && (
                  <Text style={styles.callbackMetaInfo}>
                    ({record.platform}) {record.ad_name}
                  </Text>
                )}

                <TextInput
                  style={styles.callbackNoteInput}
                  placeholder="Notes (optional)"
                  placeholderTextColor="#999"
                  value={callbackNote}
                  onChangeText={setCallbackNote}
                  multiline
                />

            <TouchableOpacity
              style={[
                styles.logActivityButton,
                (!callbackDate || savingCallback) && styles.logActivityButtonDisabled,
              ]}
              disabled={!callbackDate || savingCallback}
              onPress={async () => {
                if (!callbackDate) return;
                try {
                  setSavingCallback(true);

                  const leadDetailsForOutlook = {
                    Name: fullName,
                    Email: email,
                    Phone: phone,
                    Status: status,
                    Source: isMeta ? 'Meta Ad' : 'Organic',
                    'Lead ID': record.id,
                    'Created At': record.created_at,
                  };

                  const taskHistoryForOutlook = activities
                    .map((activity) => {
                      const createdAt = activity.created_at
                        ? new Date(activity.created_at).toLocaleString()
                        : '';
                      const type = activity.activity_type || 'activity';
                      const notes = activity.notes || '';
                      return `${createdAt} [${type}] ${notes}`.trim();
                    })
                    .filter(Boolean)
                    .join('\n');

                  await scheduleLeadCallback({
                    leadId: record.id,
                    leadName: fullName,
                    scheduledFor: callbackDate,
                    createdByUserId: session?.user?.id,
                    note: callbackNote,
                    leadSource: isMeta ? 'meta' : 'lead',
                    leadDetailsForOutlook,
                    taskHistoryForOutlook,
                    leadPhoneForOutlook: phone,
                  });

                  // Log callback as a note activity in Activity History
                  try {
                    const tableName = isMeta ? 'meta_ad_activities' : 'lead_activities';
                    const foreignKeyColumn = isMeta ? 'meta_ad_id' : 'lead_id';

                    // Format date with smart relative dates (today/tomorrow)
                    const formatCallbackDate = (date: Date): string => {
                      const now = new Date();
                      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                      const tomorrow = new Date(today);
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      const callbackDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                      
                      const timeStr = date.toLocaleString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      });
                      
                      if (callbackDay.getTime() === today.getTime()) {
                        return `today at ${timeStr}`;
                      } else if (callbackDay.getTime() === tomorrow.getTime()) {
                        return `tomorrow at ${timeStr}`;
                      } else {
                        const dateStr = date.toLocaleString('en-US', {
                          month: '2-digit',
                          day: '2-digit',
                          year: 'numeric',
                        });
                        return `${dateStr} at ${timeStr}`;
                      }
                    };

                    const formattedDate = formatCallbackDate(callbackDate);
                    const callbackMessage = `Callback scheduled for ${formattedDate}${callbackNote ? ` - ${callbackNote}` : ''}`;

                    const { data: newActivity } = await supabase.from(tableName).insert([
                      {
                        [foreignKeyColumn]: record.id,
                        activity_type: 'note',
                        notes: callbackMessage,
                        created_by: session?.user?.id || null,
                        user_email: session?.user?.email || 'Mobile App User',
                      },
                    ])
                    .select()
                    .single();

                    // Add the new activity to the list immediately
                    if (newActivity) {
                      setActivities([newActivity, ...activities]);
                    }
                  } catch (e) {
                    console.log('Callback activity log failed (non-fatal):', e);
                  }

                  setShowCallbackModal(false);
                } catch (err: any) {
                  console.error('Error scheduling callback:', err);
                  alert(err.message || 'Failed to schedule callback.');
                } finally {
                  setSavingCallback(false);
                }
              }}
            >
              <Text style={styles.logActivityButtonText}>
                {savingCallback ? 'Saving…' : 'Save & Schedule Reminder'}
              </Text>
            </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Partner Update Modal */}
      <Modal visible={showPartnerUpdateModal} transparent animationType="fade">
        <TouchableOpacity 
          style={partnerUpdateStyles.modalOverlay} 
          activeOpacity={1}
          onPress={() => { Keyboard.dismiss(); setShowPartnerUpdateModal(false); }}
        >
          <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
            <View style={[partnerUpdateStyles.modalContent, { backgroundColor: colors.cardBackground }]}>
              <View style={partnerUpdateStyles.modalHeader}>
                <Text style={[partnerUpdateStyles.modalTitle, { color: colors.textPrimary }]}>
                  Send Partner Update
                </Text>
                <TouchableOpacity onPress={() => setShowPartnerUpdateModal(false)}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              
              <Text style={[partnerUpdateStyles.modalSubtitle, { color: colors.textSecondary }]}>
                Send an email update to {partnerName} about {fullName}'s loan progress.
              </Text>
              
              <TextInput
                style={[partnerUpdateStyles.messageInput, { 
                  color: colors.textPrimary, 
                  borderColor: colors.border,
                  backgroundColor: colors.background 
                }]}
                placeholder="Enter your update message..."
                placeholderTextColor="#94A3B8"
                value={partnerUpdateMessage}
                onChangeText={(text) => {
                  setPartnerUpdateMessage(text);
                  partnerAiRef.current?.resetBadge();
                }}
                onSelectionChange={(e) => setPartnerCursorPos(e.nativeEvent.selection.end)}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
              
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={partnerUpdateStyles.emojiRow} contentContainerStyle={partnerUpdateStyles.emojiRowContent}>
                {['👋', '🏠', '📋', '✅', '🎉', '📞', '💰', '🔑', '📄', '⏳'].map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={partnerUpdateStyles.emojiButton}
                    onPress={() => {
                      setPartnerUpdateMessage((prev) => {
                        const pos = partnerCursorPos;
                        const newText = prev.slice(0, pos) + emoji + prev.slice(pos);
                        setPartnerCursorPos(pos + emoji.length);
                        return newText;
                      });
                      partnerAiRef.current?.resetBadge();
                    }}
                  >
                    <Text style={partnerUpdateStyles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              <AiRewriteToolbar
                ref={partnerAiRef}
                text={partnerUpdateMessage}
                onTextRewritten={setPartnerUpdateMessage}
                context="partner_update"
                hasAccess={!!currentLOInfo?.aiDraftAccess}
              />
              
              <TouchableOpacity 
                style={[
                  partnerUpdateStyles.sendModalButton,
                  (!partnerUpdateMessage.trim() || sendingPartnerUpdate) && partnerUpdateStyles.sendModalButtonDisabled
                ]}
                onPress={handleSendPartnerUpdate}
                disabled={!partnerUpdateMessage.trim() || sendingPartnerUpdate}
              >
                {sendingPartnerUpdate ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#FFFFFF" />
                    <Text style={partnerUpdateStyles.sendModalButtonText}>Send Update</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* Tracking Info Modal */}
      <Modal visible={showTrackingInfo} transparent animationType="fade">
        <TouchableOpacity 
          style={trackingInfoStyles.overlay} 
          activeOpacity={1}
          onPress={() => setShowTrackingInfo(false)}
        >
          <View style={[trackingInfoStyles.content, { backgroundColor: colors.cardBackground }]}>
            <Text style={[trackingInfoStyles.title, { color: colors.textPrimary }]}>Lead Tracking</Text>
            <Text style={[trackingInfoStyles.subtitle, { color: colors.textSecondary }]}>
              Track important leads to monitor their progress
            </Text>
            
            <View style={trackingInfoStyles.ruleRow}>
              <Text style={trackingInfoStyles.ruleIcon}>📌</Text>
              <Text style={[trackingInfoStyles.ruleText, { color: colors.textPrimary }]}>
                <Text style={{ fontWeight: '600' }}>Manual:</Text> Pin leads you want to follow closely
              </Text>
            </View>
            
            <View style={trackingInfoStyles.ruleRow}>
              <Text style={trackingInfoStyles.ruleIcon}>📄</Text>
              <Text style={[trackingInfoStyles.ruleText, { color: colors.textPrimary }]}>
                <Text style={{ fontWeight: '600' }}>Auto:</Text> Leads are auto-tracked when status changes to "Gathering Docs"
              </Text>
            </View>
            
            <View style={trackingInfoStyles.ruleRow}>
              <Text style={trackingInfoStyles.ruleIcon}>✅</Text>
              <Text style={[trackingInfoStyles.ruleText, { color: colors.textPrimary }]}>
                <Text style={{ fontWeight: '600' }}>Auto:</Text> Leads are auto-tracked when status changes to "Qualified"
              </Text>
            </View>
            
            <View style={trackingInfoStyles.ruleRow}>
              <Text style={trackingInfoStyles.ruleIcon}>🔓</Text>
              <Text style={[trackingInfoStyles.ruleText, { color: colors.textPrimary }]}>
                <Text style={{ fontWeight: '600' }}>Auto-untrack:</Text> When status is "Closed", "Unqualified", or "Lost Deal"
              </Text>
            </View>

            <TouchableOpacity 
              style={trackingInfoStyles.closeButton}
              onPress={() => setShowTrackingInfo(false)}
            >
              <Text style={trackingInfoStyles.closeButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* AI Recommendation Modal */}
      <Modal
        visible={showAiRecommendation}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAiRecommendation(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowAiRecommendation(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={aiRecommendationStyles.container}>
                <View style={aiRecommendationStyles.header}>
                  <Text style={aiRecommendationStyles.title}>Why this needs attention</Text>
                  <TouchableOpacity
                    onPress={() => setShowAiRecommendation(false)}
                    style={styles.templateModalClose}
                  >
                    <Text style={styles.templateModalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>
                
                <Text style={aiRecommendationStyles.reason}>
                  {aiAttention?.reason || 'No additional details available.'}
                </Text>
                
                {aiAttention?.suggestedAction && (
                  <TouchableOpacity 
                    style={[
                      aiRecommendationStyles.suggestionContainer,
                      isTextSuggestion && phone && aiRecommendationStyles.suggestionTappable
                    ]}
                    onPress={isTextSuggestion && phone ? handleAiSuggestedText : undefined}
                    activeOpacity={isTextSuggestion && phone ? 0.7 : 1}
                    disabled={!isTextSuggestion || !phone}
                  >
                    <Text style={aiRecommendationStyles.suggestionIcon}>💡</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={aiRecommendationStyles.suggestionText}>
                        {aiAttention.suggestedAction}
                      </Text>
                      {isTextSuggestion && phone && (
                        <Text style={aiRecommendationStyles.tapToSend}>
                          👆 Tap to send this text
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity
                  style={aiRecommendationStyles.closeButton}
                  onPress={() => setShowAiRecommendation(false)}
                >
                  <Text style={aiRecommendationStyles.closeButtonText}>Got it</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Docs-received SMS toast banner */}
      {smsToast.visible && (
        <Animated.View
          style={{
            position: 'absolute',
            bottom: 36,
            left: 16,
            right: 16,
            opacity: smsToastOpacity,
            backgroundColor: smsToast.type === 'success' ? '#059669' : smsToast.type === 'error' ? '#DC2626' : PLUM,
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 6,
            elevation: 6,
          }}
        >
          <Ionicons
            name={smsToast.type === 'success' ? 'checkmark-circle' : smsToast.type === 'error' ? 'alert-circle' : 'chatbubble-ellipses'}
            size={18}
            color="#FFFFFF"
            style={{ marginRight: 8 }}
          />
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600', flex: 1 }}>
            {smsToast.message}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

// Styles for AI Recommendation Modal
const aiRecommendationStyles = StyleSheet.create({
  container: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 24,
    maxWidth: 400,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  reason: {
    fontSize: 15,
    color: '#CBD5E1',
    lineHeight: 22,
    marginBottom: 16,
  },
  suggestionContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  suggestionIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  suggestionText: {
    fontSize: 14,
    color: '#10B981',
    flex: 1,
    lineHeight: 20,
    fontWeight: '500',
  },
  suggestionTappable: {
    borderWidth: 1,
    borderColor: '#10B981',
    borderStyle: 'dashed',
  },
  tapToSend: {
    fontSize: 12,
    color: '#6EE7B7',
    marginTop: 8,
    fontWeight: '600',
  },
  closeButton: {
    backgroundColor: PLUM,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

// Styles for Tracking Section
const trackingStyles = StyleSheet.create({
  container: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PLUM,
    backgroundColor: 'transparent',
  },
  trackButtonActive: {
    backgroundColor: PLUM,
    borderColor: PLUM,
  },
  trackButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: PLUM,
  },
  trackButtonTextActive: {
    color: '#FFFFFF',
  },
  infoButton: {
    padding: 4,
  },
  reasonText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
  },
  noteContainer: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  noteInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  saveNoteButton: {
    backgroundColor: PLUM,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  saveNoteButtonDisabled: {
    opacity: 0.6,
  },
  saveNoteButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

// Styles for Tracking Info Modal
const trackingInfoStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  ruleIcon: {
    width: 24,
    marginRight: 10,
  },
  ruleText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  closeButton: {
    backgroundColor: PLUM,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

const scenarioShareStyles = StyleSheet.create({
  container: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewingNowRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  viewingNowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  viewingNowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  viewingNowText: {
    color: '#047857',
    fontSize: 11,
    fontWeight: '800',
  },
  pendingUpdatesBox: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
    padding: 12,
    gap: 10,
  },
  pendingUpdatesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  pendingUpdatesTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  pendingUpdatesTitle: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '800',
  },
  pendingUpdateCard: {
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 10,
    gap: 9,
  },
  pendingUpdateHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  pendingUpdateTitleBlock: {
    flex: 1,
  },
  pendingUpdateSubmitter: {
    color: '#1E293B',
    fontSize: 13,
    fontWeight: '800',
  },
  pendingUpdateMeta: {
    color: '#B45309',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  pendingPill: {
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  pendingPillText: {
    color: '#B45309',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  pendingChangeList: {
    gap: 6,
  },
  pendingChangeRow: {
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    padding: 8,
  },
  pendingChangeLabel: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '800',
  },
  pendingChangeValue: {
    marginTop: 2,
    color: '#B45309',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  pendingActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dismissButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '800',
  },
  applyButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  errorBox: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 10,
  },
  errorText: {
    flex: 1,
    color: '#B91C1C',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  emptyBox: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  scenarioList: {
    marginTop: 12,
    gap: 10,
  },
  scenarioCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  collapsedScenarioCard: {
    marginTop: 12,
  },
  scenarioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  scenarioTitleBlock: {
    flex: 1,
  },
  scenarioNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  scenarioIndex: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  primaryPill: {
    borderRadius: 999,
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  primaryPillText: {
    color: PLUM,
    fontSize: 10,
    fontWeight: '800',
  },
  scenarioName: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  scenarioUpdated: {
    fontSize: 11,
    marginTop: 3,
  },
  qualificationPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  qualificationPillOk: {
    backgroundColor: '#DCFCE7',
  },
  qualificationPillWarn: {
    backgroundColor: '#FEF3C7',
  },
  qualificationPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  qualificationPillTextOk: {
    color: '#047857',
  },
  qualificationPillTextWarn: {
    color: '#B45309',
  },
  metricGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricItem: {
    width: '47%',
    minWidth: 120,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    padding: 9,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  collapsedHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  scenarioMeta: {
    marginTop: 9,
    fontSize: 12,
    lineHeight: 17,
  },
  linkStatusRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  linkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  linkPillActive: {
    backgroundColor: '#DCFCE7',
  },
  linkPillInactive: {
    backgroundColor: '#F1F5F9',
  },
  linkPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  linkPillTextActive: {
    color: '#047857',
  },
  linkPillTextInactive: {
    color: '#64748B',
  },
  activityRow: {
    marginTop: 8,
    gap: 3,
  },
  activityText: {
    fontSize: 11,
    lineHeight: 15,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  borrowerButton: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  borrowerButtonText: {
    color: PLUM,
    fontSize: 12,
    fontWeight: '800',
  },
  partnerButton: {
    backgroundColor: PLUM,
  },
  partnerButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
});

const incomeAnalysisStyles = StyleSheet.create({
  container: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#064E3B',
    textTransform: 'uppercase',
  },
  statusSupported: {
    backgroundColor: '#DCFCE7',
  },
  statusReview: {
    backgroundColor: '#FEF3C7',
  },
  statusUnsupported: {
    backgroundColor: '#FFE4E6',
  },
  statusDraft: {
    backgroundColor: '#F1F5F9',
  },
  metricGrid: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  metricItem: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    padding: 10,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  metricValue: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '800',
  },
  detailList: {
    marginTop: 10,
    gap: 7,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailLabel: {
    fontSize: 12,
  },
  detailValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyBox: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 12,
  },
  emptyText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
});

// Styles for Partner Update Section
const partnerUpdateStyles = StyleSheet.create({
  container: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PLUM,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  lastUpdate: {
    fontSize: 12,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  messageInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 120,
    marginBottom: 16,
  },
  sendModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PLUM,
    paddingVertical: 14,
    borderRadius: 10,
  },
  sendModalButtonDisabled: {
    opacity: 0.5,
  },
  sendModalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emojiRow: {
    marginBottom: 12,
    marginTop: -8,
  },
  emojiRowContent: {
    flexDirection: 'row',
    gap: 2,
  },
  emojiButton: {
    padding: 3,
  },
  emojiText: {
    fontSize: 18,
  },
});

// Styles for the Detail/Messages tab bar
const detailTabStyles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: PLUM,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  tabTextActive: {
    color: PLUM,
    fontWeight: '600',
  },
  tabBadge: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeActive: {
    backgroundColor: '#DC2626',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tabBadgeTextActive: {
    color: '#FFFFFF',
  },
});

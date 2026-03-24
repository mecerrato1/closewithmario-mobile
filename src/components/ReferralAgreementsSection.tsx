import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useThemeColors } from '../styles/theme';
import { useReferralAgreements } from '../hooks/useReferralAgreements';
import type { ReferralAgreement, SignerStatus } from '../lib/types/referralAgreement';

const SUPABASE_STORAGE_BASE = 'https://hxpvcaspgdgsehrehbhl.supabase.co/storage/v1/object/public/referral-agreements';

const STATUS_CONFIG: Record<ReferralAgreement['status'], { bg: string; text: string; label: string }> = {
  generated: { bg: '#F1F5F9', text: '#64748B', label: 'Generated' },
  sent:      { bg: '#F3E8FF', text: '#7C3AED', label: 'Sent' },
  viewed:    { bg: '#FEF3C7', text: '#D97706', label: 'Viewed' },
  signed:    { bg: '#DCFCE7', text: '#16A34A', label: 'Signed' },
  declined:  { bg: '#FEE2E2', text: '#DC2626', label: 'Declined' },
  expired:   { bg: '#F1F5F9', text: '#64748B', label: 'Expired' },
  failed:    { bg: '#FEE2E2', text: '#DC2626', label: 'Failed' },
};

function getSignerStatusLabel(signer: SignerStatus): { label: string; bg: string; text: string } {
  if (signer.declined) return { label: 'Declined', bg: '#FEE2E2', text: '#DC2626' };
  if (signer.signed)   return { label: 'Signed', bg: '#DCFCE7', text: '#16A34A' };
  if (signer.viewed)   return { label: 'Viewed', bg: '#FEF3C7', text: '#D97706' };
  if (signer.sent)     return { label: 'Sent', bg: '#F3E8FF', text: '#7C3AED' };
  return { label: 'Pending', bg: '#F1F5F9', text: '#64748B' };
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

interface Props {
  leadId: string;
  leadSource: 'leads' | 'meta_ads' | 'quick_captures';
}

export function ReferralAgreementsSection({ leadId, leadSource }: Props) {
  const { colors, isDark } = useThemeColors();
  const {
    agreements,
    signerStatusMap,
    loading,
    error,
    refresh,
    refreshSignerStatus,
    loadingSignerStatus,
  } = useReferralAgreements({ leadId, leadSource });

  const [expanded, setExpanded] = useState(true);

  const handleOpenPdf = async (path: string) => {
    const url = `${SUPABASE_STORAGE_BASE}/${path}`;
    await WebBrowser.openBrowserAsync(url);
  };

  if (loading) {
    return (
      <View style={{ marginTop: 12 }}>
        <Text style={[localStyles.sectionHeader, { color: colors.textSecondary }]}>REFERRAL AGREEMENTS</Text>
        <ActivityIndicator size="small" color="#7C3AED" style={{ marginTop: 8 }} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ marginTop: 12 }}>
        <Text style={[localStyles.sectionHeader, { color: colors.textSecondary }]}>REFERRAL AGREEMENTS</Text>
        <Text style={{ color: '#DC2626', fontSize: 13, marginTop: 4 }}>Failed to load agreements</Text>
      </View>
    );
  }

  if (agreements.length === 0) {
    return (
      <View style={{ marginTop: 12 }}>
        <Text style={[localStyles.sectionHeader, { color: colors.textSecondary }]}>REFERRAL AGREEMENTS</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4, fontStyle: 'italic' }}>
          No referral agreements yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 12 }}>
      <TouchableOpacity
        style={localStyles.sectionHeaderRow}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Text style={[localStyles.sectionHeader, { color: colors.textSecondary }]}>REFERRAL AGREEMENTS</Text>
          {agreements.length > 1 && (
            <View style={localStyles.countBadge}>
              <Text style={localStyles.countBadgeText}>{agreements.length}</Text>
            </View>
          )}
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textSecondary}
        />
      </TouchableOpacity>

      {expanded && agreements.map((agreement, index) => (
        <AgreementCard
          key={agreement.id}
          agreement={agreement}
          signers={signerStatusMap[agreement.id]}
          isLatest={index === 0}
          onRefreshSigners={() => refreshSignerStatus(agreement.id)}
          loadingSigners={loadingSignerStatus[agreement.id] || false}
          onOpenPdf={handleOpenPdf}
          colors={colors}
          isDark={isDark}
        />
      ))}

      {expanded && (
        <TouchableOpacity
          style={localStyles.refreshAllButton}
          onPress={refresh}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={14} color="#7C3AED" />
          <Text style={localStyles.refreshAllText}>Refresh Agreements</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

interface AgreementCardProps {
  agreement: ReferralAgreement;
  signers?: SignerStatus[];
  isLatest: boolean;
  onRefreshSigners: () => void;
  loadingSigners: boolean;
  onOpenPdf: (path: string) => void;
  colors: ReturnType<typeof useThemeColors>['colors'];
  isDark: boolean;
}

function AgreementCard({
  agreement,
  signers,
  isLatest,
  onRefreshSigners,
  loadingSigners,
  onOpenPdf,
  colors,
  isDark,
}: AgreementCardProps) {
  const statusConfig = STATUS_CONFIG[agreement.status] || STATUS_CONFIG.generated;
  const cardBg = isLatest
    ? colors.cardBackground
    : isDark ? '#0F172A' : '#F8FAFC';

  const showGeneratedPdf = agreement.generated_pdf_path && agreement.status !== 'signed';
  const showSignedPdf = agreement.status === 'signed';

  return (
    <View style={[localStyles.card, { backgroundColor: cardBg, borderColor: colors.border }]}>
      {/* Header: Status Badge + Date */}
      <View style={localStyles.cardHeader}>
        <View style={[localStyles.statusBadge, { backgroundColor: statusConfig.bg }]}>
          <Text style={[localStyles.statusBadgeText, { color: statusConfig.text }]}>
            {statusConfig.label}
          </Text>
        </View>
        <Text style={[localStyles.dateText, { color: colors.textSecondary }]}>
          {formatDate(agreement.created_at)}
        </Text>
      </View>

      {/* Detail Rows */}
      <View style={localStyles.detailGrid}>
        {agreement.prospect_name && (
          <DetailRow label="Prospect" value={agreement.prospect_name} colors={colors} />
        )}
        {agreement.realtor_name && (
          <DetailRow label="Realtor" value={agreement.realtor_name} colors={colors} />
        )}
        {agreement.realtor_email && (
          <DetailRow label="Email" value={agreement.realtor_email} colors={colors} />
        )}
        {agreement.realtor_brokerage && (
          <DetailRow label="Brokerage" value={agreement.realtor_brokerage} colors={colors} />
        )}
        {agreement.realtor_license_number && (
          <DetailRow label="License #" value={agreement.realtor_license_number} colors={colors} />
        )}
        <DetailRow label="Referral %" value={`${agreement.referral_percent}%`} colors={colors} />
        {agreement.sent_at && (
          <DetailRow label="Sent" value={formatDate(agreement.sent_at)} colors={colors} />
        )}
        {agreement.signed_at && (
          <DetailRow label="Signed" value={formatDateTime(agreement.signed_at)} colors={colors} />
        )}
      </View>

      {/* Signer Status */}
      {agreement.eversign_document_hash && (
        <View style={localStyles.signerSection}>
          <View style={localStyles.signerHeaderRow}>
            <Text style={[localStyles.signerHeader, { color: colors.textSecondary }]}>SIGNER STATUS</Text>
            <TouchableOpacity
              onPress={onRefreshSigners}
              disabled={loadingSigners}
              style={localStyles.signerRefreshButton}
              activeOpacity={0.7}
            >
              {loadingSigners ? (
                <ActivityIndicator size="small" color="#7C3AED" />
              ) : (
                <Ionicons name="refresh-outline" size={14} color="#7C3AED" />
              )}
            </TouchableOpacity>
          </View>
          {signers && signers.length > 0 ? (
            signers.map((signer) => {
              const signerConfig = getSignerStatusLabel(signer);
              return (
                <View key={signer.id} style={localStyles.signerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[localStyles.signerName, { color: colors.textPrimary }]}>{signer.name}</Text>
                    <Text style={[localStyles.signerEmail, { color: colors.textSecondary }]}>{signer.email}</Text>
                  </View>
                  <View style={[localStyles.signerBadge, { backgroundColor: signerConfig.bg }]}>
                    <Text style={[localStyles.signerBadgeText, { color: signerConfig.text }]}>
                      {signerConfig.label}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontStyle: 'italic' }}>
              Tap refresh to load signer status
            </Text>
          )}
        </View>
      )}

      {/* Action Buttons */}
      <View style={localStyles.actionRow}>
        {showGeneratedPdf && (
          <TouchableOpacity
            style={localStyles.pdfButton}
            onPress={() => onOpenPdf(agreement.generated_pdf_path!)}
            activeOpacity={0.7}
          >
            <Ionicons name="document-text-outline" size={16} color="#7C3AED" />
            <Text style={localStyles.pdfButtonText}>View Generated PDF</Text>
          </TouchableOpacity>
        )}
        {showSignedPdf && (
          agreement.signed_pdf_path ? (
            <TouchableOpacity
              style={[localStyles.pdfButton, { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }]}
              onPress={() => onOpenPdf(agreement.signed_pdf_path!)}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color="#16A34A" />
              <Text style={[localStyles.pdfButtonText, { color: '#16A34A' }]}>View Signed PDF</Text>
            </TouchableOpacity>
          ) : (
            <View style={[localStyles.pdfButton, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
              <Ionicons name="time-outline" size={16} color="#D97706" />
              <Text style={[localStyles.pdfButtonText, { color: '#D97706' }]}>Signed PDF processing...</Text>
            </View>
          )
        )}
      </View>

      {/* Error Display */}
      {agreement.last_error && (
        <View style={localStyles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
          <Text style={localStyles.errorText}>{agreement.last_error}</Text>
        </View>
      )}
    </View>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
  colors: ReturnType<typeof useThemeColors>['colors'];
}

function DetailRow({ label, value, colors }: DetailRowProps) {
  return (
    <View style={localStyles.detailRow}>
      <Text style={[localStyles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[localStyles.detailValue, { color: colors.textPrimary }]} selectable>{value}</Text>
    </View>
  );
}

const localStyles = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  countBadge: {
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
    marginLeft: 8,
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  dateText: {
    fontSize: 12,
  },
  detailGrid: {
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    paddingVertical: 3,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    width: 90,
  },
  detailValue: {
    fontSize: 13,
    flex: 1,
  },
  signerSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  signerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  signerHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  signerRefreshButton: {
    padding: 4,
  },
  signerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  signerName: {
    fontSize: 13,
    fontWeight: '600',
  },
  signerEmail: {
    fontSize: 11,
  },
  signerBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  signerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionRow: {
    marginTop: 10,
    gap: 8,
  },
  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 6,
  },
  pdfButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7C3AED',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    gap: 6,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
  },
  refreshAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 4,
  },
  refreshAllText: {
    fontSize: 12,
    color: '#7C3AED',
    fontWeight: '600',
  },
});

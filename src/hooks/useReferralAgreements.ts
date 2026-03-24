import { useState, useEffect, useCallback } from 'react';
import type { ReferralAgreement, SignerStatus, SignerStatusResponse } from '../lib/types/referralAgreement';

const API_BASE_URL = 'https://www.closewithmario.com';

interface UseReferralAgreementsOptions {
  leadId: string | undefined;
  leadSource: 'leads' | 'meta_ads' | 'quick_captures';
  enabled?: boolean;
}

interface UseReferralAgreementsResult {
  agreements: ReferralAgreement[];
  signerStatusMap: Record<string, SignerStatus[]>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshSignerStatus: (agreementId: string) => Promise<void>;
  loadingSignerStatus: Record<string, boolean>;
}

export function useReferralAgreements({
  leadId,
  leadSource,
  enabled = true,
}: UseReferralAgreementsOptions): UseReferralAgreementsResult {
  const [agreements, setAgreements] = useState<ReferralAgreement[]>([]);
  const [signerStatusMap, setSignerStatusMap] = useState<Record<string, SignerStatus[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingSignerStatus, setLoadingSignerStatus] = useState<Record<string, boolean>>({});

  const fetchSignerStatus = useCallback(async (agreementId: string): Promise<SignerStatus[] | null> => {
    try {
      const url = `${API_BASE_URL}/api/referral-agreement/signer-status?referralAgreementId=${agreementId}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const data: SignerStatusResponse = await response.json();
      if (data.success && data.signers) {
        return data.signers;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const fetchAgreements = useCallback(async () => {
    if (!leadId || !enabled) return;

    setLoading(true);
    setError(null);

    try {
      const url = `${API_BASE_URL}/api/referral-agreement/by-lead?leadId=${leadId}&leadSource=${leadSource}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch agreements (${response.status})`);
      }

      const data = await response.json();
      const fetchedAgreements: ReferralAgreement[] = data.agreements || [];
      setAgreements(fetchedAgreements);

      // Fetch signer status for each agreement that has an eversign hash
      const statusMap: Record<string, SignerStatus[]> = {};
      const signerPromises = fetchedAgreements
        .filter((a) => a.eversign_document_hash)
        .map(async (a) => {
          const signers = await fetchSignerStatus(a.id);
          if (signers) {
            statusMap[a.id] = signers;
          }
        });

      await Promise.all(signerPromises);
      setSignerStatusMap(statusMap);
    } catch (err: any) {
      console.error('Error fetching referral agreements:', err);
      setError(err.message || 'Failed to load agreements');
      setAgreements([]);
    } finally {
      setLoading(false);
    }
  }, [leadId, leadSource, enabled, fetchSignerStatus]);

  useEffect(() => {
    fetchAgreements();
  }, [fetchAgreements]);

  const refresh = useCallback(async () => {
    await fetchAgreements();
  }, [fetchAgreements]);

  const refreshSignerStatus = useCallback(async (agreementId: string) => {
    setLoadingSignerStatus((prev) => ({ ...prev, [agreementId]: true }));
    try {
      const signers = await fetchSignerStatus(agreementId);
      if (signers) {
        setSignerStatusMap((prev) => ({ ...prev, [agreementId]: signers }));
      }
    } finally {
      setLoadingSignerStatus((prev) => ({ ...prev, [agreementId]: false }));
    }
  }, [fetchSignerStatus]);

  return {
    agreements,
    signerStatusMap,
    loading,
    error,
    refresh,
    refreshSignerStatus,
    loadingSignerStatus,
  };
}

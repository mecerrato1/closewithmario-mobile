import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  type ImageSourcePropType,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  type ViewToken,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { MetaAdPreviewModal } from '../components/MetaAdPreviewModal';
import { supabase } from '../lib/supabase';
import { fetchMetaAdsLibrary, type MetaAdLibraryItem } from '../lib/supabase/metaAdsLibrary';
import type { UserRole } from '../lib/roles';
import { useThemeColors } from '../styles/theme';

type PlatformFilter = 'all' | 'facebook' | 'instagram' | 'other';

type Props = {
  session: Session | null;
  onBack: () => void;
  userRole: UserRole;
};

const PLUM = '#4C1D95';
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.closewithmario.com').replace(/\/$/, '');

type MetaAdPreviewThumbnailResponse = {
  creative?: {
    image_url?: string | null;
    thumbnail_url?: string | null;
  } | null;
};

const getPlatformLabel = (platform?: string | null) => {
  const normalized = platform?.trim().toLowerCase() || '';
  if (!normalized) return 'Meta';
  if (normalized.includes('fb') || normalized.includes('facebook')) return 'Facebook';
  if (normalized.includes('ig') || normalized.includes('instagram')) return 'Instagram';
  if (normalized.includes('messenger')) return 'Messenger';
  if (normalized.includes('whatsapp')) return 'WhatsApp';
  return platform?.trim() || 'Meta';
};

const getPlatformFilterKey = (platform?: string | null): Exclude<PlatformFilter, 'all'> => {
  const label = getPlatformLabel(platform).toLowerCase();
  if (label.includes('facebook')) return 'facebook';
  if (label.includes('instagram')) return 'instagram';
  return 'other';
};

const formatDate = (value?: string | null) => {
  if (!value) return 'No lead date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No lead date';

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const getBundledMetaAdImageAsset = (
  adNameRaw?: string | null,
  campaignNameRaw?: string | null
): ImageSourcePropType | null => {
  const adName = adNameRaw?.toLowerCase() || '';
  const normalizedAdName = adName.replace(/-{2,}/g, '-').trim();
  const campaignName = campaignNameRaw?.toLowerCase() || '';

  if (normalizedAdName.includes('florida renter video ad') && normalizedAdName.includes('veterans')) {
    return require('../../assets/FLRenterPoster.jpg');
  }
  if (normalizedAdName === 'florida renter video ad') {
    return require('../../assets/Fl_Renter_Ad.png');
  }
  if (normalizedAdName.includes('florida renter image')) {
    return require('../../assets/FLRenterPoster.jpg');
  }
  if (normalizedAdName.includes('florida renter')) {
    return require('../../assets/Fl_Renter_Ad.png');
  }
  if (adName.includes('hpa') || campaignName.includes('hpa')) {
    return require('../../assets/BrowardHPA_Ad.jpg');
  }
  if (adName.includes('condo') || campaignName.includes('condo')) {
    return require('../../assets/Condo_Ad.jpg');
  }
  if (adName.includes('green acres') || adName.includes('greenacres')) {
    return require('../../assets/Greenacres_ Ad.png');
  }

  return null;
};

const getStoredAdImageSource = (item: MetaAdLibraryItem): ImageSourcePropType | null => {
  if (item.savedImageUrl) {
    return { uri: item.savedImageUrl };
  }

  return null;
};

const hasCachedThumbnail = (cache: Record<string, string | null>, key: string) =>
  Object.prototype.hasOwnProperty.call(cache, key);

const getMetaGraphAdId = (adId?: string | null) => {
  const trimmed = adId?.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return trimmed;

  const prefixedMatch = trimmed.match(/^[a-z]+:(\d+)$/i);
  return prefixedMatch?.[1] ?? null;
};

export default function AdsLibraryScreen({ session, onBack, userRole }: Props) {
  const { colors, isDark } = useThemeColors();
  const [ads, setAds] = useState<MetaAdLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [selectedAd, setSelectedAd] = useState<MetaAdLibraryItem | null>(null);
  const [remoteThumbnails, setRemoteThumbnails] = useState<Record<string, string | null>>({});
  const [loadingThumbnails, setLoadingThumbnails] = useState<Record<string, boolean>>({});
  const thumbnailRequestsRef = useRef(new Set<string>());

  const loadAds = useCallback(
    async (refresh = false) => {
      if (userRole !== 'super_admin') {
        setLoading(false);
        setRefreshing(false);
        setErrorMessage('Ads Library is only available to super admins.');
        return;
      }

      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        setErrorMessage(null);
        const library = await fetchMetaAdsLibrary(userRole);
        setAds(library);
      } catch (error) {
        console.error('[AdsLibraryScreen] Failed to load ads library', error);
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load ads right now.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userRole]
  );

  const getAccessToken = useCallback(async () => {
    if (session?.access_token) return session.access_token;

    let {
      data: { session: currentSession },
    } = await supabase.auth.getSession();

    if (!currentSession?.access_token) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshed.session?.access_token) {
        throw new Error('Your session expired. Please sign in again.');
      }
      currentSession = refreshed.session;
    }

    return currentSession.access_token;
  }, [session?.access_token]);

  const fetchRemoteThumbnail = useCallback(
    async (item: MetaAdLibraryItem) => {
      const metaGraphAdId = getMetaGraphAdId(item.adId);
      if (!metaGraphAdId || getStoredAdImageSource(item) || hasCachedThumbnail(remoteThumbnails, item.key)) {
        return;
      }

      if (thumbnailRequestsRef.current.has(item.key)) {
        return;
      }

      thumbnailRequestsRef.current.add(item.key);
      setLoadingThumbnails((current) => ({ ...current, [item.key]: true }));

      try {
        const query = new URLSearchParams({ adId: metaGraphAdId });
        if (item.platform) query.set('platform', item.platform);

        const makeRequest = async (token: string) =>
          fetch(`${API_BASE_URL}/api/meta-ad-preview?${query.toString()}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

        let token = await getAccessToken();
        let response = await makeRequest(token);

        if (response.status === 401) {
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError || !refreshed.session?.access_token) {
            throw new Error('Your session expired. Please sign in again.');
          }

          token = refreshed.session.access_token;
          response = await makeRequest(token);
        }

        if (!response.ok) {
          throw new Error('Thumbnail unavailable');
        }

        const payload = (await response.json().catch(() => null)) as MetaAdPreviewThumbnailResponse | null;
        const thumbnailUrl = payload?.creative?.image_url || payload?.creative?.thumbnail_url || null;

        setRemoteThumbnails((current) => ({ ...current, [item.key]: thumbnailUrl }));
      } catch (error) {
        console.warn('[AdsLibraryScreen] Failed to load thumbnail', { adId: item.adId, error });
        setRemoteThumbnails((current) => ({ ...current, [item.key]: null }));
      } finally {
        thumbnailRequestsRef.current.delete(item.key);
        setLoadingThumbnails((current) => ({ ...current, [item.key]: false }));
      }
    },
    [getAccessToken, remoteThumbnails]
  );

  useEffect(() => {
    void loadAds();
  }, [loadAds]);

  const filteredAds = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return ads.filter((item) => {
      if (platformFilter !== 'all' && getPlatformFilterKey(item.platform) !== platformFilter) {
        return false;
      }

      if (!query) return true;

      return [
        item.adName,
        item.campaignName,
        item.adsetName,
        item.platform,
        item.adId,
        item.headline,
        item.body,
        item.description,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  }, [ads, platformFilter, searchQuery]);

  const totalLinkedLeads = useMemo(
    () => ads.reduce((sum, item) => sum + item.leadCount, 0),
    [ads]
  );

  const platformCounts = useMemo(() => {
    return ads.reduce(
      (counts, item) => {
        counts.all += 1;
        counts[getPlatformFilterKey(item.platform)] += 1;
        return counts;
      },
      { all: 0, facebook: 0, instagram: 0, other: 0 } as Record<PlatformFilter, number>
    );
  }, [ads]);

  useEffect(() => {
    filteredAds.slice(0, 4).forEach((item) => {
      void fetchRemoteThumbnail(item);
    });
  }, [fetchRemoteThumbnail, filteredAds]);

  const fetchRemoteThumbnailRef = useRef(fetchRemoteThumbnail);
  useEffect(() => {
    fetchRemoteThumbnailRef.current = fetchRemoteThumbnail;
  }, [fetchRemoteThumbnail]);

  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<MetaAdLibraryItem>[] }) => {
      viewableItems.forEach((viewableItem) => {
        if (viewableItem.item) {
          void fetchRemoteThumbnailRef.current(viewableItem.item);
        }
      });
    }
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 35 }).current;

  const renderAd = ({ item }: { item: MetaAdLibraryItem }) => {
    const remoteThumbnail = remoteThumbnails[item.key];
    const storedImageSource = getStoredAdImageSource(item);
    const bundledImageSource = getBundledMetaAdImageAsset(item.adName, item.campaignName);
    const imageSource =
      storedImageSource ||
      (typeof remoteThumbnail === 'string' ? { uri: remoteThumbnail } : null) ||
      bundledImageSource;
    const platformLabel = getPlatformLabel(item.platform);
    const hasCreativeCopy = Boolean(item.headline || item.body || item.description);
    const thumbnailLoading = Boolean(loadingThumbnails[item.key]);
    const displayAdId = getMetaGraphAdId(item.adId) || item.adId;

    return (
      <View style={[localStyles.adCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <View style={localStyles.adCardTop}>
          <View style={[localStyles.thumbnail, { backgroundColor: isDark ? '#111827' : '#F1F5F9' }]}>
            {imageSource ? (
              <Image source={imageSource} style={localStyles.thumbnailImage} resizeMode="cover" />
            ) : thumbnailLoading ? (
              <ActivityIndicator size="small" color={PLUM} />
            ) : (
              <Ionicons name="image-outline" size={28} color={isDark ? '#94A3B8' : '#64748B'} />
            )}
          </View>

          <View style={localStyles.adMain}>
            <Text numberOfLines={2} style={[localStyles.adTitle, { color: colors.textPrimary }]}>
              {item.adName || item.headline || 'Unnamed Meta ad'}
            </Text>
            <Text numberOfLines={1} style={[localStyles.adSubtitle, { color: colors.textSecondary }]}>
              {item.campaignName || 'Campaign unavailable'}
            </Text>
            {item.adsetName ? (
              <Text numberOfLines={1} style={[localStyles.adMetaLine, { color: colors.textSecondary }]}>
                Ad set: {item.adsetName}
              </Text>
            ) : null}
          </View>
        </View>

        {hasCreativeCopy ? (
          <View style={[localStyles.copyBlock, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
            <View style={localStyles.sectionLabelRow}>
              <Ionicons name="megaphone-outline" size={13} color={colors.textSecondary} />
              <Text style={[localStyles.sectionLabel, { color: colors.textSecondary }]}>Creative</Text>
            </View>
            {item.headline ? (
              <View style={localStyles.copyItem}>
                <Text style={[localStyles.copyKicker, { color: colors.textSecondary }]}>Headline</Text>
                <Text numberOfLines={1} style={[localStyles.copyHeadline, { color: colors.textPrimary }]}>
                  {item.headline}
                </Text>
              </View>
            ) : null}
            {item.body ? (
              <View style={localStyles.copyItem}>
                <Text style={[localStyles.copyKicker, { color: colors.textSecondary }]}>Primary Text</Text>
                <Text numberOfLines={2} style={[localStyles.copyBody, { color: colors.textSecondary }]}>
                  {item.body}
                </Text>
              </View>
            ) : null}
            {item.description ? (
              <View style={localStyles.copyItem}>
                <Text style={[localStyles.copyKicker, { color: colors.textSecondary }]}>Description</Text>
                <Text numberOfLines={2} style={[localStyles.copyBody, { color: colors.textSecondary }]}>
                  {item.description}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={localStyles.adFooter}>
          <View style={localStyles.footerMeta}>
            <View style={localStyles.badgeRow}>
              <View style={localStyles.platformBadge}>
                <Text style={localStyles.platformBadgeText}>{platformLabel}</Text>
              </View>
              <Text style={[localStyles.leadCount, { color: colors.textSecondary }]}>
                {item.leadCount} {item.leadCount === 1 ? 'lead' : 'leads'}
              </Text>
            </View>
            <Text numberOfLines={1} style={[localStyles.adDate, { color: colors.textSecondary }]}>
              Last lead {formatDate(item.lastSeenAt)}
            </Text>
            {displayAdId ? (
              <Text numberOfLines={1} style={[localStyles.adId, { color: colors.textSecondary }]}>
                Ad ID: {displayAdId}
              </Text>
            ) : null}
          </View>

          <TouchableOpacity style={localStyles.previewButton} onPress={() => setSelectedAd(item)}>
            <Ionicons name="eye-outline" size={16} color="#FFFFFF" />
            <Text style={localStyles.previewButtonText}>View Ad</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const selectedFallbackImage = selectedAd
    ? getStoredAdImageSource(selectedAd) || getBundledMetaAdImageAsset(selectedAd.adName, selectedAd.campaignName)
    : null;

  return (
    <View style={[localStyles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      <View style={localStyles.header}>
        <View style={localStyles.headerTop}>
          <TouchableOpacity onPress={onBack} style={localStyles.backButton}>
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
            <Text style={localStyles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <Text style={localStyles.headerTitle}>Ads Library</Text>
          <View style={localStyles.headerSpacer} />
        </View>

        <View style={localStyles.headerStats}>
          <View>
            <Text style={localStyles.statValue}>{ads.length}</Text>
            <Text style={localStyles.statLabel}>Ads</Text>
          </View>
          <View style={localStyles.statDivider} />
          <View>
            <Text style={localStyles.statValue}>{totalLinkedLeads}</Text>
            <Text style={localStyles.statLabel}>Linked Leads</Text>
          </View>
        </View>
      </View>

      {userRole !== 'super_admin' ? (
        <View style={localStyles.centerState}>
          <Ionicons name="lock-closed-outline" size={30} color={colors.textSecondary} />
          <Text style={[localStyles.centerTitle, { color: colors.textPrimary }]}>Super admin only</Text>
          <Text style={[localStyles.centerText, { color: colors.textSecondary }]}>
            This page is restricted to super admins.
          </Text>
        </View>
      ) : (
        <>
          <View style={localStyles.utilityPanel}>
            <View style={[localStyles.searchBox, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search ads, campaigns, ad IDs"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                style={[localStyles.searchInput, { color: colors.textPrimary }]}
              />
              {searchQuery.length > 0 ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={localStyles.clearButton}>
                  <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={localStyles.filterRow}>
              {[
                { key: 'all' as const, label: 'All' },
                { key: 'facebook' as const, label: 'Facebook' },
                { key: 'instagram' as const, label: 'Instagram' },
                { key: 'other' as const, label: 'Other' },
              ].map((filter) => {
                const active = platformFilter === filter.key;
                return (
                  <TouchableOpacity
                    key={filter.key}
                    style={[
                      localStyles.filterChip,
                      {
                        backgroundColor: active ? PLUM : colors.cardBackground,
                        borderColor: active ? PLUM : colors.border,
                      },
                    ]}
                    onPress={() => setPlatformFilter(filter.key)}
                  >
                    <Text style={[localStyles.filterChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                      {filter.label} ({platformCounts[filter.key]})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {loading ? (
            <View style={localStyles.centerState}>
              <ActivityIndicator size="large" color={PLUM} />
              <Text style={[localStyles.centerText, { color: colors.textSecondary }]}>Loading ads...</Text>
            </View>
          ) : errorMessage ? (
            <View style={localStyles.centerState}>
              <Ionicons name="alert-circle-outline" size={30} color="#EF4444" />
              <Text style={[localStyles.centerTitle, { color: colors.textPrimary }]}>Unable to load ads</Text>
              <Text style={[localStyles.centerText, { color: colors.textSecondary }]}>{errorMessage}</Text>
              <TouchableOpacity style={localStyles.retryButton} onPress={() => loadAds()}>
                <Text style={localStyles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filteredAds}
              keyExtractor={(item) => item.key}
              renderItem={renderAd}
              onViewableItemsChanged={handleViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              contentContainerStyle={[
                localStyles.listContent,
                filteredAds.length === 0 && localStyles.emptyListContent,
              ]}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => loadAds(true)} tintColor={PLUM} />
              }
              ListEmptyComponent={
                <View style={localStyles.centerState}>
                  <Ionicons name="images-outline" size={30} color={colors.textSecondary} />
                  <Text style={[localStyles.centerTitle, { color: colors.textPrimary }]}>No ads found</Text>
                  <Text style={[localStyles.centerText, { color: colors.textSecondary }]}>
                    Try clearing search or filter options.
                  </Text>
                </View>
              }
            />
          )}
        </>
      )}

      <MetaAdPreviewModal
        visible={Boolean(selectedAd)}
        onClose={() => setSelectedAd(null)}
        accessToken={session?.access_token}
        adId={selectedAd?.adId ?? null}
        platform={selectedAd?.platform ?? null}
        adName={selectedAd?.adName ?? null}
        campaignName={selectedAd?.campaignName ?? null}
        fallbackImage={selectedFallbackImage}
        fallbackHeadline={selectedAd?.headline ?? null}
        fallbackBody={selectedAd?.body || selectedAd?.description || null}
      />
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    backgroundColor: PLUM,
    paddingTop: 54,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    minWidth: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  headerSpacer: {
    minWidth: 74,
  },
  headerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
  },
  statLabel: {
    color: '#DDD6FE',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statDivider: {
    width: 1,
    height: 34,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    marginHorizontal: 18,
  },
  utilityPanel: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  searchBox: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  clearButton: {
    padding: 4,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  adCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  adCardTop: {
    flexDirection: 'row',
    gap: 12,
  },
  thumbnail: {
    width: 76,
    height: 76,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  adMain: {
    flex: 1,
    minWidth: 0,
  },
  adTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
  },
  adSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
    fontWeight: '600',
  },
  adMetaLine: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  copyBlock: {
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sectionLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  copyItem: {
    marginTop: 8,
  },
  copyKicker: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  copyHeadline: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  copyBody: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  adFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
  },
  footerMeta: {
    flex: 1,
    minWidth: 0,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  platformBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
  },
  platformBadgeText: {
    color: PLUM,
    fontSize: 11,
    fontWeight: '800',
  },
  leadCount: {
    fontSize: 12,
    fontWeight: '700',
  },
  adDate: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
  adId: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 1,
  },
  previewButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PLUM,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  previewButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  centerTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 12,
    textAlign: 'center',
  },
  centerText: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: PLUM,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Audio, InterruptionModeIOS, ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import { WebView } from 'react-native-webview';
import { supabase } from '../lib/supabase';
import { useThemeColors } from '../styles/theme';

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.closewithmario.com').replace(/\/$/, '');

type MetaAdPreviewResponse = {
  ad: {
    id: string | null;
    name: string | null;
    effective_status: string | null;
    platform: string | null;
    campaign: {
      id: string | null;
      name: string | null;
    };
    adset: {
      id: string | null;
      name: string | null;
    };
  };
  creative: {
    id: string | null;
    name: string | null;
    body: string | null;
    headline: string | null;
    description: string | null;
    image_url: string | null;
    thumbnail_url: string | null;
    link_url: string | null;
    call_to_action_type: string | null;
    video_id: string | null;
    video_story_id?: string | null;
    lead_gen_form_id: string | null;
    video_source?: string | null;
    video_permalink_url?: string | null;
    video_embeddable?: boolean | null;
  };
  preview: {
    format: string;
    iframe_src: string;
    width: number | null;
    height: number | null;
  } | null;
  preview_error: string | null;
};

type ViewMode = 'video' | 'preview' | 'details' | 'fallback';

type Props = {
  visible: boolean;
  onClose: () => void;
  accessToken?: string | null;
  adId?: string | null;
  platform?: string | null;
  adName?: string | null;
  campaignName?: string | null;
  fallbackImage?: ImageSourcePropType | null;
};

function getPlatformLabel(platform?: string | null) {
  if (!platform) return 'Meta';
  const normalized = platform.toLowerCase();
  if (normalized.includes('fb') || normalized.includes('facebook')) return 'Facebook';
  if (normalized.includes('ig') || normalized.includes('instagram')) return 'Instagram';
  if (normalized.includes('messenger')) return 'Messenger';
  if (normalized.includes('whatsapp')) return 'WhatsApp';
  return platform;
}

function normalizeMetaUrl(url?: string | null) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/reel/') || url.startsWith('/p/')) {
    return `https://www.instagram.com${url}`;
  }
  if (url.startsWith('/')) {
    return `https://www.facebook.com${url}`;
  }
  return url;
}

function formatCtaLabel(value?: string | null) {
  if (!value) return null;
  return value.replace(/_/g, ' ');
}

export function MetaAdPreviewModal({
  visible,
  onClose,
  accessToken,
  adId,
  platform,
  adName,
  campaignName,
  fallbackImage,
}: Props) {
  const { colors, isDark } = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  const [data, setData] = useState<MetaAdPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('details');
  const [showVideoPlayOverlay, setShowVideoPlayOverlay] = useState(true);
  const [creativeAspectRatio, setCreativeAspectRatio] = useState(9 / 16);
  const videoRef = useRef<Video | null>(null);

  const playableVideoAvailable = Boolean(data?.creative.video_source);
  const previewAvailable = Boolean(data?.preview?.iframe_src);
  const detailsAvailable = Boolean(data);
  const fallbackAvailable = Boolean(fallbackImage);
  const metaVideoUrl = normalizeMetaUrl(data?.creative.video_permalink_url);

  const tabs = useMemo(
    () =>
      [
        playableVideoAvailable ? { key: 'video' as const, label: 'Playable Video' } : null,
        previewAvailable ? { key: 'preview' as const, label: 'Live Preview' } : null,
        detailsAvailable ? { key: 'details' as const, label: 'Creative' } : null,
        fallbackAvailable ? { key: 'fallback' as const, label: 'Saved Image' } : null,
      ].filter((item): item is { key: ViewMode; label: string } => Boolean(item)),
    [detailsAvailable, fallbackAvailable, playableVideoAvailable, previewAvailable]
  );

  useEffect(() => {
    if (!visible || !playableVideoAvailable) return;

    void Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch(() => undefined);
  }, [playableVideoAvailable, visible]);

  useEffect(() => {
    if (!visible || viewMode !== 'video') return;
    setShowVideoPlayOverlay(true);
  }, [viewMode, visible, adId]);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    const remoteUri = data?.creative.image_url || data?.creative.thumbnail_url || null;

    if (remoteUri) {
      Image.getSize(
        remoteUri,
        (width, height) => {
          if (cancelled || width <= 0 || height <= 0) return;
          setCreativeAspectRatio(width / height);
        },
        () => {
          if (!cancelled) setCreativeAspectRatio(9 / 16);
        }
      );

      return () => {
        cancelled = true;
      };
    }

    const resolvedFallback = fallbackImage ? Image.resolveAssetSource(fallbackImage) : null;
    if (resolvedFallback?.width && resolvedFallback?.height) {
      setCreativeAspectRatio(resolvedFallback.width / resolvedFallback.height);
    } else {
      setCreativeAspectRatio(9 / 16);
    }

    return () => {
      cancelled = true;
    };
  }, [data?.creative.image_url, data?.creative.thumbnail_url, fallbackImage, visible]);

  useEffect(() => {
    if (!visible) return;

    const defaultView: ViewMode = playableVideoAvailable
      ? 'video'
      : previewAvailable
        ? 'preview'
        : detailsAvailable
          ? 'details'
          : fallbackAvailable
            ? 'fallback'
            : 'details';

    if (!tabs.some((tab) => tab.key === viewMode)) {
      setViewMode(defaultView);
    }
  }, [detailsAvailable, fallbackAvailable, playableVideoAvailable, previewAvailable, tabs, viewMode, visible]);

  useEffect(() => {
    if (!visible) return;
    if (!adId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadPreview = async () => {
      setLoading(true);
      setError(null);
      setData(null);

      try {
        const query = new URLSearchParams({ adId });
        if (platform) query.set('platform', platform);

        const getAccessToken = async () => {
          if (accessToken) return accessToken;

          let {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session?.access_token) {
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError || !refreshed.session?.access_token) {
              throw new Error('Your session expired. Please sign in again.');
            }
            session = refreshed.session;
          }

          return session.access_token;
        };

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

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load Meta ad preview');
        }

        if (cancelled) return;

        const previewData = payload as MetaAdPreviewResponse;
        setData(previewData);
        if (previewData.creative.video_source) {
          setViewMode('video');
        } else if (previewData.preview?.iframe_src) {
          setViewMode('preview');
        } else if (fallbackAvailable) {
          setViewMode('fallback');
        } else {
          setViewMode('details');
        }
      } catch (fetchError) {
        if (cancelled) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load Meta ad preview');
        setData(null);
        if (fallbackAvailable) {
          setViewMode('fallback');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [accessToken, adId, fallbackAvailable, platform, visible]);

  const warningMessage =
    !adId && fallbackAvailable
      ? 'This lead does not have a stored Meta ad ID, so the saved screenshot is shown instead.'
      : error && fallbackAvailable
        ? `Live Meta preview is unavailable right now. Showing the saved screenshot instead. ${error}`
        : error || data?.preview_error || null;
  const creativeImageHeight = Math.min(520, Math.max(220, (windowWidth - 60) / Math.max(creativeAspectRatio, 0.1)));

  const handlePlayVideo = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      await videoRef.current?.playAsync();
      setShowVideoPlayOverlay(false);
    } catch (playError) {
      console.warn('[MetaAdPreviewModal] Failed to start video playback', playError);
    }
  };

  const handleVideoStatusChange = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setShowVideoPlayOverlay(!status.isPlaying);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.card, { backgroundColor: colors.cardBackground }]}>
          <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
            <View style={modalStyles.headerText}>
              <Text style={[modalStyles.title, { color: colors.textPrimary }]}>
                {adName || data?.ad.name || 'Meta Ad Preview'}
              </Text>
              <Text style={[modalStyles.subtitle, { color: colors.textSecondary }]}>
                {campaignName || data?.ad.campaign.name || 'Campaign unavailable'}
                {platform ? ` • ${getPlatformLabel(platform)}` : ''}
              </Text>
              {adId ? (
                <Text style={[modalStyles.adId, { color: colors.textSecondary }]}>Ad ID: {adId}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[modalStyles.closeButton, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }]}
            >
              <Text style={[modalStyles.closeButtonText, { color: colors.textPrimary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {tabs.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={modalStyles.tabRow}
              style={[modalStyles.tabScroll, { borderBottomColor: colors.border }]}
            >
              {tabs.map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    modalStyles.tab,
                    viewMode === tab.key
                      ? { backgroundColor: PLUM }
                      : { backgroundColor: isDark ? '#1E293B' : '#F3F4F6' },
                  ]}
                  onPress={() => setViewMode(tab.key)}
                >
                  <Text
                    style={[
                      modalStyles.tabText,
                      { color: viewMode === tab.key ? '#FFFFFF' : colors.textSecondary },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}

          <ScrollView
            style={modalStyles.content}
            contentContainerStyle={modalStyles.contentInner}
            showsVerticalScrollIndicator={false}
          >
            {warningMessage ? (
              <View style={modalStyles.warningBox}>
                <Text style={modalStyles.warningText}>{warningMessage}</Text>
              </View>
            ) : null}

            {loading ? (
              <View style={modalStyles.loadingWrap}>
                <ActivityIndicator size="large" color={PLUM} />
                <Text style={[modalStyles.loadingText, { color: colors.textSecondary }]}>
                  Loading Meta ad preview...
                </Text>
              </View>
            ) : viewMode === 'video' && playableVideoAvailable ? (
              <View style={modalStyles.section}>
                <Text style={[modalStyles.sectionHint, { color: colors.textSecondary }]}>
                  Native video playback with audio controls. Tap the play button to start.
                </Text>
                <View style={modalStyles.videoFrame}>
                  <TouchableOpacity
                    activeOpacity={0.92}
                    onPress={handlePlayVideo}
                    style={modalStyles.videoTouchable}
                  >
                  <Video
                    ref={(node) => {
                      videoRef.current = node;
                    }}
                    source={{ uri: data?.creative.video_source || '' }}
                    style={modalStyles.video}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay={false}
                    isLooping={false}
                    onPlaybackStatusUpdate={handleVideoStatusChange}
                    posterSource={
                      data?.creative.thumbnail_url
                        ? { uri: data.creative.thumbnail_url }
                        : data?.creative.image_url
                          ? { uri: data.creative.image_url }
                          : undefined
                    }
                    usePoster={Boolean(data?.creative.thumbnail_url || data?.creative.image_url)}
                  />
                    {showVideoPlayOverlay ? (
                      <View style={modalStyles.videoOverlay}>
                        <View style={modalStyles.videoPlayButton}>
                          <Text style={modalStyles.videoPlayIcon}>▶</Text>
                        </View>
                        <Text style={modalStyles.videoOverlayText}>Tap to play with sound</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                </View>
                {metaVideoUrl ? (
                  <TouchableOpacity onPress={() => Linking.openURL(metaVideoUrl)} style={modalStyles.linkButton}>
                    <Text style={modalStyles.linkButtonText}>Open on Meta</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : viewMode === 'preview' && previewAvailable ? (
              <View style={modalStyles.section}>
                <Text style={[modalStyles.sectionHint, { color: colors.textSecondary }]}>
                  Exact Meta-hosted preview. Audio may still be muted here.
                </Text>
                <View style={modalStyles.webViewWrap}>
                  <WebView
                    source={{ uri: data?.preview?.iframe_src || '' }}
                    style={modalStyles.webView}
                    mediaPlaybackRequiresUserAction={false}
                    allowsInlineMediaPlayback
                    javaScriptEnabled
                    domStorageEnabled
                  />
                </View>
              </View>
            ) : viewMode === 'fallback' && fallbackImage ? (
              <View style={modalStyles.section}>
                <Image source={fallbackImage} style={modalStyles.fallbackImage} resizeMode="contain" />
              </View>
            ) : data ? (
              <View style={modalStyles.section}>
                {(data.creative.image_url || data.creative.thumbnail_url) ? (
                  <Image
                    source={{ uri: data.creative.image_url || data.creative.thumbnail_url || undefined }}
                    style={[modalStyles.remoteImage, { height: creativeImageHeight }]}
                    resizeMode="contain"
                  />
                ) : fallbackImage ? (
                  <Image source={fallbackImage} style={[modalStyles.remoteImage, { height: creativeImageHeight }]} resizeMode="contain" />
                ) : null}

                <View style={[modalStyles.detailCard, { backgroundColor: isDark ? '#111827' : '#F8FAFC' }]}>
                  <Text style={[modalStyles.detailLabel, { color: colors.textSecondary }]}>Meta Details</Text>
                  <Text style={[modalStyles.detailValue, { color: colors.textPrimary }]}>
                    Campaign: {data.ad.campaign.name || 'Unknown'}
                  </Text>
                  <Text style={[modalStyles.detailValue, { color: colors.textPrimary }]}>
                    Ad Set: {data.ad.adset.name || 'Unknown'}
                  </Text>
                  <Text style={[modalStyles.detailValue, { color: colors.textPrimary }]}>
                    Status: {data.ad.effective_status || 'Unknown'}
                  </Text>
                  <Text style={[modalStyles.detailValue, { color: colors.textPrimary }]}>
                    Placement: {getPlatformLabel(platform || data.ad.platform)}
                  </Text>
                  {data.creative.call_to_action_type ? (
                    <Text style={[modalStyles.detailValue, { color: colors.textPrimary }]}>
                      CTA: {formatCtaLabel(data.creative.call_to_action_type)}
                    </Text>
                  ) : null}
                </View>

                {data.creative.headline ? (
                  <View style={modalStyles.textBlock}>
                    <Text style={[modalStyles.blockLabel, { color: colors.textSecondary }]}>Headline</Text>
                    <Text style={[modalStyles.blockValue, { color: colors.textPrimary }]}>{data.creative.headline}</Text>
                  </View>
                ) : null}

                {data.creative.body ? (
                  <View style={modalStyles.textBlock}>
                    <Text style={[modalStyles.blockLabel, { color: colors.textSecondary }]}>Primary Text</Text>
                    <Text style={[modalStyles.blockBody, { color: colors.textPrimary }]}>{data.creative.body}</Text>
                  </View>
                ) : null}

                {data.creative.description ? (
                  <View style={modalStyles.textBlock}>
                    <Text style={[modalStyles.blockLabel, { color: colors.textSecondary }]}>Description</Text>
                    <Text style={[modalStyles.blockBody, { color: colors.textPrimary }]}>{data.creative.description}</Text>
                  </View>
                ) : null}

                {data.creative.link_url ? (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(data.creative.link_url!)}
                    style={modalStyles.linkButton}
                  >
                    <Text style={modalStyles.linkButtonText}>Open Destination Link</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : fallbackImage ? (
              <View style={modalStyles.section}>
                <Image source={fallbackImage} style={modalStyles.fallbackImage} resizeMode="contain" />
              </View>
            ) : (
              <View style={modalStyles.emptyState}>
                <Text style={[modalStyles.emptyText, { color: colors.textSecondary }]}>
                  No preview is available for this ad yet.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const PLUM = '#4C1D95';

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.88)',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 26,
  },
  card: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerText: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  adId: {
    fontSize: 11,
    marginTop: 6,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  tabScroll: {
    borderBottomWidth: 1,
    flexGrow: 0,
    maxHeight: 64,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
    gap: 14,
  },
  warningBox: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  warningText: {
    color: '#92400E',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  loadingWrap: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    gap: 14,
  },
  sectionHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  videoFrame: {
    backgroundColor: '#000000',
    borderRadius: 18,
    overflow: 'hidden',
    aspectRatio: 9 / 16,
  },
  videoTouchable: {
    flex: 1,
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.18)',
    gap: 10,
  },
  videoPlayButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  videoPlayIcon: {
    fontSize: 32,
    color: PLUM,
    marginLeft: 4,
    fontWeight: '700',
  },
  videoOverlayText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  webViewWrap: {
    height: 620,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  webView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  fallbackImage: {
    width: '100%',
    height: 620,
  },
  remoteImage: {
    width: '100%',
    height: 220,
    borderRadius: 18,
  },
  detailCard: {
    borderRadius: 18,
    padding: 14,
    gap: 8,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detailValue: {
    fontSize: 14,
    lineHeight: 20,
  },
  textBlock: {
    gap: 6,
  },
  blockLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  blockValue: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  blockBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  linkButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  linkButtonText: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});

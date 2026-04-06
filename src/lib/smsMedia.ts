export interface SmsMediaPayload {
  url?: string | null;
  content_type?: string | null;
  size?: number | null;
}

export interface SmsRawPayload {
  payload?: {
    media?: SmsMediaPayload[] | null;
  } | null;
}

export interface SmsMediaAttachment {
  id: string;
  url: string;
  contentType: string | null;
  size: number | null;
  kind: 'audio' | 'image' | 'video' | 'other';
}

export interface SmsVoiceSummary {
  one_sentence_summary?: string | null;
  caller_intent?: string | null;
  urgency?: string | null;
  requested_callback_time?: string | null;
  mentions_docs?: boolean | null;
  mentions_property?: boolean | null;
  confidence?: number | null;
  media_content_type?: string | null;
  transcription_model?: string | null;
  extraction_model?: string | null;
}

interface SmsMessageLike {
  id?: string;
  message_text?: string | null;
  raw_payload?: SmsRawPayload | string | null;
  voice_transcription_status?: string | null;
  voice_transcript?: string | null;
  voice_summary?: SmsVoiceSummary | string | null;
  voice_transcribed_at?: string | null;
  voice_transcription_error?: string | null;
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'heif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', '3gp', '3gpp']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'aac', 'm4a', 'ogg', 'amr', 'caf']);

export function parseSmsRawPayload(rawPayload: SmsMessageLike['raw_payload']) {
  if (!rawPayload) return null;

  if (typeof rawPayload === 'string') {
    try {
      const parsed = JSON.parse(rawPayload);
      return parsed && typeof parsed === 'object' ? (parsed as SmsRawPayload) : null;
    } catch {
      return null;
    }
  }

  return typeof rawPayload === 'object' ? rawPayload : null;
}

function getFileExtension(url: string) {
  const cleanUrl = url.split('?')[0] ?? url;
  const parts = cleanUrl.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export function getSmsMediaKind(contentType: string | null, url: string): SmsMediaAttachment['kind'] {
  const normalizedType = contentType?.toLowerCase() ?? '';
  if (normalizedType.startsWith('image/')) return 'image';
  if (normalizedType.startsWith('video/')) return 'video';
  if (normalizedType.startsWith('audio/')) return 'audio';

  const extension = getFileExtension(url);
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  return 'other';
}

export function getSmsMessageMedia(message: SmsMessageLike): SmsMediaAttachment[] {
  const parsedPayload = parseSmsRawPayload(message.raw_payload);
  const rawMedia: SmsMediaPayload[] = Array.isArray(parsedPayload?.payload?.media)
    ? (parsedPayload.payload.media as SmsMediaPayload[])
    : [];
  const idPrefix = message.id ?? 'sms-message';

  return rawMedia
    .map((entry: SmsMediaPayload, index: number) => {
      const url = typeof entry?.url === 'string' ? entry.url.trim() : '';
      if (!url) return null;

      const contentType = typeof entry?.content_type === 'string' ? entry.content_type : null;

      return {
        id: `${idPrefix}-media-${index}`,
        url,
        contentType,
        size: typeof entry?.size === 'number' ? entry.size : null,
        kind: getSmsMediaKind(contentType, url),
      } satisfies SmsMediaAttachment;
    })
    .filter((attachment: SmsMediaAttachment | null): attachment is SmsMediaAttachment => !!attachment);
}

export function getSmsMediaFallbackLabel(attachments: SmsMediaAttachment[]) {
  if (attachments.length !== 1) return 'Media attachment';

  switch (attachments[0].kind) {
    case 'audio':
      return 'Voice message';
    case 'image':
      return 'Photo';
    case 'video':
      return 'Video';
    default:
      return 'Media attachment';
  }
}

export function parseSmsVoiceSummary(
  voiceSummary: SmsMessageLike['voice_summary']
): SmsVoiceSummary | null {
  if (!voiceSummary) return null;

  if (typeof voiceSummary === 'string') {
    try {
      const parsed = JSON.parse(voiceSummary);
      return parsed && typeof parsed === 'object' ? (parsed as SmsVoiceSummary) : null;
    } catch {
      return null;
    }
  }

  return typeof voiceSummary === 'object' ? voiceSummary : null;
}

export function getSmsVoiceTranscriptionStatus(message: SmsMessageLike) {
  return message.voice_transcription_status?.trim().toLowerCase() || null;
}

export function getSmsVoiceTranscript(message: SmsMessageLike) {
  return message.voice_transcript?.trim() || '';
}

export function hasSmsAudioAttachment(message: SmsMessageLike) {
  return getSmsMessageMedia(message).some((attachment) => attachment.kind === 'audio');
}

export function getSmsMessagePreviewText(message: SmsMessageLike) {
  const messageText = message.message_text?.trim() || '';
  if (messageText) return messageText;

  const hasAudio = hasSmsAudioAttachment(message);
  const voiceStatus = getSmsVoiceTranscriptionStatus(message);
  const voiceSummary = parseSmsVoiceSummary(message.voice_summary);
  const voiceTranscript = getSmsVoiceTranscript(message);

  if (hasAudio) {
    if ((voiceStatus === 'pending' || voiceStatus === 'processing')) {
      return 'Transcribing voice message...';
    }

    if (voiceStatus === 'completed') {
      if (voiceSummary?.one_sentence_summary?.trim()) {
        return voiceSummary.one_sentence_summary.trim();
      }

      if (voiceTranscript) {
        return voiceTranscript;
      }
    }
  }

  const attachments = getSmsMessageMedia(message);
  return attachments.length > 0 ? getSmsMediaFallbackLabel(attachments) : '';
}

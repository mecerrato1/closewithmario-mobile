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

interface SmsMessageLike {
  id?: string;
  message_text?: string | null;
  raw_payload?: SmsRawPayload | string | null;
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

export function getSmsMessagePreviewText(message: SmsMessageLike) {
  const messageText = message.message_text?.trim() || '';
  if (messageText) return messageText;

  const attachments = getSmsMessageMedia(message);
  return attachments.length > 0 ? getSmsMediaFallbackLabel(attachments) : '';
}

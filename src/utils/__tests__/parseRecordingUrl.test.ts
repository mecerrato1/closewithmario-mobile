import { parseRecordingUrl } from '../parseRecordingUrl';

describe('parseRecordingUrl', () => {
  it('should extract recording URL from notes with emoji', () => {
    const notes = `📞 Call Completed
Call ID: abc123
Duration: 5m 30s

Summary:
Great conversation

🎧 Recording: https://api.vapi.ai/recording/test123.wav

📄 Transcript URL: https://example.com/transcript`;

    const result = parseRecordingUrl(notes);
    expect(result).toBe('https://api.vapi.ai/recording/test123.wav');
  });

  it('should handle notes without recording URL', () => {
    const notes = `📞 Call Completed
Call ID: abc123
Duration: 5m 30s`;

    const result = parseRecordingUrl(notes);
    expect(result).toBeNull();
  });

  it('should handle null or undefined notes', () => {
    expect(parseRecordingUrl(null)).toBeNull();
    expect(parseRecordingUrl(undefined)).toBeNull();
    expect(parseRecordingUrl('')).toBeNull();
  });

  it('should extract HTTPS URLs', () => {
    const notes = '🎧 Recording: https://storage.googleapis.com/recording.wav';
    const result = parseRecordingUrl(notes);
    expect(result).toBe('https://storage.googleapis.com/recording.wav');
  });

  it('should extract HTTP URLs', () => {
    const notes = '🎧 Recording: http://example.com/audio.wav';
    const result = parseRecordingUrl(notes);
    expect(result).toBe('http://example.com/audio.wav');
  });

  it('should handle URLs with query parameters', () => {
    const notes = '🎧 Recording: https://api.example.com/recording.wav?token=abc123&expires=456';
    const result = parseRecordingUrl(notes);
    expect(result).toBe('https://api.example.com/recording.wav?token=abc123&expires=456');
  });

  it('should be case insensitive for the recording label', () => {
    const notes = '🎧 recording: https://example.com/test.wav';
    const result = parseRecordingUrl(notes);
    expect(result).toBe('https://example.com/test.wav');
  });
});

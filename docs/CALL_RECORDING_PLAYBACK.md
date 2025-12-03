# Call Recording Playback Implementation

## Overview
This document describes how the iOS app plays call recordings from the voice agent (Vapi). The recordings are stored as URLs in the `meta_ad_activities` table's `notes` field.

## How It Works

### 1. Recording Storage (Backend)
The recording URL is stored in the `meta_ad_activities` table via the `/api/receive-call-results` endpoint:

```typescript
// From receive-call-results.ts
const recording_url = body.recording_url 
  || body.message?.recordingUrl 
  || body.message?.recording?.stereoUrl 
  || body.message?.recording?.mono?.combinedUrl 
  || '';

// Stored in notes field
const activityNotes = [
  // ... other fields
  recording_url ? `\n\n🎧 Recording: ${recording_url}` : '',
  // ...
].filter(Boolean).join('\n');
```

### 2. URL Parsing (iOS)
A utility function extracts the recording URL from the notes text:

**File:** `src/utils/parseRecordingUrl.ts`

```typescript
export function parseRecordingUrl(notes: string | null | undefined): string | null {
  if (!notes) return null;
  
  const recordingPattern = /🎧 Recording:\s*(https?:\/\/[^\s\n]+)/i;
  const match = notes.match(recordingPattern);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  
  return null;
}
```

### 3. Playback UI (iOS)
The `LeadDetailScreen` component displays a play button for call activities with recordings:

**File:** `src/screens/LeadDetailScreen.tsx`

```tsx
{/* Call recording playback button (parsed from notes) */}
{!activity.audio_url && activity.activity_type === 'call' && (() => {
  const recordingUrl = parseRecordingUrl(activity.notes);
  if (!recordingUrl) return null;
  return (
    <TouchableOpacity
      style={[
        styles.voiceNoteButton,
        playingActivityId === activity.id && styles.voiceNoteButtonActive,
      ]}
      onPress={() => handlePlayVoiceNote(activity, recordingUrl)}
    >
      <Text style={styles.voiceNoteButtonText}>
        {playingActivityId === activity.id ? '▶ Playing…' : '🎧 Play call recording'}
      </Text>
    </TouchableOpacity>
  );
})()}
```

### 4. Audio Playback
The `handlePlayVoiceNote` function uses Expo AV to play the audio:

```typescript
const handlePlayVoiceNote = async (activity: Activity, recordingUrl?: string) => {
  const audioUrl = recordingUrl || activity.audio_url;
  if (!audioUrl) return;

  // Stop current playback if playing
  if (playingActivityId === activity.id && currentSound) {
    await currentSound.stopAsync();
    await currentSound.unloadAsync();
    setCurrentSound(null);
    setPlayingActivityId(null);
    return;
  }

  // Create and play new sound
  const { sound } = await Audio.Sound.createAsync({ uri: audioUrl });
  setCurrentSound(sound);
  setPlayingActivityId(activity.id);
  await sound.playAsync();
};
```

## Database Schema

### meta_ad_activities Table
- `id`: UUID (primary key)
- `meta_ad_id`: UUID (foreign key to meta_ads)
- `activity_type`: TEXT ('call', 'text', 'email', 'note')
- `notes`: TEXT (contains the recording URL in format: "🎧 Recording: [URL]")
- `audio_url`: TEXT (optional, used for voice notes, not call recordings)
- `created_at`: TIMESTAMP
- `created_by`: UUID (optional)
- `user_email`: TEXT (optional)

## User Experience

1. **Call Activity**: When a voice agent call completes, the webhook creates an activity with type='call'
2. **Recording URL**: The recording URL is embedded in the notes field
3. **Play Button**: If a recording URL is found, a "🎧 Play call recording" button appears
4. **Playback**: Tapping the button streams and plays the WAV file
5. **Stop**: Tapping again stops playback

## Future Improvements

Consider adding a dedicated `recording_url` column to the `meta_ad_activities` table for:
- Easier querying
- Better performance (no text parsing needed)
- Type safety
- Indexing capabilities

### Migration Example
```sql
ALTER TABLE meta_ad_activities 
ADD COLUMN recording_url TEXT;

-- Optionally migrate existing data
UPDATE meta_ad_activities
SET recording_url = (
  SELECT substring(notes FROM '🎧 Recording:\s*(https?://[^\s\n]+)')
)
WHERE activity_type = 'call' 
  AND notes LIKE '%🎧 Recording:%';
```

## Testing

Unit tests are available in `src/utils/__tests__/parseRecordingUrl.test.ts` to verify URL parsing works correctly with various formats.

## Dependencies

- `expo-av`: Audio playback
- React Native: UI components
- Supabase: Database queries

## Files Modified

1. `src/utils/parseRecordingUrl.ts` - New utility function
2. `src/screens/LeadDetailScreen.tsx` - Added playback UI and logic
3. `src/utils/__tests__/parseRecordingUrl.test.ts` - Unit tests
4. `docs/CALL_RECORDING_PLAYBACK.md` - This documentation

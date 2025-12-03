/**
 * Extracts the recording URL from activity notes
 * The recording URL is stored in the format: "🎧 Recording: https://..."
 * 
 * @param notes - The activity notes string
 * @returns The recording URL if found, null otherwise
 */
export function parseRecordingUrl(notes: string | null | undefined): string | null {
  if (!notes) return null;
  
  // Look for the pattern "🎧 Recording: [URL]"
  const recordingPattern = /🎧 Recording:\s*(https?:\/\/[^\s\n]+)/i;
  const match = notes.match(recordingPattern);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  
  return null;
}

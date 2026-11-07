/** Editable transcript of an audio artifact. Off unless the value is exactly `true`. */

export type VoiceNotesConfig = { enabled: boolean };

export function readVoiceNotesConfig(source: NodeJS.ProcessEnv = process.env): VoiceNotesConfig {
  return { enabled: source.ALMA_VOICE_NOTES === "true" };
}

export type RecordingState = "idle" | "recording" | "transcribing";

export function recordingLabel(state: RecordingState): "Recording" | "Transcribing" | null {
  if (state === "recording") return "Recording";
  if (state === "transcribing") return "Transcribing";
  return null;
}

/** Title is the first line, at most 80 characters. Overflow stays on that line and is cut. */
export function splitTranscript(text: string): { title: string; body: string } {
  const lines = text.split(/\r?\n/);
  const first = lines.findIndex((line) => line.trim().length > 0);
  if (first < 0) return { title: "", body: "" };
  const title = lines[first]!.trim().slice(0, 80);
  const body = lines
    .slice(first + 1)
    .join("\n")
    .trim();
  return { title, body };
}

export type TranscriptWrite = {
  text: string;
  status: "open" | "saved";
  noteTitle: string | null;
  noteBody: string | null;
};

/** A second transcribe replaces text and leaves a saved note's title and body. */
export function nextTranscript(
  current: TranscriptWrite | null,
  text: string,
): TranscriptWrite | null {
  const trimmed = text.trim();
  if (!current && !trimmed) return null;
  if (!current) return { text: trimmed, status: "open", noteTitle: null, noteBody: null };
  return { ...current, text: trimmed || current.text };
}

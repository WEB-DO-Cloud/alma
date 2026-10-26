import { AudioModule, RecordingPresets, setAudioModeAsync } from "expo-audio";
import { File } from "expo-file-system";
import { captureApiRequestContext } from "./api";

const MAX_MS = 20_000;

/** Records one clip and sends it to the operator transcription endpoint. */
export async function transcribeFromMicrophone(input: {
  language: string;
  signal: AbortSignal;
}): Promise<string> {
  const permission = await AudioModule.requestRecordingPermissionsAsync();
  if (!permission.granted) throw new Error("microphone");
  const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
  try {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, MAX_MS);
      input.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri || input.signal.aborted) throw new Error("cancelled");
    const audioBase64 = await new File(uri).base64();
    try {
      new File(uri).delete();
    } catch {
      // The clip is disposable.
    }
    const { apiBase, headers } = await captureApiRequestContext();
    const res = await fetch(`${apiBase}/api/voice/transcribe`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "rakazo://", ...headers },
      body: JSON.stringify({ audioBase64, mimeType: "audio/m4a", language: input.language }),
      signal: input.signal,
    });
    const body = (await res.json().catch(() => ({}))) as { text?: string };
    if (!res.ok) throw new Error("transcribe");
    return body.text ?? "";
  } finally {
    recorder.release();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  }
}

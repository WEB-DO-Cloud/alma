import type {
  AdapterContext,
  AdapterDescriptor,
  SpeechClip,
  VoiceCapabilities,
  VoiceInfo,
  VoiceProvider,
  VoiceSynthesizeRequest,
  VoiceTranscribeRequest,
  VoiceVerifyResult,
} from "@rakazo/adapter-kit";
import {
  readVoiceAudio,
  readVoiceJson,
  speechUploadName,
  voiceDeadline,
  voiceRequestError,
} from "./voice-http.js";

export const XAI_STT_URL = "https://api.x.ai/v1/stt";
export const XAI_STT_MODEL = "grok-voice-transcribe-2.0";
export const XAI_TTS_URL = "https://api.x.ai/v1/tts";
/** One operator voice. Lawyers do not pick it. */
export const XAI_TTS_VOICE = "eve";

const LANGUAGES = new Set([
  "ar",
  "bg",
  "bs",
  "ca",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "es-es",
  "fa",
  "fi",
  "fil",
  "fr",
  "hi",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "mk",
  "ms",
  "nb",
  "nl",
  "pl",
  "pt",
  "pt-pt",
  "ro",
  "ru",
  "sk",
  "sv",
  "th",
  "tr",
  "uk",
  "ur",
  "vi",
  "yue",
  "zh",
  "ar-ae",
  "ar-sa",
]);

/** Legal terms the transcriber should prefer. Each stays under the 50-character keyterm limit. */
export const XAI_LEGAL_KEYTERMS = [
  "contrato",
  "demanda",
  "sentencia",
  "poder",
  "notario",
  "hipoteca",
  "arrendamiento",
  "cláusula",
  "demandante",
  "demandado",
] as const;

/** A locale tag becomes a supported language code. Anything else is Spanish. */
export function voiceLanguage(locale: string | undefined): string {
  const raw = (locale ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (!raw) return "es";
  if (LANGUAGES.has(raw)) return raw;
  const base = raw.split("-")[0] ?? "";
  if (LANGUAGES.has(base)) return base;
  return "es";
}

const TTS_LANGUAGES = new Set([
  "en",
  "ar-eg",
  "ar-sa",
  "ar-ae",
  "bn",
  "zh",
  "fr",
  "de",
  "hi",
  "id",
  "it",
  "ja",
  "ko",
  "pt-br",
  "pt-pt",
  "ru",
  "es-mx",
  "es-es",
  "tr",
  "vi",
]);

/** Speech synthesis wants a regional tag. Spanish that is not Mexican becomes es-ES. */
export function ttsLanguage(locale: string | undefined): string {
  const raw = (locale ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (raw === "es-mx") return "es-MX";
  if (raw === "pt-br") return "pt-BR";
  if (raw === "pt-pt" || raw === "pt") return "pt-PT";
  if (raw.startsWith("es")) return "es-ES";
  if (TTS_LANGUAGES.has(raw)) return raw === "zh" ? "zh" : raw;
  const base = raw.split("-")[0] ?? "";
  if (base === "pt") return "pt-PT";
  if (TTS_LANGUAGES.has(base)) return base;
  return "es-ES";
}

export class XaiVoiceProvider implements VoiceProvider {
  describe(): AdapterDescriptor<VoiceCapabilities> {
    return {
      id: "xai",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { catalog: false, synthesize: true, transcribe: true },
    };
  }

  async verify(apiKey: string, context: AdapterContext): Promise<VoiceVerifyResult> {
    if (apiKey.trim().length < 8) return { ok: false, message: "Missing key" };
    void context;
    return { ok: true };
  }

  async listVoices(_apiKey: string, _context: AdapterContext): Promise<VoiceInfo[]> {
    return [];
  }

  async synthesize(request: VoiceSynthesizeRequest, context: AdapterContext): Promise<SpeechClip> {
    const signal = voiceDeadline(request.signal ?? context.signal, 60_000);
    const res = await fetch(XAI_TTS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${request.apiKey}`,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: request.text,
        voice_id: request.voiceId || XAI_TTS_VOICE,
        language: ttsLanguage(request.language),
        text_normalization: true,
      }),
      signal,
    });
    if (!res.ok) {
      throw voiceRequestError(res.status, "xAI", "speaking", await readVoiceJson(res));
    }
    return { bytes: await readVoiceAudio(res, signal), mimeType: "audio/mpeg" };
  }

  async transcribe(
    request: VoiceTranscribeRequest,
    context: AdapterContext,
  ): Promise<{ text: string }> {
    const form = new FormData();
    form.append("model", XAI_STT_MODEL);
    form.append("format", "true");
    form.append("language", voiceLanguage(request.language));
    for (const term of XAI_LEGAL_KEYTERMS) form.append("keyterm", term);
    form.append(
      "file",
      new Blob([new Uint8Array(request.audio)], { type: request.mimeType || "audio/webm" }),
      speechUploadName(request.mimeType),
    );
    const res = await fetch(XAI_STT_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${request.apiKey}` },
      body: form,
      signal: voiceDeadline(request.signal ?? context.signal, 60_000),
    });
    const body = await readVoiceJson(res, { requireValid: res.ok });
    if (!res.ok) throw voiceRequestError(res.status, "xAI", "transcribing", body);
    return { text: String((body as { text?: unknown } | null)?.text ?? "").trim() };
  }
}

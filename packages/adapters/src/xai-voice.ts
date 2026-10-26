import type {
  AdapterContext,
  AdapterDescriptor,
  VoiceCapabilities,
  VoiceInfo,
  VoiceProvider,
  VoiceTranscribeRequest,
  VoiceVerifyResult,
} from "@rakazo/adapter-kit";
import { readVoiceJson, speechUploadName, voiceDeadline, voiceRequestError } from "./voice-http.js";

export const XAI_STT_URL = "https://api.x.ai/v1/stt";
export const XAI_STT_MODEL = "grok-voice-transcribe-2.0";

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

export class XaiVoiceProvider implements VoiceProvider {
  describe(): AdapterDescriptor<VoiceCapabilities> {
    return {
      id: "xai",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { catalog: false, synthesize: false, transcribe: true },
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

  async synthesize(): Promise<never> {
    throw new Error("This voice provider does not speak.");
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

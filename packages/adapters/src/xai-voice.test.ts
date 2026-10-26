import { afterEach, describe, expect, it, vi } from "vitest";
import { managedVoiceStatus, resolveManagedVoice } from "./managed-voice.js";
import { voiceLanguage, XAI_LEGAL_KEYTERMS, XAI_STT_MODEL, XaiVoiceProvider } from "./xai-voice.js";

const context = {
  operationId: "voice",
  traceId: "voice",
  spaceId: "space",
  userId: "user",
  signal: new AbortController().signal,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("voiceLanguage", () => {
  it("defaults to Spanish and keeps a supported base code", () => {
    expect(voiceLanguage(undefined)).toBe("es");
    expect(voiceLanguage("")).toBe("es");
    expect(voiceLanguage("es-DO")).toBe("es");
    expect(voiceLanguage("EN_us")).toBe("en");
    expect(voiceLanguage("pt-PT")).toBe("pt-pt");
    expect(voiceLanguage("klingon")).toBe("es");
  });
});

describe("XaiVoiceProvider", () => {
  it("posts the file last and reads the transcript", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      const names = [...form.keys()];
      expect(names.at(-1)).toBe("file");
      expect(names.indexOf("file")).toBe(names.length - 1);
      expect(form.get("model")).toBe(XAI_STT_MODEL);
      expect(form.get("format")).toBe("true");
      expect(form.get("language")).toBe("es");
      expect(form.getAll("keyterm")).toEqual([...XAI_LEGAL_KEYTERMS]);
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer xai-test-key");
      return new Response(JSON.stringify({ text: "El saldo es $100." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await new XaiVoiceProvider().transcribe(
      {
        audio: new Uint8Array([1, 2, 3]),
        mimeType: "audio/webm",
        apiKey: "xai-test-key",
        language: "es-DO",
      },
      context,
    );
    expect(result).toEqual({ text: "El saldo es $100." });
    expect(fetchMock).toHaveBeenCalledWith("https://api.x.ai/v1/stt", expect.any(Object));
  });
});

describe("managed voice", () => {
  it("is ready for every org when the operator key is set", () => {
    expect(resolveManagedVoice({ ALMA_VOICE_PROVIDER: " xai " }).enabled).toBe(true);
    expect(resolveManagedVoice({}).enabled).toBe(false);
    expect(managedVoiceStatus({ ALMA_VOICE_PROVIDER: "xai", XAI_API_KEY: "xai-test-key" })).toEqual(
      {
        configured: true,
        ready: true,
        transcribe: true,
        provider: null,
        voiceId: "",
      },
    );
    expect(managedVoiceStatus({ ALMA_VOICE_PROVIDER: "xai" })).toEqual({
      configured: false,
      ready: false,
      transcribe: false,
      provider: null,
      voiceId: "",
    });
  });
});

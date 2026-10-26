import type { VoiceStatus } from "@rakazo/contracts";

export interface ManagedVoiceConfig {
  enabled: boolean;
  provider: "xai";
  apiKey: string | undefined;
}

/** Operator speech-to-text. Only `xai` is wired; another id stays off until a runtime exists. */
export function resolveManagedVoice(env: NodeJS.ProcessEnv = process.env): ManagedVoiceConfig {
  const provider = env.ALMA_VOICE_PROVIDER?.trim().toLowerCase();
  return {
    enabled: provider === "xai",
    provider: "xai",
    apiKey: env.XAI_API_KEY?.trim() || undefined,
  };
}

/**
 * The status every organization sees while managed voice is on.
 * Null means the caller's saved voice credential still applies.
 * `ready` here means dictation is available. This provider does not synthesize speech.
 */
export function managedVoiceStatus(env: NodeJS.ProcessEnv = process.env): VoiceStatus | null {
  const managed = resolveManagedVoice(env);
  if (!managed.enabled) return null;
  if (!managed.apiKey) {
    return { configured: false, ready: false, transcribe: false, provider: null, voiceId: "" };
  }
  return { configured: true, ready: true, transcribe: true, provider: null, voiceId: "" };
}

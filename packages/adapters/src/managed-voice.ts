import type { VoiceStatus } from "@rakazo/contracts";
import { XAI_VOICE_PROVIDER_ID } from "./xai-voice.js";

const MANAGED_VOICE_ID = "eve";

export interface ManagedVoiceConfig {
  enabled: boolean;
  provider: "xai";
  apiKey: string | undefined;
}

/** Operator speech. Only `xai` is wired; another id stays off until a runtime exists. */
export function resolveManagedVoice(env: NodeJS.ProcessEnv = process.env): ManagedVoiceConfig {
  const provider = env.ALMA_VOICE_PROVIDER?.trim().toLowerCase();
  return {
    enabled: provider === XAI_VOICE_PROVIDER_ID,
    provider: XAI_VOICE_PROVIDER_ID,
    apiKey: env.XAI_API_KEY?.trim() || undefined,
  };
}

/**
 * The status every organization sees while managed voice is on.
 * Null means the caller's saved voice credential still applies.
 * `ready` with `voiceId` means the operator voice can speak. `transcribe` means dictation
 * can use the server. `provider` stays null so the client does not name the vendor.
 */
export function managedVoiceStatus(env: NodeJS.ProcessEnv = process.env): VoiceStatus | null {
  const managed = resolveManagedVoice(env);
  if (!managed.enabled) return null;
  if (!managed.apiKey) {
    return { configured: false, ready: false, transcribe: false, provider: null, voiceId: "" };
  }
  return {
    configured: true,
    ready: true,
    transcribe: true,
    provider: null,
    voiceId: MANAGED_VOICE_ID,
  };
}

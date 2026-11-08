/** Phone quick actions. Off unless the value is exactly `true`. No native permission change. */

export type MobileActionsConfig = { enabled: boolean };

export function readMobileActionsConfig(
  source: NodeJS.ProcessEnv = process.env,
): MobileActionsConfig {
  return { enabled: source.ALMA_MOBILE_ACTIONS === "true" };
}

export type QuickActionName = "review" | "camera" | "share" | "voice";

export type QuickActionTarget =
  | { name: "review"; path: "/queue" }
  | { name: "camera"; path: "/thread"; capture: "camera"; threadId: string }
  | { name: "share"; path: "/share" }
  | { name: "voice"; path: "/thread"; capture: "voice"; threadId: string };

/** Home-screen shortcuts are not registered here. A later store build can call this. */
export function quickActionTarget(input: {
  enabled: boolean;
  name: string;
  phase2aEnabled: boolean;
  voiceNotesEnabled: boolean;
  threadId: string | null;
}): QuickActionTarget | null {
  if (!input.enabled) return null;
  if (input.name === "review")
    return input.phase2aEnabled ? { name: "review", path: "/queue" } : null;
  if (input.name === "share") return { name: "share", path: "/share" };
  if (input.name === "camera") {
    return input.threadId
      ? { name: "camera", path: "/thread", capture: "camera", threadId: input.threadId }
      : null;
  }
  if (input.name === "voice") {
    return input.voiceNotesEnabled && input.threadId
      ? { name: "voice", path: "/thread", capture: "voice", threadId: input.threadId }
      : null;
  }
  return null;
}

/** Biometric lock waits for a store build. This module does not import one. */
export function lockAvailability(): "unavailable" {
  return "unavailable";
}

/** Read once. A second render with the same value does not launch again. */
export function consumeCapture(
  capture: string | null,
  enabled: boolean,
): "camera" | "voice" | null {
  if (!enabled) return null;
  if (capture === "camera" || capture === "voice") return capture;
  return null;
}

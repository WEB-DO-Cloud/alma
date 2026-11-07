import { readPhase2aConfig } from "./phase2a.js";

/** Undo window. Off unless the value is exactly `true`. Requires Phase 2A when on. */

export type SendUndoConfig = { enabled: boolean };

const ALLOWED = [0, 10, 30, 60] as const;
export type UndoSeconds = (typeof ALLOWED)[number];

export function readSendUndoConfig(source: NodeJS.ProcessEnv = process.env): SendUndoConfig {
  const enabled = source.ALMA_SEND_UNDO === "true";
  if (enabled && !readPhase2aConfig(source).enabled) {
    throw new Error("send undo requires phase 2a");
  }
  return { enabled };
}

export function undoSeconds(value: number | null | undefined): UndoSeconds {
  if (value === 0 || value === 10 || value === 30 || value === 60) return value;
  if (value === undefined || value === null) return 30;
  throw new Error("send undo seconds must be 0, 10, 30, or 60");
}

export type HeldDraft = {
  channel: "email" | "other";
  recipient: string;
  body: string;
};

/** Recipient and body for a held tool. Null means the tool is not called and no draft is stored. */
export function draftFromToolArgs(name: string, args: Record<string, unknown>): HeldDraft | null {
  if (name === "send_email") {
    const to = Array.isArray(args.to) ? args.to[0] : undefined;
    if (typeof to !== "string" || typeof args.text !== "string" || !to || !args.text) return null;
    return { channel: "email", recipient: to, body: args.text };
  }
  if (!name.includes("send")) return null;
  const recipient = typeof args.to === "string" ? args.to : null;
  const body =
    typeof args.text === "string" ? args.text : typeof args.body === "string" ? args.body : null;
  if (!recipient || !body) return null;
  return { channel: "other", recipient, body };
}

/** Shown while a draft this slice created is still approved. */
export const NOT_SENT = "Not sent";
export const ALREADY_SENT = "Already sent.";

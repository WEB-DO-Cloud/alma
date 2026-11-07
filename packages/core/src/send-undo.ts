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

/** Sending after the window. Off unless exactly `true`, and only with send undo (which needs Phase 2A). */
export function readUndoDispatchConfig(source: NodeJS.ProcessEnv = process.env): {
  enabled: boolean;
} {
  const enabled = source.ALMA_UNDO_DISPATCH === "true";
  if (enabled && !readSendUndoConfig(source).enabled) {
    throw new Error("undo dispatch requires send undo");
  }
  return { enabled };
}

export type DueDraft = {
  id: string;
  status: string;
  dispatchAfter: string | null;
  bodyHash: string;
  approvedBodyHash: string | null;
};

/** True only for an approved draft whose hash still matches and whose window has elapsed. */
export function dispatchAllowed(draft: DueDraft, now: Date): boolean {
  if (draft.status !== "approved") return false;
  if (!draft.dispatchAfter || draft.approvedBodyHash !== draft.bodyHash) return false;
  return new Date(draft.dispatchAfter).getTime() <= now.getTime();
}

export function undoCountdown(dispatchAfter: string | null, now: Date): number | null {
  if (!dispatchAfter) return null;
  const remaining = new Date(dispatchAfter).getTime() - now.getTime();
  if (Number.isNaN(remaining)) return null;
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / 1000);
}

/** Claims then sends. A failed claim (cancel or edit) never calls send. */
export async function runDraftDispatch(input: {
  enabled: boolean;
  now: Date;
  list: () => Promise<DueDraft[]>;
  claim: (draft: DueDraft) => Promise<boolean>;
  send: (draft: DueDraft) => Promise<"sent" | "failed" | "unknown">;
  finish: (id: string, result: "sent" | "failed" | "unknown") => Promise<void>;
}): Promise<number> {
  if (!input.enabled) return 0;
  let sent = 0;
  for (const draft of await input.list()) {
    if (!dispatchAllowed(draft, input.now)) continue;
    if (!(await input.claim(draft))) continue;
    let result: "sent" | "failed" | "unknown" = "unknown";
    try {
      result = await input.send(draft);
    } catch {
      result = "unknown";
    }
    await input.finish(draft.id, result);
    if (result === "sent") sent += 1;
  }
  return sent;
}

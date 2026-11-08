/** Lock-screen notification policy. Off unless the value is exactly `true`. */

export type NotifyPolicyConfig = { enabled: boolean };

export function readNotifyPolicyConfig(
  source: NodeJS.ProcessEnv = process.env,
): NotifyPolicyConfig {
  return { enabled: source.ALMA_NOTIFY_POLICY === "true" };
}

export type NotifyChannel = "push" | "in_app" | "both";

export type NotifyPolicy = {
  channel: NotifyChannel;
  quietStartMinute: number | null;
  quietEndMinute: number | null;
};

export const DEFAULT_NOTIFY_POLICY: NotifyPolicy = {
  channel: "both",
  quietStartMinute: null,
  quietEndMinute: null,
};

const URGENT = new Set(["approval_waiting", "deadline", "failure", "help", "takeover"]);
const KEPT_DATA = new Set(["spaceId", "threadId", "botId", "draftId", "issueId", "kind"]);
const KEPT_KIND = new Set([
  "approval_waiting",
  "deadline",
  "failure",
  "digest",
  "help",
  "takeover",
]);

export type PushDecision = {
  deliver: boolean;
  /** True only when a routine push is inside quiet hours. */
  hold: boolean;
  title: string;
  body: string;
  data: Record<string, string>;
};

/** Minutes from midnight in `timeZone`. Invalid zones throw. */
export function minuteInZone(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function scheduleZone(timezone: string | null | undefined): string {
  const trimmed = timezone?.trim();
  if (!trimmed) return "America/Santo_Domingo";
  try {
    minuteInZone(new Date(), trimmed);
    return trimmed;
  } catch {
    return "America/Santo_Domingo";
  }
}

/** Inclusive start, exclusive end. A window that crosses midnight uses either side. */
export function quietHoursContain(policy: NotifyPolicy, minute: number): boolean {
  const start = policy.quietStartMinute;
  const end = policy.quietEndMinute;
  if (start === null || end === null || start === end) return false;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

export function notifyCopy(urgent: boolean, locale: string | null | undefined): string {
  const spanish = locale?.toLowerCase().startsWith("es") === true;
  if (urgent) return spanish ? "Te necesita" : "Needs you";
  return spanish ? "Novedades" : "Updates";
}

export function decidePush(input: {
  kind: string;
  data: Record<string, unknown>;
  policy: NotifyPolicy;
  minute: number;
  locale?: string | null;
}): PushDecision {
  const urgent = URGENT.has(input.kind);
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.data)) {
    if (!KEPT_DATA.has(key) || typeof value !== "string") continue;
    if (key === "kind" && !KEPT_KIND.has(value)) continue;
    data[key] = value;
  }
  if (!data.kind && KEPT_KIND.has(input.kind)) data.kind = input.kind;
  const hold = !urgent && quietHoursContain(input.policy, input.minute);
  const channelBlocks = input.policy.channel === "in_app";
  return {
    deliver: !hold && !channelBlocks,
    hold,
    title: "ALMA",
    body: notifyCopy(urgent, input.locale),
    data,
  };
}

/** One unsent row per user. A second hold does not insert. */
export function shouldHoldRoutine(existingUnsent: boolean): boolean {
  return !existingUnsent;
}

export type BatchRow = { id: string; userId: string; flushingAt: Date | null; sentAt: Date | null };

/** Claim rows whose lease is free or older than five minutes. */
export function claimableBatchIds(rows: readonly BatchRow[], now: Date): string[] {
  const lease = now.getTime() - 5 * 60_000;
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of rows) {
    if (row.sentAt || seen.has(row.userId)) continue;
    if (row.flushingAt && row.flushingAt.getTime() >= lease) continue;
    seen.add(row.userId);
    ids.push(row.id);
  }
  return ids;
}

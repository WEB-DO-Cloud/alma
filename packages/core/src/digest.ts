/** Morning and Monday counts. Off unless the value is exactly `true`. */

export type DigestConfig = { enabled: boolean };

export function readDigestConfig(source: NodeJS.ProcessEnv = process.env): DigestConfig {
  return { enabled: source.ALMA_DIGEST === "true" };
}

export function localParts(
  now: Date,
  timeZone: string,
): { minute: number; date: string; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  return {
    minute: hour * 60 + minute,
    date: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: value("weekday"),
  };
}

export type DigestSuggestion = { key: "digest.review" | "digest.reminders"; href: string | null };

export type DigestBuild =
  | { empty: true }
  | { empty: false; draftCount: number; reminderCount: number; suggestions: DigestSuggestion[] };

/** Counts only. No prose. An empty input inserts nothing. */
export function buildDigest(input: {
  draftCount: number;
  reminders: ReadonlyArray<{ threadId: string | null; nextRunAt: string }>;
}): DigestBuild {
  const reminderCount = input.reminders.length;
  if (input.draftCount <= 0 && reminderCount === 0) return { empty: true };
  const suggestions: DigestSuggestion[] = [];
  if (input.draftCount > 0) suggestions.push({ key: "digest.review", href: "/app/queue" });
  if (reminderCount > 0) {
    const linked = [...input.reminders]
      .filter((reminder) => reminder.threadId)
      .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt));
    suggestions.push({
      key: "digest.reminders",
      href: linked[0]?.threadId ? `/app?thread=${linked[0].threadId}` : null,
    });
  }
  return {
    empty: false,
    draftCount: Math.max(0, input.draftCount),
    reminderCount,
    suggestions,
  };
}

export type DigestSubscription = {
  enabled: boolean;
  weekly: boolean;
  minuteOfDay: number;
  email: boolean;
};

/** Which issue kinds are due. The caller inserts only after buildDigest is not empty. */
export function dueDigestKinds(
  subscription: DigestSubscription,
  local: { minute: number; weekday: string },
  existing: ReadonlyArray<"daily" | "weekly">,
): Array<"daily" | "weekly"> {
  if (!subscription.enabled || local.minute !== subscription.minuteOfDay) return [];
  const kinds: Array<"daily" | "weekly"> = [];
  if (!existing.includes("daily")) kinds.push("daily");
  if (subscription.weekly && local.weekday === "Mon" && !existing.includes("weekly"))
    kinds.push("weekly");
  return kinds;
}

/** Push body before notify policy rewrites it. Counts stay off the lock screen. */
export function digestPushBody(kind: "daily" | "weekly", locale: string | null): string {
  const spanish = locale?.toLowerCase().startsWith("es") === true;
  if (kind === "weekly") return spanish ? "Resumen del lunes" : "Monday summary";
  return spanish ? "Resumen de la mañana" : "Morning summary";
}

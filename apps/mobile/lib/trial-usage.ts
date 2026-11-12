import { plural, t } from "@lingui/core/macro";

/**
 * The home trial line, such as "12 days left · 49 messages".
 * Missing counts hide the banner instead of leaving placeholder braces on screen.
 */
export function trialUsageLabel(daysLeft: number, messagesLeft: number): string | null {
  if (!Number.isSafeInteger(daysLeft) || !Number.isSafeInteger(messagesLeft)) return null;
  if (daysLeft < 0 || messagesLeft < 0) return null;
  const days = daysLeft;
  const left = messagesLeft;
  return t`${plural(days, {
    one: "# day left",
    other: "# days left",
  })} · ${plural(left, {
    one: "# message",
    other: "# messages",
  })}`;
}

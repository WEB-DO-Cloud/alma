import { describe, expect, it } from "vitest";
import { buildDigest, digestPushBody, dueDigestKinds, readDigestConfig } from "./digest.js";
import { scheduleZone } from "./notify-policy.js";

const opted = { enabled: true, weekly: true, minuteOfDay: 450, email: false };

describe("digest flag", () => {
  it("is on only for the exact string true", () => {
    for (const value of [undefined, "", "1", "yes", "TRUE"]) {
      expect(readDigestConfig({ ALMA_DIGEST: value }).enabled).toBe(false);
    }
    expect(readDigestConfig({ ALMA_DIGEST: "true" }).enabled).toBe(true);
  });
});

describe("buildDigest", () => {
  it("inserts nothing when both sources are empty", () => {
    expect(buildDigest({ draftCount: 0, reminders: [] })).toEqual({ empty: true });
  });

  it("offers at most the two sourced links", () => {
    const built = buildDigest({
      draftCount: 2,
      reminders: [
        { threadId: "later", nextRunAt: "2026-11-07T16:00:00.000Z" },
        { threadId: "sooner", nextRunAt: "2026-11-07T12:00:00.000Z" },
        { threadId: null, nextRunAt: "2026-11-07T08:00:00.000Z" },
      ],
    });
    expect(built).toEqual({
      empty: false,
      draftCount: 2,
      reminderCount: 3,
      suggestions: [
        { key: "digest.review", href: "/app/queue" },
        { key: "digest.reminders", href: "/app?thread=sooner" },
      ],
    });
  });

  it("keeps names and subjects out of the push body", () => {
    expect(digestPushBody("daily", "en")).toBe("Morning summary");
    expect(digestPushBody("weekly", "es-DO")).toBe("Resumen del lunes");
    expect(digestPushBody("daily", "en")).not.toContain("0");
  });
});

describe("due kinds", () => {
  it("skips a disabled subscription and a duplicate day", () => {
    expect(
      dueDigestKinds({ ...opted, enabled: false }, { minute: 450, weekday: "Mon" }, []),
    ).toEqual([]);
    expect(dueDigestKinds(opted, { minute: 451, weekday: "Mon" }, [])).toEqual([]);
    expect(dueDigestKinds(opted, { minute: 450, weekday: "Tue" }, [])).toEqual(["daily"]);
    expect(dueDigestKinds(opted, { minute: 450, weekday: "Mon" }, ["daily"])).toEqual(["weekly"]);
    expect(
      dueDigestKinds({ ...opted, weekly: false }, { minute: 450, weekday: "Mon" }, []),
    ).toEqual(["daily"]);
  });
});

describe("schedule zone", () => {
  it("falls back when the zone is missing or invalid", () => {
    expect(scheduleZone(null)).toBe("America/Santo_Domingo");
    expect(scheduleZone("not-a-zone")).toBe("America/Santo_Domingo");
    expect(scheduleZone("America/New_York")).toBe("America/New_York");
  });
});

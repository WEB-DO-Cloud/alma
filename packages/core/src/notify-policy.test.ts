import { describe, expect, it } from "vitest";
import {
  claimableBatchIds,
  decidePush,
  quietHoursContain,
  readNotifyPolicyConfig,
  scheduleZone,
  shouldHoldRoutine,
} from "./notify-policy.js";

const open = { channel: "both" as const, quietStartMinute: null, quietEndMinute: null };

describe("notify policy flag", () => {
  it("is on only for the exact string true", () => {
    for (const value of [undefined, "", "1", "yes", "TRUE", "false"]) {
      expect(readNotifyPolicyConfig({ ALMA_NOTIFY_POLICY: value }).enabled).toBe(false);
    }
    expect(readNotifyPolicyConfig({ ALMA_NOTIFY_POLICY: "true" }).enabled).toBe(true);
  });
});

describe("quiet hours", () => {
  const daytime = { channel: "both" as const, quietStartMinute: 22 * 60, quietEndMinute: 7 * 60 };

  it("treats a missing or equal window as off", () => {
    expect(quietHoursContain(open, 100)).toBe(false);
    expect(
      quietHoursContain({ channel: "both", quietStartMinute: 60, quietEndMinute: 60 }, 60),
    ).toBe(false);
    expect(
      quietHoursContain({ channel: "both", quietStartMinute: 60, quietEndMinute: null }, 60),
    ).toBe(false);
  });

  it("matches a window that crosses midnight on either side", () => {
    expect(quietHoursContain(daytime, 22 * 60)).toBe(true);
    expect(quietHoursContain(daytime, 23 * 60)).toBe(true);
    expect(quietHoursContain(daytime, 6 * 60)).toBe(true);
    expect(quietHoursContain(daytime, 7 * 60)).toBe(false);
    expect(quietHoursContain(daytime, 12 * 60)).toBe(false);
  });

  it("keeps the end minute outside a same-day window", () => {
    const window = { channel: "push" as const, quietStartMinute: 60, quietEndMinute: 120 };
    expect(quietHoursContain(window, 60)).toBe(true);
    expect(quietHoursContain(window, 119)).toBe(true);
    expect(quietHoursContain(window, 120)).toBe(false);
  });
});

describe("decidePush", () => {
  it("drops message text and a person name from the payload", () => {
    const decision = decidePush({
      kind: "completion",
      minute: 12 * 60,
      policy: open,
      data: {
        kind: "completion",
        spaceId: "space-1",
        threadId: "thread-1",
        botId: "bot-1",
        title: "Hello Ada",
        body: "Your contract is ready",
        name: "Ada",
        email: "ada@example.test",
        notificationBody: "Your contract is ready",
      },
    });
    expect(decision).toEqual({
      deliver: true,
      hold: false,
      title: "ALMA",
      body: "Updates",
      data: { spaceId: "space-1", threadId: "thread-1", botId: "bot-1" },
    });
    expect(JSON.stringify(decision)).not.toContain("Ada");
    expect(JSON.stringify(decision)).not.toContain("contract");
  });

  it("holds a routine push inside quiet hours and still sends an urgent one", () => {
    const policy = { channel: "both" as const, quietStartMinute: 22 * 60, quietEndMinute: 7 * 60 };
    expect(
      decidePush({ kind: "digest", minute: 23 * 60, policy, data: { kind: "digest" } }).deliver,
    ).toBe(false);
    const urgent = decidePush({
      kind: "failure",
      minute: 23 * 60,
      policy,
      data: { kind: "failure", draftId: "d1" },
    });
    expect(urgent.deliver).toBe(true);
    expect(urgent.body).toBe("Needs you");
  });

  it("sends no push when the channel is in the app", () => {
    expect(
      decidePush({
        kind: "failure",
        minute: 0,
        policy: { ...open, channel: "in_app" },
        data: {},
      }).deliver,
    ).toBe(false);
  });

  it("drops a kind that is not on the list", () => {
    const decision = decidePush({
      kind: "completion",
      minute: 0,
      policy: open,
      data: { kind: "the contract body" },
    });
    expect(decision.data.kind).toBeUndefined();
    expect(JSON.stringify(decision)).not.toContain("contract");
  });
});

describe("batch claim", () => {
  const now = new Date("2026-11-07T15:00:00.000Z");

  it("claims one free row per user and skips a live lease", () => {
    const ids = claimableBatchIds(
      [
        { id: "a", userId: "u1", flushingAt: null, sentAt: null },
        { id: "b", userId: "u1", flushingAt: null, sentAt: null },
        { id: "c", userId: "u2", flushingAt: new Date(now.getTime() - 60_000), sentAt: null },
        { id: "d", userId: "u3", flushingAt: new Date(now.getTime() - 6 * 60_000), sentAt: null },
        { id: "e", userId: "u4", flushingAt: null, sentAt: now },
      ],
      now,
    );
    expect(ids).toEqual(["a", "d"]);
  });

  it("does not insert a second unsent row", () => {
    expect(shouldHoldRoutine(true)).toBe(false);
    expect(shouldHoldRoutine(false)).toBe(true);
  });
});

describe("schedule zone", () => {
  it("uses a valid name and falls back otherwise", () => {
    expect(scheduleZone("America/Santo_Domingo")).toBe("America/Santo_Domingo");
    expect(scheduleZone(null)).toBe("America/Santo_Domingo");
    expect(scheduleZone("")).toBe("America/Santo_Domingo");
    expect(scheduleZone("not-a-zone")).toBe("America/Santo_Domingo");
  });
});

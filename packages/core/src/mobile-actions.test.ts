import { describe, expect, it } from "vitest";
import {
  consumeCapture,
  lockAvailability,
  quickActionTarget,
  readMobileActionsConfig,
} from "./mobile-actions.js";

const base = {
  enabled: true,
  phase2aEnabled: true,
  voiceNotesEnabled: true,
  threadId: "thread-1",
};

describe("mobile actions flag", () => {
  it("is on only for the exact string true", () => {
    for (const value of [undefined, "", "1", "yes", "TRUE"]) {
      expect(readMobileActionsConfig({ ALMA_MOBILE_ACTIONS: value }).enabled).toBe(false);
    }
    expect(readMobileActionsConfig({ ALMA_MOBILE_ACTIONS: "true" }).enabled).toBe(true);
  });
});

describe("quickActionTarget", () => {
  it("maps the four names and the absent cases", () => {
    expect(quickActionTarget({ ...base, name: "review" })).toEqual({
      name: "review",
      path: "/queue",
    });
    expect(quickActionTarget({ ...base, name: "review", phase2aEnabled: false })).toBeNull();
    expect(quickActionTarget({ ...base, name: "share" })).toEqual({
      name: "share",
      path: "/share",
    });
    const camera = quickActionTarget({ ...base, name: "camera" });
    expect(camera && "capture" in camera ? camera.capture : null).toBe("camera");
    expect(quickActionTarget({ ...base, name: "camera", threadId: null })).toBeNull();
    const voice = quickActionTarget({ ...base, name: "voice" });
    expect(voice && "capture" in voice ? voice.capture : null).toBe("voice");
    expect(quickActionTarget({ ...base, name: "voice", voiceNotesEnabled: false })).toBeNull();
    expect(quickActionTarget({ ...base, name: "unknown" })).toBeNull();
    expect(quickActionTarget({ ...base, enabled: false, name: "share" })).toBeNull();
  });

  it("does not offer a biometric lock", () => {
    expect(lockAvailability()).toBe("unavailable");
  });

  it("ignores capture while the flag is off and consumes it once", () => {
    expect(consumeCapture("camera", false)).toBeNull();
    expect(consumeCapture("camera", true)).toBe("camera");
    expect(consumeCapture("voice", true)).toBe("voice");
    expect(consumeCapture(null, true)).toBeNull();
  });
});

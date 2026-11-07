import { describe, expect, it } from "vitest";
import { externalSendHold } from "./phase2a.js";
import {
  ALREADY_SENT,
  draftFromToolArgs,
  NOT_SENT,
  readSendUndoConfig,
  undoSeconds,
} from "./send-undo.js";

describe("send undo flag", () => {
  it("is off unless the value is exactly true", () => {
    for (const value of [undefined, "", "1", "yes", "TRUE"]) {
      expect(readSendUndoConfig({ ALMA_SEND_UNDO: value }).enabled).toBe(false);
    }
  });

  it("throws when undo is on and phase 2a is off", () => {
    expect(() => readSendUndoConfig({ ALMA_SEND_UNDO: "true" })).toThrow(
      "send undo requires phase 2a",
    );
    expect(readSendUndoConfig({ ALMA_SEND_UNDO: "true", ALMA_PHASE2A: "true" }).enabled).toBe(true);
  });

  it("accepts only the four windows", () => {
    expect(undoSeconds(null)).toBe(30);
    expect(undoSeconds(0)).toBe(0);
    expect(undoSeconds(60)).toBe(60);
    expect(() => undoSeconds(15)).toThrow("0, 10, 30, or 60");
  });
});

describe("held drafts", () => {
  it("holds send_email and a connector send, and still refuses payment", () => {
    expect(
      externalSendHold({
        enabled: true,
        undo: true,
        viaConnector: false,
        connectorKind: "builtin",
        tools: [{ name: "send_email" }],
      })?.code,
    ).toBe("phase2a_external_hold");
    expect(
      externalSendHold({
        enabled: true,
        undo: true,
        viaConnector: true,
        connectorKind: "gmail",
        tools: [{ name: "gmail_send_email", readOnly: false }],
      })?.code,
    ).toBe("phase2a_external_hold");
    expect(
      externalSendHold({
        enabled: true,
        undo: true,
        viaConnector: true,
        connectorKind: "gmail",
        tools: [{ name: "gmail_send_email", readOnly: true }],
      }),
    ).toBeNull();
    expect(
      externalSendHold({
        enabled: true,
        undo: true,
        viaConnector: true,
        connectorKind: "stripe",
        tools: [{ name: "stripe_send_payment", readOnly: false }],
      })?.code,
    ).toBe("phase2a_refused");
  });

  it("reads the email recipient and body and skips a tool with neither", () => {
    expect(draftFromToolArgs("send_email", { to: ["ada@example.test"], text: "Hello" })).toEqual({
      channel: "email",
      recipient: "ada@example.test",
      body: "Hello",
    });
    expect(draftFromToolArgs("send_email", { to: [], text: "Hello" })).toBeNull();
    expect(
      draftFromToolArgs("gmail_send_email", { to: "ada@example.test", body: "Hello" }),
    ).toEqual({
      channel: "other",
      recipient: "ada@example.test",
      body: "Hello",
    });
  });

  it("does not use recall in the status strings", () => {
    expect(`${NOT_SENT} ${ALREADY_SENT}`.toLowerCase()).not.toContain("recall");
    expect(ALREADY_SENT).not.toContain("delivered");
  });
});

import { describe, expect, it } from "vitest";
import { externalSendHold, nextDraftState } from "./phase2a.js";
import {
  ALREADY_SENT,
  dispatchAllowed,
  draftFromToolArgs,
  NOT_SENT,
  readSendUndoConfig,
  readUndoDispatchConfig,
  runDraftDispatch,
  undoCountdown,
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

  it("does not send inside the window, after cancel, or after an edit", async () => {
    const now = new Date("2026-11-07T12:00:30.000Z");
    const approved = {
      id: "d1",
      status: "approved",
      dispatchAfter: "2026-11-07T12:00:30.000Z",
      bodyHash: "abc",
      approvedBodyHash: "abc",
    };
    const calls: string[] = [];
    const send = async (draft: { id: string }) => {
      calls.push(draft.id);
      return "sent" as const;
    };
    expect(
      await runDraftDispatch({
        enabled: false,
        now,
        list: async () => [approved],
        claim: async () => true,
        send,
        finish: async () => undefined,
      }),
    ).toBe(0);
    expect(calls).toEqual([]);
    expect(
      await runDraftDispatch({
        enabled: true,
        now,
        list: async () => [{ ...approved, dispatchAfter: "2026-11-07T12:01:00.000Z" }],
        claim: async () => true,
        send,
        finish: async () => undefined,
      }),
    ).toBe(0);
    expect(
      await runDraftDispatch({
        enabled: true,
        now,
        list: async () => [{ ...approved, status: "cancelled" }],
        claim: async () => true,
        send,
        finish: async () => undefined,
      }),
    ).toBe(0);
    const edited = nextDraftState({
      status: "approved",
      command: "edit",
      actorRole: "owner",
      actorUserId: "owner",
      creatorRole: "owner",
      creatorUserId: "owner",
      now,
      delaySeconds: 30,
    });
    expect(edited.status).toBe("draft");
    expect(edited.clearApproval).toBe(true);
    expect(dispatchAllowed({ ...approved, status: "draft", approvedBodyHash: null }, now)).toBe(
      false,
    );
    expect(
      await runDraftDispatch({
        enabled: true,
        now,
        list: async () => [approved],
        claim: async () => false,
        send,
        finish: async () => undefined,
      }),
    ).toBe(0);
    expect(calls).toEqual([]);
    expect(
      await runDraftDispatch({
        enabled: true,
        now,
        list: async () => [approved],
        claim: async () => true,
        send,
        finish: async () => undefined,
      }),
    ).toBe(1);
    expect(calls).toEqual(["d1"]);
    expect(undoCountdown("2026-11-07T12:00:40.000Z", now)).toBe(10);
    expect(undoCountdown("2026-11-07T12:00:30.000Z", now)).toBe(0);
  });

  it("refuses dispatch without the undo flag", () => {
    expect(readUndoDispatchConfig({}).enabled).toBe(false);
    expect(() => readUndoDispatchConfig({ ALMA_UNDO_DISPATCH: "true" })).toThrow(
      "undo dispatch requires send undo",
    );
    expect(
      readUndoDispatchConfig({
        ALMA_UNDO_DISPATCH: "true",
        ALMA_SEND_UNDO: "true",
        ALMA_PHASE2A: "true",
      }).enabled,
    ).toBe(true);
  });

  it("does not use recall in the status strings", () => {
    expect(`${NOT_SENT} ${ALREADY_SENT}`.toLowerCase()).not.toContain("recall");
    expect(ALREADY_SENT).not.toContain("delivered");
  });
});

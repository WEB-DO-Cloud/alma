import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALMA_PERSONAL_SECTOR, ALMA_WORK_SECTORS } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import {
  assertCanApprove,
  assertContextParent,
  assertGrant,
  assertRevoke,
  claimDraft,
  deliveryLabel,
  draftBodyHash,
  externalSendHold,
  nextDraftState,
  Phase2aError,
  readPhase2aConfig,
  queueDraftActions,
  recordDispatchResult,
  resolveRecordTitles,
  splitTiming,
  visibleRecordIds,
} from "./phase2a.js";
import { PHASE2A_SECTOR_FIXTURES } from "./phase2a-fixtures.js";

const now = new Date("2026-11-07T12:00:00.000Z");
const actor = {
  actorRole: "owner" as const,
  actorUserId: "owner",
  creatorRole: "owner" as const,
  creatorUserId: "owner",
  now,
  delaySeconds: 30,
};

describe("readPhase2aConfig", () => {
  it("is on only for the exact string true", () => {
    expect(readPhase2aConfig({}).enabled).toBe(false);
    for (const value of ["", "1", "yes", "TRUE", "false"]) {
      expect(readPhase2aConfig({ ALMA_PHASE2A: value }).enabled).toBe(false);
    }
    expect(readPhase2aConfig({ ALMA_PHASE2A: "true" })).toMatchObject({
      enabled: true,
      dispatchDelaySeconds: 30,
    });
  });

  it("checks the delay only when the flag is on", () => {
    expect(
      readPhase2aConfig({ ALMA_PHASE2A: "false", ALMA_PHASE2A_DISPATCH_DELAY_SECONDS: "900" })
        .dispatchDelaySeconds,
    ).toBe(30);
    expect(
      readPhase2aConfig({ ALMA_PHASE2A: "true", ALMA_PHASE2A_DISPATCH_DELAY_SECONDS: "0" })
        .dispatchDelaySeconds,
    ).toBe(0);
    expect(() =>
      readPhase2aConfig({ ALMA_PHASE2A: "true", ALMA_PHASE2A_DISPATCH_DELAY_SECONDS: "301" }),
    ).toThrow("ALMA_PHASE2A_DISPATCH_DELAY_SECONDS");
  });
});

describe("contexts", () => {
  it("keeps personal unshared and client under work in the same space", () => {
    expect(() =>
      assertContextParent({
        kind: "personal",
        spaceId: "s",
        parent: { kind: "work", spaceId: "s" },
      }),
    ).toThrow(Phase2aError);
    expect(() =>
      assertContextParent({
        kind: "client",
        spaceId: "s",
        parent: { kind: "work", spaceId: "other" },
      }),
    ).toThrow(Phase2aError);
    expect(() =>
      assertContextParent({
        kind: "client",
        spaceId: "s",
        parent: { kind: "personal", spaceId: "s" },
      }),
    ).toThrow(Phase2aError);
    assertContextParent({ kind: "client", spaceId: "s", parent: { kind: "work", spaceId: "s" } });
    assertContextParent({ kind: "personal", spaceId: "s", parent: null });
    expect(() => assertGrant({ kind: "personal", actorRole: "owner", role: "reader" })).toThrow(
      Phase2aError,
    );
    assertGrant({ kind: "work", actorRole: "owner", role: "owner" });
    expect(() => assertRevoke({ actorRole: "owner", targetRole: "owner", ownerCount: 1 })).toThrow(
      "phase2a_last_owner",
    );
  });
});

describe("approval", () => {
  it("lets an owner approve their own draft and refuses an assistant", () => {
    expect(nextDraftState({ ...actor, status: "pending", command: "approve" }).status).toBe(
      "approved",
    );
    expect(() =>
      assertCanApprove({
        actorRole: "assistant",
        actorUserId: "junior",
        creatorRole: "assistant",
        creatorUserId: "junior",
      }),
    ).toThrow("phase2a_role");
    expect(() =>
      nextDraftState({
        ...actor,
        status: "pending",
        command: "approve",
        actorRole: "professional",
        actorUserId: "pro",
        creatorRole: "assistant",
        creatorUserId: "pro",
      }),
    ).toThrow("phase2a_role");
    expect(
      nextDraftState({
        ...actor,
        status: "pending",
        command: "approve",
        actorRole: "professional",
        actorUserId: "pro",
        creatorRole: "assistant",
        creatorUserId: "junior",
      }).dispatchAfter?.toISOString(),
    ).toBe("2026-11-07T12:00:30.000Z");
  });

  it("clears approval on edit and refuses a stale approve", () => {
    const edited = nextDraftState({ ...actor, status: "approved", command: "edit" });
    expect(edited).toMatchObject({ status: "draft", clearApproval: true, action: "invalidated" });
    expect(() => nextDraftState({ ...actor, status: "draft", command: "approve" })).toThrow(
      "phase2a_stale_approval",
    );
  });

  it("cancels before dispatch and does not recall a sent draft", () => {
    expect(nextDraftState({ ...actor, status: "approved", command: "cancel" }).status).toBe(
      "cancelled",
    );
    expect(() => nextDraftState({ ...actor, status: "sent", command: "cancel" })).toThrow(
      "phase2a_already_sent",
    );
    const error = new Phase2aError("phase2a_already_sent");
    expect(error.message).not.toMatch(/recall|delivered/i);
    expect(() => nextDraftState({ ...actor, status: "dispatching", command: "cancel" })).toThrow(
      "phase2a_in_flight",
    );
  });

  it("never labels a draft delivered, including after the delay", () => {
    const past = new Date("2026-11-07T11:00:00.000Z");
    expect(deliveryLabel("approved", past, now)).toBe("waiting");
    expect(deliveryLabel("sent", null, now)).toBe("sent");
    const labels = [
      "draft",
      "pending",
      "approved",
      "dispatching",
      "sent",
      "failed",
      "unknown",
      "cancelled",
    ].map((status) => deliveryLabel(status as "draft", null, now));
    expect(labels).not.toContain("delivered");
  });

  it("claims only a matching approved draft and records an honest result", () => {
    expect(
      claimDraft({
        status: "approved",
        dispatchAfter: new Date("2026-11-07T11:59:00.000Z"),
        bodyHash: "abc",
        approvedBodyHash: "abc",
        now,
      }),
    ).toBe("dispatching");
    expect(recordDispatchResult({ status: "dispatching", result: "unknown" })).toBe("unknown");
    expect(() =>
      claimDraft({
        status: "approved",
        dispatchAfter: new Date("2026-11-07T12:01:00.000Z"),
        bodyHash: "abc",
        approvedBodyHash: "abc",
        now,
      }),
    ).toThrow("phase2a_in_flight");
  });
});

describe("draft hash and isolation", () => {
  const payload = {
    recipient: "ada@example.test",
    channel: "email",
    body: "Hola",
    attachmentIds: ["b", "a"],
  };

  it("hashes the attachment set, not the order", () => {
    expect(draftBodyHash(payload)).toBe(draftBodyHash({ ...payload, attachmentIds: ["a", "b"] }));
    expect(draftBodyHash(payload)).not.toBe(draftBodyHash({ ...payload, body: "Adios" }));
    expect(draftBodyHash(payload)).not.toBe(
      draftBodyHash({ ...payload, attachmentIds: ["a", "c"] }),
    );
    expect(draftBodyHash(payload)).not.toBe(
      draftBodyHash({ ...payload, recipient: "bea@example.test" }),
    );
    expect(draftBodyHash(payload)).not.toBe(draftBodyHash({ ...payload, channel: "whatsapp" }));
  });

  it("does not return another context's records or an ambiguous body", () => {
    const records = [
      { id: "one", contextId: "client-a", title: "Ada" },
      { id: "two", contextId: "client-b", title: "Ada" },
      { id: "three", contextId: "client-a", title: "Ada" },
    ];
    expect(visibleRecordIds(records, "client-a")).toEqual(["one", "three"]);
    expect(visibleRecordIds(records, "personal")).toEqual([]);
    const ambiguous = resolveRecordTitles(records, "client-a", "ada");
    expect(ambiguous).toEqual({ status: "ambiguous", ids: ["one", "three"] });
    expect(ambiguous).not.toHaveProperty("body");
    expect(resolveRecordTitles(records, "client-b", "Ada")).toEqual({ status: "one", id: "two" });
  });
});

describe("external send hold", () => {
  it("does nothing while the flag is off", () => {
    expect(
      externalSendHold({
        enabled: false,
        viaConnector: true,
        connectorKind: "gmail",
        tools: [{ name: "gmail_send_email", readOnly: false }],
      }),
    ).toBeNull();
  });

  it("lets ordinary connector writes through and refuses clinical, filing, payment, and price tools", () => {
    expect(
      externalSendHold({
        enabled: true,
        viaConnector: true,
        connectorKind: "gmail",
        tools: [{ name: "gmail_send_email", readOnly: false }],
      }),
    ).toBeNull();
    expect(
      externalSendHold({
        enabled: true,
        viaConnector: true,
        connectorKind: "gmail",
        tools: [{ name: "gmail_list_threads", readOnly: true }],
      }),
    ).toBeNull();
    expect(
      externalSendHold({
        enabled: true,
        viaConnector: false,
        connectorKind: "web",
        tools: [{ name: "web_fetch" }],
      }),
    ).toBeNull();
    expect(
      externalSendHold({
        enabled: true,
        viaConnector: false,
        connectorKind: "builtin",
        tools: [{ name: "message_user" }],
      }),
    ).toBeNull();
    for (const name of ["prescribe", "file_return", "commit_price", "paid_request"]) {
      expect(
        externalSendHold({
          enabled: true,
          viaConnector: false,
          connectorKind: "builtin",
          tools: [{ name }],
        })?.code,
      ).toBe("phase2a_refused");
    }
    expect(
      externalSendHold({
        enabled: true,
        viaConnector: true,
        connectorKind: "stripe",
        tools: [{ name: "stripe_create_payment", readOnly: false }],
      })?.code,
    ).toBe("phase2a_refused");
  });
});

describe("queue actions", () => {
  it("lets an owner approve and hides approval of an assistant's own draft", () => {
    expect(
      queueDraftActions({
        role: "owner",
        status: "pending",
        creatorRole: "assistant",
        creatorUserId: "junior",
        actorUserId: "owner",
      }).approve,
    ).toBe(true);
    expect(
      queueDraftActions({
        role: "assistant",
        status: "pending",
        creatorRole: "assistant",
        creatorUserId: "junior",
        actorUserId: "junior",
      }),
    ).toMatchObject({ approve: false, submit: false, cancel: true });
    expect(
      queueDraftActions({
        role: "reader",
        status: "draft",
        creatorRole: "owner",
        creatorUserId: "owner",
        actorUserId: "reader",
      }).compose,
    ).toBe(false);
  });
});

describe("fixtures", () => {
  it("covers personal use and the eight launch sectors without a new activation event", () => {
    const expected = [
      ...ALMA_WORK_SECTORS.map((sector) => sector.id).filter((id) => id !== "otro"),
      ALMA_PERSONAL_SECTOR.id,
    ].sort();
    expect(PHASE2A_SECTOR_FIXTURES.map((fixture) => fixture.sectorId).sort()).toEqual(expected);
    expect(PHASE2A_SECTOR_FIXTURES).toHaveLength(9);
    for (const fixture of PHASE2A_SECTOR_FIXTURES) {
      expect(fixture.sla).toBe(false);
      expect(fixture.activationEventName).toBeNull();
      expect(
        visibleRecordIds(
          [
            { id: fixture.recordId, contextId: fixture.contextId },
            { id: fixture.hiddenRecordId, contextId: fixture.otherContextId },
          ],
          fixture.contextId,
        ),
      ).toEqual([fixture.recordId]);
    }
    const timing = splitTiming({ modelMs: 40, approvalWaitMs: 2_000 });
    expect(timing.modelMs).toBe(40);
    expect(timing.modelMs + timing.approvalWaitMs).not.toBe(timing.modelMs);
  });

  it("reuses the phase 1 activation names and does not record them here", () => {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const sources = walk(path.join(root, "packages/db/src"))
      .concat(walk(path.join(root, "apps/api/src")))
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    for (const name of [
      "signup",
      "sector_chosen",
      "assistant_ready",
      "task_started",
      "task_completed",
      "limit_reached",
      "plan_viewed",
      "checkout_started",
      "payment_completed",
    ]) {
      expect(sources).toContain(`name: "${name}"`);
    }
    const phase2a = readFileSync(fileURLToPath(new URL("./phase2a.ts", import.meta.url)), "utf8");
    expect(phase2a).not.toContain("recordActivationEvent");
    expect(phase2a).not.toContain("activation_events");
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const file = path.join(dir, entry);
    if (statSync(file).isDirectory()) return walk(file);
    return [file];
  });
}

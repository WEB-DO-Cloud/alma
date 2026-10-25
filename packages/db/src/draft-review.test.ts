import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { OrganizationSettings } from "@rakazo/contracts";
import { draftTextHash } from "@rakazo/core";
import { describe, expect, it } from "vitest";
import {
  approveReviewDraft,
  createReviewDraft,
  type DraftApprovalLogRow,
  type DraftReviewDb,
  DraftReviewError,
  exportApprovedDraft,
  exportDraftApprovalLogCsv,
  listDraftApprovalLog,
  openReviewDraft,
  type ReviewDraftRow,
  rejectReviewDraft,
  saveReviewDraft,
  unapprovedDraftBlocksText,
} from "./draft-review.js";

const lawyers = [
  {
    id: "lawyer-1",
    name: "María Núñez",
    cardNumber: "12345",
    email: "maria@firma.example",
    mayApproveDrafts: true,
    archivedAt: null,
  },
  {
    id: "lawyer-2",
    name: "Luis Pérez",
    cardNumber: "67890",
    email: "luis@firma.example",
    mayApproveDrafts: false,
    archivedAt: null,
  },
];

const settings: OrganizationSettings = {
  legalName: "Núñez & Asociados S.R.L.",
  tradeName: "Núñez",
  rnc: "101123456",
  addressLine: "Calle 1",
  cityProvince: "Santo Domingo",
  phone: "809-555-0100",
  email: "firma@example.com",
  website: "https://firma.example",
  bankName: "",
  bankAccount: "",
  invoiceFooter: "",
  accentColor: "#1F4B3A",
  minimumReviewSeconds: 60,
  logo: null,
  lawyers: lawyers.map(({ archivedAt: _archived, ...lawyer }) => lawyer),
};

function memory() {
  const drafts: ReviewDraftRow[] = [];
  const logs: DraftApprovalLogRow[] = [];
  const logMutations: string[] = [];
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(where)) {
      const current = row[key];
      if (value && typeof value === "object" && "in" in value) {
        const list = (value as { in: unknown[] }).in;
        if (!list.includes(current)) return false;
      } else if (value && typeof value === "object" && ("gte" in value || "lte" in value)) {
        const range = value as { gte?: Date; lte?: Date };
        const time = new Date(current as string).getTime();
        if (range.gte && time < range.gte.getTime()) return false;
        if (range.lte && time > range.lte.getTime()) return false;
      } else if (current !== value) return false;
    }
    return true;
  };
  const db: DraftReviewDb = {
    reviewDraft: {
      findMany: async ({ where, take }) =>
        drafts.filter((row) => matches(row as never, where)).slice(0, take ?? drafts.length),
      findFirst: async ({ where }) => drafts.find((row) => matches(row as never, where)) ?? null,
      create: async ({ data }) => {
        drafts.push({ ...data });
        return data;
      },
      update: async ({ where, data }) => {
        const row = drafts.find((item) => item.id === where.id);
        if (!row) throw new Error("missing draft");
        if (row.status === "approved" || row.status === "rejected") {
          throw new Error("A finished review draft cannot be changed");
        }
        if (data.originalText !== undefined && data.originalText !== row.originalText) {
          throw new Error("The original agent draft is immutable");
        }
        if (row.openedAt && data.openedAt && data.openedAt.getTime() !== row.openedAt.getTime()) {
          throw new Error("The review open time is immutable");
        }
        Object.assign(row, data);
        return row;
      },
    },
    draftApprovalLog: {
      findMany: async ({ where, take }) =>
        logs.filter((row) => matches(row as never, where)).slice(0, take ?? logs.length),
      create: async ({ data }) => {
        const row = data as DraftApprovalLogRow;
        logs.push(row);
        return row;
      },
    },
    $transaction: async (fn) => fn(db),
  };
  const refuseLog = async (kind: string) => {
    logMutations.push(kind);
    throw new Error("Draft approval log records are append-only");
  };
  return {
    db,
    drafts,
    logs,
    logMutations,
    updateLog: () => refuseLog("update"),
    deleteLog: () => refuseLog("delete"),
  };
}

const firm = {
  organizationId: "org-1",
  spaceId: "space-1",
  lawyers,
  minimumReviewSeconds: 60,
};

async function draft(store: ReturnType<typeof memory>, text = "El arrendatario paga la renta.") {
  return createReviewDraft(store.db, {
    ...firm,
    createdByUserId: "user-1",
    email: "maria@firma.example",
    title: "Contrato",
    originalText: text,
    model: "example-model",
    modelVersion: "2026-10-01",
    sourceMessageId: "message-1",
    now: new Date("2026-10-26T15:00:00.000Z"),
    id: "draft-1",
  });
}

describe("draft review", () => {
  it("refuses export, a short review, and a lawyer who may not approve", async () => {
    const store = memory();
    await draft(store);
    await expect(
      exportApprovedDraft(store.db, { organizationId: "org-1", draftId: "draft-1", settings }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const opened = new Date("2026-10-26T15:00:00.000Z");
    await openReviewDraft(store.db, {
      ...firm,
      draftId: "draft-1",
      userId: "user-1",
      email: "maria@firma.example",
      now: opened,
    });
    await expect(
      approveReviewDraft(store.db, {
        ...firm,
        draftId: "draft-1",
        userId: "user-1",
        email: "maria@firma.example",
        lawyerId: "lawyer-1",
        confirmation: true,
        editedText: "El arrendatario paga la renta mensual.",
        now: new Date(opened.getTime() + 10_000),
      }),
    ).rejects.toMatchObject({ code: "TOO_EARLY" });
    await expect(
      approveReviewDraft(store.db, {
        ...firm,
        draftId: "draft-1",
        userId: "user-2",
        email: "luis@firma.example",
        lawyerId: "lawyer-2",
        confirmation: true,
        editedText: "El arrendatario paga la renta mensual.",
        now: new Date(opened.getTime() + 120_000),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      approveReviewDraft(store.db, {
        ...firm,
        draftId: "draft-1",
        userId: "user-1",
        email: "maria@firma.example",
        lawyerId: "lawyer-1",
        confirmation: false,
        editedText: "El arrendatario paga la renta mensual.",
        now: new Date(opened.getTime() + 120_000),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(store.logs).toHaveLength(0);
    expect(store.drafts[0]?.status).toBe("in_review");
    expect(store.drafts[0]?.originalText).toBe("El arrendatario paga la renta.");
  });

  it("stores the diff and hashes, and keeps the original text", async () => {
    const store = memory();
    const original = "El arrendatario paga la renta.";
    await draft(store, original);
    const opened = new Date("2026-10-26T15:00:00.000Z");
    await openReviewDraft(store.db, {
      ...firm,
      draftId: "draft-1",
      userId: "user-1",
      email: "maria@firma.example",
      now: opened,
    });
    const edited = "El arrendatario paga la renta mensual.";
    await saveReviewDraft(store.db, {
      ...firm,
      draftId: "draft-1",
      email: "maria@firma.example",
      editedText: edited,
      now: new Date(opened.getTime() + 5_000),
    });
    expect(store.drafts[0]?.originalText).toBe(original);
    const approvedAt = new Date(opened.getTime() + 70_000);
    const view = await approveReviewDraft(store.db, {
      ...firm,
      draftId: "draft-1",
      userId: "user-1",
      email: "maria@firma.example",
      lawyerId: "lawyer-1",
      confirmation: true,
      editedText: edited,
      now: approvedAt,
    });
    expect(view.status).toBe("approved");
    expect(store.logs).toHaveLength(1);
    expect(store.logs[0]).toMatchObject({
      draftId: "draft-1",
      approverLawyerId: "lawyer-1",
      approverName: "María Núñez",
      cardNumber: "12345",
      userId: "user-1",
      model: "example-model",
      modelVersion: "2026-10-01",
      reviewDurationMs: 70_000,
    });
    expect(store.logs[0]?.originalHash).toBe(await draftTextHash(original));
    expect(store.logs[0]?.finalHash).toBe(await draftTextHash(edited));
    expect(
      store.logs[0]?.diff.some((span) => span.type === "insert" && span.text.includes("mensual")),
    ).toBe(true);
    expect(store.drafts[0]?.originalText).toBe(original);
    expect(store.drafts[0]?.editedText).toBe(edited);

    await expect(
      approveReviewDraft(store.db, {
        ...firm,
        draftId: "draft-1",
        userId: "user-1",
        email: "maria@firma.example",
        lawyerId: "lawyer-1",
        confirmation: true,
        editedText: edited,
        now: new Date(approvedAt.getTime() + 10_000),
      }),
    ).rejects.toBeInstanceOf(DraftReviewError);
    expect(store.logs).toHaveLength(1);
    await expect(store.updateLog()).rejects.toThrow(/append-only/);
    await expect(store.deleteLog()).rejects.toThrow(/append-only/);
    expect(store.logMutations).toEqual(["update", "delete"]);

    const exported = await exportApprovedDraft(store.db, {
      organizationId: "org-1",
      draftId: "draft-1",
      settings,
    });
    expect(exported.html).toContain("Núñez");
    expect(exported.html).toContain(
      "Borrador preparado con asistencia de software y revisado y aprobado por Lic. María Núñez, CARD 12345, el 26 de octubre de 2026.",
    );
    expect(exported.text).toContain(edited);
    expect(exported.html.toLowerCase()).not.toContain("abogado ia");

    const csv = await exportDraftApprovalLogCsv(store.db, {
      organizationId: "org-1",
      lawyerId: "lawyer-1",
    });
    expect(csv).toContain("draft-1");
    expect(csv).toContain("12345");
    expect(csv.split("\n")[0]).toContain("originalHash");
    const listed = await listDraftApprovalLog(store.db, {
      organizationId: "org-1",
      action: "approved",
    });
    expect(listed).toHaveLength(1);
  });

  it("scales the minimum review with the length of the original draft", async () => {
    const store = memory();
    const text = "a".repeat(3_000);
    await draft(store, text);
    const opened = new Date("2026-10-26T15:00:00.000Z");
    await openReviewDraft(store.db, {
      ...firm,
      draftId: "draft-1",
      userId: "user-1",
      email: "maria@firma.example",
      now: opened,
    });
    await expect(
      approveReviewDraft(store.db, {
        ...firm,
        draftId: "draft-1",
        userId: "user-1",
        email: "maria@firma.example",
        lawyerId: "lawyer-1",
        confirmation: true,
        editedText: text,
        now: new Date(opened.getTime() + 90_000),
      }),
    ).rejects.toMatchObject({ code: "TOO_EARLY" });
    await expect(
      approveReviewDraft(store.db, {
        ...firm,
        draftId: "draft-1",
        userId: "user-1",
        email: "maria@firma.example",
        lawyerId: "lawyer-1",
        confirmation: true,
        editedText: text,
        now: new Date(opened.getTime() + 130_000),
      }),
    ).resolves.toMatchObject({ status: "approved" });
  });

  it("blocks an unapproved draft from leaving and lets an approved one through", async () => {
    const store = memory();
    await draft(store);
    const prisma = {
      ...store.db,
      space: { findUnique: async () => ({ organizationId: "org-1" }) },
    };
    await expect(
      unapprovedDraftBlocksText(prisma, {
        spaceId: "space-1",
        texts: ["Nota. El arrendatario paga la renta. Fin."],
        messageIds: [],
      }),
    ).resolves.toBe(true);
    await expect(
      unapprovedDraftBlocksText(prisma, {
        spaceId: "space-1",
        texts: ["otra cosa"],
        messageIds: ["message-1"],
      }),
    ).resolves.toBe(true);
    const opened = new Date("2026-10-26T15:00:00.000Z");
    await openReviewDraft(store.db, {
      ...firm,
      draftId: "draft-1",
      userId: "user-1",
      email: "maria@firma.example",
      now: opened,
    });
    await approveReviewDraft(store.db, {
      ...firm,
      draftId: "draft-1",
      userId: "user-1",
      email: "maria@firma.example",
      lawyerId: "lawyer-1",
      confirmation: true,
      editedText: "El arrendatario paga la renta.",
      now: new Date(opened.getTime() + 70_000),
    });
    await expect(
      unapprovedDraftBlocksText(prisma, {
        spaceId: "space-1",
        texts: ["El arrendatario paga la renta."],
        messageIds: ["message-1"],
      }),
    ).resolves.toBe(false);
  });

  it("refuses an archived lawyer and a different email", async () => {
    const store = memory();
    await draft(store);
    const archived = lawyers.map((lawyer) =>
      lawyer.id === "lawyer-1" ? { ...lawyer, archivedAt: "2026-10-01T00:00:00.000Z" } : lawyer,
    );
    await expect(
      openReviewDraft(store.db, {
        ...firm,
        lawyers: archived,
        draftId: "draft-1",
        userId: "user-1",
        email: "maria@firma.example",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      openReviewDraft(store.db, {
        ...firm,
        draftId: "draft-1",
        userId: "user-9",
        email: "otra@firma.example",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps the approval log append-only in the migration", () => {
    const sql = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../prisma/migrations/20261026140000_draft_approval/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("draft_approval_logs_no_mutation");
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE OR TRUNCATE ON "draft_approval_logs"/);
    expect(sql).toContain("Draft approval log records are append-only");
    expect(sql).toContain("The original agent draft is immutable");
    expect(sql).toContain('REVOKE UPDATE, DELETE, TRUNCATE ON "draft_approval_logs"');
  });

  it("records a rejection without removing the draft", async () => {
    const store = memory();
    await draft(store);
    await rejectReviewDraft(store.db, {
      ...firm,
      draftId: "draft-1",
      userId: "user-1",
      email: "maria@firma.example",
      lawyerId: "lawyer-1",
      editedText: "No enviar.",
      now: new Date("2026-10-26T15:10:00.000Z"),
    });
    expect(store.drafts).toHaveLength(1);
    expect(store.drafts[0]?.status).toBe("rejected");
    expect(store.logs[0]?.action).toBe("rejected");
    await expect(
      exportApprovedDraft(store.db, { organizationId: "org-1", draftId: "draft-1", settings }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

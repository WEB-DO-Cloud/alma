import { OrganizationSettingsUpdateSchema } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import type { PrismaClient } from "./client.js";
import {
  isOrganizationAdmin,
  type OrganizationLawyerState,
  type OrganizationSettingsState,
  organizationRoleForMember,
  organizationSettingsSnapshot,
  planOrganizationSettingsChange,
  recordOrganizationLogo,
  saveOrganizationSettings,
} from "./organization-settings.js";

const now = new Date("2026-10-26T12:00:00.000Z");

function update(overrides: Record<string, unknown> = {}) {
  return OrganizationSettingsUpdateSchema.parse({
    legalName: "Núñez & Asociados S.R.L.",
    tradeName: "Núñez",
    rnc: "1-01-12345-6",
    addressLine: "Calle 1",
    cityProvince: "Santo Domingo",
    phone: "809-555-0100",
    email: "firma@example.com",
    website: "https://firma.example",
    bankName: "",
    bankAccount: "",
    invoiceFooter: "",
    accentColor: "#1f4b3a",
    lawyers: [
      {
        name: "María Núñez",
        cardNumber: "12345",
        email: "maria@firma.example",
        mayApproveDrafts: true,
      },
    ],
    ...overrides,
  });
}

describe("organization admin", () => {
  it("accepts owner and admin roles, including a combined role list", () => {
    expect(isOrganizationAdmin("owner")).toBe(true);
    expect(isOrganizationAdmin("admin")).toBe(true);
    expect(isOrganizationAdmin("admin, owner")).toBe(true);
    expect(isOrganizationAdmin("member")).toBe(false);
    expect(isOrganizationAdmin("")).toBe(false);
    expect(isOrganizationAdmin(null)).toBe(false);
  });

  it("reads the role of the member in the space's organization", async () => {
    const prisma = {
      space: { findUnique: async () => ({ organizationId: "org-1" }) },
      member: { findUnique: async () => ({ role: "admin" }) },
    } as unknown as PrismaClient;
    await expect(
      organizationRoleForMember(prisma, { spaceId: "space-1", userId: "user-1" }),
    ).resolves.toEqual({ organizationId: "org-1", role: "admin" });
    const missing = {
      space: { findUnique: async () => ({ organizationId: "org-1" }) },
      member: { findUnique: async () => null },
    } as unknown as PrismaClient;
    await expect(
      organizationRoleForMember(missing, { spaceId: "space-1", userId: "user-1" }),
    ).resolves.toBeNull();
  });
});

describe("organization settings changes", () => {
  it("archives a lawyer who is left off the form and keeps the row", () => {
    const current: OrganizationSettingsState = {
      legalName: "Núñez & Asociados S.R.L.",
      tradeName: "Núñez",
      rnc: "101123456",
      logoId: null,
      addressLine: "Calle 1",
      cityProvince: "Santo Domingo",
      phone: "809-555-0100",
      email: "firma@example.com",
      website: "https://firma.example",
      bankName: "",
      bankAccount: "",
      invoiceFooter: "",
      accentColor: "#1F4B3A",
      lawyers: [
        {
          id: "lawyer-1",
          name: "María Núñez",
          cardNumber: "12345",
          email: "maria@firma.example",
          mayApproveDrafts: true,
          archivedAt: null,
        },
      ],
    };
    const planned = planOrganizationSettingsChange(current, update({ lawyers: [] }), {
      now,
      newId: () => "lawyer-2",
    });
    expect(planned.archive.map((lawyer) => lawyer.id)).toEqual(["lawyer-1"]);
    expect(planned.next.lawyers).toEqual([
      expect.objectContaining({ id: "lawyer-1", archivedAt: now.toISOString() }),
    ]);
    expect(() =>
      planOrganizationSettingsChange(
        planned.next,
        update({
          lawyers: [
            {
              id: "lawyer-1",
              name: "María Núñez",
              cardNumber: "12345",
              email: "maria@firma.example",
              mayApproveDrafts: true,
            },
          ],
        }),
        { now, newId: () => "lawyer-3" },
      ),
    ).toThrow(/not an active member/);
  });
});

function memoryDb() {
  let profile: (OrganizationSettingsState & { organizationId: string }) | null = null;
  const lawyers: OrganizationLawyerState[] = [];
  const logos: Array<{ id: string }> = [];
  const audits: Array<{ action: string; before: unknown; after: unknown }> = [];
  const removed: string[] = [];
  const refuse = async (kind: string) => {
    removed.push(kind);
    throw new Error(`${kind} is not allowed`);
  };
  const db = {
    organizationProfile: {
      findUnique: async () => {
        if (!profile) return null;
        return {
          ...profile,
          lawyers: lawyers.map((lawyer) => ({
            ...lawyer,
            archivedAt: lawyer.archivedAt ? new Date(lawyer.archivedAt) : null,
          })),
          logo: profile.logoId
            ? { id: profile.logoId, mimeType: "image/png", storageKey: "k" }
            : null,
        };
      },
      upsert: async ({
        create,
        update,
      }: {
        create: OrganizationSettingsState & { organizationId: string };
        update: OrganizationSettingsState;
      }) => {
        profile = profile ? { ...profile, ...update } : { ...create };
        return profile;
      },
    },
    organizationLawyer: {
      create: async ({ data }: { data: OrganizationLawyerState & { organizationId: string } }) => {
        lawyers.push({ ...data, archivedAt: null });
        return data;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: {
          name?: string;
          cardNumber?: string;
          email?: string;
          mayApproveDrafts?: boolean;
          archivedAt?: Date | null;
        };
      }) => {
        const lawyer = lawyers.find((item) => item.id === where.id);
        if (!lawyer) throw new Error("missing lawyer");
        if (data.name !== undefined) lawyer.name = data.name;
        if (data.cardNumber !== undefined) lawyer.cardNumber = data.cardNumber;
        if (data.email !== undefined) lawyer.email = data.email;
        if (data.mayApproveDrafts !== undefined) lawyer.mayApproveDrafts = data.mayApproveDrafts;
        if (data.archivedAt instanceof Date) lawyer.archivedAt = data.archivedAt.toISOString();
        return lawyer;
      },
      delete: () => refuse("delete"),
      deleteMany: () => refuse("deleteMany"),
    },
    organizationLogo: {
      count: async () => logos.length,
      create: async ({ data }: { data: { id: string } }) => {
        logos.push({ id: data.id });
        return data;
      },
      delete: () => refuse("logo delete"),
    },
    organizationSettingsAudit: {
      create: async ({ data }: { data: { action: string; before: unknown; after: unknown } }) => {
        audits.push(data);
        return data;
      },
      update: () => refuse("audit update"),
      delete: () => refuse("audit delete"),
      deleteMany: () => refuse("audit deleteMany"),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db: db as unknown as PrismaClient, audits, lawyers, logos, removed };
}

describe("organization settings audit", () => {
  it("records before and after, and archives without deleting", async () => {
    const memory = memoryDb();
    let ids = 0;
    await saveOrganizationSettings(memory.db, {
      organizationId: "org-1",
      actorUserId: "user-1",
      update: update(),
      now,
      newId: () => `lawyer-${++ids}`,
    });
    expect(memory.audits).toHaveLength(1);
    expect(memory.audits[0]).toMatchObject({
      action: "settings.update",
      before: expect.objectContaining({ lawyers: [], rnc: "" }),
      after: expect.objectContaining({
        rnc: "101123456",
        accentColor: "#1F4B3A",
        lawyers: [
          expect.objectContaining({ id: "lawyer-1", archivedAt: null, mayApproveDrafts: true }),
        ],
      }),
    });

    await saveOrganizationSettings(memory.db, {
      organizationId: "org-1",
      actorUserId: "user-2",
      update: update({ lawyers: [] }),
      now,
      newId: () => `lawyer-${++ids}`,
    });
    expect(memory.audits).toHaveLength(2);
    expect(organizationSettingsSnapshot(memory.audits[1]!.before as never)).toEqual(
      organizationSettingsSnapshot(memory.audits[0]!.after as never),
    );
    expect(memory.audits[1]!.after).toMatchObject({
      lawyers: [expect.objectContaining({ id: "lawyer-1", archivedAt: now.toISOString() })],
    });
    expect(memory.lawyers).toHaveLength(1);
    expect(memory.removed).toEqual([]);
  });

  it("keeps the previous logo when a new one is stored", async () => {
    const memory = memoryDb();
    await recordOrganizationLogo(memory.db, {
      organizationId: "org-1",
      actorUserId: "user-1",
      logo: {
        id: "logo-1",
        mimeType: "image/png",
        byteSize: 4,
        storageKey: "organization-logos/org-1/logo-1",
      },
    });
    await recordOrganizationLogo(memory.db, {
      organizationId: "org-1",
      actorUserId: "user-1",
      logo: {
        id: "logo-2",
        mimeType: "image/png",
        byteSize: 4,
        storageKey: "organization-logos/org-1/logo-2",
      },
    });
    expect(memory.logos.map((logo) => logo.id)).toEqual(["logo-1", "logo-2"]);
    expect(memory.audits.map((audit) => audit.action)).toEqual(["logo.upload", "logo.upload"]);
    expect(memory.audits[1]!.before).toMatchObject({ logoId: "logo-1" });
    expect(memory.audits[1]!.after).toMatchObject({ logoId: "logo-2" });
    expect(memory.removed).toEqual([]);
  });
});

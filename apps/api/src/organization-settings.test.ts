import { ORPCError } from "@orpc/server";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import type { OrganizationLogoStore } from "./organization-logo-store.js";
import {
  readOrganizationSettingsForActor,
  updateOrganizationSettingsForActor,
} from "./organization-settings.js";

const actor: Actor = {
  userId: "user-1",
  spaceId: "space-1",
  email: "ada@firma.example",
  isDeploymentOwner: false,
};

const logos: OrganizationLogoStore = {
  put: vi.fn(async () => undefined),
  get: vi.fn(async () => null),
};

function prisma(role: string | null): PrismaClient {
  return {
    space: { findUnique: async () => ({ organizationId: "org-1" }) },
    member: { findUnique: async () => (role === null ? null : { role }) },
    organizationProfile: { findUnique: async () => null },
  } as unknown as PrismaClient;
}

describe("organization settings permissions", () => {
  it("lets an owner or admin read settings", async () => {
    await expect(
      readOrganizationSettingsForActor(prisma("owner"), logos, actor),
    ).resolves.toMatchObject({
      legalName: "",
      lawyers: [],
    });
    await expect(
      readOrganizationSettingsForActor(prisma("admin"), logos, actor),
    ).resolves.toMatchObject({
      legalName: "",
    });
  });

  it("refuses a member and a user outside the organization", async () => {
    await expect(
      readOrganizationSettingsForActor(prisma("member"), logos, actor),
    ).rejects.toBeInstanceOf(ORPCError);
    await expect(
      readOrganizationSettingsForActor(prisma(null), logos, actor),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const update = updateOrganizationSettingsForActor(prisma("member"), logos, actor, {
      legalName: "Firma",
      tradeName: "",
      rnc: "",
      addressLine: "",
      cityProvince: "",
      phone: "",
      email: "",
      website: "",
      bankName: "",
      bankAccount: "",
      invoiceFooter: "",
      accentColor: null,
      minimumReviewSeconds: 60,
      lawyers: [],
    });
    await expect(update).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

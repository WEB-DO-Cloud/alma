import { randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type {
  Actor,
  OrganizationLogoUpload,
  OrganizationSettings,
  OrganizationSettingsUpdate,
} from "@rakazo/contracts";
import {
  decodeOrganizationLogo,
  isOrganizationLogoMime,
  organizationLogoBytesMatch,
} from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import {
  activeOrganizationLawyers,
  isOrganizationAdmin,
  loadOrganizationSettings,
  OrganizationSettingsError,
  organizationRoleForMember,
  recordOrganizationLogo,
  saveOrganizationSettings,
} from "@rakazo/db";
import { type OrganizationLogoStore, organizationLogoKey } from "./organization-logo-store.js";

function settingsError(error: unknown): never {
  if (error instanceof OrganizationSettingsError) {
    throw new ORPCError("BAD_REQUEST", { message: error.message });
  }
  throw error;
}

async function requireOrganizationAdmin(prisma: PrismaClient, actor: Actor) {
  const membership = await organizationRoleForMember(prisma, actor);
  if (!membership || !isOrganizationAdmin(membership.role)) throw new ORPCError("FORBIDDEN");
  return membership;
}

function dataUrl(mimeType: string, bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.byteLength; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function present(
  prisma: PrismaClient,
  logos: OrganizationLogoStore,
  organizationId: string,
): Promise<OrganizationSettings> {
  const loaded = await loadOrganizationSettings(prisma, organizationId);
  const lawyers = activeOrganizationLawyers(loaded.state).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  let logo: OrganizationSettings["logo"] = null;
  if (loaded.logo && isOrganizationLogoMime(loaded.logo.mimeType)) {
    const bytes = await logos.get(loaded.logo.storageKey);
    logo = {
      id: loaded.logo.id,
      mimeType: loaded.logo.mimeType,
      dataUrl: bytes ? dataUrl(loaded.logo.mimeType, bytes) : null,
    };
  }
  return {
    legalName: loaded.state.legalName,
    tradeName: loaded.state.tradeName,
    rnc: loaded.state.rnc,
    addressLine: loaded.state.addressLine,
    cityProvince: loaded.state.cityProvince,
    phone: loaded.state.phone,
    email: loaded.state.email,
    website: loaded.state.website,
    bankName: loaded.state.bankName,
    bankAccount: loaded.state.bankAccount,
    invoiceFooter: loaded.state.invoiceFooter,
    accentColor: loaded.state.accentColor,
    logo,
    lawyers: lawyers.map((lawyer) => ({
      id: lawyer.id,
      name: lawyer.name,
      cardNumber: lawyer.cardNumber,
      email: lawyer.email,
      mayApproveDrafts: lawyer.mayApproveDrafts,
    })),
  };
}

export async function readOrganizationSettingsForActor(
  prisma: PrismaClient,
  logos: OrganizationLogoStore,
  actor: Actor,
): Promise<OrganizationSettings> {
  const membership = await requireOrganizationAdmin(prisma, actor);
  return present(prisma, logos, membership.organizationId);
}

export async function updateOrganizationSettingsForActor(
  prisma: PrismaClient,
  logos: OrganizationLogoStore,
  actor: Actor,
  update: OrganizationSettingsUpdate,
): Promise<OrganizationSettings> {
  const membership = await requireOrganizationAdmin(prisma, actor);
  try {
    await saveOrganizationSettings(prisma, {
      organizationId: membership.organizationId,
      actorUserId: actor.userId,
      update,
    });
  } catch (error) {
    settingsError(error);
  }
  return present(prisma, logos, membership.organizationId);
}

export async function uploadOrganizationLogoForActor(
  prisma: PrismaClient,
  logos: OrganizationLogoStore,
  actor: Actor,
  upload: OrganizationLogoUpload,
): Promise<OrganizationSettings> {
  const membership = await requireOrganizationAdmin(prisma, actor);
  const bytes = decodeOrganizationLogo(upload.contentBase64);
  if (!bytes || !organizationLogoBytesMatch(bytes, upload.mimeType)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Logo must be a PNG, JPG, or SVG file up to 1 MB.",
    });
  }
  const id = randomUUID();
  const storageKey = organizationLogoKey(membership.organizationId, id);
  await logos.put(storageKey, bytes);
  try {
    await recordOrganizationLogo(prisma, {
      organizationId: membership.organizationId,
      actorUserId: actor.userId,
      logo: { id, mimeType: upload.mimeType, byteSize: bytes.byteLength, storageKey },
    });
  } catch (error) {
    settingsError(error);
  }
  return present(prisma, logos, membership.organizationId);
}

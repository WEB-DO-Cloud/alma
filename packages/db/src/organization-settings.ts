import { randomUUID } from "node:crypto";
import type { OrganizationSettingsUpdate } from "@rakazo/contracts";
import type { Prisma, PrismaClient } from "./client.js";

const MAX_STORED_LAWYERS = 500;
const MAX_STORED_LOGOS = 100;

export class OrganizationSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationSettingsError";
  }
}

/** Owner and admin may edit the firm. Member roles, including comma-separated Better Auth lists, may not. */
export function isOrganizationAdmin(role: string | null | undefined): boolean {
  if (!role) return false;
  return role
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .some((part) => part === "owner" || part === "admin");
}

export async function organizationRoleForMember(
  prisma: PrismaClient,
  input: { spaceId: string; userId: string },
): Promise<{ organizationId: string; role: string } | null> {
  const space = await prisma.space.findUnique({
    where: { id: input.spaceId },
    select: { organizationId: true },
  });
  if (!space) return null;
  const member = await prisma.member.findUnique({
    where: {
      organizationId_userId: { organizationId: space.organizationId, userId: input.userId },
    },
    select: { role: true },
  });
  if (!member) return null;
  return { organizationId: space.organizationId, role: member.role };
}

/**
 * Route tests build partial database doubles that never reach organization tables.
 * A missing delegate means this process is not a real client, so the member is not an admin.
 */
export async function actorCanManageOrganization(
  prisma: PrismaClient,
  actor: { userId: string; spaceId: string },
): Promise<boolean> {
  const client = prisma as PrismaClient & {
    space?: { findUnique?: unknown };
    member?: { findUnique?: unknown };
  };
  if (
    typeof client.space?.findUnique !== "function" ||
    typeof client.member?.findUnique !== "function"
  ) {
    return false;
  }
  const membership = await organizationRoleForMember(prisma, actor);
  return isOrganizationAdmin(membership?.role);
}

export interface OrganizationLawyerState {
  id: string;
  name: string;
  cardNumber: string;
  email: string;
  mayApproveDrafts: boolean;
  archivedAt: string | null;
}

export interface OrganizationSettingsState {
  legalName: string;
  tradeName: string;
  rnc: string;
  logoId: string | null;
  addressLine: string;
  cityProvince: string;
  phone: string;
  email: string;
  website: string;
  bankName: string;
  bankAccount: string;
  invoiceFooter: string;
  accentColor: string | null;
  minimumReviewSeconds: number;
  lawyers: OrganizationLawyerState[];
}

export interface OrganizationLogoRecord {
  id: string;
  mimeType: string;
  storageKey: string;
}

export interface LoadedOrganizationSettings {
  state: OrganizationSettingsState;
  logo: OrganizationLogoRecord | null;
}

export function emptyOrganizationSettingsState(): OrganizationSettingsState {
  return {
    legalName: "",
    tradeName: "",
    rnc: "",
    logoId: null,
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
  };
}

/** Stable shape stored in the audit log. Logo bytes stay in file storage. */
export function organizationSettingsSnapshot(state: OrganizationSettingsState) {
  return {
    legalName: state.legalName,
    tradeName: state.tradeName,
    rnc: state.rnc,
    logoId: state.logoId,
    addressLine: state.addressLine,
    cityProvince: state.cityProvince,
    phone: state.phone,
    email: state.email,
    website: state.website,
    bankName: state.bankName,
    bankAccount: state.bankAccount,
    invoiceFooter: state.invoiceFooter,
    accentColor: state.accentColor,
    minimumReviewSeconds: state.minimumReviewSeconds,
    lawyers: [...state.lawyers]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((lawyer) => ({
        id: lawyer.id,
        name: lawyer.name,
        cardNumber: lawyer.cardNumber,
        email: lawyer.email,
        mayApproveDrafts: lawyer.mayApproveDrafts,
        archivedAt: lawyer.archivedAt,
      })),
  };
}

export function organizationSettingsChanged(
  before: OrganizationSettingsState,
  after: OrganizationSettingsState,
): boolean {
  return (
    JSON.stringify(organizationSettingsSnapshot(before)) !==
    JSON.stringify(organizationSettingsSnapshot(after))
  );
}

export interface PlannedOrganizationSettings {
  next: OrganizationSettingsState;
  create: OrganizationLawyerState[];
  update: OrganizationLawyerState[];
  archive: OrganizationLawyerState[];
}

/**
 * The next firm record. Lawyers omitted from the update are archived, never removed.
 * An id that is not an active lawyer is rejected so an archived record stays archived.
 */
export function planOrganizationSettingsChange(
  current: OrganizationSettingsState,
  update: OrganizationSettingsUpdate,
  options: { now: Date; newId: () => string },
): PlannedOrganizationSettings {
  const active = new Map(
    current.lawyers
      .filter((lawyer) => lawyer.archivedAt === null)
      .map((lawyer) => [lawyer.id, lawyer]),
  );
  const kept = new Set<string>();
  const create: OrganizationLawyerState[] = [];
  const changed: OrganizationLawyerState[] = [];
  const nowIso = options.now.toISOString();
  for (const lawyer of update.lawyers) {
    if (!lawyer.id) {
      create.push({
        id: options.newId(),
        name: lawyer.name,
        cardNumber: lawyer.cardNumber,
        email: lawyer.email,
        mayApproveDrafts: lawyer.mayApproveDrafts,
        archivedAt: null,
      });
      continue;
    }
    const existing = active.get(lawyer.id);
    if (!existing) {
      throw new OrganizationSettingsError("That lawyer is not an active member of this firm.");
    }
    kept.add(lawyer.id);
    const nextLawyer = {
      ...existing,
      name: lawyer.name,
      cardNumber: lawyer.cardNumber,
      email: lawyer.email,
      mayApproveDrafts: lawyer.mayApproveDrafts,
    };
    if (JSON.stringify(nextLawyer) !== JSON.stringify(existing)) changed.push(nextLawyer);
  }
  if (current.lawyers.length + create.length > MAX_STORED_LAWYERS) {
    throw new OrganizationSettingsError("This firm has the maximum number of stored lawyers.");
  }
  const archive = [...active.values()]
    .filter((lawyer) => !kept.has(lawyer.id))
    .map((lawyer) => ({ ...lawyer, archivedAt: nowIso }));
  const byId = new Map(current.lawyers.map((lawyer) => [lawyer.id, lawyer]));
  for (const lawyer of [...changed, ...archive, ...create]) byId.set(lawyer.id, lawyer);
  return {
    next: {
      ...current,
      legalName: update.legalName,
      tradeName: update.tradeName,
      rnc: update.rnc,
      addressLine: update.addressLine,
      cityProvince: update.cityProvince,
      phone: update.phone,
      email: update.email,
      website: update.website,
      bankName: update.bankName,
      bankAccount: update.bankAccount,
      invoiceFooter: update.invoiceFooter,
      accentColor: update.accentColor,
      minimumReviewSeconds: update.minimumReviewSeconds,
      lawyers: [...byId.values()],
    },
    create,
    update: changed,
    archive,
  };
}

type OrganizationDb = Pick<
  PrismaClient,
  "organizationProfile" | "organizationLawyer" | "organizationLogo" | "organizationSettingsAudit"
>;

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function profileFields(state: OrganizationSettingsState) {
  return {
    legalName: state.legalName,
    tradeName: state.tradeName,
    rnc: state.rnc,
    logoId: state.logoId,
    addressLine: state.addressLine,
    cityProvince: state.cityProvince,
    phone: state.phone,
    email: state.email,
    website: state.website,
    bankName: state.bankName,
    bankAccount: state.bankAccount,
    invoiceFooter: state.invoiceFooter,
    accentColor: state.accentColor,
    minimumReviewSeconds: state.minimumReviewSeconds,
  };
}

export async function loadOrganizationSettings(
  prisma: OrganizationDb,
  organizationId: string,
): Promise<LoadedOrganizationSettings> {
  const profile = await prisma.organizationProfile.findUnique({
    where: { organizationId },
    include: { lawyers: true, logo: true },
  });
  if (!profile) return { state: emptyOrganizationSettingsState(), logo: null };
  return {
    state: {
      legalName: profile.legalName,
      tradeName: profile.tradeName,
      rnc: profile.rnc,
      logoId: profile.logoId,
      addressLine: profile.addressLine,
      cityProvince: profile.cityProvince,
      phone: profile.phone,
      email: profile.email,
      website: profile.website,
      bankName: profile.bankName,
      bankAccount: profile.bankAccount,
      invoiceFooter: profile.invoiceFooter,
      accentColor: profile.accentColor,
      minimumReviewSeconds: profile.minimumReviewSeconds ?? 60,
      lawyers: profile.lawyers.map((lawyer) => ({
        id: lawyer.id,
        name: lawyer.name,
        cardNumber: lawyer.cardNumber,
        email: lawyer.email,
        mayApproveDrafts: lawyer.mayApproveDrafts,
        archivedAt: iso(lawyer.archivedAt),
      })),
    },
    logo: profile.logo
      ? {
          id: profile.logo.id,
          mimeType: profile.logo.mimeType,
          storageKey: profile.logo.storageKey,
        }
      : null,
  };
}

async function writeProfile(
  prisma: OrganizationDb,
  organizationId: string,
  state: OrganizationSettingsState,
) {
  const data = profileFields(state);
  await prisma.organizationProfile.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });
}

async function appendAudit(
  prisma: OrganizationDb,
  input: {
    organizationId: string;
    actorUserId: string;
    action: "settings.update" | "logo.upload";
    before: OrganizationSettingsState;
    after: OrganizationSettingsState;
  },
) {
  await prisma.organizationSettingsAudit.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: input.action,
      before: organizationSettingsSnapshot(input.before) as Prisma.InputJsonValue,
      after: organizationSettingsSnapshot(input.after) as Prisma.InputJsonValue,
    },
  });
}

export async function saveOrganizationSettings(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    actorUserId: string;
    update: OrganizationSettingsUpdate;
    now?: Date;
    newId?: () => string;
  },
): Promise<OrganizationSettingsState> {
  const now = input.now ?? new Date();
  const newId = input.newId ?? randomUUID;
  return prisma.$transaction(async (tx) => {
    const loaded = await loadOrganizationSettings(tx, input.organizationId);
    const planned = planOrganizationSettingsChange(loaded.state, input.update, { now, newId });
    if (!organizationSettingsChanged(loaded.state, planned.next)) return loaded.state;
    await writeProfile(tx, input.organizationId, planned.next);
    for (const lawyer of planned.create) {
      await tx.organizationLawyer.create({
        data: {
          id: lawyer.id,
          organizationId: input.organizationId,
          name: lawyer.name,
          cardNumber: lawyer.cardNumber,
          email: lawyer.email,
          mayApproveDrafts: lawyer.mayApproveDrafts,
        },
      });
    }
    for (const lawyer of planned.update) {
      await tx.organizationLawyer.update({
        where: { id: lawyer.id },
        data: {
          name: lawyer.name,
          cardNumber: lawyer.cardNumber,
          email: lawyer.email,
          mayApproveDrafts: lawyer.mayApproveDrafts,
        },
      });
    }
    for (const lawyer of planned.archive) {
      await tx.organizationLawyer.update({
        where: { id: lawyer.id },
        data: { archivedAt: new Date(lawyer.archivedAt ?? now.toISOString()) },
      });
    }
    await appendAudit(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "settings.update",
      before: loaded.state,
      after: planned.next,
    });
    return planned.next;
  });
}

export async function recordOrganizationLogo(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    actorUserId: string;
    logo: { id: string; mimeType: string; byteSize: number; storageKey: string };
  },
): Promise<OrganizationSettingsState> {
  return prisma.$transaction(async (tx) => {
    const stored = await tx.organizationLogo.count({
      where: { organizationId: input.organizationId },
    });
    if (stored >= MAX_STORED_LOGOS) {
      throw new OrganizationSettingsError("This firm has the maximum number of stored logos.");
    }
    const loaded = await loadOrganizationSettings(tx, input.organizationId);
    await tx.organizationLogo.create({
      data: {
        id: input.logo.id,
        organizationId: input.organizationId,
        mimeType: input.logo.mimeType,
        byteSize: input.logo.byteSize,
        storageKey: input.logo.storageKey,
        createdByUserId: input.actorUserId,
      },
    });
    const next = { ...loaded.state, logoId: input.logo.id };
    await writeProfile(tx, input.organizationId, next);
    await appendAudit(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "logo.upload",
      before: loaded.state,
      after: next,
    });
    return next;
  });
}

export function activeOrganizationLawyers(state: OrganizationSettingsState) {
  return state.lawyers.filter((lawyer) => lawyer.archivedAt === null);
}

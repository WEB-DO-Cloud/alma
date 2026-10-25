import * as z from "zod";
import { Id } from "./ids.js";

/** Decoded logo bytes. A letterhead image, not a document. */
export const ORGANIZATION_LOGO_MAX_BYTES = 1024 * 1024;
export const ORGANIZATION_LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/svg+xml"] as const;
export type OrganizationLogoMime = (typeof ORGANIZATION_LOGO_MIME_TYPES)[number];

export const MAX_ORGANIZATION_LAWYERS = 40;

const RNC_MESSAGE = "RNC must be 9 digits (company) or 11 digits (cédula).";

/**
 * Dominican tax id: 9 digits for a company RNC, 11 for a cédula.
 * Dashes and spaces are optional. Anything else is rejected. Empty is unset.
 */
export function normalizeRnc(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^[\d\s-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/[\s-]/g, "");
  if (digits.length !== 9 && digits.length !== 11) return null;
  return digits;
}

/** `1-01-12345-6` for a company, `001-1234567-8` for a cédula. Other strings pass through. */
export function formatRnc(digits: string): string {
  if (digits.length === 9) {
    return `${digits.slice(0, 1)}-${digits.slice(1, 3)}-${digits.slice(3, 8)}-${digits.slice(8)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`;
  }
  return digits;
}

export function isOrganizationLogoMime(value: string): value is OrganizationLogoMime {
  return (ORGANIZATION_LOGO_MIME_TYPES as readonly string[]).includes(value);
}

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.byteLength < magic.length) return false;
  return magic.every((byte, index) => bytes[index] === byte);
}

function svgIsSafe(bytes: Uint8Array): boolean {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^\uFEFF/, "");
  const trimmed = text.trimStart();
  if (!/^(?:<\?xml[\s\S]*?\?>\s*)?<svg[\s>]/i.test(trimmed)) return false;
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) return false;
  if (/<script[\s>/]/i.test(text)) return false;
  if (/<(?:foreignObject|iframe|embed|object|link|meta|base)[\s>/]/i.test(text)) return false;
  if (/\son[a-z]+\s*=/i.test(text)) return false;
  if (/javascript\s*:/i.test(text)) return false;
  if (/data\s*:\s*text\/html/i.test(text)) return false;
  return true;
}

/** True when the bytes are a PNG, JPEG, or a script-free SVG of the declared type. */
export function organizationLogoBytesMatch(bytes: Uint8Array, mimeType: string): boolean {
  if (bytes.byteLength === 0 || bytes.byteLength > ORGANIZATION_LOGO_MAX_BYTES) return false;
  if (mimeType === "image/png")
    return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimeType === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (mimeType === "image/svg+xml") return svgIsSafe(bytes);
  return false;
}

export function decodeOrganizationLogo(contentBase64: string): Uint8Array | null {
  const compact = contentBase64.replace(/\s/g, "");
  if (!compact || compact.length > 2_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact))
    return null;
  try {
    const binary = atob(compact);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

const boundedText = (max: number) => z.string().trim().max(max);

const RncSchema = boundedText(20).superRefine((value, ctx) => {
  if (normalizeRnc(value) === null) ctx.addIssue({ code: "custom", message: RNC_MESSAGE });
});

const AccentColorSchema = boundedText(7).superRefine((value, ctx) => {
  if (value !== "" && !/^#[0-9A-Fa-f]{6}$/.test(value)) {
    ctx.addIssue({ code: "custom", message: "Use a color like #1F4B3A." });
  }
});

const WebsiteSchema = boundedText(200).superRefine((value, ctx) => {
  if (value !== "" && !/^https?:\/\/\S+$/i.test(value)) {
    ctx.addIssue({ code: "custom", message: "Website must start with http:// or https://." });
  }
});

const PhoneSchema = boundedText(40).superRefine((value, ctx) => {
  if (value !== "" && !/^[0-9+().\-\s]+$/.test(value)) {
    ctx.addIssue({ code: "custom", message: "Enter a phone number." });
  }
});

const OptionalEmailSchema = boundedText(200).superRefine((value, ctx) => {
  if (value !== "" && !z.string().email().safeParse(value).success) {
    ctx.addIssue({ code: "custom", message: "Enter an email address." });
  }
});

export const OrganizationLawyerInputSchema = z.object({
  id: Id.optional(),
  name: boundedText(120).min(1),
  cardNumber: boundedText(32)
    .min(1)
    .regex(/^[A-Za-z0-9-]+$/, "Enter the CARD membership number."),
  email: z.string().trim().email().max(200),
  mayApproveDrafts: z.boolean(),
});

export const OrganizationSettingsUpdateSchema = z
  .object({
    legalName: boundedText(200),
    tradeName: boundedText(200),
    rnc: RncSchema,
    addressLine: boundedText(300),
    cityProvince: boundedText(120),
    phone: PhoneSchema,
    email: OptionalEmailSchema,
    website: WebsiteSchema,
    bankName: boundedText(120),
    bankAccount: boundedText(64),
    invoiceFooter: boundedText(500),
    accentColor: AccentColorSchema,
    minimumReviewSeconds: z.number().int().min(30).max(1800).default(60),
    lawyers: z.array(OrganizationLawyerInputSchema).max(MAX_ORGANIZATION_LAWYERS),
  })
  .superRefine((input, ctx) => {
    const ids = new Set<string>();
    const cards = new Set<string>();
    for (const [index, lawyer] of input.lawyers.entries()) {
      if (lawyer.id) {
        if (ids.has(lawyer.id)) {
          ctx.addIssue({
            code: "custom",
            message: "Each lawyer can only be listed once.",
            path: ["lawyers", index, "id"],
          });
        }
        ids.add(lawyer.id);
      }
      const card = lawyer.cardNumber.toLowerCase();
      if (cards.has(card)) {
        ctx.addIssue({
          code: "custom",
          message: "Each CARD membership number can only be listed once.",
          path: ["lawyers", index, "cardNumber"],
        });
      }
      cards.add(card);
    }
  })
  .transform((input) => ({
    ...input,
    rnc: normalizeRnc(input.rnc) ?? "",
    accentColor: input.accentColor === "" ? null : input.accentColor.toUpperCase(),
  }));

export type OrganizationSettingsUpdate = z.infer<typeof OrganizationSettingsUpdateSchema>;

export const OrganizationLawyerSchema = z.object({
  id: Id,
  name: z.string(),
  cardNumber: z.string(),
  email: z.string().email(),
  mayApproveDrafts: z.boolean(),
});
export type OrganizationLawyer = z.infer<typeof OrganizationLawyerSchema>;

export const OrganizationLogoSchema = z.object({
  id: Id,
  mimeType: z.enum(ORGANIZATION_LOGO_MIME_TYPES),
  dataUrl: z.string().nullable(),
});

export const OrganizationSettingsSchema = z.object({
  legalName: z.string(),
  tradeName: z.string(),
  rnc: z.string(),
  addressLine: z.string(),
  cityProvince: z.string(),
  phone: z.string(),
  email: z.string(),
  website: z.string(),
  bankName: z.string(),
  bankAccount: z.string(),
  invoiceFooter: z.string(),
  accentColor: z.string().nullable(),
  /** Base seconds a lawyer must keep a draft open. Longer drafts add more time. */
  minimumReviewSeconds: z.number().int().min(30).max(1800),
  logo: OrganizationLogoSchema.nullable(),
  lawyers: z.array(OrganizationLawyerSchema),
});
export type OrganizationSettings = z.infer<typeof OrganizationSettingsSchema>;

export const OrganizationLogoUploadSchema = z.object({
  mimeType: z.enum(ORGANIZATION_LOGO_MIME_TYPES),
  contentBase64: z.string().min(1).max(2_000_000),
});
export type OrganizationLogoUpload = z.infer<typeof OrganizationLogoUploadSchema>;

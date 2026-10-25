import type { OrganizationLawyer, OrganizationSettings } from "@rakazo/contracts";
import { formatRnc } from "@rakazo/contracts";

/**
 * Letterhead for drafts, invoices, contracts, and letters.
 *
 * Future templates:
 * 1. Load `OrganizationSettings` for the caller's organization. Admins edit that
 *    record; document rendering reads the same one.
 * 2. Build `organizationLetterhead(settings, { logoDataUrl })`.
 * 3. Before export, call `assertNamedApprover(letterhead, lawyerId)` with a lawyer
 *    whose `mayApproveDrafts` is true. Review time and the draft-to-final diff
 *    are recorded beside that check when export exists.
 * 4. Render with `renderDraftDocumentHtml`, which requires that lawyer, or place
 *    `headerHtml` and `footerHtml` in another template and call the same check.
 *
 * `accentColor` is for these documents. The app UI keeps ALMA branding.
 * The document says "Borrador para revisión".
 */
export interface OrganizationLetterhead {
  displayName: string;
  legalName: string;
  tradeName: string;
  rnc: string;
  rncFormatted: string;
  addressLine: string;
  cityProvince: string;
  phone: string;
  email: string;
  website: string;
  accentColor: string | null;
  logo: { id: string; mimeType: string; dataUrl: string | null } | null;
  lawyers: OrganizationLawyer[];
  /** Lawyers who may approve drafts for review before export. */
  approvingLawyers: OrganizationLawyer[];
  invoice: { bankName: string; bankAccount: string; footer: string } | null;
  headerText: string;
  footerText: string;
  headerHtml: string;
  footerHtml: string;
}

export class DraftApprovalError extends Error {
  constructor(message = "Name a lawyer who may approve drafts before export.") {
    super(message);
    this.name = "DraftApprovalError";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function lines(...values: Array<string | null | undefined>): string[] {
  return values.map((value) => value?.trim() ?? "").filter((value) => value.length > 0);
}

export function organizationLetterhead(
  settings: OrganizationSettings,
  options: { logoDataUrl?: string | null } = {},
): OrganizationLetterhead {
  const displayName = settings.tradeName.trim() || settings.legalName.trim();
  const rncFormatted = formatRnc(settings.rnc);
  const approvingLawyers = settings.lawyers.filter((lawyer) => lawyer.mayApproveDrafts);
  const invoice =
    settings.bankName || settings.bankAccount || settings.invoiceFooter
      ? {
          bankName: settings.bankName,
          bankAccount: settings.bankAccount,
          footer: settings.invoiceFooter,
        }
      : null;
  const logo = settings.logo
    ? {
        id: settings.logo.id,
        mimeType: settings.logo.mimeType,
        dataUrl: options.logoDataUrl ?? settings.logo.dataUrl,
      }
    : null;
  const accent =
    settings.accentColor && /^#[0-9A-F]{6}$/.test(settings.accentColor)
      ? settings.accentColor
      : null;
  const contact = lines(
    settings.phone ? `Tel. ${settings.phone}` : "",
    settings.email ? `Correo ${settings.email}` : "",
    settings.website,
  ).join(" · ");
  const headerText = lines(
    displayName,
    settings.tradeName.trim() && settings.legalName.trim() ? settings.legalName : "",
    rncFormatted ? `RNC ${rncFormatted}` : "",
    settings.addressLine,
    settings.cityProvince,
    contact,
  ).join("\n");
  const footerText = lines(
    "Borrador para revisión",
    invoice?.bankName ? `Banco ${invoice.bankName}` : "",
    invoice?.bankAccount ? `Cuenta ${invoice.bankAccount}` : "",
    invoice?.footer,
  ).join("\n");
  const logoHtml = logo?.dataUrl
    ? `<img alt="" src="${escapeHtml(logo.dataUrl)}" style="max-height:64px;max-width:220px"/>`
    : "";
  const headerHtml = `<header style="border-top:4px solid ${accent ?? "#111111"};padding-top:12px;font-family:Georgia,serif;color:#111111">${logoHtml}<p style="margin:8px 0 0;font-size:18px"><strong>${escapeHtml(displayName)}</strong></p>${
    settings.tradeName.trim() && settings.legalName.trim()
      ? `<p style="margin:2px 0 0">${escapeHtml(settings.legalName)}</p>`
      : ""
  }${rncFormatted ? `<p style="margin:2px 0 0">RNC ${escapeHtml(rncFormatted)}</p>` : ""}${
    settings.addressLine || settings.cityProvince
      ? `<p style="margin:2px 0 0">${escapeHtml(lines(settings.addressLine, settings.cityProvince).join(", "))}</p>`
      : ""
  }${contact ? `<p style="margin:2px 0 0">${escapeHtml(contact)}</p>` : ""}</header>`;
  const footerHtml = `<footer style="margin-top:24px;border-top:1px solid #cccccc;padding-top:8px;font-family:Georgia,serif;color:#111111"><p>Borrador para revisión</p>${
    invoice?.bankName ? `<p>Banco ${escapeHtml(invoice.bankName)}</p>` : ""
  }${invoice?.bankAccount ? `<p>Cuenta ${escapeHtml(invoice.bankAccount)}</p>` : ""}${
    invoice?.footer ? `<p>${escapeHtml(invoice.footer)}</p>` : ""
  }</footer>`;
  return {
    displayName,
    legalName: settings.legalName,
    tradeName: settings.tradeName,
    rnc: settings.rnc,
    rncFormatted,
    addressLine: settings.addressLine,
    cityProvince: settings.cityProvince,
    phone: settings.phone,
    email: settings.email,
    website: settings.website,
    accentColor: accent,
    logo,
    lawyers: settings.lawyers,
    approvingLawyers,
    invoice,
    headerText,
    footerText,
    headerHtml,
    footerHtml,
  };
}

/** The named lawyer who may approve this draft. Export calls this before the file leaves the firm. */
export function assertNamedApprover(
  letterhead: OrganizationLetterhead,
  lawyerId: string,
): OrganizationLawyer {
  const lawyer = letterhead.approvingLawyers.find((candidate) => candidate.id === lawyerId);
  if (!lawyer) throw new DraftApprovalError();
  return lawyer;
}

/**
 * A full HTML document with the firm letterhead. `bodyHtml` is inserted as HTML and must
 * already be escaped by the template. `reviewingLawyerId` has to be a lawyer who may approve drafts.
 */
export function renderDraftDocumentHtml(input: {
  title: string;
  bodyHtml: string;
  letterhead: OrganizationLetterhead;
  reviewingLawyerId: string;
}): string {
  const lawyer = assertNamedApprover(input.letterhead, input.reviewingLawyerId);
  const accent = input.letterhead.accentColor ?? "#111111";
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>${escapeHtml(input.title)}</title></head><body style="margin:32px;color:#111111;font-family:Georgia,serif">${input.letterhead.headerHtml}<article><p style="margin-top:20px;letter-spacing:0.04em;text-transform:uppercase;color:${accent}">Borrador para revisión</p><h1 style="font-size:22px;font-weight:normal">${escapeHtml(input.title)}</h1>${input.bodyHtml}<p>Revisión: ${escapeHtml(lawyer.name)} · CARD ${escapeHtml(lawyer.cardNumber)}</p></article>${input.letterhead.footerHtml}</body></html>`;
}

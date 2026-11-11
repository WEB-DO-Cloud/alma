import { createHmac, timingSafeEqual } from "node:crypto";

/** Narrow scopes by default. `restricted` is the wider set, and only that exact word selects it. */
export type GoogleScopeMode = "limited" | "restricted";

export type GoogleAppProvider = "gmail" | "googlecalendar" | "googledrive";

export const GOOGLE_SCOPES = {
  gmailSend: "https://www.googleapis.com/auth/gmail.send",
  gmailReadonly: "https://www.googleapis.com/auth/gmail.readonly",
  gmailCompose: "https://www.googleapis.com/auth/gmail.compose",
  calendarList: "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  calendarEvents: "https://www.googleapis.com/auth/calendar.events",
  driveFile: "https://www.googleapis.com/auth/drive.file",
  driveReadonly: "https://www.googleapis.com/auth/drive.readonly",
} as const;

const CALENDAR_SCOPES = [GOOGLE_SCOPES.calendarList, GOOGLE_SCOPES.calendarEvents] as const;

const MAILBOX_TOOLS = new Set([
  "gmail_list_labels",
  "gmail_search_threads",
  "gmail_read_thread",
  "gmail_create_draft",
]);

const PICKED_DRIVE_TOOLS = new Set(["drive_list_picked", "drive_read_file"]);

const PICKER_KEY = /^[A-Za-z0-9_-]{20,128}$/;
const PROJECT_NUMBER = /^\d{6,20}$/;
const TICKET_TTL_MS = 10 * 60 * 1000;

export type GooglePickerEnv = { apiKey: string; appId: string };

export type DrivePick = { id: string; name: string; mimeType: string };

const FILE_ID = /^[A-Za-z0-9_-]{10,128}$/;

export function readGoogleScopeMode(source: NodeJS.ProcessEnv): GoogleScopeMode {
  return source.ALMA_GOOGLE_SCOPE_MODE?.trim() === "restricted" ? "restricted" : "limited";
}

/** Both picker settings, or null when both are unset. One without the other refuses to start. */
export function readGooglePickerEnv(source: NodeJS.ProcessEnv): GooglePickerEnv | null {
  const apiKey = source.ALMA_GOOGLE_PICKER_API_KEY?.trim() ?? "";
  const appId = source.ALMA_GOOGLE_PICKER_APP_ID?.trim() ?? "";
  if (!apiKey && !appId) return null;
  if (!apiKey || !appId) {
    throw new Error("Set ALMA_GOOGLE_PICKER_API_KEY and ALMA_GOOGLE_PICKER_APP_ID together");
  }
  if (!PICKER_KEY.test(apiKey))
    throw new Error("ALMA_GOOGLE_PICKER_API_KEY must be a Google API key");
  if (!PROJECT_NUMBER.test(appId)) {
    throw new Error("ALMA_GOOGLE_PICKER_APP_ID must be the Cloud project number");
  }
  return { apiKey, appId };
}

export function googleAppScopes(
  mode: GoogleScopeMode,
  provider: GoogleAppProvider,
): readonly string[] {
  if (provider === "googlecalendar") return CALENDAR_SCOPES;
  if (provider === "gmail") {
    return mode === "limited"
      ? [GOOGLE_SCOPES.gmailSend]
      : [GOOGLE_SCOPES.gmailReadonly, GOOGLE_SCOPES.gmailCompose];
  }
  return mode === "limited" ? [GOOGLE_SCOPES.driveFile] : [GOOGLE_SCOPES.driveReadonly];
}

/**
 * The scopes to store. An omitted scope field means Google returned the set we requested.
 * A different set is refused so a wider token is not kept.
 */
export function acceptedScopes(
  scopeField: unknown,
  requested: readonly string[],
): readonly string[] | null {
  if (scopeField === undefined) return requested;
  if (typeof scopeField !== "string") return null;
  const granted = scopeField.split(/\s+/).filter(Boolean);
  if (granted.length !== requested.length) return null;
  if (!requested.every((scope) => granted.includes(scope))) return null;
  return requested;
}

/** A missing scope list is a grant from before this mode existed, which requested the restricted set. */
export function grantUsable(
  mode: GoogleScopeMode,
  provider: GoogleAppProvider,
  granted: readonly string[] | undefined,
): boolean {
  const required = googleAppScopes(mode, provider);
  const have = granted ?? googleAppScopes("restricted", provider);
  return required.every((scope) => have.includes(scope));
}

export function toolVisible(mode: GoogleScopeMode, name: string): boolean {
  if (mode === "restricted") return !PICKED_DRIVE_TOOLS.has(name);
  if (MAILBOX_TOOLS.has(name) || name === "drive_search_files") return false;
  return true;
}

export function googleAppSummary(mode: GoogleScopeMode, provider: GoogleAppProvider): string {
  if (provider === "gmail") {
    return mode === "limited" ? "Send email you approve." : "Search, read, draft, and send email.";
  }
  if (provider === "googlecalendar") return "List calendars and add events you approve.";
  return mode === "limited" ? "Read files you choose." : "Search files in Drive.";
}

const LIMITED_USE =
  "Los datos de Google se usan según la Política de datos de usuario de los servicios de API de Google, incluido el uso limitado (Limited Use), y no se usan para entrenar modelos.\n\nGoogle user data follows the Google API Services User Data Policy, including Limited Use, and is not used to train models.";

export function googleAppNotice(mode: GoogleScopeMode, provider: GoogleAppProvider): string {
  if (provider === "gmail") {
    const access =
      mode === "limited"
        ? "ALMA solo envía correos que apruebas en el chat. No lee tu bandeja.\n\nALMA only sends mail you approve in the chat. It does not read your inbox."
        : "ALMA puede buscar y leer tu correo, crear borradores y enviar correos que apruebas.\n\nALMA can search and read your mail, create drafts, and send mail you approve.";
    return `${access}\n\n${LIMITED_USE}`;
  }
  if (provider === "googlecalendar") {
    return `ALMA lista tus calendarios y, cuando lo apruebas, crea eventos.\n\nALMA lists your calendars and, after you approve, creates events.\n\n${LIMITED_USE}`;
  }
  const access =
    mode === "limited"
      ? "ALMA solo lee archivos de Drive que eliges. No busca el resto de tu Drive.\n\nALMA only reads Drive files you pick. It does not search the rest of your Drive."
      : "ALMA busca archivos en tu Drive cuando se lo pides.\n\nALMA searches your Drive when you ask.";
  return `${access}\n\n${LIMITED_USE}`;
}

export function signDrivePickerTicket(
  key: string,
  claims: { grantId: string; spaceId: string; userId: string },
  now: number,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      g: claims.grantId,
      s: claims.spaceId,
      u: claims.userId,
      e: now + TICKET_TTL_MS,
    }),
  ).toString("base64url");
  const sig = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readDrivePickerTicket(
  key: string,
  ticket: string,
  now: number,
): { grantId: string; spaceId: string; userId: string } | null {
  if (!key) return null;
  const dot = ticket.indexOf(".");
  if (dot <= 0) return null;
  const payload = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  const expected = createHmac("sha256", key).update(payload).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      g?: unknown;
      s?: unknown;
      u?: unknown;
      e?: unknown;
    };
    if (
      typeof parsed.g !== "string" ||
      typeof parsed.s !== "string" ||
      typeof parsed.u !== "string" ||
      typeof parsed.e !== "number" ||
      parsed.e < now
    ) {
      return null;
    }
    return { grantId: parsed.g, spaceId: parsed.s, userId: parsed.u };
  } catch {
    return null;
  }
}

/** Keeps the newest 20 chosen files. Returns null when nothing in the batch was a file id. */
export function mergeDrivePicks(
  existing: readonly DrivePick[] | undefined,
  incoming: readonly { id?: unknown; name?: unknown; mimeType?: unknown }[],
): DrivePick[] | null {
  const next = [...(existing ?? [])];
  let added = 0;
  for (const file of incoming) {
    if (typeof file.id !== "string" || !FILE_ID.test(file.id)) continue;
    if (typeof file.name !== "string" || typeof file.mimeType !== "string") continue;
    if (/[\r\n]/.test(file.mimeType)) continue;
    const name = file.name
      .replace(/[\r\n]/g, " ")
      .trim()
      .slice(0, 200);
    const mimeType = file.mimeType.trim().slice(0, 120);
    if (!name || !mimeType) continue;
    const index = next.findIndex((pick) => pick.id === file.id);
    if (index >= 0) next.splice(index, 1);
    next.push({ id: file.id, name, mimeType });
    added += 1;
  }
  if (added === 0) return null;
  return next.slice(-20);
}

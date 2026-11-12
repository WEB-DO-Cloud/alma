import {
  ipVersion,
  isCloudMetadataHost,
  isInternalHostname,
  isNonPublicAddress,
  normalizeHost,
} from "./network-host.js";

/** Catalog id for the self-hosted mailbox connector. */
export const EMAIL_IMAP_CONNECTOR_ID = "email-imap";
/** One catalog app. Each saved address is its own connection row. */
export const EMAIL_IMAP_PROVIDER = "email";

export const EMAIL_IMAP_SEARCH_LIMIT = 20;
export const EMAIL_IMAP_BODY_MAX_CHARS = 20_000;
export const EMAIL_IMAP_ATTACHMENT_MAX_BYTES = 100_000;
export const EMAIL_IMAP_MESSAGE_MAX_BYTES = 8 * 1024 * 1024;
export const EMAIL_IMAP_CONNECT_TIMEOUT_MS = 10_000;
export const EMAIL_IMAP_COMMAND_TIMEOUT_MS = 20_000;

/** Privileged ports the form may name, besides the unprivileged range. */
export const EMAIL_IMAP_PRIVILEGED_PORTS = [25, 143, 465, 587, 993] as const;

export const EMAIL_IMAP_ERROR_CODES = [
  "invalid",
  "wrong_password",
  "unreachable",
  "tls",
  "auth_unsupported",
  "private_host",
  "rate_limited",
  "too_large",
  "not_found",
] as const;

export type EmailImapErrorCode = (typeof EMAIL_IMAP_ERROR_CODES)[number];
export type EmailImapSecurity = "ssl" | "starttls";
export type EmailImapSide = "imap" | "smtp";

export type EmailImapServer = {
  host: string;
  port: number;
  security: EmailImapSecurity;
};

export type EmailImapCredentials = {
  email: string;
  password: string;
  username: string;
  imap: EmailImapServer;
  smtp: EmailImapServer;
};

export type EmailImapField =
  | "email"
  | "password"
  | "username"
  | "imap_host"
  | "imap_port"
  | "smtp_host"
  | "smtp_port";

const HOST_CHARS = /^[a-z0-9.-]+$/;

/** A host the person typed that is already unsafe before DNS. */
export function isUnsafeMailHost(host: string): boolean {
  const normalized = normalizeHost(host.trim());
  if (!normalized || normalized.length > 253) return true;
  if (normalized.includes("..") || normalized.startsWith(".") || normalized.endsWith(".")) {
    return true;
  }
  if (isInternalHostname(normalized) || isCloudMetadataHost(normalized)) return true;
  const version = ipVersion(normalized);
  if (version !== 0) return isNonPublicAddress(normalized);
  if (!HOST_CHARS.test(normalized) || !normalized.includes(".")) return true;
  return false;
}

export function isAllowedMailPort(port: number): boolean {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  if (port >= 1024) return true;
  return (EMAIL_IMAP_PRIVILEGED_PORTS as readonly number[]).includes(port);
}

export function emailImapCatalogName(locale: string | null | undefined): string {
  return locale?.toLowerCase().startsWith("es") ? "Correo (IMAP/SMTP)" : "Email (IMAP/SMTP)";
}

export function catalogItemLabel(
  item: { connectorId: string; name: string },
  locale: string | null | undefined,
): string {
  return item.connectorId === EMAIL_IMAP_CONNECTOR_ID ? emailImapCatalogName(locale) : item.name;
}

type Copy = {
  title: string;
  email: string;
  password: string;
  help: string;
  changeServers: string;
  servers: string;
  username: string;
  incoming: string;
  outgoing: string;
  port: string;
  security: string;
  test: string;
  save: string;
  testing: string;
  saving: string;
  works: string;
  errors: Record<EmailImapErrorCode, string>;
  side: Record<EmailImapSide, string>;
};

const ENGLISH: Copy = {
  title: "Email (IMAP/SMTP)",
  email: "Email",
  password: "Password",
  help: "If this account uses two-step verification, use an app password.",
  changeServers: "Change servers",
  servers: "Servers",
  username: "Username",
  incoming: "Incoming server",
  outgoing: "Outgoing server",
  port: "Port",
  security: "Security",
  test: "Test connection",
  save: "Save",
  testing: "Testing…",
  saving: "Saving…",
  works: "Connection works.",
  errors: {
    invalid: "Check the address, password, and servers.",
    wrong_password: "The password was not accepted.",
    unreachable: "The server could not be reached.",
    tls: "The secure connection to the server failed.",
    auth_unsupported: "This server does not accept password sign-in.",
    private_host: "That server address is not allowed.",
    rate_limited: "Too many attempts. Wait a few minutes and try again.",
    too_large: "That message is too large.",
    not_found: "Could not connect.",
  },
  side: { imap: "Incoming server.", smtp: "Outgoing server." },
};

const SPANISH: Copy = {
  title: "Correo (IMAP/SMTP)",
  email: "Correo",
  password: "Contraseña",
  help: "Si esta cuenta usa verificación en dos pasos, usa una contraseña de aplicación.",
  changeServers: "Cambiar servidores",
  servers: "Servidores",
  username: "Usuario",
  incoming: "Servidor de entrada",
  outgoing: "Servidor de salida",
  port: "Puerto",
  security: "Seguridad",
  test: "Probar conexión",
  save: "Guardar",
  testing: "Probando…",
  saving: "Guardando…",
  works: "La conexión funciona.",
  errors: {
    invalid: "Revisa el correo, la contraseña y los servidores.",
    wrong_password: "La contraseña no fue aceptada.",
    unreachable: "No se pudo contactar el servidor.",
    tls: "La conexión segura con el servidor falló.",
    auth_unsupported: "Este servidor no acepta la contraseña.",
    private_host: "Esa dirección de servidor no está permitida.",
    rate_limited: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    too_large: "Ese mensaje es demasiado grande.",
    not_found: "No se pudo conectar.",
  },
  side: { imap: "Servidor de entrada.", smtp: "Servidor de salida." },
};

export function emailImapCopy(locale: string | null | undefined): Copy {
  return locale?.toLowerCase().startsWith("es") ? SPANISH : ENGLISH;
}

export function emailImapErrorText(
  locale: string | null | undefined,
  code: EmailImapErrorCode,
  side?: EmailImapSide,
): string {
  const copy = emailImapCopy(locale);
  const sentence = copy.errors[code];
  return side ? `${sentence} ${copy.side[side]}` : sentence;
}

function serverFrom(value: unknown, prefix: "imap" | "smtp"): EmailImapServer | EmailImapField {
  if (!value || typeof value !== "object") return `${prefix}_host`;
  const record = value as Record<string, unknown>;
  const host = typeof record.host === "string" ? record.host.trim() : "";
  if (!host || isUnsafeMailHost(host)) return `${prefix}_host`;
  const port = typeof record.port === "number" ? record.port : Number(record.port);
  if (!isAllowedMailPort(port)) return `${prefix}_port`;
  if (record.security !== "ssl" && record.security !== "starttls") return `${prefix}_port`;
  return { host: normalizeHost(host), port, security: record.security };
}

function emailOf(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || email.includes(" ") || email.includes("\n")) {
    return null;
  }
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return null;
  const domain = email.slice(at + 1);
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return null;
  if (isUnsafeMailHost(domain)) return null;
  return email;
}

/** Shape check for the form and the save procedure. DNS and login happen later. */
export function parseEmailImapCredentials(
  input: unknown,
): { ok: true; value: EmailImapCredentials } | { ok: false; field: EmailImapField } {
  if (!input || typeof input !== "object") return { ok: false, field: "email" };
  const record = input as Record<string, unknown>;
  const email = typeof record.email === "string" ? emailOf(record.email) : null;
  if (!email) return { ok: false, field: "email" };
  const password = typeof record.password === "string" ? record.password : "";
  if (!password || password.length > 256 || password.includes("\n") || password.includes("\r")) {
    return { ok: false, field: "password" };
  }
  const usernameRaw = typeof record.username === "string" ? record.username.trim() : "";
  if (usernameRaw.length > 254 || usernameRaw.includes("\n") || usernameRaw.includes(" ")) {
    return { ok: false, field: "username" };
  }
  const imap = serverFrom(record.imap, "imap");
  if (typeof imap === "string") return { ok: false, field: imap };
  const smtp = serverFrom(record.smtp, "smtp");
  if (typeof smtp === "string") return { ok: false, field: smtp };
  return { ok: true, value: { email, password, username: usernameRaw || email, imap, smtp } };
}

export function parseEmailImapAddress(
  input: unknown,
): { ok: true; email: string } | { ok: false; field: "email" } {
  const email = typeof input === "string" ? emailOf(input) : null;
  return email ? { ok: true, email } : { ok: false, field: "email" };
}

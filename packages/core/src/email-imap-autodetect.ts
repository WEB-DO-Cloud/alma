import type { EmailImapSecurity, EmailImapServer } from "@rakazo/contracts";
import { isUnsafeMailHost } from "@rakazo/contracts";
import { getDomain } from "tldts";

export type DetectedMailbox = {
  username: string;
  imap: EmailImapServer;
  smtp: EmailImapServer;
};

const SOCKET: Record<string, EmailImapSecurity | "plain"> = {
  ssl: "ssl",
  ssltls: "ssl",
  starttls: "starttls",
  tls: "starttls",
  plain: "plain",
};

/** Domain, then the registered domain when they differ (`mail.example.co.uk` -> `example.co.uk`). */
export function emailDomainCandidates(email: string): string[] {
  const domain = email.split("@")[1]?.trim().toLowerCase().replace(/\.$/, "") ?? "";
  if (!domain.includes(".")) return [];
  const registered = getDomain(domain, { allowPrivateDomains: false })?.toLowerCase();
  return registered && registered !== domain ? [domain, registered] : [domain];
}

export function parseAutoconfigXml(xml: string, email: string): DetectedMailbox | null {
  const incoming = firstServer(xml, "incomingServer", "imap", email);
  const outgoing = firstServer(xml, "outgoingServer", "smtp", email);
  if (!incoming || !outgoing) return null;
  return { username: incoming.username, imap: incoming.server, smtp: outgoing.server };
}

export function parseAutodiscoverXml(xml: string): DetectedMailbox | null {
  const protocols = [...xml.matchAll(/<Protocol>([\s\S]*?)<\/Protocol>/gi)].map(
    (match) => match[1]!,
  );
  const imap = protocols.map(autodiscoverServer).find((server) => server?.kind === "imap")?.server;
  const smtp = protocols.map(autodiscoverServer).find((server) => server?.kind === "smtp")?.server;
  if (!imap || !smtp) return null;
  return { username: "", imap, smtp };
}

/** Known providers keyed by the mail exchanger host. Null when the host is not one of them. */
export function serversFromMx(mxHost: string, email: string): DetectedMailbox | null {
  const host = mxHost.trim().toLowerCase().replace(/\.$/, "");
  const provider = MX_PROVIDERS.find((entry) => entry.matches(host));
  if (!provider) return null;
  const servers = provider.servers(host);
  if (isUnsafeMailHost(servers.imap.host) || isUnsafeMailHost(servers.smtp.host)) return null;
  return { username: email, ...servers };
}

/** Pairs to try after directories and known exchangers, most specific first. */
export function guessMailboxes(domain: string, email: string): DetectedMailbox[] {
  const hosts = [
    { imap: `mail.${domain}`, smtp: `mail.${domain}` },
    { imap: `imap.${domain}`, smtp: `smtp.${domain}` },
  ];
  const pairs: DetectedMailbox[] = [];
  for (const host of hosts) {
    if (isUnsafeMailHost(host.imap) || isUnsafeMailHost(host.smtp)) continue;
    pairs.push(mailbox(email, host.imap, 993, "ssl", host.smtp, 465, "ssl"));
    pairs.push(mailbox(email, host.imap, 993, "ssl", host.smtp, 587, "starttls"));
  }
  return pairs;
}

export function chooseMailboxSettings(input: {
  email: string;
  autoconfigs: readonly string[];
  autodiscover: readonly string[];
  mxHosts: readonly string[];
  /** Hosts already resolved to public addresses. A directory result naming anything else is skipped. */
  publicHosts: ReadonlySet<string>;
  /** Guesses whose ports both accepted a connection, in try order. */
  liveGuesses: readonly DetectedMailbox[];
}): { detected: true; settings: DetectedMailbox } | { detected: false } {
  for (const xml of input.autoconfigs) {
    const parsed = parseAutoconfigXml(xml, input.email);
    if (parsed && hostsPublic(parsed, input.publicHosts))
      return { detected: true, settings: parsed };
  }
  for (const xml of input.autodiscover) {
    const parsed = parseAutodiscoverXml(xml);
    if (!parsed) continue;
    const settings = { ...parsed, username: parsed.username || input.email };
    if (hostsPublic(settings, input.publicHosts)) return { detected: true, settings };
  }
  for (const host of input.mxHosts) {
    const settings = serversFromMx(host, input.email);
    if (settings && hostsPublic(settings, input.publicHosts)) return { detected: true, settings };
  }
  const live = input.liveGuesses.find((guess) => hostsPublic(guess, input.publicHosts));
  return live ? { detected: true, settings: live } : { detected: false };
}

function hostsPublic(settings: DetectedMailbox, publicHosts: ReadonlySet<string>): boolean {
  return publicHosts.has(settings.imap.host) && publicHosts.has(settings.smtp.host);
}

function mailbox(
  email: string,
  imapHost: string,
  imapPort: number,
  imapSecurity: EmailImapSecurity,
  smtpHost: string,
  smtpPort: number,
  smtpSecurity: EmailImapSecurity,
): DetectedMailbox {
  return {
    username: email,
    imap: { host: imapHost, port: imapPort, security: imapSecurity },
    smtp: { host: smtpHost, port: smtpPort, security: smtpSecurity },
  };
}

function firstServer(
  xml: string,
  tag: "incomingServer" | "outgoingServer",
  type: "imap" | "smtp",
  email: string,
): { username: string; server: EmailImapServer } | null {
  const blocks = [...xml.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, "gi"))];
  for (const block of blocks) {
    const declared = /type\s*=\s*"([^"]+)"/i.exec(block[1] ?? "")?.[1]?.toLowerCase();
    if (declared && declared !== type) continue;
    const body = block[2] ?? "";
    const host = text(body, "hostname");
    const port = Number(text(body, "port"));
    const security = SOCKET[(text(body, "socketType") ?? "").toLowerCase().replace(/[^a-z]/g, "")];
    if (!host || !Number.isInteger(port) || (security !== "ssl" && security !== "starttls")) {
      continue;
    }
    if (isUnsafeMailHost(host)) continue;
    return {
      username: expandUsername(text(body, "username") ?? "", email),
      server: { host, port, security },
    };
  }
  return null;
}

function autodiscoverServer(
  body: string,
): { kind: "imap" | "smtp"; server: EmailImapServer } | null {
  const kind = (text(body, "Type") ?? "").toLowerCase();
  if (kind !== "imap" && kind !== "smtp") return null;
  const host = text(body, "Server");
  const port = Number(text(body, "Port"));
  const encryption = (text(body, "Encryption") ?? text(body, "SSL") ?? "").toLowerCase();
  const security: EmailImapSecurity | null =
    encryption === "ssl" || encryption === "on"
      ? "ssl"
      : encryption.includes("tls")
        ? "starttls"
        : null;
  if (!host || !Number.isInteger(port) || !security || isUnsafeMailHost(host)) return null;
  return { kind, server: { host, port, security } };
}

function text(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  if (!match) return null;
  const value = decodeXml(match[1] ?? "").trim();
  return value || null;
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function expandUsername(value: string, email: string): string {
  const local = email.split("@")[0] ?? "";
  const replaced = value.replaceAll("%EMAILADDRESS%", email).replaceAll("%EMAILLOCALPART%", local);
  return replaced || email;
}

function ends(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

const MX_PROVIDERS: ReadonlyArray<{
  matches: (host: string) => boolean;
  servers: (host: string) => { imap: EmailImapServer; smtp: EmailImapServer };
}> = [
  {
    matches: (host) => ends(host, "google.com") || ends(host, "googlemail.com"),
    servers: () => pair("imap.gmail.com", 993, "ssl", "smtp.gmail.com", 465, "ssl"),
  },
  {
    matches: (host) => ends(host, "outlook.com") || ends(host, "protection.outlook.com"),
    servers: () => pair("outlook.office365.com", 993, "ssl", "smtp.office365.com", 587, "starttls"),
  },
  {
    matches: (host) =>
      ends(host, "zoho.eu") || ends(host, "zoho.com") || ends(host, "zohomail.com"),
    servers: (host) => {
      const eu = host.includes("zoho.eu");
      const domain = eu ? "zoho.eu" : "zoho.com";
      return pair(`imap.${domain}`, 993, "ssl", `smtp.${domain}`, 465, "ssl");
    },
  },
  {
    matches: (host) => ends(host, "privateemail.com"),
    servers: () => pair("mail.privateemail.com", 993, "ssl", "mail.privateemail.com", 465, "ssl"),
  },
  {
    matches: (host) => ends(host, "secureserver.net"),
    servers: () =>
      pair("imap.secureserver.net", 993, "ssl", "smtpout.secureserver.net", 465, "ssl"),
  },
  {
    matches: (host) => ends(host, "fastmail.com") || ends(host, "messagingengine.com"),
    servers: () => pair("imap.fastmail.com", 993, "ssl", "smtp.fastmail.com", 465, "ssl"),
  },
  {
    matches: (host) => ends(host, "migadu.com"),
    servers: () => pair("imap.migadu.com", 993, "ssl", "smtp.migadu.com", 465, "ssl"),
  },
  {
    matches: (host) => ends(host, "icloud.com") || ends(host, "me.com"),
    servers: () => pair("imap.mail.me.com", 993, "ssl", "smtp.mail.me.com", 587, "starttls"),
  },
  {
    matches: (host) =>
      ends(host, "yandex.net") || ends(host, "yandex.com") || ends(host, "yandex.ru"),
    servers: () => pair("imap.yandex.com", 993, "ssl", "smtp.yandex.com", 465, "ssl"),
  },
  {
    matches: (host) => ends(host, "titan.email"),
    servers: () => pair("imap.titan.email", 993, "ssl", "smtp.titan.email", 465, "ssl"),
  },
  {
    matches: (host) => ends(host, "hostinger.com"),
    servers: () => pair("imap.hostinger.com", 993, "ssl", "smtp.hostinger.com", 465, "ssl"),
  },
];

function pair(
  imapHost: string,
  imapPort: number,
  imapSecurity: EmailImapSecurity,
  smtpHost: string,
  smtpPort: number,
  smtpSecurity: EmailImapSecurity,
): { imap: EmailImapServer; smtp: EmailImapServer } {
  return {
    imap: { host: imapHost, port: imapPort, security: imapSecurity },
    smtp: { host: smtpHost, port: smtpPort, security: smtpSecurity },
  };
}

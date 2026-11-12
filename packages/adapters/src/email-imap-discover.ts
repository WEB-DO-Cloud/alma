import { resolveMx } from "node:dns/promises";
import { connect as connectTcp } from "node:net";
import { connect as connectTls } from "node:tls";
import type { EmailImapServer } from "@rakazo/contracts";
import type { DetectedMailbox } from "@rakazo/core";
import {
  emailDomainCandidates,
  guessMailboxes,
  parseAutoconfigXml,
  parseAutodiscoverXml,
  serversFromMx,
} from "@rakazo/core";
import { resolvePublicMailHost } from "./email-imap-guard.js";
import { fetchSafeHttpRequest, fetchSafeWebText } from "./web-ssrf.js";

const STEP_TIMEOUT_MS = 5_000;
const DETECT_TIMEOUT_MS = 20_000;

export type MailboxDiscovery = { detected: true; settings: DetectedMailbox } | { detected: false };

export async function discoverMailbox(
  email: string,
  signal: AbortSignal = AbortSignal.timeout(DETECT_TIMEOUT_MS),
): Promise<MailboxDiscovery> {
  const domains = emailDomainCandidates(email).filter((domain) => !domain.endsWith(".internal"));
  for (const domain of domains) {
    const fromDirectory = await directory(domain, email, signal);
    if (fromDirectory) return { detected: true, settings: fromDirectory };
  }
  for (const domain of domains) {
    const mx = await exchangers(domain);
    for (const host of mx) {
      const mapped = serversFromMx(host, email);
      if (mapped && (await publicSettings(mapped))) return { detected: true, settings: mapped };
    }
  }
  const domain = domains[0];
  if (!domain) return { detected: false };
  for (const guess of guessMailboxes(domain, email)) {
    if (signal.aborted) return { detected: false };
    if (!(await publicSettings(guess))) continue;
    const imapUp = await probe(guess.imap, "imap");
    const smtpUp = imapUp && (await probe(guess.smtp, "smtp"));
    if (imapUp && smtpUp) return { detected: true, settings: guess };
  }
  return { detected: false };
}

async function directory(
  domain: string,
  email: string,
  signal: AbortSignal,
): Promise<DetectedMailbox | null> {
  const urls = [
    `https://autoconfig.thunderbird.net/v1.1/${encodeURIComponent(domain)}`,
    `https://autoconfig.${domain}/mail/config-v1.1.xml?emailaddress=${encodeURIComponent(email)}`,
    `https://${domain}/.well-known/autoconfig/mail/config-v1.1.xml?emailaddress=${encodeURIComponent(email)}`,
  ];
  for (const url of urls) {
    const xml = await getText(url, signal);
    const parsed = xml ? parseAutoconfigXml(xml, email) : null;
    if (parsed && (await publicSettings(parsed))) return parsed;
  }
  for (const url of [
    `https://autodiscover.${domain}/autodiscover/autodiscover.xml`,
    `https://${domain}/autodiscover/autodiscover.xml`,
  ]) {
    const xml = await postText(url, autodiscoverBody(email), signal);
    const parsed = xml ? parseAutodiscoverXml(xml) : null;
    if (!parsed) continue;
    const settings = { ...parsed, username: parsed.username || email };
    if (await publicSettings(settings)) return settings;
  }
  return null;
}

async function publicSettings(settings: DetectedMailbox): Promise<boolean> {
  try {
    await resolvePublicMailHost(settings.imap.host);
    await resolvePublicMailHost(settings.smtp.host);
    return true;
  } catch {
    return false;
  }
}

async function exchangers(domain: string): Promise<string[]> {
  try {
    const records = await resolveMx(domain);
    return records
      .sort((left, right) => left.priority - right.priority)
      .map((record) => record.exchange.replace(/\.$/, "").toLowerCase());
  } catch {
    return [];
  }
}

async function getText(url: string, signal: AbortSignal): Promise<string | null> {
  try {
    const response = await fetchSafeWebText(url, {
      timeoutMs: STEP_TIMEOUT_MS,
      maxBytes: 256 * 1024,
      signal,
    });
    return response.body;
  } catch {
    return null;
  }
}

async function postText(url: string, body: string, signal: AbortSignal): Promise<string | null> {
  try {
    const response = await fetchSafeHttpRequest(
      url,
      {
        method: "POST",
        headers: { "content-type": "text/xml" },
        body,
      },
      { timeoutMs: STEP_TIMEOUT_MS, maxBytes: 256 * 1024, signal },
    );
    if (response.status < 200 || response.status >= 300) return null;
    return new TextDecoder().decode(response.body);
  } catch {
    return null;
  }
}

function autodiscoverBody(email: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/requestschema/2006"><Request><EMailAddress>${email}</EMailAddress><AcceptableResponseSchema>http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a</AcceptableResponseSchema></Request></Autodiscover>`;
}

async function probe(server: EmailImapServer, kind: "imap" | "smtp"): Promise<boolean> {
  try {
    const target = await resolvePublicMailHost(server.host);
    if (server.security === "ssl")
      return await tlsReady(target.host, server.port, target.servername);
    return await startTlsReady(target.host, server.port, target.servername, kind);
  } catch {
    return false;
  }
}

function tlsReady(host: string, port: number, servername: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connectTls({ host, port, servername, rejectUnauthorized: true });
    const timer = setTimeout(() => finish(false), STEP_TIMEOUT_MS);
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(ok);
    };
    socket.once("secureConnect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function startTlsReady(
  host: string,
  port: number,
  servername: string,
  kind: "imap" | "smtp",
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connectTcp({ host, port });
    let buffer = "";
    let stage = 0;
    const timer = setTimeout(() => finish(false), STEP_TIMEOUT_MS);
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(ok);
    };
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (stage === 0 && buffer.includes("\n")) {
        stage = 1;
        buffer = "";
        socket.write(kind === "imap" ? "a1 STARTTLS\r\n" : "EHLO alma\r\n");
        return;
      }
      if (kind === "smtp" && stage === 1 && /^250 /m.test(buffer)) {
        stage = 2;
        buffer = "";
        socket.write("STARTTLS\r\n");
        return;
      }
      const ready =
        (kind === "imap" && stage === 1 && /^a1 OK/im.test(buffer)) ||
        (kind === "smtp" && stage === 2 && buffer.startsWith("220"));
      if (!ready) return;
      const secure = connectTls({ socket, servername, rejectUnauthorized: true });
      secure.once("secureConnect", () => {
        clearTimeout(timer);
        secure.destroy();
        resolve(true);
      });
      secure.once("error", () => finish(false));
    });
    socket.once("error", () => finish(false));
  });
}

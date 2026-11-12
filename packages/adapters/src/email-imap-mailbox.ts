import type { EmailImapCredentials, EmailImapErrorCode, EmailImapSide } from "@rakazo/contracts";
import {
  EMAIL_IMAP_COMMAND_TIMEOUT_MS,
  EMAIL_IMAP_CONNECT_TIMEOUT_MS,
  EMAIL_IMAP_MESSAGE_MAX_BYTES,
  EMAIL_IMAP_SEARCH_LIMIT,
} from "@rakazo/contracts";
import nodemailer from "nodemailer";
import { MailHostRejected, resolvePublicMailHost } from "./email-imap-guard.js";
import type { MailSummary } from "./email-imap-message.js";
import {
  buildRawMessage,
  forwardSubject,
  quoteMessage,
  replySubject,
  summarizeMessage,
  threadReferences,
} from "./email-imap-message.js";

export class MailboxFailure extends Error {
  readonly code: EmailImapErrorCode;
  readonly side?: EmailImapSide;

  constructor(code: EmailImapErrorCode, side?: EmailImapSide) {
    super(code);
    this.name = "MailboxFailure";
    this.code = code;
    this.side = side;
  }
}

export type MailboxAccess = {
  /** Tests only. Production never sets this. */
  allowPrivateHosts?: boolean;
  /** Tests only. Skips TLS so a local server can speak cleartext. */
  allowInsecure?: boolean;
};

type ImapClient = {
  usable: boolean;
  connect: () => Promise<void>;
  logout: () => Promise<void>;
  close: () => void;
  on: (event: "error", listener: () => void) => void;
  list: () => Promise<
    Array<{ path: string; name: string; flags: Set<string>; specialUse?: string }>
  >;
  mailboxOpen: (path: string) => Promise<unknown>;
  search: (
    query: Record<string, unknown>,
    options?: { uid?: boolean },
  ) => Promise<number[] | false | undefined>;
  fetchOne: (
    seq: string | number,
    query: { source?: { maxLength: number }; uid?: boolean },
    options?: { uid?: boolean },
  ) => Promise<{ source?: Buffer } | false>;
  append: (path: string, content: Buffer, flags?: string[]) => Promise<unknown>;
};

type PoolEntry = {
  client: ImapClient | null;
  tail: Promise<void>;
  users: number;
  idle?: ReturnType<typeof setTimeout>;
};

const IDLE_MS = 20_000;
const DRAFT_NAMES = ["drafts", "draft", "borradores"];
const SENT_NAMES = ["sent", "sent items", "sent messages", "enviados"];

export class MailboxClient {
  private readonly pool = new Map<string, PoolEntry>();

  constructor(private readonly access: MailboxAccess = {}) {}

  async test(settings: EmailImapCredentials): Promise<void> {
    const client = await this.open(settings, true);
    await logout(client);
    await this.verifySmtp(settings);
  }

  async listFolders(key: string, settings: EmailImapCredentials): Promise<string[]> {
    return this.use(key, settings, async (client) =>
      (await client.list()).map((folder) => folder.path),
    );
  }

  async search(
    key: string,
    settings: EmailImapCredentials,
    input: {
      folder?: string;
      from?: string;
      to?: string;
      subject?: string;
      since?: string;
      before?: string;
      text?: string;
    },
  ): Promise<
    Array<{
      uid: number;
      folder: string;
      from: string;
      to: string[];
      subject: string;
      date: string;
    }>
  > {
    return this.use(key, settings, async (client) => {
      const folder = input.folder?.trim() || "INBOX";
      await client.mailboxOpen(folder);
      const query: Record<string, unknown> = {};
      if (input.from) query.from = input.from;
      if (input.to) query.to = input.to;
      if (input.subject) query.subject = input.subject;
      if (input.text) query.text = input.text;
      if (input.since) query.since = new Date(input.since);
      if (input.before) query.before = new Date(input.before);
      const found = await client.search(Object.keys(query).length ? query : { all: true }, {
        uid: true,
      });
      const uids = Array.isArray(found) ? found.slice(0, EMAIL_IMAP_SEARCH_LIMIT) : [];
      const rows = [];
      for (const uid of uids) {
        const summary = await this.readUid(client, uid);
        if (!summary) continue;
        rows.push({
          uid,
          folder,
          from: summary.from,
          to: summary.to,
          subject: summary.subject,
          date: summary.date,
        });
      }
      return rows;
    });
  }

  async read(
    key: string,
    settings: EmailImapCredentials,
    input: { folder?: string; uid: number },
  ): Promise<MailSummary & { uid: number; folder: string }> {
    return this.use(key, settings, async (client) => {
      const folder = input.folder?.trim() || "INBOX";
      await client.mailboxOpen(folder);
      const summary = await this.readUid(client, input.uid);
      if (!summary) throw new MailboxFailure("not_found");
      return { ...summary, uid: input.uid, folder };
    });
  }

  async readAttachment(
    key: string,
    settings: EmailImapCredentials,
    input: { folder?: string; uid: number; index: number },
  ): Promise<{ filename: string; contentType: string; size: number; text: string | null }> {
    const message = await this.read(key, settings, input);
    const attachment = message.attachments[input.index];
    if (!attachment) throw new MailboxFailure("not_found");
    return {
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      text: attachment.text ?? null,
    };
  }

  async createDraft(
    key: string,
    settings: EmailImapCredentials,
    input: { to: string; cc?: string[]; subject: string; text: string },
  ): Promise<{ folder: string }> {
    const raw = buildRawMessage({
      from: settings.email,
      to: [input.to],
      cc: input.cc,
      subject: input.subject,
      text: input.text,
    });
    return this.use(key, settings, async (client) => {
      const folder = await specialFolder(client, "\\Drafts", DRAFT_NAMES);
      if (!folder) throw new MailboxFailure("not_found");
      await client.append(folder, raw, ["\\Draft"]);
      return { folder };
    });
  }

  async send(
    key: string,
    settings: EmailImapCredentials,
    input: {
      to: string;
      cc?: string[];
      bcc?: string[];
      subject: string;
      text: string;
      inReplyTo?: string;
      references?: string[];
    },
  ): Promise<{ savedToSent: boolean }> {
    const raw = buildRawMessage({ from: settings.email, ...input, to: [input.to] });
    await this.deliver(settings, raw, [input.to, ...(input.cc ?? []), ...(input.bcc ?? [])]);
    const savedToSent = await this.use(key, settings, async (client) => {
      const folder = await specialFolder(client, "\\Sent", SENT_NAMES);
      if (!folder) return false;
      await client.append(folder, raw, ["\\Seen"]);
      return true;
    }).catch(() => false);
    return { savedToSent };
  }

  async reply(
    key: string,
    settings: EmailImapCredentials,
    input: { folder?: string; uid: number; to: string; text: string },
  ): Promise<{ savedToSent: boolean }> {
    const original = await this.read(key, settings, input);
    const references = threadReferences(original.references, original.messageId);
    return this.send(key, settings, {
      to: input.to,
      subject: replySubject(original.subject),
      text: `${input.text}\n\n${quoteMessage(original.text)}`,
      inReplyTo: original.messageId,
      references,
    });
  }

  async forward(
    key: string,
    settings: EmailImapCredentials,
    input: { folder?: string; uid: number; to: string; text?: string },
  ): Promise<{ savedToSent: boolean }> {
    const original = await this.read(key, settings, input);
    const intro = input.text?.trim() ? `${input.text.trim()}\n\n` : "";
    return this.send(key, settings, {
      to: input.to,
      subject: forwardSubject(original.subject),
      text: `${intro}----------\nFrom: ${original.from}\nSubject: ${original.subject}\n\n${original.text}`,
      references: threadReferences("", original.messageId),
    });
  }

  async close(key: string): Promise<void> {
    const entry = this.pool.get(key);
    if (!entry) return;
    this.pool.delete(key);
    await drop(entry);
  }

  async closeIdle(): Promise<void> {
    for (const [key, entry] of this.pool) {
      if (entry.users > 0) continue;
      this.pool.delete(key);
      await drop(entry);
    }
  }

  async closeAll(): Promise<void> {
    const entries = [...this.pool.values()];
    this.pool.clear();
    await Promise.all(entries.map((entry) => drop(entry)));
  }

  private async readUid(client: ImapClient, uid: number): Promise<MailSummary | null> {
    const fetched = await client.fetchOne(
      uid,
      { uid: true, source: { maxLength: EMAIL_IMAP_MESSAGE_MAX_BYTES + 1 } },
      { uid: true },
    );
    if (fetched === false || !fetched.source) return null;
    if (fetched.source.byteLength > EMAIL_IMAP_MESSAGE_MAX_BYTES)
      throw new MailboxFailure("too_large");
    return summarizeMessage(fetched.source);
  }

  private async use<T>(
    key: string,
    settings: EmailImapCredentials,
    run: (client: ImapClient) => Promise<T>,
  ): Promise<T> {
    const entry = this.pool.get(key) ?? { client: null, tail: Promise.resolve(), users: 0 };
    this.pool.set(key, entry);
    const job = entry.tail.then(async () => {
      entry.users += 1;
      if (entry.idle) clearTimeout(entry.idle);
      try {
        if (!entry.client?.usable) {
          await drop(entry);
          entry.client = await this.open(settings, false);
        }
        return await run(entry.client);
      } catch (error) {
        if (!(error instanceof MailboxFailure)) await drop(entry);
        throw asMailboxFailure(error);
      } finally {
        entry.users -= 1;
        if (entry.users === 0 && entry.client) {
          entry.idle = setTimeout(() => {
            void drop(entry);
          }, IDLE_MS);
          entry.idle.unref?.();
        }
      }
    });
    entry.tail = job.then(
      () => undefined,
      () => undefined,
    );
    return job;
  }

  private async open(settings: EmailImapCredentials, verifyOnly: boolean): Promise<ImapClient> {
    const target = await endpoint(settings.imap.host, this.access);
    const { ImapFlow } = (await import("imapflow")) as {
      ImapFlow: new (options: Record<string, unknown>) => ImapClient;
    };
    const secure = !this.access.allowInsecure && settings.imap.security === "ssl";
    const client = new ImapFlow({
      host: target.host,
      port: settings.imap.port,
      secure,
      doSTARTTLS: this.access.allowInsecure ? false : settings.imap.security === "starttls",
      servername: target.servername,
      auth: { user: settings.username, pass: settings.password },
      logger: false,
      logRaw: false,
      emitLogs: false,
      disableAutoIdle: true,
      disableCompression: true,
      disableAutoEnable: true,
      disableIMAP4rev2: true,
      verifyOnly,
      connectionTimeout: EMAIL_IMAP_CONNECT_TIMEOUT_MS,
      greetingTimeout: EMAIL_IMAP_CONNECT_TIMEOUT_MS,
      socketTimeout: EMAIL_IMAP_COMMAND_TIMEOUT_MS,
      tls: { servername: target.servername, rejectUnauthorized: !this.access.allowInsecure },
    });
    client.on("error", () => undefined);
    try {
      await client.connect();
    } catch (error) {
      client.close();
      throw asMailboxFailure(error, "imap");
    }
    return client;
  }

  private async verifySmtp(settings: EmailImapCredentials): Promise<void> {
    const transport = await this.transport(settings);
    try {
      await transport.verify();
    } catch (error) {
      throw asMailboxFailure(error, "smtp");
    } finally {
      transport.close();
    }
  }

  private async deliver(
    settings: EmailImapCredentials,
    raw: Buffer,
    recipients: string[],
  ): Promise<void> {
    if (raw.byteLength > EMAIL_IMAP_MESSAGE_MAX_BYTES) throw new MailboxFailure("too_large");
    const transport = await this.transport(settings);
    try {
      await transport.sendMail({
        envelope: { from: settings.email, to: recipients },
        raw,
      });
    } catch (error) {
      throw asMailboxFailure(error, "smtp");
    } finally {
      transport.close();
    }
  }

  private async transport(settings: EmailImapCredentials) {
    const target = await endpoint(settings.smtp.host, this.access);
    return nodemailer.createTransport({
      host: target.host,
      port: settings.smtp.port,
      secure: !this.access.allowInsecure && settings.smtp.security === "ssl",
      requireTLS: !this.access.allowInsecure && settings.smtp.security === "starttls",
      ignoreTLS: this.access.allowInsecure === true,
      auth: { user: settings.username, pass: settings.password },
      connectionTimeout: EMAIL_IMAP_CONNECT_TIMEOUT_MS,
      greetingTimeout: EMAIL_IMAP_CONNECT_TIMEOUT_MS,
      socketTimeout: EMAIL_IMAP_COMMAND_TIMEOUT_MS,
      tls: { servername: target.servername, rejectUnauthorized: !this.access.allowInsecure },
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }
}

async function endpoint(host: string, access: MailboxAccess) {
  if (access.allowPrivateHosts) return { host, servername: host };
  try {
    return await resolvePublicMailHost(host);
  } catch (error) {
    if (error instanceof MailHostRejected) throw new MailboxFailure(error.code);
    throw new MailboxFailure("unreachable");
  }
}

async function specialFolder(
  client: ImapClient,
  flag: string,
  names: readonly string[],
): Promise<string | null> {
  const folders = await client.list();
  const flagged = folders.find(
    (folder) =>
      folder.specialUse === flag ||
      folder.flags.has(flag) ||
      names.includes(folder.name.toLowerCase()),
  );
  return flagged?.path ?? null;
}

async function drop(entry: PoolEntry): Promise<void> {
  if (entry.idle) clearTimeout(entry.idle);
  entry.idle = undefined;
  const client = entry.client;
  entry.client = null;
  if (client) await logout(client);
}

async function logout(client: ImapClient): Promise<void> {
  await client.logout().catch(() => client.close());
}

export function asMailboxFailure(error: unknown, side?: EmailImapSide): MailboxFailure {
  if (error instanceof MailboxFailure) return error;
  return new MailboxFailure(classifyMailError(error), side);
}

export function classifyMailError(error: unknown): EmailImapErrorCode {
  if (error instanceof MailboxFailure) return error.code;
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const response =
    typeof error === "object" && error && "responseCode" in error ? String(error.responseCode) : "";
  const message = error instanceof Error ? error.message : "";
  const authFailed =
    (typeof error === "object" &&
      error !== null &&
      "authenticationFailed" in error &&
      error.authenticationFailed === true) ||
    code === "EAUTH" ||
    response === "535" ||
    /AUTHENTICATIONFAILED|Invalid credentials/i.test(`${code} ${message}`);
  if (authFailed) return "wrong_password";
  if (/LOGINDISABLED|No matching authentication|auth(?:entication)? mechanism/i.test(message)) {
    return "auth_unsupported";
  }
  if (
    /certificate|UNABLE_TO_VERIFY|SELF_SIGNED|altname|ERR_TLS|ClosedAfterConnectTLS/i.test(
      `${code} ${message}`,
    )
  ) {
    return "tls";
  }
  return "unreachable";
}

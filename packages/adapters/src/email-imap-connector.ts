import { randomUUID } from "node:crypto";
import type {
  AdapterContext,
  ConnectorCall,
  ConnectorCatalogItem,
  ConnectorEvent,
  ConnectorTool,
  ManagedConnectorProvider,
  SecretStore,
} from "@rakazo/adapter-kit";
import type { EmailImapCredentials } from "@rakazo/contracts";
import {
  EMAIL_IMAP_CONNECTOR_ID,
  EMAIL_IMAP_PROVIDER,
  emailImapCatalogName,
  emailImapErrorText,
  parseEmailImapCredentials,
} from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { runAsTenant } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { discoverMailbox } from "./email-imap-discover.js";
import { MailboxClient, MailboxFailure } from "./email-imap-mailbox.js";

const STRING = { type: "string", maxLength: 500 };
const TEXT = { type: "string", maxLength: 100_000 };

const TOOLS: ConnectorTool[] = [
  tool("email_imap_list_folders", "List mailbox folders.", "Listing folders", true, {}),
  tool(
    "email_imap_search",
    "Search messages by sender, recipient, subject, date, or text. Returns at most 20.",
    "Searching mail",
    true,
    {
      account: STRING,
      folder: STRING,
      from: STRING,
      to: STRING,
      subject: STRING,
      since: STRING,
      before: STRING,
      text: STRING,
    },
  ),
  tool(
    "email_imap_read",
    "Read one message, including text attachments.",
    "Reading a message",
    true,
    {
      account: STRING,
      folder: STRING,
      uid: { type: "integer", minimum: 1 },
    },
    ["uid"],
  ),
  tool(
    "email_imap_read_attachment",
    "Read one text attachment from a message.",
    "Reading an attachment",
    true,
    {
      account: STRING,
      folder: STRING,
      uid: { type: "integer", minimum: 1 },
      index: { type: "integer", minimum: 0 },
    },
    ["uid", "index"],
  ),
  tool(
    "email_imap_create_draft",
    "Save a draft in the Drafts folder. This does not send it.",
    "Saving a draft",
    false,
    {
      account: STRING,
      to: STRING,
      cc: { type: "array", items: STRING, maxItems: 20 },
      subject: STRING,
      text: TEXT,
    },
    ["to", "subject", "text"],
  ),
  tool(
    "email_imap_send",
    "Send a message through the person's outgoing server and keep a copy in Sent.",
    "Sending mail",
    false,
    {
      account: STRING,
      to: STRING,
      cc: { type: "array", items: STRING, maxItems: 20 },
      bcc: { type: "array", items: STRING, maxItems: 20 },
      subject: STRING,
      text: TEXT,
    },
    ["to", "subject", "text"],
  ),
  tool(
    "email_imap_send_reply",
    "Reply to a message with In-Reply-To and References, then send it.",
    "Replying",
    false,
    {
      account: STRING,
      folder: STRING,
      uid: { type: "integer", minimum: 1 },
      to: STRING,
      text: TEXT,
    },
    ["uid", "to", "text"],
  ),
  tool(
    "email_imap_send_forward",
    "Forward a message. This is not a reply, so it does not set In-Reply-To.",
    "Forwarding",
    false,
    {
      account: STRING,
      folder: STRING,
      uid: { type: "integer", minimum: 1 },
      to: STRING,
      text: TEXT,
    },
    ["uid", "to"],
  ),
];

const TOOL_BY_NAME = new Map(TOOLS.map((entry) => [entry.name, entry]));

export class EmailImapConnector implements ManagedConnectorProvider {
  private readonly mail = new MailboxClient();
  private readonly attempts = new SlidingWindow(8, 10 * 60_000);
  private readonly calls = new SlidingWindow(30, 60_000);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly secrets: SecretStore,
  ) {}

  describe() {
    return {
      id: EMAIL_IMAP_CONNECTOR_ID,
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { discover: true, oauth: false, secretsBrokered: true },
    };
  }

  async catalog(context: AdapterContext): Promise<ConnectorCatalogItem[]> {
    const connected = (await this.rows(context)).length > 0;
    return [
      {
        connectorId: EMAIL_IMAP_CONNECTOR_ID,
        slug: EMAIL_IMAP_PROVIDER,
        name: emailImapCatalogName("en"),
        logo: null,
        connected,
        noAuth: false,
      },
    ];
  }

  async listConnectedExternalIds(context: AdapterContext): Promise<string[]> {
    return (await this.rows(context)).length > 0 ? [EMAIL_IMAP_PROVIDER] : [];
  }

  async connectionReady(context: AdapterContext, externalId: string): Promise<boolean> {
    if (externalId.trim().toLowerCase() !== EMAIL_IMAP_PROVIDER) return false;
    return (await this.rows(context)).length > 0;
  }

  async begin(): Promise<{ authorizationUrl: string | null; state: string }> {
    throw new Error("Open the email form.");
  }

  async complete(): Promise<{ connectionRef: string }> {
    throw new Error("Open the email form.");
  }

  async revoke(connectionRef: string, context: AdapterContext): Promise<void> {
    if (!connectionRef || connectionRef === EMAIL_IMAP_PROVIDER) return;
    await this.mail.close(connectionRef);
    await this.inTenant(context, (db) =>
      db.secret.deleteMany({
        where: {
          id: connectionRef,
          userId: context.userId,
          spaceId: context.spaceId,
          kind: "email-imap",
        },
      }),
    );
  }

  endRun(): void {
    void this.mail.closeIdle();
  }

  async discover(email: string, context: AdapterContext) {
    this.take(this.attempts, context.userId);
    return discoverMailbox(email, context.signal);
  }

  async test(input: unknown, context: AdapterContext): Promise<void> {
    this.take(this.attempts, context.userId);
    const settings = this.settings(input);
    await this.mail.test(settings);
  }

  async save(input: unknown, context: AdapterContext): Promise<string> {
    this.take(this.attempts, context.userId);
    const settings = this.settings(input);
    await this.mail.test(settings);
    const secretId = randomUUID();
    const stored = await this.secrets.put(JSON.stringify(settings), context, {
      recordId: secretId,
    });
    await this.inTenant(context, (db) =>
      db.secret.create({
        data: {
          id: secretId,
          userId: context.userId,
          spaceId: context.spaceId,
          kind: "email-imap",
          ciphertext: stored.ciphertext,
        },
      }),
    );
    try {
      const connection = await this.inTenant(context, (db) =>
        db.connection.create({
          data: {
            spaceId: context.spaceId,
            userId: context.userId,
            connectorId: EMAIL_IMAP_CONNECTOR_ID,
            provider: EMAIL_IMAP_PROVIDER,
            displayName: settings.email,
            status: "connected",
            secretId,
            providerRef: secretId,
            metadata: {},
          },
          select: { id: true },
        }),
      );
      return connection.id;
    } catch (error) {
      await this.inTenant(context, (db) =>
        db.secret.deleteMany({ where: { id: secretId, userId: context.userId } }),
      ).catch(() => undefined);
      throw error;
    }
  }

  async discoverTools(context: AdapterContext): Promise<ConnectorTool[]> {
    if ((await this.rows(context)).length === 0) return [];
    return TOOLS.map((entry) => ({
      ...entry,
      route: { connectorId: EMAIL_IMAP_CONNECTOR_ID, toolName: entry.name },
    }));
  }

  async *execute(call: ConnectorCall, context: AdapterContext): AsyncIterable<ConnectorEvent> {
    const name = call.route?.toolName ?? call.tool;
    if (!TOOL_BY_NAME.has(name)) {
      yield { type: "error", message: "Unknown mail tool." };
      return;
    }
    try {
      const row = await this.account(call, context);
      this.take(this.calls, row.secretId);
      const settings = await this.load(row.secretId, context);
      const data = await this.callTool(name, call.args, row.secretId, settings);
      yield { type: "result", data };
    } catch (error) {
      const failure = error instanceof MailboxFailure ? error : null;
      if (!failure) getLogger().warn("email imap tool failed", { tool: name });
      yield { type: "error", message: toolError(failure) };
    }
  }

  private async callTool(
    name: string,
    args: Record<string, unknown>,
    key: string,
    settings: EmailImapCredentials,
  ): Promise<unknown> {
    const folder = stringArg(args.folder);
    const to = stringArg(args.to);
    const text = stringArg(args.text);
    const subject = stringArg(args.subject);
    const uid = numberArg(args.uid);
    if (name === "email_imap_list_folders")
      return { folders: await this.mail.listFolders(key, settings) };
    if (name === "email_imap_search") {
      return {
        messages: await this.mail.search(key, settings, {
          folder,
          from: stringArg(args.from),
          to: stringArg(args.to),
          subject,
          since: stringArg(args.since),
          before: stringArg(args.before),
          text,
        }),
      };
    }
    if (name === "email_imap_read") {
      if (!uid) throw new MailboxFailure("invalid");
      return this.mail.read(key, settings, { folder, uid });
    }
    if (name === "email_imap_read_attachment") {
      const index = numberArg(args.index);
      if (!uid || index === undefined) throw new MailboxFailure("invalid");
      return this.mail.readAttachment(key, settings, { folder, uid, index });
    }
    if (name === "email_imap_create_draft") {
      if (!to || subject === undefined || text === undefined) throw new MailboxFailure("invalid");
      return this.mail.createDraft(key, settings, { to, cc: stringList(args.cc), subject, text });
    }
    if (name === "email_imap_send") {
      if (!to || subject === undefined || text === undefined) throw new MailboxFailure("invalid");
      return this.mail.send(key, settings, {
        to,
        cc: stringList(args.cc),
        bcc: stringList(args.bcc),
        subject,
        text,
      });
    }
    if (name === "email_imap_send_reply") {
      if (!uid || !to || text === undefined) throw new MailboxFailure("invalid");
      return this.mail.reply(key, settings, { folder, uid, to, text });
    }
    if (name === "email_imap_send_forward") {
      if (!uid || !to) throw new MailboxFailure("invalid");
      return this.mail.forward(key, settings, { folder, uid, to, text });
    }
    throw new MailboxFailure("not_found");
  }

  private async account(call: ConnectorCall, context: AdapterContext): Promise<MailboxRow> {
    const rows = await this.rows(context);
    const scoped = call.connectionId ? rows.filter((row) => row.id === call.connectionId) : rows;
    const account = stringArg(call.args.account)?.toLowerCase();
    const labeled = account
      ? scoped.find((row) => row.displayName.toLowerCase() === account)
      : undefined;
    if (labeled) return labeled;
    if (!account && scoped.length === 1) return scoped[0]!;
    if (account) {
      for (const row of scoped) {
        const settings = await this.load(row.secretId, context).catch(() => null);
        if (settings?.email === account) return row;
      }
    }
    if (scoped.length > 1) {
      throw new ChooseMailbox(scoped.map((row) => row.displayName).join(", "));
    }
    throw new MailboxFailure("not_found");
  }

  private async load(secretId: string, context: AdapterContext): Promise<EmailImapCredentials> {
    const row = await this.inTenant(context, (db) =>
      db.secret.findFirst({
        where: {
          id: secretId,
          userId: context.userId,
          spaceId: context.spaceId,
          kind: "email-imap",
        },
        select: { ciphertext: true },
      }),
    );
    if (!row) throw new MailboxFailure("not_found");
    const parsed = parseEmailImapCredentials(
      JSON.parse(
        await this.secrets.load(row.ciphertext, { recordId: secretId, signal: context.signal }),
      ),
    );
    if (!parsed.ok) throw new MailboxFailure("invalid");
    return parsed.value;
  }

  private rows(context: AdapterContext): Promise<MailboxRow[]> {
    const connected = context.connectedConnections?.filter(
      (connection) => connection.connectorId === EMAIL_IMAP_CONNECTOR_ID && connection.providerRef,
    );
    if (connected && connected.length > 0) {
      return Promise.resolve(
        connected.map((connection) => ({
          id: connection.id,
          displayName: connection.displayName,
          secretId: connection.providerRef!,
        })),
      );
    }
    return this.inTenant(context, async (db) => {
      const found = await db.connection.findMany({
        where: {
          spaceId: context.spaceId,
          userId: context.userId,
          connectorId: EMAIL_IMAP_CONNECTOR_ID,
          status: "connected",
          providerRef: { not: null },
        },
        select: { id: true, displayName: true, providerRef: true },
      });
      return found.flatMap((row) =>
        row.providerRef
          ? [{ id: row.id, displayName: row.displayName, secretId: row.providerRef }]
          : [],
      );
    });
  }

  private settings(input: unknown): EmailImapCredentials {
    const parsed = parseEmailImapCredentials(input);
    if (!parsed.ok) throw new MailboxFailure("invalid");
    return parsed.value;
  }

  private take(window: SlidingWindow, key: string): void {
    if (!window.allow(key)) throw new MailboxFailure("rate_limited");
  }

  private inTenant<T>(context: AdapterContext, run: (db: PrismaClient) => Promise<T>): Promise<T> {
    return runAsTenant({ spaceId: context.spaceId, userId: context.userId }, () =>
      run(this.prisma),
    );
  }
}

type MailboxRow = { id: string; displayName: string; secretId: string };

function tool(
  name: string,
  description: string,
  label: string,
  readOnly: boolean,
  properties: Record<string, unknown>,
  required: string[] = [],
): ConnectorTool {
  return {
    name,
    description,
    label,
    readOnly,
    inputSchema: { type: "object", properties, required, additionalProperties: false },
  };
}

class ChooseMailbox extends MailboxFailure {
  constructor(readonly choices: string) {
    super("invalid");
  }
}

function toolError(failure: MailboxFailure | null): string {
  if (failure instanceof ChooseMailbox) return `Choose one mailbox: ${failure.choices}`;
  if (!failure) return "Could not reach the mail server.";
  if (failure.code === "not_found") return "That folder or message was not found.";
  if (failure.code === "invalid") return "Check the fields and try again.";
  return emailImapErrorText("en", failure.code, failure.side);
}

function stringArg(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberArg(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter(
    (item): item is string => typeof item === "string" && item.trim() !== "",
  );
  return items.length ? items : undefined;
}

class SlidingWindow {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((time) => now - time < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

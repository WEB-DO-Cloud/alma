import type { AdapterContext } from "@rakazo/adapter-kit";
import { draftFromToolArgs, externalSendHold } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it } from "vitest";
import { ComposioConnector } from "./composio-connector.js";
import { FakeComposioClient } from "./composio-fake.js";
import {
  GoogleWorkspaceConnector,
  googleWorkspaceClient,
  isWorkspacePreviewHost,
  WORKSPACE_PREVIEW_MESSAGE,
} from "./google-workspace.js";
import { EncryptedSecretStore } from "./secrets.js";

const CLIENT_ID = "100-abc.apps.googleusercontent.com";
const SECRET = "preset-secret-value";

type Grant = {
  id: string;
  spaceId: string;
  userId: string;
  provider: string;
  status: string;
  ciphertext: string;
  createdAt: Date;
  updatedAt: Date;
};
type ConnectionRow = {
  id: string;
  spaceId: string;
  userId: string;
  connectorId: string;
  provider: string;
  providerRef: string | null;
  status: string;
  updatedAt: Date;
};

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(where)) {
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      const spec = expected as { not?: unknown; in?: unknown[] };
      if ("in" in spec && !spec.in?.includes(row[key])) return false;
      if ("not" in spec && row[key] === spec.not) return false;
      continue;
    }
    if (row[key] !== expected) return false;
  }
  return true;
}

function memory() {
  const grants: Grant[] = [];
  const connections: ConnectionRow[] = [];
  let clock = Date.parse("2026-11-11T12:00:00.000Z");
  const db = {
    googleWorkspaceGrant: {
      async findFirst(args: { where: Record<string, unknown>; orderBy?: { updatedAt: string } }) {
        const rows = grants.filter((row) => matches(row, args.where));
        if (args.orderBy?.updatedAt === "desc") {
          rows.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
        }
        return rows[0] ?? null;
      },
      async findMany(args: {
        where: Record<string, unknown>;
        select?: { id?: boolean; provider?: boolean };
      }) {
        return grants.filter((row) => matches(row, args.where));
      },
      async create(args: { data: Omit<Grant, "createdAt" | "updatedAt"> }) {
        const row: Grant = {
          ...args.data,
          createdAt: new Date(clock),
          updatedAt: new Date(clock),
        };
        clock += 1_000;
        grants.push(row);
        return row;
      },
      async update(args: { where: { id: string }; data: Partial<Grant> }) {
        const row = grants.find((item) => item.id === args.where.id);
        if (!row) throw new Error("missing grant");
        Object.assign(row, args.data, { updatedAt: new Date(clock) });
        clock += 1_000;
        return row;
      },
      async updateMany(args: { where: Record<string, unknown>; data: Partial<Grant> }) {
        let count = 0;
        for (const row of grants) {
          if (!matches(row, args.where)) continue;
          Object.assign(row, args.data, { updatedAt: new Date(clock) });
          count += 1;
        }
        clock += 1_000;
        return { count };
      },
      async deleteMany(args: { where: Record<string, unknown> }) {
        const before = grants.length;
        for (let index = grants.length - 1; index >= 0; index -= 1) {
          if (matches(grants[index]!, args.where)) grants.splice(index, 1);
        }
        return { count: before - grants.length };
      },
    },
    connection: {
      async findFirst(args: { where: Record<string, unknown>; orderBy?: { updatedAt: string } }) {
        const rows = connections.filter((row) => matches(row, args.where));
        if (args.orderBy?.updatedAt === "desc") {
          rows.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
        }
        return rows[0] ?? null;
      },
      async updateMany(args: { where: Record<string, unknown>; data: Partial<ConnectionRow> }) {
        let count = 0;
        for (const row of connections) {
          if (!matches(row, args.where)) continue;
          Object.assign(row, args.data, { updatedAt: new Date(clock) });
          count += 1;
        }
        return { count };
      },
    },
  };
  return {
    db: db as unknown as PrismaClient,
    grants,
    connections,
    addConnection(provider: string, providerRef: string, status = "pending") {
      connections.push({
        id: `conn-${connections.length}`,
        spaceId: "space-1",
        userId: "user-1",
        connectorId: "google",
        provider,
        providerRef,
        status,
        updatedAt: new Date(clock),
      });
      clock += 1_000;
    },
  };
}

function context(): AdapterContext {
  return {
    operationId: "op",
    traceId: "trace",
    spaceId: "space-1",
    userId: "user-1",
    signal: new AbortController().signal,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("googleWorkspaceClient", () => {
  const preset = {
    pattern: "*.googleapis.com",
    clientId: CLIENT_ID,
    clientSecret: SECRET,
    extraAuthorizationParams: {},
  };

  it("registers only when exactly one preset secret matches the client id", () => {
    expect(
      googleWorkspaceClient({
        clientId: ` ${CLIENT_ID} `,
        presets: [preset],
        webOrigin: "https://app.alma.com.do",
      }),
    ).toEqual({
      clientId: CLIENT_ID,
      clientSecret: SECRET,
      webOrigin: "https://app.alma.com.do",
    });
    expect(
      googleWorkspaceClient({
        clientId: "not-a-client",
        presets: [preset],
        webOrigin: "https://app.alma.com.do",
      }),
    ).toBeNull();
    expect(
      googleWorkspaceClient({
        clientId: CLIENT_ID,
        presets: [preset, { ...preset, pattern: "gmail.example.test" }],
        webOrigin: "https://app.alma.com.do",
      }),
    ).toBeNull();
    expect(
      googleWorkspaceClient({
        clientId: CLIENT_ID,
        presets: [],
        webOrigin: "https://app.alma.com.do",
      }),
    ).toBeNull();
  });
});

describe("preview hosts", () => {
  it("names only the three Developer Preview hosts", () => {
    expect(isWorkspacePreviewHost("https://gmailmcp.googleapis.com/mcp/v1")).toBe(true);
    expect(isWorkspacePreviewHost("https://calendarmcp.googleapis.com/mcp/v1")).toBe(true);
    expect(isWorkspacePreviewHost("https://drivemcp.googleapis.com/mcp/v1")).toBe(true);
    expect(isWorkspacePreviewHost("https://gmail.googleapis.com/gmail/v1/users/me/labels")).toBe(
      false,
    );
    expect(
      isWorkspacePreviewHost("https://www.googleapis.com/calendar/v3/users/me/calendarList"),
    ).toBe(false);
  });
});

describe("Google Workspace REST", () => {
  it("lists labels and threads, creates a draft, and lists calendar events", async () => {
    const store = memory();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let access = "access-1";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "https://oauth2.googleapis.com/token") {
        return json({ access_token: access, refresh_token: "refresh-1", expires_in: 3600 });
      }
      if (url === "https://gmail.googleapis.com/gmail/v1/users/me/labels") {
        return json({ labels: [{ id: "INBOX", name: "INBOX" }] });
      }
      if (url.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/threads?")) {
        return json({ threads: [{ id: "thread-1" }] });
      }
      if (url === "https://gmail.googleapis.com/gmail/v1/users/me/drafts") {
        return json({ id: "draft-1" });
      }
      if (url.startsWith("https://www.googleapis.com/calendar/v3/calendars/primary/events?")) {
        return json({ items: [{ id: "event-1" }] });
      }
      return json({ error: "unexpected" }, 404);
    };
    const connector = new GoogleWorkspaceConnector(
      store.db,
      new EncryptedSecretStore("test-only-encryption-key"),
      { clientId: CLIENT_ID, clientSecret: SECRET, webOrigin: "https://app.alma.com.do" },
      fetchImpl,
    );
    const actor = context();
    const started = await connector.begin(
      { provider: "gmail", redirectUrl: "https://ignored.example/cb" },
      actor,
    );
    expect(started.authorizationUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(started.authorizationUrl).toContain(
      "redirect_uri=https%3A%2F%2Fapp.alma.com.do%2Fmcp%2Foauth%2Fcallback",
    );
    expect(started.authorizationUrl).not.toContain(SECRET);
    store.addConnection("gmail", started.state);
    expect(await connector.finishCallback({ ...actor, state: started.state, code: "code-1" })).toBe(
      true,
    );
    expect(store.grants.some((row) => row.ciphertext.includes("access-1"))).toBe(false);
    expect(store.grants.some((row) => row.ciphertext.includes(SECRET))).toBe(false);

    const labels = await result(connector, "gmail_list_labels", {});
    const threads = await result(connector, "gmail_search_threads", { q: "newer_than:1d" });
    const draft = await result(connector, "gmail_create_draft", {
      to: "ada@example.test",
      subject: "Hello",
      body: "Draft body",
    });
    expect(labels).toEqual({ labels: [{ id: "INBOX", name: "INBOX" }] });
    expect(threads).toEqual({ threads: [{ id: "thread-1" }] });
    expect(draft).toEqual({ id: "draft-1" });

    const calendar = await connector.begin(
      { provider: "googlecalendar", redirectUrl: "https://ignored.example/cb" },
      actor,
    );
    store.addConnection("googlecalendar", calendar.state);
    access = "access-2";
    await connector.finishCallback({ ...actor, state: calendar.state, code: "code-2" });
    const events = await result(connector, "calendar_list_events", {});
    expect(events).toEqual({ items: [{ id: "event-1" }] });

    const urls = calls.map((call) => call.url);
    expect(urls.some((url) => url.includes("mcp.googleapis.com"))).toBe(false);
    expect(urls).toContain("https://gmail.googleapis.com/gmail/v1/users/me/labels");
    expect(
      urls.some((url) => url.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/threads?")),
    ).toBe(true);
    expect(urls).toContain("https://gmail.googleapis.com/gmail/v1/users/me/drafts");
    expect(
      urls.some((url) =>
        url.startsWith("https://www.googleapis.com/calendar/v3/calendars/primary/events?"),
      ),
    ).toBe(true);
    const threadCall = calls.find((call) => call.url.includes("/threads?"));
    expect(new URL(threadCall!.url).searchParams.get("maxResults")).toBe("10");
    const draftCall = calls.find((call) => call.url.endsWith("/drafts"));
    const draftBody = JSON.parse(String(draftCall?.init?.body)) as { message: { raw: string } };
    const message = Buffer.from(draftBody.message.raw, "base64url").toString("utf8");
    expect(message).toContain("To: ada@example.test");
    expect(message).toContain("Draft body");
    const bearer = calls.find((call) => call.url.includes("/labels"))?.init?.headers as
      | { authorization?: string }
      | undefined;
    expect(bearer?.authorization).toBe("Bearer access-1");
  });

  it("holds a send for the existing undo gate and posts only when the tool runs", () => {
    expect(
      externalSendHold({
        enabled: true,
        viaConnector: true,
        connectorKind: "gmail",
        undo: true,
        tools: [{ name: "gmail_send", readOnly: false }],
      }),
    ).toEqual({ code: "phase2a_external_hold" });
    expect(draftFromToolArgs("gmail_send", { to: "ada@example.test", body: "Hello" })).toEqual({
      channel: "other",
      recipient: "ada@example.test",
      body: "Hello",
    });
    expect(WORKSPACE_PREVIEW_MESSAGE).toBe("This Google app connects from the card in the chat.");
  });
});

describe("Composio catalog", () => {
  it("omits the three Google apps from search and leaves other apps", async () => {
    const connector = new ComposioConnector({
      client: new FakeComposioClient(),
      omitWorkspaceCatalog: true,
    });
    const items = await connector.catalog(context());
    expect(items.map((item) => item.slug).sort()).toEqual(["GITHUB", "NOTION", "SLACK"]);
  });
});

async function result(
  connector: GoogleWorkspaceConnector,
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const events = [];
  for await (const event of connector.execute(
    { tool, args, executionId: "exec-1", route: { connectorId: "google", toolName: tool } },
    context(),
  )) {
    events.push(event);
  }
  const found = events.find((event) => event.type === "result" || event.type === "error");
  if (found?.type !== "result") {
    throw new Error(found?.type === "error" ? found.message : "no result");
  }
  return found.data;
}

import type { ConnectionCatalogItem, MessageBlock } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import {
  appConnectCard,
  appConnectedInput,
  connectedAppBlocks,
  matchAppCatalog,
  matchAppCatalogEntries,
} from "./app-connect.js";

const entry: ConnectionCatalogItem = {
  connectorId: "catalog",
  slug: "googlecalendar",
  name: "Google Calendar",
  logo: null,
  connected: false,
  noAuth: false,
};
describe("inline app cards", () => {
  it("matches exact names, slugs, and featured aliases", () => {
    for (const query of ["GOOGLECALENDAR", "Google Calendar", "gcal"])
      expect(matchAppCatalog([entry], query)).toBe(entry);
    expect(matchAppCatalog([entry], "unknown")).toBeUndefined();
  });
  it("resolves mail aliases to Gmail and Outlook cards", () => {
    const gmail = { ...entry, slug: "GMAIL", name: "Gmail" };
    const outlook = { ...entry, slug: "OUTLOOK", name: "Outlook" };
    const catalog = [gmail, outlook, { ...entry, slug: "GOOGLECALENDAR", name: "Google Calendar" }];
    expect(matchAppCatalogEntries(catalog, "correo").map((item) => item.slug)).toEqual([
      "GMAIL",
      "OUTLOOK",
    ]);
    expect(matchAppCatalogEntries(catalog, "Google Workspace").map((item) => item.name)).toEqual([
      "Gmail",
    ]);
    expect(matchAppCatalogEntries(catalog, "hotmail").map((item) => item.name)).toEqual([
      "Outlook",
    ]);
    expect(appConnectCard(outlook).description).toBe("Search, read, draft, and send email.");
  });
  it("builds trusted card fields and preserves unrelated blocks", () => {
    const card = appConnectCard(entry);
    const other = { ...card, connectorId: "other" };
    const text: MessageBlock = { kind: "text", text: "hello" };
    expect(connectedAppBlocks([card, other, text], "catalog", "gcal")).toEqual([
      { ...card, status: "connected" },
      other,
      text,
    ]);
    expect(card.description).toBe("Search events and schedule meetings.");
    expect(appConnectedInput("bot", "group-thread", card)).toEqual({
      botId: "bot",
      threadId: "group-thread",
      connectorId: "catalog",
      provider: "googlecalendar",
    });
  });
});

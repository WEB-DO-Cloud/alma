import { describe, expect, it } from "vitest";
import {
  catalogItemMatchesQuery,
  mailTargetsForQuery,
  normalizeConnectorQuery,
} from "./mail-connector-aliases.js";

describe("mail connector aliases", () => {
  it("folds accents and separators", () => {
    expect(normalizeConnectorQuery("  Correo electrónico ")).toBe("correoelectronico");
    expect(normalizeConnectorQuery("Microsoft 365")).toBe("microsoft365");
  });

  it("maps mail phrases onto Gmail, Outlook, or both", () => {
    expect(mailTargetsForQuery("Gmail")).toEqual(["gmail"]);
    expect(mailTargetsForQuery("Google Workspace")).toEqual(["gmail"]);
    expect(mailTargetsForQuery("Outlook")).toEqual(["outlook"]);
    expect(mailTargetsForQuery("hotmail")).toEqual(["outlook"]);
    expect(mailTargetsForQuery("Microsoft 365")).toEqual(["outlook"]);
    expect(mailTargetsForQuery("correo")).toEqual(["gmail", "outlook"]);
    expect(mailTargetsForQuery("email")).toEqual(["gmail", "outlook"]);
    expect(mailTargetsForQuery("mail")).toEqual(["gmail", "outlook"]);
    expect(mailTargetsForQuery("proton")).toBeNull();
    expect(mailTargetsForQuery("google")).toBeNull();
  });

  it("matches catalog rows by those targets and not by a shared vendor word", () => {
    const gmail = { slug: "GMAIL", name: "Gmail" };
    const outlook = { slug: "OUTLOOK", name: "Outlook" };
    const calendar = { slug: "GOOGLECALENDAR", name: "Google Calendar" };
    const outlookCalendar = { slug: "outlook_calendar", name: "Outlook Calendar" };
    expect(catalogItemMatchesQuery(gmail, "correo")).toBe(true);
    expect(catalogItemMatchesQuery(outlook, "Google Workspace")).toBe(false);
    expect(catalogItemMatchesQuery(gmail, "Google Workspace")).toBe(true);
    expect(catalogItemMatchesQuery(outlook, "hotmail")).toBe(true);
    expect(catalogItemMatchesQuery(calendar, "correo")).toBe(false);
    expect(catalogItemMatchesQuery(outlookCalendar, "outlook")).toBe(false);
    expect(
      catalogItemMatchesQuery(
        { slug: "microsoft_outlook", name: "Microsoft Outlook" },
        "microsoft 365",
      ),
    ).toBe(true);
  });
});

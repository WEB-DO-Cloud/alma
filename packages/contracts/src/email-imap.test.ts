import { describe, expect, it } from "vitest";
import {
  emailImapCatalogName,
  emailImapCopy,
  emailImapErrorText,
  isAllowedMailPort,
  isUnsafeMailHost,
  parseEmailImapCredentials,
} from "./email-imap.js";

function field(input: unknown) {
  const parsed = parseEmailImapCredentials(input);
  if (parsed.ok) throw new Error("expected a field error");
  return parsed.field;
}

const servers = {
  imap: { host: "imap.example.test", port: 993, security: "ssl" },
  smtp: { host: "smtp.example.test", port: 587, security: "starttls" },
};

describe("email form", () => {
  it("names the row in Spanish and English", () => {
    expect(emailImapCatalogName("es")).toBe("Correo (IMAP/SMTP)");
    expect(emailImapCatalogName("es-DO")).toBe("Correo (IMAP/SMTP)");
    expect(emailImapCatalogName("en")).toBe("Email (IMAP/SMTP)");
    expect(emailImapCatalogName(undefined)).toBe("Email (IMAP/SMTP)");
  });

  it("keeps the app-password line in both languages", () => {
    expect(emailImapCopy("en").help).toMatch(/app password/i);
    expect(emailImapCopy("es").help).toMatch(/contraseña de aplicación/i);
  });

  it("accepts a mailbox and fills a blank username with the address", () => {
    const parsed = parseEmailImapCredentials({
      email: "Ada@Example.Test",
      password: "app pass word",
      imap: servers.imap,
      smtp: servers.smtp,
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        email: "ada@example.test",
        password: "app pass word",
        username: "ada@example.test",
        imap: servers.imap,
        smtp: servers.smtp,
      },
    });
  });

  it("rejects a bad address, an empty password, and a port that is not mail", () => {
    expect(field({ email: "ada", password: "x", ...servers })).toBe("email");
    expect(field({ email: "ada@10.0.0.1", password: "x", ...servers })).toBe("email");
    expect(field({ email: "ada@example.test", password: "", ...servers })).toBe("password");
    expect(
      field({
        email: "ada@example.test",
        password: "secret",
        imap: { host: "imap.example.test", port: 22, security: "ssl" },
        smtp: servers.smtp,
      }),
    ).toBe("imap_port");
    expect(
      field({
        email: "ada@example.test",
        password: "secret",
        imap: { host: "localhost", port: 993, security: "ssl" },
        smtp: servers.smtp,
      }),
    ).toBe("imap_host");
  });

  it("allows the mail ports and other unprivileged ports", () => {
    expect(isAllowedMailPort(993)).toBe(true);
    expect(isAllowedMailPort(587)).toBe(true);
    expect(isAllowedMailPort(2525)).toBe(true);
    expect(isAllowedMailPort(22)).toBe(false);
    expect(isAllowedMailPort(443)).toBe(false);
    expect(isAllowedMailPort(0)).toBe(false);
  });

  it("refuses loopback, private, link-local, and metadata names before DNS", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "10.1.2.3",
      "192.168.1.1",
      "169.254.169.254",
      "[::1]",
      "metadata.google.internal",
      "fd00:ec2::254",
    ]) {
      expect(isUnsafeMailHost(host), host).toBe(true);
    }
    expect(isUnsafeMailHost("imap.example.test")).toBe(false);
    expect(isUnsafeMailHost("1.2.3.4")).toBe(false);
  });

  it("adds which server failed when the caller knows", () => {
    expect(emailImapErrorText("en", "wrong_password", "smtp")).toBe(
      "The password was not accepted. Outgoing server.",
    );
    expect(emailImapErrorText("es", "tls")).toBe("La conexión segura con el servidor falló.");
  });
});

import { afterAll, beforeAll, expect, it } from "vitest";
import { MailboxClient, MailboxFailure } from "./email-imap-mailbox.js";
import { buildRawMessage } from "./email-imap-message.js";
import { TestMailServer } from "./email-imap-test-server.js";

const USER = "ada@example.test";
const PASSWORD = "app-password";
const access = { allowPrivateHosts: true, allowInsecure: true };

const server = new TestMailServer(USER, PASSWORD);
const client = new MailboxClient(access);

function settings(password = PASSWORD) {
  return {
    email: USER,
    password,
    username: USER,
    imap: { host: "127.0.0.1", port: server.imapPort, security: "starttls" as const },
    smtp: { host: "127.0.0.1", port: server.smtpPort, security: "starttls" as const },
  };
}

const raw = Buffer.from(
  [
    "From: <ada@example.test>",
    "To: <bob@example.test>",
    "Subject: Hello",
    "Date: Tue, 12 Nov 2026 12:00:00 +0000",
    "Message-ID: <m1@example.test>",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="bound"',
    "",
    "--bound",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "See the note.",
    "--bound",
    'Content-Type: text/plain; name="note.txt"',
    'Content-Disposition: attachment; filename="note.txt"',
    "",
    "hello attachment",
    "--bound--",
    "",
  ].join("\r\n"),
);

beforeAll(async () => {
  await server.start();
  server.seed("INBOX", raw);
});

afterAll(async () => {
  await client.closeAll();
  await server.stop();
});

it("refuses a loopback server unless the test seam is on", async () => {
  const guarded = new MailboxClient();
  await expect(guarded.test(settings())).rejects.toMatchObject({ code: "private_host" });
});

it("logs in to IMAP and SMTP, and reports a wrong password", async () => {
  await client.test(settings());
  await expect(client.test(settings("nope"))).rejects.toBeInstanceOf(MailboxFailure);
  await expect(client.test(settings("nope"))).rejects.toMatchObject({ code: "wrong_password" });
});

it("lists folders, searches, and reads the body and a text attachment", async () => {
  const folders = await client.listFolders("ada", settings());
  expect(folders).toEqual(expect.arrayContaining(["INBOX", "Drafts", "Sent"]));
  const found = await client.search("ada", settings(), { from: "ada@example.test", text: "note" });
  expect(found).toEqual([
    expect.objectContaining({ folder: "INBOX", from: "ada@example.test", subject: "Hello" }),
  ]);
  const message = await client.read("ada", settings(), { uid: found[0]!.uid });
  expect(message.text).toContain("See the note.");
  expect(message.attachments[0]).toMatchObject({
    filename: "note.txt",
    contentType: "text/plain",
    text: "hello attachment",
  });
});

it("appends a draft and sends with reply headers and a Sent copy", async () => {
  const draft = await client.createDraft("ada", settings(), {
    to: "bob@example.test",
    subject: "Later",
    text: "Not yet.",
  });
  expect(draft.folder).toBe("Drafts");
  expect(server.messages("Drafts")[0]?.raw.toString("utf8")).toContain("Not yet.");
  const sent = await client.reply("ada", settings(), {
    uid: server.messages("INBOX")[0]!.uid,
    to: "ada@example.test",
    text: "Thanks",
  });
  expect(sent.savedToSent).toBe(true);
  const copy = server.smtpMessages.at(-1)?.toString("utf8") ?? "";
  expect(copy).toContain("In-Reply-To: <m1@example.test>");
  expect(copy).toContain("References: <m1@example.test>");
  expect(copy).toContain("Subject: Re: Hello");
  expect(server.messages("Sent").at(-1)?.raw.toString("utf8")).toContain(
    "In-Reply-To: <m1@example.test>",
  );
});

it("reuses one IMAP login for two reads", async () => {
  const fresh = new MailboxClient(access);
  const before = server.logins;
  await fresh.listFolders("reuse", settings());
  await fresh.listFolders("reuse", settings());
  expect(server.logins - before).toBe(1);
  await fresh.closeAll();
});

it("builds a forward subject without calling it a reply", () => {
  const rawForward = buildRawMessage({
    from: USER,
    to: ["cara@example.test"],
    subject: "Fwd: Hello",
    text: "See below",
    references: ["m1@example.test"],
  });
  const text = rawForward.toString("utf8");
  expect(text).toContain("Subject: Fwd: Hello");
  expect(text).not.toContain("In-Reply-To:");
  expect(text).toContain("References: <m1@example.test>");
});

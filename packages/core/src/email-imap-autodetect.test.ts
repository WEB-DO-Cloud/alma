import { describe, expect, it } from "vitest";
import type { DetectedMailbox } from "./email-imap-autodetect.js";
import {
  chooseMailboxSettings,
  emailDomainCandidates,
  guessMailboxes,
  parseAutoconfigXml,
  parseAutodiscoverXml,
  serversFromMx,
} from "./email-imap-autodetect.js";

function found(input: Parameters<typeof chooseMailboxSettings>[0]): DetectedMailbox {
  const choice = chooseMailboxSettings(input);
  if (!choice.detected) throw new Error("expected a mailbox");
  return choice.settings;
}

const EMAIL = "ada@mail.example.com";
const PUBLIC = new Set([
  "imap.example.com",
  "smtp.example.com",
  "mail.example.com",
  "imap.gmail.com",
  "smtp.gmail.com",
  "imap.zoho.eu",
  "smtp.zoho.eu",
]);

const AUTOCONFIG = `<?xml version="1.0"?>
<clientConfig>
  <emailProvider>
    <incomingServer type="imap">
      <hostname>imap.example.com</hostname>
      <port>993</port>
      <socketType>SSL</socketType>
      <username>%EMAILADDRESS%</username>
    </incomingServer>
    <incomingServer type="pop3">
      <hostname>pop.example.com</hostname>
      <port>995</port>
      <socketType>SSL</socketType>
    </incomingServer>
    <outgoingServer type="smtp">
      <hostname>smtp.example.com</hostname>
      <port>587</port>
      <socketType>STARTTLS</socketType>
      <username>%EMAILLOCALPART%</username>
    </outgoingServer>
  </emailProvider>
</clientConfig>`;

describe("mailbox autodetect", () => {
  it("tries the full domain and then the registered domain", () => {
    expect(emailDomainCandidates("ada@dept.example.co.uk")).toEqual([
      "dept.example.co.uk",
      "example.co.uk",
    ]);
    expect(emailDomainCandidates("ada@example.com")).toEqual(["example.com"]);
  });

  it("reads Thunderbird autoconfig and skips pop and plaintext", () => {
    expect(parseAutoconfigXml(AUTOCONFIG, EMAIL)).toEqual({
      username: EMAIL,
      imap: { host: "imap.example.com", port: 993, security: "ssl" },
      smtp: { host: "smtp.example.com", port: 587, security: "starttls" },
    });
    expect(
      parseAutoconfigXml(
        AUTOCONFIG.replace("STARTTLS", "plain").replace("%EMAILADDRESS%", "%EMAILADDRESS%"),
        EMAIL,
      ),
    ).toBeNull();
  });

  it("ignores an autoconfig host that is not public", () => {
    const xml = AUTOCONFIG.replace("imap.example.com", "127.0.0.1");
    expect(parseAutoconfigXml(xml, EMAIL)).toBeNull();
  });

  it("reads autodiscover IMAP and SMTP", () => {
    const xml = `
      <Protocol><Type>IMAP</Type><Server>imap.example.com</Server><Port>993</Port><Encryption>SSL</Encryption></Protocol>
      <Protocol><Type>SMTP</Type><Server>smtp.example.com</Server><Port>587</Port><Encryption>TLS</Encryption></Protocol>`;
    expect(parseAutodiscoverXml(xml)?.imap.host).toBe("imap.example.com");
    expect(parseAutodiscoverXml(xml)?.smtp.security).toBe("starttls");
  });

  it("maps a known mail exchanger and leaves an unknown one", () => {
    expect(serversFromMx("aspmx.l.google.com", EMAIL)?.imap.host).toBe("imap.gmail.com");
    expect(serversFromMx("mx.zoho.eu", EMAIL)?.smtp.host).toBe("smtp.zoho.eu");
    expect(serversFromMx("mx.example.com", EMAIL)).toBeNull();
  });

  it("guesses mail.domain before imap and smtp, SSL before STARTTLS", () => {
    const guesses = guessMailboxes("example.com", EMAIL);
    expect(guesses[0]).toMatchObject({
      imap: { host: "mail.example.com", port: 993, security: "ssl" },
      smtp: { host: "mail.example.com", port: 465, security: "ssl" },
    });
    expect(guesses[1]?.smtp).toMatchObject({ port: 587, security: "starttls" });
    expect(guesses[2]?.imap.host).toBe("imap.example.com");
  });

  it("prefers a directory, then the exchanger, then a live guess", () => {
    const guess = guessMailboxes("example.com", EMAIL)[0]!;
    expect(
      found({
        email: EMAIL,
        autoconfigs: [AUTOCONFIG],
        autodiscover: [],
        mxHosts: ["aspmx.l.google.com"],
        publicHosts: PUBLIC,
        liveGuesses: [guess],
      }).imap.host,
    ).toBe("imap.example.com");
    expect(
      found({
        email: EMAIL,
        autoconfigs: [],
        autodiscover: [],
        mxHosts: ["mx2.zoho.eu"],
        publicHosts: PUBLIC,
        liveGuesses: [guess],
      }).imap.host,
    ).toBe("imap.zoho.eu");
    expect(
      found({
        email: EMAIL,
        autoconfigs: [],
        autodiscover: [],
        mxHosts: ["mx.unknown.test"],
        publicHosts: PUBLIC,
        liveGuesses: [guess],
      }).smtp.port,
    ).toBe(465);
    expect(
      chooseMailboxSettings({
        email: EMAIL,
        autoconfigs: [],
        autodiscover: [],
        mxHosts: [],
        publicHosts: PUBLIC,
        liveGuesses: [],
      }),
    ).toEqual({ detected: false });
  });

  it("does not treat a directory host as found until it is public", () => {
    expect(
      chooseMailboxSettings({
        email: EMAIL,
        autoconfigs: [AUTOCONFIG],
        autodiscover: [],
        mxHosts: [],
        publicHosts: new Set(),
        liveGuesses: [],
      }),
    ).toEqual({ detected: false });
  });
});

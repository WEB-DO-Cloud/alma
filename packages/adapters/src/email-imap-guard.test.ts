import { describe, expect, it } from "vitest";
import { MailHostRejected, resolvePublicMailHost } from "./email-imap-guard.js";
import type { ResolveHostname } from "./network-address.js";

function resolver(addresses: string[]): ResolveHostname {
  return async () =>
    addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
}

describe("mail host guard", () => {
  it("pins a public address and refuses a name that also points somewhere private", async () => {
    await expect(
      resolvePublicMailHost("imap.example.test", resolver(["203.0.113.10"])),
    ).resolves.toEqual({
      host: "203.0.113.10",
      servername: "imap.example.test",
      addresses: ["203.0.113.10"],
    });
    await expect(
      resolvePublicMailHost("imap.example.test", resolver(["203.0.113.10", "10.0.0.1"])),
    ).rejects.toMatchObject({ code: "private_host" });
  });

  it("refuses loopback, link-local, private, and metadata addresses", async () => {
    for (const address of ["127.0.0.1", "::1", "169.254.169.254", "192.168.0.8", "fd00:ec2::254"]) {
      await expect(
        resolvePublicMailHost("mail.example.test", resolver([address])),
      ).rejects.toBeInstanceOf(MailHostRejected);
    }
    await expect(
      resolvePublicMailHost("127.0.0.1", resolver(["203.0.113.10"])),
    ).rejects.toMatchObject({
      code: "private_host",
    });
    await expect(
      resolvePublicMailHost("localhost", resolver(["203.0.113.10"])),
    ).rejects.toMatchObject({
      code: "private_host",
    });
    await expect(
      resolvePublicMailHost("metadata.google.internal", resolver(["203.0.113.10"])),
    ).rejects.toMatchObject({ code: "private_host" });
  });

  it("does not resolve a host that is not a name", async () => {
    const resolve = viResolve();
    await expect(resolvePublicMailHost("not a host", resolve.fn)).rejects.toMatchObject({
      code: "invalid",
    });
    expect(resolve.calls).toEqual([]);
  });
});

function viResolve(): { fn: ResolveHostname; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fn: async (hostname) => {
      calls.push(hostname);
      return [];
    },
  };
}

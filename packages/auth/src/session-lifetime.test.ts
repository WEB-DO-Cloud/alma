import type * as Db from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "./identity-fixture.js";
import { SESSION_EXPIRES_IN_SECONDS } from "./index.js";

vi.mock("better-auth/adapters/prisma", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return {
    prismaAdapter: (prisma: { authData: Record<string, { id?: unknown }[]> }) => {
      const factory = memoryAdapter(prisma.authData);
      return (options: Parameters<typeof factory>[0]) => {
        const adapter = factory(options);
        return {
          ...adapter,
          create: (async (input: { model: string; data: { id?: unknown } }) => {
            const id = input.data.id;
            if (id !== undefined && prisma.authData[input.model]?.some((row) => row.id === id))
              throw new Error("duplicate key");
            return adapter.create(input as never);
          }) as typeof adapter.create,
        };
      };
    },
  };
});
vi.mock("@rakazo/db", async (original) => ({
  ...(await original<typeof Db>()),
  bootstrapUserSpace: vi.fn(async () => ({ spaceId: "space-1" })),
  leaveInvitedSpaces: vi.fn(async () => ({ ownedOrganizationIds: [] })),
  recordSecurityEvent: vi.fn(async () => undefined),
}));

const DAY = 24 * 60 * 60 * 1000;
const origin = "http://web.example.test";

function sessionCookie(response: Response) {
  const raw = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  if (!raw) throw new Error("missing session cookie");
  return {
    header: raw.split(";")[0]!,
    maxAge: Number(/max-age=(\d+)/i.exec(raw)?.[1]),
    raw,
  };
}

function readSession(auth: ReturnType<typeof fixture>["auth"], cookie: string) {
  return auth.handler(
    new Request("http://auth.example.test/api/auth/get-session", {
      headers: { cookie, origin },
    }),
  );
}

async function signedInUser(response: Response) {
  const body = (await response.json()) as { user?: { id?: string } } | null;
  return body?.user?.id ?? null;
}

describe("session lifetime", () => {
  it("keeps the same cookie across a later visit and drops it on sign-out or a password change", async () => {
    const f = fixture({ delivery: false });
    const signedUp = await f.signup();
    expect(signedUp.status).toBe(200);
    const cookie = sessionCookie(signedUp);
    // No Max-Age would make this a session cookie, dropped when the desktop app quits.
    expect(cookie.maxAge).toBe(SESSION_EXPIRES_IN_SECONDS);
    const { token } = (await signedUp.json()) as { token: string };
    const row = f.data.session!.at(-1)!;
    const lifetime = new Date(row.expiresAt as string | Date).getTime() - Date.now();
    expect(lifetime).toBeGreaterThan(399 * DAY);
    expect(lifetime).toBeLessThanOrEqual(SESSION_EXPIRES_IN_SECONDS * 1000 + 5_000);

    const user = await signedInUser(await readSession(f.auth, cookie.header));
    expect(user).toBeTruthy();
    // Thirty days later a 7-day session would be gone. The same cookie still works.
    row.expiresAt = new Date(Date.now() + 370 * DAY);
    expect(await signedInUser(await readSession(f.auth, cookie.header))).toBe(user);

    const signedOut = await f.request("/sign-out", {}, token);
    expect(signedOut.status).toBe(200);
    expect(sessionCookie(signedOut).raw).toMatch(/max-age=0/i);
    expect(await signedInUser(await readSession(f.auth, cookie.header))).toBeNull();

    const again = await f.signin();
    const next = sessionCookie(again);
    const { token: live } = (await again.json()) as { token: string };
    const changed = await f.request(
      "/change-password",
      {
        currentPassword: "offline-password12",
        newPassword: "offline-password34",
        revokeOtherSessions: true,
      },
      live,
    );
    expect(changed.status).toBe(200);
    expect(await signedInUser(await readSession(f.auth, next.header))).toBeNull();
    const replacement = sessionCookie(changed);
    expect(replacement.maxAge).toBe(SESSION_EXPIRES_IN_SECONDS);
    expect(await signedInUser(await readSession(f.auth, replacement.header))).toBe(user);

    const expired = f.data.session!.at(-1)!;
    expired.expiresAt = new Date(Date.now() - 60_000);
    expect(await signedInUser(await readSession(f.auth, replacement.header))).toBeNull();
  });
});

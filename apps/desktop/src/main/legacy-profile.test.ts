import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  adoptLegacyDesktopProfile,
  legacyDesktopUserDataDirs,
  profileHasSessionCookie,
} from "./legacy-profile.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "alma-profile-"));
  roots.push(dir);
  return dir;
}

async function cookieFile(dir: string, relative: string, body: string) {
  const file = path.join(dir, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

describe("legacy desktop profile", () => {
  it("names the folders the app used before ALMA", () => {
    expect(
      legacyDesktopUserDataDirs({
        packaged: true,
        platform: "darwin",
        home: "/Users/person",
      }),
    ).toEqual([
      "/Users/person/Library/Application Support/Rakazo",
      "/Users/person/Library/Application Support/rakazo",
    ]);
    expect(
      legacyDesktopUserDataDirs({ packaged: false, platform: "darwin", home: "/Users/person" }),
    ).toEqual([]);
  });

  it("copies a login from the previous folder so an update stays signed in", async () => {
    const root = await tempDir();
    const previous = path.join(root, "Rakazo");
    const current = path.join(root, "ALMA");
    await cookieFile(
      previous,
      path.join("Partitions", "persist_rakazo-abc", "Network", "Cookies"),
      "host better-auth.session_token value",
    );
    await cookieFile(previous, "setup.json", '{"mode":"existing"}\n');
    await cookieFile(previous, path.join("Local Storage", "leveldb", "LOG"), "signed-in-before");

    expect(adoptLegacyDesktopProfile(current, [previous, path.join(root, "rakazo")])).toBe(true);
    expect(profileHasSessionCookie(current)).toBe(true);
    expect(await readFile(path.join(current, "setup.json"), "utf8")).toBe('{"mode":"existing"}\n');
  });

  it("does not replace a profile that already has a session", async () => {
    const root = await tempDir();
    const previous = path.join(root, "Rakazo");
    const current = path.join(root, "ALMA");
    await cookieFile(previous, "Cookies", "session_token old");
    await cookieFile(current, "Network/Cookies", "session_token current");
    await cookieFile(current, "setup.json", "current\n");

    expect(adoptLegacyDesktopProfile(current, [previous])).toBe(false);
    expect(await readFile(path.join(current, "Network", "Cookies"), "utf8")).toBe(
      "session_token current",
    );
    expect(await readFile(path.join(current, "setup.json"), "utf8")).toBe("current\n");
  });

  it("does not follow a symlink out of the old profile", async () => {
    const root = await tempDir();
    const previous = path.join(root, "Rakazo");
    const current = path.join(root, "ALMA");
    const outside = path.join(root, "outside");
    await mkdir(previous, { recursive: true });
    await writeFile(outside, "session_token secret");
    await symlink(outside, path.join(previous, "Cookies"));

    expect(profileHasSessionCookie(previous)).toBe(false);
    expect(adoptLegacyDesktopProfile(current, [previous])).toBe(false);
  });
});

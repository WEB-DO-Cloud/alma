import {
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { packagedUserDataDir } from "./setup-config.js";

/** Profile directory names from before the app stored its data under ALMA. */
export const LEGACY_DESKTOP_PROFILE_NAMES = ["Rakazo", "rakazo"] as const;

const PROFILE_ROOT_ENTRIES = [
  "Cookies",
  "Cookies-journal",
  "Network",
  "Partitions",
  "Local Storage",
  "Session Storage",
  "IndexedDB",
  "setup.json",
  "devices",
] as const;

const SESSION_COOKIE_NAME = "session_token";
const MAX_COOKIE_DB_BYTES = 32 * 1024 * 1024;

type UserDataInput = NonNullable<Parameters<typeof packagedUserDataDir>[0]>;

/** Sibling folders the previous desktop build used for the same account. */
export function legacyDesktopUserDataDirs(input: UserDataInput): string[] {
  const current = packagedUserDataDir(input);
  if (current === null) return [];
  const parent = path.dirname(current);
  return LEGACY_DESKTOP_PROFILE_NAMES.map((name) => path.join(parent, name)).filter(
    (dir) => path.resolve(dir) !== path.resolve(current),
  );
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isRealFile(file: string): boolean {
  try {
    return lstatSync(file).isFile();
  } catch (error) {
    if (isEnoent(error)) return false;
    throw error;
  }
}

/** Cookie names are stored in the clear; the value stays encrypted. */
function fileContains(file: string, needle: string): boolean {
  let size = 0;
  try {
    const info = lstatSync(file);
    if (!info.isFile()) return false;
    size = info.size;
  } catch (error) {
    if (isEnoent(error)) return false;
    throw error;
  }
  if (size === 0 || size > MAX_COOKIE_DB_BYTES) return false;
  const needleBuf = Buffer.from(needle);
  const handle = openSync(file, "r");
  try {
    const chunk = Buffer.alloc(Math.min(size, 1024 * 1024));
    let position = 0;
    let carry = Buffer.alloc(0);
    while (position < size) {
      const read = readSync(handle, chunk, 0, chunk.length, position);
      if (read <= 0) break;
      const view = Buffer.concat([carry, chunk.subarray(0, read)]);
      if (view.includes(needleBuf)) return true;
      carry = view.subarray(Math.max(0, view.length - (needleBuf.length - 1)));
      position += read;
    }
    return false;
  } finally {
    closeSync(handle);
  }
}

function cookieDatabases(dir: string): string[] {
  const files = [path.join(dir, "Cookies"), path.join(dir, "Network", "Cookies")];
  const partitions = path.join(dir, "Partitions");
  let names: string[] = [];
  try {
    if (lstatSync(partitions).isDirectory()) names = readdirSync(partitions);
  } catch (error) {
    if (!isEnoent(error)) throw error;
  }
  for (const name of names) {
    const partition = path.join(partitions, name);
    let directory = false;
    try {
      directory = lstatSync(partition).isDirectory();
    } catch (error) {
      if (isEnoent(error)) continue;
      throw error;
    }
    if (!directory) continue;
    files.push(path.join(partition, "Cookies"), path.join(partition, "Network", "Cookies"));
  }
  return files;
}

export function profileHasSessionCookie(dir: string): boolean {
  return cookieDatabases(dir).some(
    (file) => isRealFile(file) && fileContains(file, SESSION_COOKIE_NAME),
  );
}

function isCookieDatabase(file: string): boolean {
  const base = path.basename(file);
  return base === "Cookies" || base === "Cookies-journal";
}

function copyEntry(from: string, to: string): void {
  let info: ReturnType<typeof lstatSync>;
  try {
    info = lstatSync(from);
  } catch (error) {
    if (isEnoent(error)) return;
    throw error;
  }
  // A link could point outside the profile. Leave it behind.
  if (info.isSymbolicLink()) return;
  if (info.isDirectory()) {
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from)) copyEntry(path.join(from, name), path.join(to, name));
    return;
  }
  if (!info.isFile()) return;
  const replace = isCookieDatabase(from);
  if (!replace && existsSync(to)) return;
  mkdirSync(path.dirname(to), { recursive: true });
  if (replace && existsSync(to)) rmSync(to, { force: true });
  copyFileSync(from, to);
}

/**
 * Copies a login left in the previous app folder into this one.
 * A profile that already has its own session is left untouched.
 * Returns true when a legacy login was copied.
 */
export function adoptLegacyDesktopProfile(current: string, legacyDirs: string[]): boolean {
  if (profileHasSessionCookie(current)) return false;
  const legacy = legacyDirs.find(
    (dir) => path.resolve(dir) !== path.resolve(current) && profileHasSessionCookie(dir),
  );
  if (legacy === undefined) return false;
  mkdirSync(current, { recursive: true });
  for (const name of PROFILE_ROOT_ENTRIES)
    copyEntry(path.join(legacy, name), path.join(current, name));
  return profileHasSessionCookie(current);
}

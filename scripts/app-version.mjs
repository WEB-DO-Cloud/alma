// The version both store apps and the desktop app ship. The committed number is
// expo.version. ALMA_VERSION, when set, replaces it for that build on every surface.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STABLE_VERSION = /^\d+\.\d+\.\d+$/;

function requireStable(version, label) {
  if (!STABLE_VERSION.test(version)) {
    throw new Error(`${label} must be MAJOR.MINOR.PATCH, got ${JSON.stringify(version)}.`);
  }
  return version;
}

/** `ALMA_VERSION` when it is set, otherwise the committed mobile version. */
export function resolveAppVersion({ almaVersion, committed }) {
  const fromEnv = typeof almaVersion === "string" ? almaVersion.trim() : "";
  if (fromEnv) return requireStable(fromEnv, "ALMA_VERSION");
  return requireStable(committed, "apps/mobile/app.json expo.version");
}

export function readCommittedAppVersion(root = repoRoot) {
  const app = JSON.parse(readFileSync(path.join(root, "apps/mobile/app.json"), "utf8"));
  const version = app?.expo?.version;
  if (typeof version !== "string") {
    throw new Error("apps/mobile/app.json has no expo.version.");
  }
  return version;
}

/** Writes the resolved version into the desktop package electron-builder reads. */
export function syncDesktopVersion(version, root = repoRoot) {
  requireStable(version, "desktop version");
  const manifestPath = path.join(root, "apps/desktop/package.json");
  const text = readFileSync(manifestPath, "utf8");
  const match = text.match(/"version"\s*:\s*"([^"]+)"/);
  if (!match) throw new Error("apps/desktop/package.json has no version.");
  if (match[1] === version) return version;
  writeFileSync(manifestPath, text.replace(match[0], `"version": "${version}"`));
  return version;
}

function resolvedFromEnv(root = repoRoot) {
  return resolveAppVersion({
    almaVersion: process.env.ALMA_VERSION,
    committed: readCommittedAppVersion(root),
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const command = process.argv[2] ?? "print";
  try {
    const version = resolvedFromEnv();
    if (command === "sync") syncDesktopVersion(version);
    else if (command !== "print") {
      console.error("Usage: node scripts/app-version.mjs [print|sync]");
      process.exit(2);
    }
    console.log(version);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

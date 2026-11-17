// The desktop app and the store apps ship one version. Packaging copies it onto
// the desktop package before electron-builder, and this fails when the committed
// numbers diverge.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  readCommittedAppVersion,
  resolveAppVersion,
  syncDesktopVersion,
} from "../../apps/mobile/scripts/app-version.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const syncCommand = "node apps/mobile/scripts/app-version.mjs sync";

test("the committed desktop version is the committed mobile version", () => {
  const desktop = JSON.parse(readFileSync(path.join(root, "apps/desktop/package.json"), "utf8"));
  assert.equal(desktop.version, readCommittedAppVersion(root));
  for (const name of ["pack", "pack:dir", "release"]) {
    assert.match(desktop.scripts[name], /app-version\.mjs sync/);
  }
});

test("ALMA_VERSION overrides the committed version and a blank one does not", () => {
  assert.equal(resolveAppVersion({ almaVersion: " 1.0.22 ", committed: "1.0.21" }), "1.0.22");
  assert.equal(resolveAppVersion({ almaVersion: "  ", committed: "1.0.21" }), "1.0.21");
  assert.equal(resolveAppVersion({ almaVersion: undefined, committed: "1.0.21" }), "1.0.21");
  assert.throws(
    () => resolveAppVersion({ almaVersion: "1.0", committed: "1.0.21" }),
    /ALMA_VERSION must be MAJOR\.MINOR\.PATCH/,
  );
  assert.throws(
    () => resolveAppVersion({ committed: "v1.0.21" }),
    /expo\.version must be MAJOR\.MINOR\.PATCH/,
  );
});

test("sync writes the resolved version and leaves an unchanged package alone", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "app-version-"));
  const manifestPath = path.join(dir, "apps/desktop/package.json");
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  const original =
    '{ "name": "desktop", "version": "1.0.17", "build": { "appId": "do.alma.desktop" } }\n';
  writeFileSync(manifestPath, original);
  assert.equal(syncDesktopVersion("1.0.21", dir), "1.0.21");
  const written = readFileSync(manifestPath, "utf8");
  assert.match(written, /"version": "1.0.21"/);
  assert.match(written, /"appId": "do.alma.desktop"/);
  const updated = readFileSync(manifestPath);
  assert.equal(syncDesktopVersion("1.0.21", dir), "1.0.21");
  assert.deepEqual(readFileSync(manifestPath), updated);
});

function workflowSlice(source, name) {
  const start = source.indexOf(`\n  ${name}:`);
  assert.notEqual(start, -1, name);
  const rest = source.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z0-9-]+:/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

test("desktop packaging applies the shared version before electron-builder", () => {
  const bitrise = readFileSync(path.join(root, "bitrise.yml"), "utf8");
  for (const name of ["desktop-mac", "desktop-linux"]) {
    const body = workflowSlice(bitrise, name);
    const syncAt = body.indexOf(syncCommand);
    const packAt = body.indexOf("electron-builder");
    assert.ok(syncAt >= 0, `${name} syncs the app version`);
    assert.ok(packAt > syncAt, `${name} syncs before electron-builder`);
  }
  const release = readFileSync(path.join(root, ".github/workflows/release-desktop.yml"), "utf8");
  const syncAt = release.indexOf(syncCommand);
  const packAt = release.indexOf("electron-builder");
  assert.ok(syncAt >= 0, "release-desktop syncs the app version");
  assert.ok(packAt > syncAt, "release-desktop syncs before electron-builder");
  const bump = readFileSync(path.join(root, "apps/mobile/scripts/bump-native.mjs"), "utf8");
  assert.match(bump, /app\.expo\.version = resolveAppVersion\(/);
});

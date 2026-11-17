import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const buildNumber =
  process.argv[2] ?? process.env.BITRISE_BUILD_NUMBER ?? process.env.ALMA_BUILD_NUMBER;
if (!buildNumber || !/^\d+$/.test(buildNumber) || Number(buildNumber) < 1) {
  console.error("Pass a positive integer build number, or set BITRISE_BUILD_NUMBER.");
  process.exit(1);
}

const version = spawnSync(
  process.execPath,
  [join(here, "../../../scripts/app-version.mjs"), "print"],
  {
    encoding: "utf8",
  },
);
if (version.status !== 0) {
  process.stderr.write(version.stderr || version.stdout);
  process.exit(version.status ?? 1);
}

const appPath = join(here, "..", "app.json");
const app = JSON.parse(readFileSync(appPath, "utf8"));
app.expo.ios.buildNumber = String(Number(buildNumber));
app.expo.android.versionCode = Number(buildNumber);
app.expo.version = version.stdout.trim();
writeFileSync(appPath, `${JSON.stringify(app, null, 2)}\n`);

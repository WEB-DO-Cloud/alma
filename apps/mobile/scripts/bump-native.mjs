import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const buildNumber = process.argv[2] ?? process.env.BITRISE_BUILD_NUMBER ?? process.env.ALMA_BUILD_NUMBER;
if (!buildNumber || !/^\d+$/.test(buildNumber) || Number(buildNumber) < 1) {
  console.error("Pass a positive integer build number, or set BITRISE_BUILD_NUMBER.");
  process.exit(1);
}

const appPath = join(dirname(fileURLToPath(import.meta.url)), "..", "app.json");
const app = JSON.parse(readFileSync(appPath, "utf8"));
app.expo.ios.buildNumber = String(Number(buildNumber));
app.expo.android.versionCode = Number(buildNumber);
const version = process.env.ALMA_VERSION?.trim();
if (version) app.expo.version = version;
writeFileSync(appPath, `${JSON.stringify(app, null, 2)}\n`);

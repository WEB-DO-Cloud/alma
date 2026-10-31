import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const mobileRoot = join(repoRoot, "apps/mobile");
const forbidden = [/abogado\s+ia/i, /ai lawyer/i, /asesor[ií]a jur[ií]dica/i, /legal advice/i];

function read(path: string) {
  return readFileSync(path, "utf8");
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

async function parseYaml(source: string) {
  const pnpmDir = join(repoRoot, "node_modules/.pnpm");
  const versions = readdirSync(pnpmDir).filter((name) => name.startsWith("yaml@"));
  for (const version of versions) {
    const packageJson = join(pnpmDir, version, "node_modules/yaml/package.json");
    if (!existsSync(packageJson)) continue;
    const pkg = JSON.parse(read(packageJson)) as { main?: string };
    const file = join(pnpmDir, version, "node_modules/yaml", pkg.main ?? "dist/index.js");
    const imported = (await import(pathToFileURL(file).href)) as {
      parse?: (value: string) => unknown;
      default?: { parse?: (value: string) => unknown };
    };
    const parse = imported.parse ?? imported.default?.parse;
    if (!parse) continue;
    return parse(source) as {
      workflows: Record<string, { steps?: unknown[] }>;
      trigger_map: Array<{ workflow: string }>;
    };
  }
  throw new Error("yaml package is not installed");
}

describe("store listing", () => {
  const metadata = walk(join(mobileRoot, "fastlane/metadata")).filter((path) =>
    path.endsWith(".txt"),
  );

  it("uses the store name and says drafts for review", () => {
    expect(read(join(mobileRoot, "fastlane/metadata/es-ES/name.txt")).trim()).toBe(
      "ALMA Asistente IA",
    );
    expect(read(join(mobileRoot, "fastlane/metadata/en-US/name.txt")).trim()).toBe(
      "ALMA Asistente IA",
    );
    expect(read(join(mobileRoot, "fastlane/metadata/android/es-ES/title.txt")).trim()).toBe(
      "ALMA Asistente IA",
    );
    expect(read(join(mobileRoot, "fastlane/metadata/android/en-US/title.txt")).trim()).toBe(
      "ALMA Asistente IA",
    );
    expect(read(join(mobileRoot, "fastlane/metadata/es-ES/description.txt"))).toContain(
      "borradores para revisión",
    );
    expect(
      read(join(mobileRoot, "fastlane/metadata/en-US/description.txt")).toLowerCase(),
    ).toContain("drafts for review");
    expect(
      read(join(mobileRoot, "fastlane/metadata/android/es-ES/full_description.txt")),
    ).toContain("borradores para revisión");
    expect(
      read(join(mobileRoot, "fastlane/metadata/android/en-US/full_description.txt")).toLowerCase(),
    ).toContain("drafts for review");
  });

  it("does not offer legal advice or an AI lawyer", () => {
    const text = metadata.map((path) => read(path)).join("\n");
    for (const pattern of forbidden) expect(text).not.toMatch(pattern);
  });
});

describe("match", () => {
  const matchfile = read(join(mobileRoot, "fastlane/Matchfile"));

  it("defaults to the private certificates repo and reads auth from the environment", () => {
    expect(matchfile).toContain('ENV.fetch("MATCH_GIT_URL", default_git_url)');
    expect(matchfile).toContain("https://github.com/WEB-DO-Cloud/alma-certificates");
    expect(matchfile).toContain("git_basic_authorization(material)");
    expect(matchfile).toContain("PRIVATE KEY");
    expect(matchfile).toContain("MATCH_GIT_BASIC_AUTHORIZATION");
    expect(matchfile).not.toMatch(/MATCH_PASSWORD\s*=/);
    expect(matchfile).not.toMatch(/password\s*\(/);
  });
});

describe("fastlane lanes", () => {
  const fastfile = read(join(mobileRoot, "fastlane/Fastfile"));

  it("uploads only to TestFlight and the Play internal track", () => {
    expect(read(join(mobileRoot, "Gemfile"))).toContain('gem "fastlane", "2.241.1"');
    expect(read(join(mobileRoot, "Gemfile"))).toContain('gem "cocoapods", "~> 1.17"');
    expect(fastfile).toContain('sh("bundle", "exec", "pod", "install", "--project-directory=ios")');
    expect(fastfile).toContain("submit_for_review: false");
    expect(fastfile).toContain("skip_submission: true");
    expect(fastfile).toContain('track: "internal"');
    expect(fastfile).not.toMatch(/track:\s*"(production|beta|alpha)"/);
    expect(fastfile).toContain('ENV["ALMA_STORE_RELEASE_APPROVED"] == "yes"');
    expect(fastfile).toContain("ALMA_MATCH_CREATE");
    expect(fastfile).toContain("signing = <<-GRADLE");
    expect(fastfile).toContain("signingConfig signingConfigs.release");
    expect(fastfile).toContain("does not submit for App Store review");
    expect(fastfile).not.toMatch(/MATCH_PASSWORD\s*=\s*["']/);
    expect(fastfile).not.toContain("EXPO_PUBLIC_ALMA_MOCK");
    expect(fastfile).not.toContain("alma-screenshots.yaml");
  });
});

describe("bitrise", () => {
  it("runs tests on push and keeps store uploads manual", async () => {
    const source = read(join(repoRoot, "bitrise.yml"));
    const config = await parseYaml(source);
    expect(Object.keys(config.workflows).sort()).toEqual(
      [
        "android-aab",
        "android-apk",
        "android-debug",
        "ios-archive",
        "ios-simulator",
        "manual-play-internal",
        "manual-testflight",
        "mobile-tests",
      ].sort(),
    );
    expect(config.trigger_map.map((entry) => entry.workflow)).toEqual([
      "mobile-tests",
      "mobile-tests",
    ]);
    expect(source).not.toMatch(/ALMA_STORE_RELEASE_APPROVED:\s*["']?yes/);
    expect(source).toContain('{{enveq "BITRISE_USE_UPLOADED_SIGNING" "true"}}');
    expect(source).toContain("osx-xcode-27.1.x");
    expect(source).toContain("ubuntu-resolute-26.04-bitrise-2026-android");
    expect(source).toContain("bundle exec fastlane ios beta");
    expect(source).toContain("bundle exec fastlane android internal");
    const tests = JSON.stringify(config.workflows["mobile-tests"]);
    const installAt = tests.indexOf("pnpm install --frozen-lockfile");
    const generateAt = tests.indexOf("pnpm db:generate");
    expect(installAt).toBeGreaterThanOrEqual(0);
    expect(generateAt).toBeGreaterThan(installAt);
  });
});

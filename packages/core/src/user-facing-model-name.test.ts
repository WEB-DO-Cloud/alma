import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const WORD = /deepseek/i;

const SKIP_DIR = new Set(["node_modules", "dist", "coverage", ".git"]);
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

function filesUnder(dir: string, predicate: (path: string) => boolean): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIR.has(name)) continue;
      const path = join(current, name);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (predicate(path)) found.push(path);
    }
  };
  walk(dir);
  return found;
}

function hits(paths: string[]): string[] {
  const found: string[] = [];
  for (const path of paths) {
    const text = readFileSync(path, "utf8");
    if (!WORD.test(text)) continue;
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (WORD.test(line)) found.push(`${path.slice(root.length + 1)}:${index + 1}`);
    });
  }
  return found;
}

const localeFile = (path: string) =>
  /\/locales\/.+\.(?:po|json|ts)$/.test(path.replaceAll("\\", "/"));

describe("user-facing model names", () => {
  it("keeps the upstream vendor out of translation catalogs", () => {
    const catalogs = [
      ...filesUnder(join(root, "apps/web/src/locales"), localeFile),
      ...filesUnder(join(root, "apps/mobile/locales"), localeFile),
      ...filesUnder(join(root, "apps/mobile/lib/locales"), localeFile),
      ...filesUnder(join(root, "apps/desktop/src/locales"), localeFile),
      ...filesUnder(join(root, "packages/auth/src/locales"), localeFile),
      ...filesUnder(join(root, "packages/page-kit/src/kit/locales"), localeFile),
    ];
    expect(catalogs.length).toBeGreaterThan(10);
    expect(hits(catalogs)).toEqual([]);
  });

  it("keeps the upstream vendor out of rendered product copy", () => {
    const source = (path: string) =>
      /\.(?:tsx?|astro|html|po|json|md)$/.test(path) && !TEST_FILE.test(path);
    const helpDocs = [
      "getting-started",
      "bots-and-chats",
      "import-an-agent",
      "integrations",
      "messaging-apps",
      "routines",
      "computer",
      "memory",
      "skills",
      "approvals",
      "groups",
      "voice-and-calls",
      "models",
      "spaces",
      "bot-secrets",
      "account",
      "desktop-app",
      "mobile-app",
      "fleet-management",
      "build-a-plugin",
    ].map((name) => join(root, "docs", `${name}.md`));
    const paths = [
      ...filesUnder(join(root, "apps/web/src"), source),
      ...filesUnder(join(root, "apps/mobile/app"), source),
      ...filesUnder(join(root, "apps/mobile/components"), source),
      ...filesUnder(join(root, "apps/mobile/lib"), source),
      ...filesUnder(join(root, "apps/desktop/src"), source),
      ...filesUnder(join(root, "packages/auth/src"), (path) => path.endsWith(".tsx")),
      ...filesUnder(join(root, "apps/www/src/pages"), source).filter(
        (path) => !path.endsWith("privacy.astro") && !path.endsWith("terms.astro"),
      ),
      ...filesUnder(join(root, "apps/www/src/layouts"), source),
      join(root, "apps/web/index.html"),
      ...helpDocs,
    ];
    expect(hits(paths)).toEqual([]);
  });
});

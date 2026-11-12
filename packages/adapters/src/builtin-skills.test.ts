import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUILTIN_AGENT_SKILLS, RAKAZO_DOCS_URLS } from "./builtin-skills.js";
import { MAX_SKILL_FILES, MAX_SKILL_FILES_BYTES } from "./plugin-connectors.js";

const repoFile = (path: string) => new URL(`../../../${path}`, import.meta.url);
const publishedSlugs = [
  ...readFileSync(repoFile("apps/www/src/docs.ts"), "utf8").matchAll(/slug: "([\w-]+)"/g),
].map((match) => match[1]);

describe("ALMA skill", () => {
  it("links only to published docs pages", () => {
    const skill = BUILTIN_AGENT_SKILLS.find((s) => s.name === "ALMA")!;
    const urls = [...skill.content.matchAll(/https?:\/\/\S+/g)].map((match) => match[0]);
    expect(urls).toEqual(RAKAZO_DOCS_URLS);
    for (const url of urls) {
      const slug =
        url === "https://app.alma.com.do/docs.md"
          ? publishedSlugs[0]
          : /^https:\/\/app\.alma\.com\.do\/docs\/([\w-]+)\.md$/.exec(url)?.[1];
      expect(publishedSlugs, url).toContain(slug);
      expect(existsSync(repoFile(`docs/${slug}.md`)), url).toBe(true);
    }
  });
});

/** Same cap as a plugin companion file. Not exported from the plugin installer. */
const MAX_SKILL_FILE_BYTES = 100_000;
const IMPORTED = ["frontend-design", "hyperframes", "hyperframes-cli"] as const;
const skillRoot = fileURLToPath(new URL("./builtin-skills/", import.meta.url));

function filesIn(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...filesIn(full));
    else found.push(full);
  }
  return found;
}

describe("imported built-in skills", () => {
  it("embeds the published skill files and stays within companion limits", () => {
    for (const name of IMPORTED) {
      const skill = BUILTIN_AGENT_SKILLS.find((item) => item.name === name);
      expect(skill, name).toBeDefined();
      const directory = path.join(skillRoot, name);
      const onDisk = filesIn(directory);
      const skillMd = onDisk.find((file) => path.relative(directory, file) === "SKILL.md");
      expect(
        readFileSync(skillMd!, "utf8"),
        `${name}: run node packages/adapters/scripts/embed-builtin-skills.mjs`,
      ).toBe(skill!.content);
      const companions = Object.fromEntries(
        onDisk
          .filter((file) => file !== skillMd)
          .map((file) => [
            path.relative(directory, file).split(path.sep).join("/"),
            readFileSync(file, "utf8"),
          ]),
      );
      expect(skill!.files).toEqual(companions);
      expect(Object.keys(companions).length).toBeLessThanOrEqual(MAX_SKILL_FILES);
      const total = Object.values(companions).reduce(
        (sum, text) => sum + Buffer.byteLength(text),
        0,
      );
      expect(total).toBeLessThanOrEqual(MAX_SKILL_FILES_BYTES);
      for (const text of Object.values(companions)) {
        expect(Buffer.byteLength(text)).toBeLessThanOrEqual(MAX_SKILL_FILE_BYTES);
      }
      expect(`${skill!.content}\n${Object.values(companions).join("\n")}`).not.toMatch(/Rakazo/);
    }
  });

  it("keeps license files and drops hyperframes programs and binary assets", () => {
    const frontend = BUILTIN_AGENT_SKILLS.find((skill) => skill.name === "frontend-design")!;
    const hyperframes = BUILTIN_AGENT_SKILLS.find((skill) => skill.name === "hyperframes")!;
    const cli = BUILTIN_AGENT_SKILLS.find((skill) => skill.name === "hyperframes-cli")!;
    expect(frontend.content).toContain("license: Complete terms in LICENSE.txt");
    expect(frontend.files?.["LICENSE.txt"]).toContain("Apache License");
    expect(hyperframes.files?.LICENSE).toContain("Copyright 2026 HeyGen, Inc.");
    expect(cli.files?.LICENSE).toContain("Copyright 2026 HeyGen, Inc.");
    expect(
      Object.keys(cli.files ?? {}).filter((file) => file.startsWith("references/")),
    ).toHaveLength(12);
    const paths = Object.keys(hyperframes.files ?? {});
    expect(paths.some((file) => file.startsWith("scripts/"))).toBe(false);
    expect(
      paths.some(
        (file) => file.endsWith(".html") || file.endsWith(".woff2") || file.endsWith(".mjs"),
      ),
    ).toBe(false);
    expect(paths).toContain("assets/frame-presets/bold-poster/FRAME.md");
    expect(paths.filter((file) => file.endsWith("/FRAME.md"))).toHaveLength(13);
  });
});

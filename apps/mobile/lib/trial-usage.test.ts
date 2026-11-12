import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Messages } from "@lingui/core";
import { setupI18n } from "@lingui/core";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";
import { lingui } from "@lingui/vite-plugin";
import { afterEach, describe, expect, it } from "vitest";
import { trialUsageLabel } from "./trial-usage";

const require = createRequire(import.meta.url);
const { ensureMessageTemplate, shouldExtractTemplate } = require("../message-template.js") as {
  ensureMessageTemplate: (options: { cwd: string; configPath: string }) => Promise<void>;
  shouldExtractTemplate: (env?: { NODE_ENV?: string }) => boolean;
};

const sourceMessage =
  "{days, plural, one {# day left} other {# days left}} · {left, plural, one {# message} other {# messages}}";

let project: string | undefined;
afterEach(() => {
  if (project) rmSync(project, { recursive: true, force: true });
  project = undefined;
});

describe("trial usage label", () => {
  it("fills the day and message counts", () => {
    expect(trialUsageLabel(12, 49)).toBe("12 days left · 49 messages");
    expect(trialUsageLabel(1, 1)).toBe("1 day left · 1 message");
    expect(trialUsageLabel(0, 0)).toBe("0 days left · 0 messages");
    expect(trialUsageLabel(12, 49)).not.toMatch(/\{[A-Za-z0-9_]+\}/);
  });

  it("hides the banner when a count is missing", () => {
    expect(trialUsageLabel(Number.NaN, 3)).toBeNull();
    expect(trialUsageLabel(3, 1.5)).toBeNull();
    expect(trialUsageLabel(-1, 3)).toBeNull();
  });
});

describe("trial usage message in a production catalog", () => {
  it("extracts a template before the mobile release bundle compiles catalogs", () => {
    const transformer = readFileSync(new URL("../metro-transformer.js", import.meta.url), "utf8");
    expect(shouldExtractTemplate({ NODE_ENV: "production" })).toBe(true);
    expect(shouldExtractTemplate({ NODE_ENV: "development" })).toBe(false);
    expect(shouldExtractTemplate({ NODE_ENV: undefined })).toBe(false);
    expect(transformer).toMatch(/options\?\.dev === false[\s\S]*ensureMessageTemplate/);
    expect(transformer).toMatch(/ensureMessageTemplate\(\)[\s\S]*lingui\.transform/);
  });

  it("interpolates the counts from the compiled template and leaves braces when it was not extracted", async () => {
    const built = await projectCatalogs();
    expect(built.msgid).toBe(sourceMessage);

    const withTemplate = productionI18n(built.withTemplate);
    expect(withTemplate._(descriptor(12, 49))).toBe("12 days left · 49 messages");
    expect(withTemplate._(descriptor(1, 1))).toBe("1 day left · 1 message");
    expect(withTemplate._(descriptor(12, 49))).not.toMatch(/\{[A-Za-z0-9_]+\}/);

    const missing = productionI18n(built.withoutTemplate);
    const raw = missing._(descriptor(12, 49));
    expect(raw).toContain("{days");
    expect(raw).toContain("{left");
  });
});

function descriptor(days: number, left: number) {
  return {
    id: generateMessageId(sourceMessage),
    message: sourceMessage,
    values: { days, left },
  };
}

/** The release runtime has no message compiler, so only a compiled catalog can fill placeholders. */
function productionI18n(messages: Messages) {
  const i18n = setupI18n();
  i18n.setMessagesCompiler(undefined as never);
  i18n.load("de", messages);
  i18n.activate("de");
  return i18n;
}

async function projectCatalogs() {
  project = mkdtempSync(path.join(tmpdir(), "alma-trial-usage-"));
  const root = project;
  mkdirSync(path.join(root, "src"), { recursive: true });
  mkdirSync(path.join(root, "locales/en"), { recursive: true });
  mkdirSync(path.join(root, "locales/de"), { recursive: true });
  writeFileSync(
    path.join(root, "src/trial-usage.ts"),
    readFileSync(new URL("./trial-usage.ts", import.meta.url), "utf8"),
  );
  writeFileSync(path.join(root, "locales/en/messages.po"), "");
  writeFileSync(path.join(root, "locales/de/messages.po"), "");
  const configPath = path.join(root, "lingui.config.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      sourceLocale: "en",
      locales: ["en", "de"],
      catalogs: [{ path: "<rootDir>/locales/{locale}/messages", include: ["<rootDir>/src"] }],
    }),
  );
  const german = path.join(root, "locales/de/messages.po");
  const template = path.join(root, "locales/messages.pot");
  await ensureMessageTemplate({ cwd: root, configPath });
  const msgid = messageIds(readFileSync(template, "utf8")).find((id) => id.includes("day left"));
  const withTemplate = await compiledMessages(configPath, german);
  rmSync(template);
  const withoutTemplate = await compiledMessages(configPath, german);
  return { msgid, withTemplate, withoutTemplate };
}

async function compiledMessages(configPath: string, file: string): Promise<Messages> {
  const [config, loader] = lingui({ configPath });
  (config!.configResolved as () => void)();
  const transform = loader!.transform as {
    handler: (this: unknown, src: string, id: string) => Promise<{ code: string }>;
  };
  const context = { addWatchFile: () => undefined, warn: () => undefined };
  const { code } = await transform.handler.call(context, "", file);
  const compiled = (await import(`data:text/javascript,${encodeURIComponent(code)}`)) as {
    messages: Messages;
  };
  return compiled.messages;
}

function messageIds(po: string): string[] {
  return [...po.matchAll(/^msgid ((?:"(?:\\.|[^"\\])*"\n?)+)/gm)].map((match) =>
    match[1]!
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string)
      .join(""),
  );
}

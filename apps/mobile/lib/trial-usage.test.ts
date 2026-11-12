import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Messages } from "@lingui/core";
import { setupI18n } from "@lingui/core";
import { compileMessage } from "@lingui/message-utils/compileMessage";
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

const locales = [
  "en",
  "de",
  "ko",
  "tr",
  "hi",
  "pt-BR",
  "zh-CN",
  "zh-TW",
  "es",
  "ru",
  "fr",
  "he",
  "nl",
  "ja",
  "pl",
] as const;

describe("trial usage translations", () => {
  it.each([
    ["es", 1, 1, "Quedan 1 día · 1 mensaje"],
    ["es", 12, 49, "Quedan 12 días · 49 mensajes"],
    ["es", 1, 5, "Quedan 1 día · 5 mensajes"],
    ["es", 3, 1, "Quedan 3 días · 1 mensaje"],
    ["en", 1, 1, "1 day left · 1 message"],
    ["de", 1, 1, "Noch 1 Tag · 1 Nachricht"],
    ["de", 12, 49, "Noch 12 Tage · 49 Nachrichten"],
    ["fr", 1, 1, "Il reste 1 jour · 1 message"],
    ["fr", 2, 3, "Il reste 2 jours · 3 messages"],
    ["pt-BR", 1, 1, "Falta 1 dia · 1 mensagem"],
    ["pt-BR", 2, 3, "Faltam 2 dias · 3 mensagens"],
    ["nl", 1, 1, "Nog 1 dag · 1 bericht"],
    ["nl", 4, 8, "Nog 4 dagen · 8 berichten"],
    ["ru", 1, 1, "Остался 1 день · 1 сообщение"],
    ["ru", 2, 2, "Осталось 2 дня · 2 сообщения"],
    ["ru", 5, 11, "Осталось 5 дней · 11 сообщений"],
    ["ru", 21, 22, "Остался 21 день · 22 сообщения"],
    ["pl", 1, 1, "Został 1 dzień · 1 wiadomość"],
    ["pl", 2, 3, "Zostały 2 dni · 3 wiadomości"],
    ["pl", 5, 12, "Zostało 5 dni · 12 wiadomości"],
    ["he", 1, 1, "נותר יום אחד · הודעה אחת"],
    ["he", 2, 2, "נותרו יומיים · 2 הודעות"],
    ["he", 5, 5, "נותרו 5 ימים · 5 הודעות"],
    ["ja", 12, 49, "残り12日 · メッセージ49件"],
    ["ko", 12, 49, "12일 남음 · 메시지 49개"],
    ["zh-CN", 12, 49, "剩余 12 天 · 剩余 49 条消息"],
    ["zh-TW", 12, 49, "剩餘 12 天 · 剩餘 49 則訊息"],
    ["tr", 1, 1, "1 gün kaldı · 1 mesaj"],
    ["tr", 12, 49, "12 gün kaldı · 49 mesaj"],
    ["hi", 1, 1, "1 दिन बचा है · 1 संदेश"],
    ["hi", 12, 49, "12 दिन बचे हैं · 49 संदेश"],
  ] as const)("%s shows %s days and %s messages", (locale, days, left, expected) => {
    expect(renderCatalog(locale, days, left)).toBe(expected);
  });

  it.each(locales)("%s fills both counts and does not leave placeholder names", (locale) => {
    const text = renderCatalog(locale, 12, 49);
    expect(text).toContain("12");
    expect(text).toContain("49");
    expect(text).not.toMatch(/\{(?:days|left)\}/);
    if (locale !== "en") expect(text).not.toBe("12 days left · 49 messages");
  });
});

function catalogTranslation(locale: string): string {
  const po = readFileSync(
    new URL(`../../../packages/i18n/locales/${locale}/messages.po`, import.meta.url),
    "utf8",
  );
  const needle = `msgid ${JSON.stringify(sourceMessage)}\nmsgstr `;
  const at = po.indexOf(needle);
  if (at < 0) throw new Error(`missing trial usage translation for ${locale}`);
  const line = po.slice(at + needle.length).split("\n", 1)[0] ?? "";
  return JSON.parse(line) as string;
}

function renderCatalog(locale: string, days: number, left: number): string {
  const i18n = setupI18n();
  i18n.setMessagesCompiler(undefined as never);
  i18n.load(locale, {
    [generateMessageId(sourceMessage)]: compileMessage(catalogTranslation(locale)),
  });
  i18n.activate(locale);
  return i18n._(descriptor(days, left));
}

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

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deploymentGoogleClientId } from "@rakazo/adapters";

/** Pages the in-app help skill may fetch. Self-host guides are not included. */
export const HELP_DOC_NAMES = [
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
] as const;

const GOOGLE_WORKSPACE_DOC = "google-workspace";
const CLIENT_ID_TOKEN = "{{ALMA_GOOGLE_OAUTH_CLIENT_ID}}";
const CLIENT_ID_UNSET = "The client ID is not set on this server.";

const DOC_NAME = /^[a-z0-9-]+$/;

function helpDocNames(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  if (env.ALMA_GOOGLE_BYO_OAUTH !== "true") return HELP_DOC_NAMES;
  return [...HELP_DOC_NAMES, GOOGLE_WORKSPACE_DOC];
}

function withClientId(markdown: string, env: NodeJS.ProcessEnv): string {
  const clientId = deploymentGoogleClientId(env.ALMA_GOOGLE_OAUTH_CLIENT_ID);
  return markdown.replaceAll(CLIENT_ID_TOKEN, clientId ?? CLIENT_ID_UNSET);
}

function docsDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../../../docs"),
    join(process.cwd(), "../../docs"),
    join(process.cwd(), "docs"),
  ];
  return candidates.find((path) => existsSync(join(path, "getting-started.md"))) ?? null;
}

function titleOf(markdown: string, name: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || name;
}

/** Drop self-host links and point sibling pages at this host. */
export function helpMarkdown(markdown: string): string {
  const lines = markdown.split("\n").flatMap((line) => {
    if (/self-host/i.test(line) && /\[[^\]]+\]\([^)]+\)/.test(line) && line.trim().startsWith("-"))
      return [];
    return [
      line
        .replaceAll(/\]\(\.\/self-host[^)]*\)/g, "](#)")
        .replaceAll(/\]\(\.\/([a-z0-9-]+)\.md\)/g, "](/docs/$1.md)"),
    ];
  });
  return lines.join("\n");
}

export function readHelpDoc(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): { title: string; markdown: string } | null {
  if (!DOC_NAME.test(name) || !helpDocNames(env).includes(name)) return null;
  const dir = docsDir();
  if (!dir) return null;
  const file = join(dir, `${name}.md`);
  if (!existsSync(file)) return null;
  const markdown = withClientId(helpMarkdown(readFileSync(file, "utf8")), env);
  return { title: titleOf(markdown, name), markdown };
}

export function helpIndexMarkdown(env: NodeJS.ProcessEnv = process.env): string {
  const pages = helpDocNames(env).flatMap((name) => {
    const page = readHelpDoc(name, env);
    return page ? [`- ${page.title}: /docs/${name}.md`] : [];
  });
  return `# Documentación de ALMA

Estas páginas explican el producto. Están en inglés.

${pages.join("\n")}
`;
}

export function helpIndexHtml(env: NodeJS.ProcessEnv = process.env): string {
  const items = helpDocNames(env).flatMap((name) => {
    const page = readHelpDoc(name, env);
    return page ? [`<li><a href="/docs/${name}.md">${escapeHtml(page.title)}</a></li>`] : [];
  });
  return `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<title>Documentación de ALMA</title>
<main>
<h1>Documentación de ALMA</h1>
<p>Estas páginas explican cómo usar ALMA. El texto de cada artículo está en inglés.</p>
<ul>
${items.join("\n")}
</ul>
</main>
`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

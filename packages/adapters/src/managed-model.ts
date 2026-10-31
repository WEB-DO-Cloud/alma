import { accessSync, constants } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const OFF = new Set(["0", "false", "no", "off"]);

export interface ManagedModelConfig {
  enabled: boolean;
  runtime: string;
  provider: string;
  modelId: string | undefined;
  baseUrl: string | undefined;
  /** Secret for a later host. The config file stores the name, not this value. */
  modelApiKey: string | undefined;
  /** Subscription fallback. Forwarded to the child when set. Never logged. */
  xaiApiKey: string | undefined;
  grokBin: string;
  grokHome: string | undefined;
  scratchRoot: string;
}

export function managedModelEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.ALMA_MANAGED_MODEL?.trim().toLowerCase();
  if (!raw) return true;
  return !OFF.has(raw);
}

/** On, and not overridden by the scripted test runtime. */
export function managedModelActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return managedModelEnabled(env) && env.AGENT_RUNTIME !== "scripted";
}

export function resolveManagedModel(env: NodeJS.ProcessEnv = process.env): ManagedModelConfig {
  return {
    enabled: managedModelEnabled(env),
    runtime: env.ALMA_MODEL_RUNTIME?.trim() || "grok-build",
    provider: env.ALMA_MODEL_PROVIDER?.trim() || "xai",
    modelId: env.ALMA_MODEL_ID?.trim() || undefined,
    baseUrl: env.ALMA_MODEL_BASE_URL?.trim() || undefined,
    modelApiKey: env.ALMA_MODEL_API_KEY?.trim() || undefined,
    xaiApiKey: env.XAI_API_KEY?.trim() || undefined,
    grokBin: env.GROK_BIN?.trim() || "grok",
    grokHome: env.GROK_HOME?.trim() || undefined,
    scratchRoot: resolveGrokScratchRoot(env),
  };
}

/**
 * Grok's per-thread scratch directory. An explicit `ALMA_GROK_SCRATCH` wins.
 * Otherwise use `<DATA_DIR>/alma-grok` when that directory is writable, then
 * `/data/alma-grok` when no data dir is configured. The prod image runs as
 * `node` and `/tmp` is not a reliable writable path there.
 */
export function resolveGrokScratchRoot(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.ALMA_GROK_SCRATCH?.trim();
  if (explicit) return explicit;
  const configured = env.DATA_DIR?.trim();
  if (configured) {
    return directoryWritable(configured)
      ? path.join(configured, "alma-grok")
      : path.join(os.tmpdir(), "alma-grok");
  }
  if (directoryWritable("/data")) return path.join("/data", "alma-grok");
  return path.join(os.tmpdir(), "alma-grok");
}

function directoryWritable(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function managedDraftIdentity(config: ManagedModelConfig): {
  model: string;
  modelVersion: string;
} {
  return {
    model: config.provider,
    modelVersion: config.modelId || "subscription-default",
  };
}

/** The model the executor should run when the member has no credential. */
export function managedRuntimeModel(config: ManagedModelConfig): { provider: string; id: string } {
  return { provider: config.provider, id: config.modelId || "subscription-default" };
}

const ALMA_TABLE = "[model.alma]";

/**
 * Ensures the alma model table exists. Other tables stay. The secret value is
 * not written; `env_key` is the variable name the child already receives.
 */
export async function writeAlmaModelTable(config: ManagedModelConfig): Promise<void> {
  if (!config.baseUrl || !config.grokHome) return;
  await mkdir(config.grokHome, { recursive: true });
  const file = path.join(config.grokHome, "config.toml");
  let current = "";
  try {
    current = await readFile(file, "utf8");
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  const modelId = config.modelId || "alma";
  const table = [
    ALMA_TABLE,
    `model = ${tomlString(modelId)}`,
    `base_url = ${tomlString(config.baseUrl)}`,
    `name = "ALMA"`,
    `env_key = "ALMA_MODEL_API_KEY"`,
    "",
  ].join("\n");
  const without = removeTomlTable(current, "model.alma");
  const withDefault = setModelsDefault(without, "alma");
  const next = `${withDefault.trimEnd()}\n\n${table}`;
  await writeFile(file, next.endsWith("\n") ? next : `${next}\n`, { mode: 0o600 });
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function removeTomlTable(source: string, name: string): string {
  const lines = source.split("\n");
  const header = `[${name}]`;
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === header) {
      skipping = true;
      continue;
    }
    if (skipping && trimmed.startsWith("[") && trimmed.endsWith("]")) skipping = false;
    if (!skipping) kept.push(line);
  }
  return kept.join("\n");
}

function setModelsDefault(source: string, modelName: string): string {
  const lines = source.split("\n");
  let inModels = false;
  let found = false;
  let replaced = false;
  const next: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      if (inModels && !replaced) next.push(`default = ${tomlString(modelName)}`);
      inModels = trimmed === "[models]";
      if (inModels) found = true;
      replaced = false;
    } else if (inModels && trimmed.startsWith("default")) {
      next.push(`default = ${tomlString(modelName)}`);
      replaced = true;
      continue;
    }
    next.push(line);
  }
  if (inModels && !replaced) next.push(`default = ${tomlString(modelName)}`);
  if (!found) {
    if (next.length && next[next.length - 1] !== "") next.push("");
    next.push("[models]", `default = ${tomlString(modelName)}`);
  }
  return next.join("\n");
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AdapterContext,
  AgentRunRequest,
  AgentRuntime,
  AgentRuntimeEvent,
} from "@rakazo/adapter-kit";
import { ALMA_UNAVAILABLE_MESSAGE } from "@rakazo/core";
import { getLogger } from "@rakazo/logging";
import type { ManagedModelConfig } from "./managed-model.js";
import { managedRuntimeModel, writeAlmaModelTable } from "./managed-model.js";

const RULES_LIMIT = 32_000;
const PROMPT_LIMIT = 100_000;
const RULES_OVERFLOW = "Follow the rules at the start of the prompt.";
const DISALLOWED_TOOLS =
  "run_terminal_cmd,grep,read_file,search_replace,list_dir,web_search,web_fetch,todo_write,task,Agent";
const DENY = ["Bash", "Edit", "Write", "Read", "Grep", "WebFetch", "MCPTool"] as const;
const AUTH_FAILURE = /auth|login|unauthorized|expired/i;
const SESSION_TAKEN = /already in use|already exists/i;

interface LiveRun {
  controller: AbortController;
  child: ChildProcess | null;
}

const running = new Map<string, LiveRun>();
const threadLocks = new Map<string, Promise<void>>();

export function threadSessionId(threadId: string): string {
  const hex = createHash("sha256").update(`alma-thread:${threadId}`).digest("hex").slice(0, 32);
  const chars = hex.split("");
  chars[12] = "5";
  const variant = (Number.parseInt(chars[16] ?? "0", 16) & 0x3) | 0x8;
  chars[16] = variant.toString(16);
  const body = chars.join("");
  return `${body.slice(0, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}-${body.slice(16, 20)}-${body.slice(20)}`;
}

export class GrokBuildAgentRuntime implements AgentRuntime {
  constructor(private readonly config: ManagedModelConfig) {}

  describe() {
    return {
      id: "grok-build",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: {
        streaming: true,
        compaction: false,
        tools: false,
        scripted: false,
        managed: managedRuntimeModel(this.config),
      },
    };
  }

  async abort(runId: string): Promise<void> {
    const live = running.get(runId);
    live?.controller.abort();
    await killChild(live?.child ?? null);
  }

  async *run(
    request: AgentRunRequest,
    context?: Partial<AdapterContext>,
  ): AsyncIterable<AgentRuntimeEvent> {
    const release = await acquireThread(request.threadId);
    const controller = new AbortController();
    const live: LiveRun = { controller, child: null };
    running.set(request.runId, live);
    const signal = abortSignalAny(context?.signal, controller.signal);
    try {
      if (signal.aborted) {
        yield { type: "done" };
        return;
      }
      const built = buildPrompt(request);
      if (!built) {
        yield* unavailable("alma.managed-model.runtime-failed", { reason: "empty-prompt" });
        return;
      }
      const scratch = path.join(this.config.scratchRoot, request.threadId);
      if (insideGit(this.config.scratchRoot) || insideGit(scratch)) {
        yield* unavailable("alma.managed-model.scratch-rejected", {
          reason: "git-parent",
        });
        return;
      }
      const authed = await usableAuth(this.config.grokHome);
      if (!authed && !this.config.xaiApiKey) {
        yield* unavailable("alma.managed-model.auth-missing", { reason: "no-session" });
        return;
      }
      await mkdir(scratch, { recursive: true });
      if (this.config.baseUrl) await writeAlmaModelTable(this.config);
      const sessionId = threadSessionId(request.threadId);
      let resume = false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const outcome = yield* this.spawnOnce({
          request,
          live,
          signal,
          scratch,
          sessionId,
          resume,
          prompt: resume ? built.user : built.full,
          rules: built.rules,
        });
        if (outcome !== "retry-resume" || resume) return;
        resume = true;
      }
    } finally {
      if (running.get(request.runId) === live) running.delete(request.runId);
      release();
    }
  }

  private async *spawnOnce(input: {
    request: AgentRunRequest;
    live: LiveRun;
    signal: AbortSignal;
    scratch: string;
    sessionId: string;
    resume: boolean;
    prompt: string;
    rules: string;
  }): AsyncIterable<AgentRuntimeEvent, "done" | "retry-resume"> {
    const args = grokArgs(this.config, input);
    if (input.prompt.length > PROMPT_LIMIT) {
      const file = path.join(input.scratch, "prompt.txt");
      await writeFile(file, input.prompt, { mode: 0o600 });
      const promptFlag = args.indexOf("-p");
      args.splice(promptFlag, 2, "--prompt-file", file);
    }
    let child: ChildProcess;
    try {
      child = spawn(this.config.grokBin, args, {
        cwd: input.scratch,
        shell: false,
        env: childEnv(this.config),
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      yield* unavailable("alma.managed-model.runtime-failed", {
        reason: "spawn",
        detail: errorName(error),
      });
      return "done";
    }
    input.live.child = child;
    const events: GrokEvent[] = [];
    let stderr = "";
    let closed = false;
    let exitCode: number | null = null;
    let spawnFailed: string | undefined;
    let wake: (() => void) | undefined;
    const notify = () => {
      wake?.();
      wake = undefined;
    };
    const stdout = child.stdout;
    const stderrStream = child.stderr;
    if (!stdout || !stderrStream) {
      yield* unavailable("alma.managed-model.runtime-failed", { reason: "spawn" });
      return "done";
    }
    let buffer = "";
    stdout.setEncoding("utf8");
    stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) events.push(parseGrokLine(line));
        newline = buffer.indexOf("\n");
      }
      notify();
    });
    stderrStream.setEncoding("utf8");
    stderrStream.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-4_000);
      notify();
    });
    child.on("error", (error) => {
      spawnFailed = errorName(error);
      closed = true;
      notify();
    });
    child.on("close", (code) => {
      exitCode = code;
      closed = true;
      notify();
    });
    const onAbort = () => {
      void killChild(child);
    };
    if (input.signal.aborted) onAbort();
    else input.signal.addEventListener("abort", onAbort, { once: true });

    let yieldedText = false;
    let sawTool = false;
    let toolName = "";
    let stop = false;
    const waitForIo = () =>
      new Promise<void>((resolve) => {
        if (closed || events.length > 0) {
          resolve();
          return;
        }
        wake = resolve;
      });
    try {
      while (!stop) {
        if (events.length === 0) {
          if (closed) break;
          await waitForIo();
          continue;
        }
        const event = events.shift()!;
        if (event.type === "text" && event.text) {
          yieldedText = true;
          yield { type: "text", text: event.text };
          continue;
        }
        if (event.type === "tool_call") {
          sawTool = true;
          toolName = event.toolName ?? "tool";
          await killChild(child);
          stop = true;
          break;
        }
        if (event.type === "error" || event.type === "max_turns_reached") {
          stderr = `${stderr}\n${event.message ?? event.type}`;
          stop = true;
          break;
        }
        if (event.type === "end") {
          stop = true;
          break;
        }
      }
      while (!closed) await waitForIo();
      if (buffer.trim()) events.push(parseGrokLine(buffer.trim()));
    } finally {
      input.signal.removeEventListener("abort", onAbort);
    }

    if (input.signal.aborted) {
      if (!yieldedText) yield { type: "done" };
      return "done";
    }
    if (sawTool) {
      getLogger().error("alma.managed-model.tool-blocked", { tool: toolName });
      if (!yieldedText) yield { type: "text", text: ALMA_UNAVAILABLE_MESSAGE };
      yield { type: "done" };
      return "done";
    }
    const failureText = `${stderr}\n${events.map((event) => event.message ?? "").join("\n")}`;
    const failed = spawnFailed || (exitCode !== null && exitCode !== 0);
    if (!failed) {
      yield { type: "done" };
      return "done";
    }
    if (!input.resume && SESSION_TAKEN.test(failureText)) return "retry-resume";
    if (AUTH_FAILURE.test(failureText)) {
      getLogger().error("alma.managed-model.auth-rejected", { exitCode });
    } else {
      getLogger().error("alma.managed-model.runtime-failed", {
        reason: spawnFailed ? "spawn" : "exit",
        exitCode,
      });
    }
    if (!yieldedText) yield { type: "text", text: ALMA_UNAVAILABLE_MESSAGE };
    yield { type: "done" };
    return "done";
  }
}

interface GrokEvent {
  type: string;
  text?: string;
  message?: string;
  toolName?: string;
}

export function parseGrokLine(line: string): GrokEvent {
  try {
    const value = JSON.parse(line) as {
      type?: unknown;
      data?: unknown;
      message?: unknown;
      toolName?: unknown;
    };
    return {
      type: typeof value.type === "string" ? value.type : "ignored",
      text: typeof value.data === "string" ? value.data : undefined,
      message: typeof value.message === "string" ? value.message : undefined,
      toolName: typeof value.toolName === "string" ? value.toolName : undefined,
    };
  } catch {
    return { type: "ignored" };
  }
}

export function grokArgs(
  config: ManagedModelConfig,
  input: { scratch: string; sessionId: string; resume: boolean; prompt: string; rules: string },
): string[] {
  const args = [
    "--no-auto-update",
    "--output-format",
    "streaming-json",
    "--cwd",
    input.scratch,
    "--max-turns",
    "1",
    "--tools",
    "",
    "--disallowed-tools",
    DISALLOWED_TOOLS,
  ];
  for (const name of DENY) args.push("--deny", name);
  args.push("--verbatim");
  if (config.baseUrl) args.push("-m", "alma");
  else if (config.modelId) args.push("-m", config.modelId);
  args.push(
    "--rules",
    input.rules,
    "-p",
    input.prompt,
    input.resume ? "-r" : "-s",
    input.sessionId,
  );
  return args;
}

function buildPrompt(
  request: AgentRunRequest,
): { full: string; user: string; rules: string } | null {
  const userText = request.prompt.trim();
  if (!userText) return null;
  const user = `User: ${userText}`;
  const history = request.history
    .filter((item) => item.role === "user" || item.role === "assistant")
    .map((item) => `${item.role === "user" ? "User" : "Assistant"}: ${item.content}`)
    .join("\n");
  let full = history ? `${history}\n${user}` : user;
  const instructions = request.instructions ?? "";
  const rules = instructions.length <= RULES_LIMIT ? instructions : RULES_OVERFLOW;
  if (instructions.length > RULES_LIMIT) {
    full = `Rules:\n${instructions}\n\nRequest:\n${full}`;
  }
  return { full, user, rules };
}

function childEnv(config: ManagedModelConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: process.env.LANG,
    GROK_DISABLE_AUTOUPDATER: "1",
  };
  if (config.grokHome) env.GROK_HOME = config.grokHome;
  if (config.xaiApiKey) env.XAI_API_KEY = config.xaiApiKey;
  if (config.modelApiKey) env.ALMA_MODEL_API_KEY = config.modelApiKey;
  return env;
}

async function usableAuth(home: string | undefined): Promise<boolean> {
  if (!home) return false;
  try {
    const raw = await readFile(path.join(home, "auth.json"), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Boolean(
      parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        Object.keys(parsed).length > 0,
    );
  } catch {
    return false;
  }
}

function insideGit(dir: string): boolean {
  let current = path.resolve(dir);
  for (;;) {
    if (existsSync(path.join(current, ".git"))) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

async function* unavailable(
  event: string,
  bindings: Record<string, unknown>,
): AsyncIterable<AgentRuntimeEvent> {
  getLogger().error(event, bindings);
  yield { type: "text", text: ALMA_UNAVAILABLE_MESSAGE };
  yield { type: "done" };
}

function errorName(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string")
    return error.code;
  return "error";
}

async function killChild(child: ChildProcess | null): Promise<void> {
  if (!child || child.killed || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 2_000);
    timer.unref?.();
    child.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function acquireThread(threadId: string): Promise<() => void> {
  const previous = threadLocks.get(threadId) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  threadLocks.set(threadId, tail);
  return previous.then(() => () => {
    release();
    if (threadLocks.get(threadId) === tail) threadLocks.delete(threadId);
  });
}

function abortSignalAny(left: AbortSignal | undefined, right: AbortSignal): AbortSignal {
  if (!left) return right;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (left.aborted || right.aborted) controller.abort();
  else {
    left.addEventListener("abort", abort, { once: true });
    right.addEventListener("abort", abort, { once: true });
  }
  return controller.signal;
}

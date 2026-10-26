import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentRunRequest } from "@rakazo/adapter-kit";
import { ALMA_UNAVAILABLE_MESSAGE } from "@rakazo/core";
import { getLogger } from "@rakazo/logging";
import { afterEach, expect, it, vi } from "vitest";
import { GrokBuildAgentRuntime, threadSessionId } from "./grok-build-runtime.js";
import { resolveManagedModel } from "./managed-model.js";
import { UnavailableManagedRuntime } from "./unavailable-managed-runtime.js";

const FAKE = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const home = process.env.GROK_HOME;
const mode = fs.readFileSync(path.join(home, "mode.txt"), "utf8").trim();
const record = path.join(home, "argv.json");
const previous = fs.existsSync(record) ? JSON.parse(fs.readFileSync(record, "utf8")) : [];
previous.push({ argv: process.argv.slice(2), cwd: process.cwd() });
fs.writeFileSync(record, JSON.stringify(previous));
if (mode === "stream") {
  process.stdout.write(JSON.stringify({ type: "text", data: "hola" }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "end" }) + "\\n");
  process.exit(0);
}
if (mode === "auth") {
  process.stdout.write(JSON.stringify({ type: "error", message: "authentication expired" }) + "\\n");
  process.exit(1);
}
if (mode === "tool") {
  process.stdout.write(JSON.stringify({ type: "tool_call", toolName: "run_terminal_cmd" }) + "\\n");
  setInterval(() => {}, 1000);
}
if (mode === "busy") {
  const count = previous.length;
  if (count === 1) {
    process.stderr.write("session already in use\\n");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({ type: "text", data: "seguido" }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "end" }) + "\\n");
  process.exit(0);
}
process.exit(1);
`;

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

it("formats a stable session id", () => {
  const id = threadSessionId("thread-1");
  expect(id).toBe(threadSessionId("thread-1"));
  expect(id).not.toBe(threadSessionId("thread-2"));
  expect(id.split("-")[2]?.startsWith("5")).toBe(true);
});

it("streams text from a fake grok and denies its tools", async () => {
  const { runtime, home } = await fixture("stream");
  const events = [];
  for await (const event of runtime.run(request("Hola"), undefined)) events.push(event);
  expect(events).toEqual([
    { type: "text", text: "hola" },
    { type: "done" },
  ]);
  const argv = JSON.parse(await readFile(path.join(home, "argv.json"), "utf8")) as Array<{
    argv: string[];
    cwd: string;
  }>;
  expect(argv).toHaveLength(1);
  expect(argv[0]?.argv).toEqual(expect.arrayContaining(["--tools", "", "--disallowed-tools", "--max-turns", "1", "-s"]));
  expect(argv[0]?.cwd).toContain("scratch");
  expect(argv[0]?.argv.includes("-s")).toBe(true);
});

it("shows the Spanish sentence when grok rejects the session and does not log the key", async () => {
  const error = vi.spyOn(getLogger(), "error").mockImplementation(() => undefined);
  const { runtime } = await fixture("auth", { XAI_API_KEY: "xai-test-fixture" });
  const events = [];
  for await (const event of runtime.run(request("Hola"), undefined)) events.push(event);
  expect(events).toEqual([
    { type: "text", text: ALMA_UNAVAILABLE_MESSAGE },
    { type: "done" },
  ]);
  expect(error).toHaveBeenCalledWith("alma.managed-model.auth-rejected", expect.any(Object));
  expect(JSON.stringify(error.mock.calls)).not.toContain("xai-test-fixture");
});

it("hides a tool call and logs the tool name", async () => {
  const error = vi.spyOn(getLogger(), "error").mockImplementation(() => undefined);
  const { runtime } = await fixture("tool");
  const events = [];
  for await (const event of runtime.run(request("Hola"), undefined)) events.push(event);
  expect(events.map((event) => (event.type === "text" ? event.text : event.type))).toEqual([
    ALMA_UNAVAILABLE_MESSAGE,
    "done",
  ]);
  expect(JSON.stringify(events)).not.toContain("run_terminal_cmd");
  expect(error).toHaveBeenCalledWith(
    "alma.managed-model.tool-blocked",
    expect.objectContaining({ tool: "run_terminal_cmd" }),
  );
});

it("resumes with -r when the session id is already in use", async () => {
  const { runtime, home } = await fixture("busy");
  const events = [];
  for await (const event of runtime.run(request("Hola"), undefined)) events.push(event);
  expect(events).toEqual([
    { type: "text", text: "seguido" },
    { type: "done" },
  ]);
  const argv = JSON.parse(await readFile(path.join(home, "argv.json"), "utf8")) as Array<{
    argv: string[];
  }>;
  expect(argv[0]?.argv).toContain("-s");
  expect(argv[1]?.argv).toContain("-r");
  expect(argv[1]?.argv).not.toContain("-s");
});

it("does not spawn when the scratch directory is inside a git checkout", async () => {
  const error = vi.spyOn(getLogger(), "error").mockImplementation(() => undefined);
  const root = path.join(os.tmpdir(), `alma-git-${Date.now()}`);
  roots.push(root);
  const repo = path.join(root, "repo");
  await mkdir(repo, { recursive: true });
  await writeFile(path.join(repo, ".git"), "");
  const home = path.join(root, "home");
  await mkdir(home);
  await writeFile(path.join(home, "auth.json"), '{"ok":true}');
  await writeFile(path.join(home, "mode.txt"), "stream");
  const script = path.join(root, "grok");
  await writeFile(script, FAKE, { mode: 0o755 });
  const runtime = new GrokBuildAgentRuntime(
    resolveManagedModel({
      GROK_BIN: script,
      GROK_HOME: home,
      ALMA_GROK_SCRATCH: path.join(repo, "scratch"),
    }),
  );
  const events = [];
  for await (const event of runtime.run(request("Hola"), undefined)) events.push(event);
  expect(events[0]).toEqual({ type: "text", text: ALMA_UNAVAILABLE_MESSAGE });
  await expect(readFile(path.join(home, "argv.json"), "utf8")).rejects.toThrow();
  expect(error).toHaveBeenCalledWith(
    "alma.managed-model.scratch-rejected",
    expect.objectContaining({ reason: "git-parent" }),
  );
});

it("uses the Spanish sentence for an unknown runtime id", async () => {
  const error = vi.spyOn(getLogger(), "error").mockImplementation(() => undefined);
  const runtime = new UnavailableManagedRuntime(
    resolveManagedModel({ ALMA_MODEL_RUNTIME: "later-host" }),
  );
  const events = [];
  for await (const event of runtime.run(request("Hola"), undefined)) events.push(event);
  expect(events[0]).toEqual({ type: "text", text: ALMA_UNAVAILABLE_MESSAGE });
  expect(error).toHaveBeenCalledWith(
    "alma.managed-model.runtime-failed",
    expect.objectContaining({ reason: "unknown-runtime", runtime: "later-host" }),
  );
});

async function fixture(mode: string, extra: NodeJS.ProcessEnv = {}) {
  const root = path.join(os.tmpdir(), `alma-grok-${mode}-${Date.now()}-${Math.random()}`);
  roots.push(root);
  const home = path.join(root, "home");
  const scratch = path.join(root, "scratch");
  await mkdir(home, { recursive: true });
  await writeFile(path.join(home, "auth.json"), '{"session":"present"}');
  await writeFile(path.join(home, "mode.txt"), mode);
  const script = path.join(root, "grok");
  await writeFile(script, FAKE, { mode: 0o755 });
  const runtime = new GrokBuildAgentRuntime(
    resolveManagedModel({
      ...extra,
      GROK_BIN: script,
      GROK_HOME: home,
      ALMA_GROK_SCRATCH: scratch,
    }),
  );
  return { runtime, home, scratch };
}

function request(prompt: string): AgentRunRequest {
  return {
    botId: "bot-1",
    threadId: "thread-1",
    runId: `run-${prompt}`,
    prompt,
    instructions: "Prepara borradores para revisión.",
    history: [],
    tools: [],
    model: { provider: "xai", id: "subscription-default" },
  } as AgentRunRequest;
}

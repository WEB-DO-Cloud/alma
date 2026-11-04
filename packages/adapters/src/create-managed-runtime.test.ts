import type { AgentRuntime } from "@rakazo/adapter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { selectChatRuntime } from "./create-managed-runtime.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

function piRuntime(): AgentRuntime {
  return {
    describe: () => ({
      id: "pi",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { streaming: true, compaction: true, tools: true, scripted: false },
    }),
    run: () => (async function* () {})(),
    abort: async () => undefined,
  };
}

describe("selectChatRuntime", () => {
  it("keeps Grok Build when the runtime is unset", () => {
    vi.stubEnv("ALMA_MANAGED_MODEL", "1");
    vi.stubEnv("AGENT_RUNTIME", "pi");
    vi.stubEnv("ALMA_MODEL_RUNTIME", "");
    expect(selectChatRuntime("pi", piRuntime()).describe().id).toBe("grok-build");
  });

  it("runs the caller's Pi runtime on DeepSeek when ALMA_MODEL_RUNTIME=pi", () => {
    vi.stubEnv("ALMA_MANAGED_MODEL", "1");
    vi.stubEnv("AGENT_RUNTIME", "pi");
    vi.stubEnv("ALMA_MODEL_RUNTIME", "pi");
    vi.stubEnv("PI_DEFAULT_PROVIDER", "deepseek");
    vi.stubEnv("PI_DEFAULT_MODEL", "deepseek-flash");
    const pi = piRuntime();
    const selected = selectChatRuntime("pi", pi);
    expect(selected.describe()).toMatchObject({
      id: "pi",
      capabilities: { managed: { provider: "deepseek", id: "deepseek-flash" }, tools: true },
    });
    expect(selected).not.toBe(pi);
  });

  it("leaves an unknown runtime unavailable", () => {
    vi.stubEnv("ALMA_MANAGED_MODEL", "1");
    vi.stubEnv("AGENT_RUNTIME", "pi");
    vi.stubEnv("ALMA_MODEL_RUNTIME", "later-host");
    expect(selectChatRuntime("pi", piRuntime()).describe().id).toBe("later-host");
  });
});

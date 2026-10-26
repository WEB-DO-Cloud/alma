import type { AgentRuntime } from "@rakazo/adapter-kit";
import { GrokBuildAgentRuntime } from "./grok-build-runtime.js";
import type { ManagedModelConfig } from "./managed-model.js";
import { managedModelActive, resolveManagedModel } from "./managed-model.js";
import { ScriptedAgentRuntime } from "./scripted-runtime.js";
import { UnavailableManagedRuntime } from "./unavailable-managed-runtime.js";

export function createManagedAgentRuntime(config: ManagedModelConfig): AgentRuntime {
  if (config.runtime === "grok-build") return new GrokBuildAgentRuntime(config);
  return new UnavailableManagedRuntime(config);
}

/**
 * Scripted runs win, then the operator model, then the Pi runtime the caller built.
 * `pi` is constructed by the caller so session recording stays at the composition root.
 */
export function selectChatRuntime(agentRuntime: string, pi: AgentRuntime): AgentRuntime {
  if (agentRuntime === "scripted") return new ScriptedAgentRuntime();
  if (managedModelActive()) return createManagedAgentRuntime(resolveManagedModel());
  return pi;
}

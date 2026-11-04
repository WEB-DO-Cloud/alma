import type { AgentRuntime } from "@rakazo/adapter-kit";
import { GrokBuildAgentRuntime } from "./grok-build-runtime.js";
import type { ManagedModelConfig } from "./managed-model.js";
import { managedChatModel, managedModelActive, resolveManagedModel } from "./managed-model.js";
import { ScriptedAgentRuntime } from "./scripted-runtime.js";
import { UnavailableManagedRuntime } from "./unavailable-managed-runtime.js";

export function createManagedAgentRuntime(config: ManagedModelConfig): AgentRuntime {
  if (config.runtime === "grok-build") return new GrokBuildAgentRuntime(config);
  return new UnavailableManagedRuntime(config);
}

/**
 * The caller's Pi runtime, marked as the operator model so the executor does not
 * ask for a member key. Session recording stays on the instance the caller built.
 */
export function withManagedPiRuntime(pi: AgentRuntime): AgentRuntime {
  const managed = managedChatModel();
  if (!managed) return pi;
  return {
    describe: () => {
      const described = pi.describe();
      return { ...described, capabilities: { ...described.capabilities, managed } };
    },
    run: (request, context) => pi.run(request, context),
    abort: (runId) => pi.abort(runId),
  };
}

/**
 * Scripted runs win, then the operator model, then the Pi runtime the caller built.
 * `pi` is constructed by the caller so session recording stays at the composition root.
 * `ALMA_MODEL_RUNTIME=pi` uses that same runtime. Unset stays on Grok Build.
 */
export function selectChatRuntime(agentRuntime: string, pi: AgentRuntime): AgentRuntime {
  if (agentRuntime === "scripted") return new ScriptedAgentRuntime();
  if (!managedModelActive()) return pi;
  const config = resolveManagedModel();
  if (config.runtime === "pi") return withManagedPiRuntime(pi);
  return createManagedAgentRuntime(config);
}

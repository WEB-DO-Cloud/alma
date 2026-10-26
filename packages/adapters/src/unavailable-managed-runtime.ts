import type {
  AdapterContext,
  AgentRunRequest,
  AgentRuntime,
  AgentRuntimeEvent,
} from "@rakazo/adapter-kit";
import { ALMA_UNAVAILABLE_MESSAGE } from "@rakazo/core";
import { getLogger } from "@rakazo/logging";
import type { ManagedModelConfig } from "./managed-model.js";
import { managedRuntimeModel } from "./managed-model.js";

/** An unknown runtime id boots, then every run tells the lawyer the sentence. */
export class UnavailableManagedRuntime implements AgentRuntime {
  constructor(private readonly config: ManagedModelConfig) {}

  describe() {
    return {
      id: this.config.runtime,
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: {
        streaming: false,
        compaction: false,
        tools: false,
        scripted: false,
        managed: managedRuntimeModel(this.config),
      },
    };
  }

  async abort(): Promise<void> {}

  async *run(
    _request: AgentRunRequest,
    _context?: Partial<AdapterContext>,
  ): AsyncIterable<AgentRuntimeEvent> {
    getLogger().error("alma.managed-model.runtime-failed", {
      reason: "unknown-runtime",
      runtime: this.config.runtime,
    });
    yield { type: "text", text: ALMA_UNAVAILABLE_MESSAGE };
    yield { type: "done" };
  }
}

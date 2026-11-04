import type { AgentRunRequest, AgentRuntimeEvent } from "@rakazo/adapter-kit";
import { describe, expect, it } from "vitest";
import { PiAgentRuntime } from "./pi-runtime.js";

const REASONING = "Check the statute before answering.";

function sse(deltas: unknown[], finish: string): Response {
  const chunks = deltas.map(
    (delta) =>
      `data: ${JSON.stringify({
        id: "fixture",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta, finish_reason: null }],
      })}\n\n`,
  );
  chunks.push(
    `data: ${JSON.stringify({
      id: "fixture",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: {}, finish_reason: finish }],
    })}\n\n`,
  );
  return new Response(`${chunks.join("")}data: [DONE]\n\n`, {
    headers: { "content-type": "text/event-stream" },
  });
}

describe("DeepSeek thinking mode", () => {
  it("echoes reasoning_content through the tool loop and keeps it out of the reply", async () => {
    const bodies: Array<{ messages: Array<Record<string, unknown>> }> = [];
    let calls = 0;
    const runtime = new PiAgentRuntime({
      modelFetch: async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)) as { messages: Array<Record<string, unknown>> });
        calls += 1;
        if (calls === 1) {
          return sse(
            [
              { reasoning_content: REASONING },
              {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_lookup",
                    type: "function",
                    function: { name: "lookup", arguments: '{"q":"fee"}' },
                  },
                ],
              },
            ],
            "tool_calls",
          );
        }
        return sse([{ content: "The filing fee is 42." }], "stop");
      },
    });
    const request = {
      botId: "bot",
      threadId: "thread",
      runId: `run-${Math.random()}`,
      prompt: "What is the filing fee?",
      instructions: "Answer briefly.",
      history: [],
      tools: [
        {
          name: "lookup",
          description: "Look up a fixture",
          inputSchema: { type: "object", properties: { q: { type: "string" } } },
          readOnly: true,
        },
      ],
      executeTool: async () => "42",
      model: {
        provider: "deepseek",
        id: "deepseek-flash",
        apiKey: "sk-deepseek-fixture",
        thinkingLevel: "high",
      },
    } as AgentRunRequest;
    const events: AgentRuntimeEvent[] = [];
    for await (const event of runtime.run(request, {
      operationId: "deepseek-thinking",
      traceId: "deepseek-thinking",
      spaceId: "space",
      userId: "user",
      signal: new AbortController().signal,
    })) {
      events.push(event);
    }

    const reply = events
      .filter((event) => event.type === "text")
      .map((event) => event.text)
      .join("");
    expect(reply).toContain("The filing fee is 42.");
    expect(reply).not.toContain(REASONING);
    expect(calls).toBeGreaterThanOrEqual(2);
    const followUp = bodies[1]?.messages.find(
      (message) => message.role === "assistant" && message.tool_calls,
    );
    expect(followUp?.reasoning_content).toBe(REASONING);
    expect(JSON.stringify(followUp?.content ?? "")).not.toContain(REASONING);
    expect(JSON.stringify(bodies)).not.toContain("sk-deepseek-fixture");
  });
});

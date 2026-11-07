import { describe, expect, it } from "vitest";
import {
  almaAssistantCopy,
  assistantFacingTools,
  assistantTurnText,
} from "./alma-assistant-copy.js";
import { builtinAgentTools } from "./builtin-tools.js";
import { userTurnInstructions } from "./run-instructions.js";

const BOT_INSTRUCTIONS = "Keep the name Rakazo in my private job notes.";

describe("assistant product copy", () => {
  it("replaces the product name the model would repeat", () => {
    expect(almaAssistantCopy("Open the Rakazo desktop app. Rakazo's skill.")).toBe(
      "Open the ALMA desktop app. ALMA's skill.",
    );
    expect(almaAssistantCopy("rakazo://stay and RakazoDesktop stay")).toBe(
      "rakazo://stay and RakazoDesktop stay",
    );
  });

  it("keeps the bot's own instructions and removes the product name from the rest", () => {
    const parts = userTurnInstructions({
      botInstructions: BOT_INSTRUCTIONS,
      groupContext: undefined,
      messagingContext: undefined,
      redactedMemoryContext: undefined,
      redactedScratchpadContext: undefined,
      hasHistoricalContext: false,
      computerInstruction: "You have a persistent computer.",
      pageBrowserAllowed: false,
      workspaceInstruction: "Workspace",
      agentEnvironmentInstruction: undefined,
      botDirectory: undefined,
      pluginLine: undefined,
      agentSkillsLine: "Skills",
      taughtSkillsLine: undefined,
      replyGuidance: "Reply",
      userComputer: "offline",
    });
    const text = assistantTurnText(parts, BOT_INSTRUCTIONS);
    expect(text).toContain(BOT_INSTRUCTIONS);
    expect(text).toContain("read the ALMA skill");
    expect(text).toContain("open the ALMA desktop app");
    expect(text).toContain("correo");
    expect(text.replace(BOT_INSTRUCTIONS, "")).not.toMatch(/\bRakazo\b/);
  });

  it("removes the product name from tool descriptions the model can quote", () => {
    const tools = assistantFacingTools(builtinAgentTools);
    const connect = tools.find((tool) => tool.name === "connect_app");
    expect(connect?.description).toContain("correo");
    expect(connect?.description).toContain("Never tell the user to open settings");
    expect(JSON.stringify(tools)).not.toMatch(/\bRakazo\b/);
    expect(builtinAgentTools.find((tool) => tool.name === "save_page")?.description).toMatch(
      /\bRakazo\b/,
    );
  });
});

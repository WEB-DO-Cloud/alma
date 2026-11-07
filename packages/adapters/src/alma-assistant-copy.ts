import type { ConnectorTool } from "@rakazo/adapter-kit";

/** Product name the model is allowed to say. Upstream prompts still say the old one. */
export function almaAssistantCopy(text: string): string {
  return text.replace(/\bRakazo\b/g, "ALMA");
}

export const EMAIL_CONNECT_GUIDANCE =
  "When the user asks to connect email, in any language, call connect_app for Gmail and for Outlook and wait for the cards. Words such as email, mail, correo, gmail, google workspace, outlook, microsoft 365, and hotmail are those apps. If connect_app says an app is not in the catalog, offer the apps it lists. Never tell the user to open settings, admin, or billing to connect an app.";

const CONNECT_APP_DESCRIPTION =
  "Show an inline card to connect an app in this chat when you need an unconnected app or the user asks to connect one, in any language. For email, call it once for Gmail and once for Outlook. Aliases that mean those apps: email, mail, correo, gmail, google workspace, outlook, microsoft 365, hotmail. Then wait. If the app is not in the catalog, the result lists apps you can offer with connect_app. Never tell the user to open settings, admin, or billing.";

function rewriteSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewriteSchema);
  if (!value || typeof value !== "object") return value;
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    copy[key] =
      key === "description" && typeof item === "string"
        ? almaAssistantCopy(item)
        : rewriteSchema(item);
  }
  return copy;
}

/**
 * Instructions handed to the model. The bot's own instructions stay as written.
 * Every other line is product copy, so the old product name is replaced. The mail
 * rule is added when this run can connect apps.
 */
export function assistantTurnText(
  parts: readonly (string | undefined)[],
  botInstructions: string,
  options?: { mail?: boolean },
): string {
  return [
    ...parts
      .filter((part): part is string => Boolean(part))
      .map((part) => (part === botInstructions ? part : almaAssistantCopy(part))),
    ...(options?.mail === false ? [] : [EMAIL_CONNECT_GUIDANCE]),
  ].join("\n\n");
}

/** Tool text the model can repeat. Leaves names and argument values alone. */
export function assistantFacingTools<T extends Pick<ConnectorTool, "name" | "description">>(
  tools: readonly T[],
): T[] {
  return tools.map((tool) => ({
    ...tool,
    description:
      tool.name === "connect_app" ? CONNECT_APP_DESCRIPTION : almaAssistantCopy(tool.description),
    ...("inputSchema" in tool ? { inputSchema: rewriteSchema(tool.inputSchema) } : {}),
  }));
}

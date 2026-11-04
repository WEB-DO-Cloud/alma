/** The pinned human-support chat. The stored name stays "Support"; clients translate it. */
export function isSupportBot(bot: { kind?: string | null } | null | undefined): boolean {
  return bot?.kind === "support";
}

/**
 * English source for an automated support reply (no person attached).
 * Clients translate this exact string.
 */
export const SUPPORT_DESK_NAME = "ALMA Support";

/** First name on an agent reply, the desk name when it has no sender, or null outside support. */
export function supportAgentName(blocks: readonly object[]): string | null {
  for (const block of blocks) {
    if (!("source" in block) || block.source !== "chatwoot") continue;
    const name =
      "agentName" in block && typeof block.agentName === "string" ? block.agentName.trim() : "";
    return name || SUPPORT_DESK_NAME;
  }
  return null;
}

export function supportDeliveryFailed(blocks: readonly object[]): boolean {
  return blocks.some((block) => "supportDelivery" in block && block.supportDelivery === "failed");
}

/** Push and server copy. Spanish locales use Soporte; everything else uses Support. */
export function supportBotLabel(locale: string | null | undefined): "Soporte" | "Support" {
  const tag = (locale ?? "").trim().toLowerCase();
  return tag === "es" || tag.startsWith("es-") ? "Soporte" : "Support";
}

/** The pinned human-support chat. The stored name stays "Support"; clients translate it. */
export function isSupportBot(bot: { kind?: string | null } | null | undefined): boolean {
  return bot?.kind === "support";
}

/** First name shown on an agent reply, or null when the message did not come from support. */
export function supportAgentName(blocks: readonly object[]): string | null {
  for (const block of blocks) {
    if (!("source" in block) || block.source !== "chatwoot") continue;
    const name =
      "agentName" in block && typeof block.agentName === "string" ? block.agentName.trim() : "";
    return name || "ALMA";
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

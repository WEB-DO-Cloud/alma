import type { ArtifactStore, NotificationProvider } from "@rakazo/adapter-kit";
import {
  acceptSupportReply,
  claimWebhookDelivery,
  loadSupportChatwootConfig,
  payloadAccountId,
  payloadInboxId,
  readInboundReply,
  releaseWebhookDelivery,
  verifySupportWebhook,
} from "@rakazo/adapters";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import type { Hono } from "hono";

export const SUPPORT_WEBHOOK_PATH = "/api/support/chatwoot/webhook";

export function mountSupportWebhook(
  app: Hono,
  deps: {
    prisma: PrismaClient;
    events: ThreadEvents;
    artifacts: ArtifactStore;
    notifications?: NotificationProvider;
  },
) {
  app.post(`${SUPPORT_WEBHOOK_PATH}/:secret`, async (c) => {
    const config = loadSupportChatwootConfig();
    const rawBody = await c.req.text();
    let payload: unknown = {};
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody) as unknown;
      } catch {
        getLogger().warn("support webhook rejected", { reason: "json" });
        return c.json({ error: "unauthorized" }, 401);
      }
    }
    const verdict = verifySupportWebhook({
      enabled: Boolean(config?.enabled && config.urlSecret),
      urlSecret: config?.urlSecret ?? "",
      providedSecret: c.req.param("secret"),
      inboxWebhookSecret: config?.inboxWebhookSecret,
      signatureHeader: c.req.header("x-chatwoot-signature"),
      timestampHeader: c.req.header("x-chatwoot-timestamp"),
      rawBody,
      now: Date.now(),
      accountId: config?.accountId ?? "",
      inboxId: config?.inboxId ?? "",
      payloadAccountId: payloadAccountId(payload),
      payloadInboxId: payloadInboxId(payload),
    });
    if (!verdict.ok) {
      getLogger().warn("support webhook rejected", { reason: verdict.reason });
      return c.json({ error: "unauthorized" }, verdict.status);
    }
    if (!config) return c.json({ error: "unauthorized" }, 404);

    const eventName =
      payload && typeof payload === "object" && "event" in payload
        ? String((payload as { event?: unknown }).event ?? "")
        : "";
    if (eventName === "conversation_status_changed") {
      const conversationId = payloadInboxId(payload) ? payloadAccountId(payload) : undefined;
      getLogger().info("support conversation status changed", {
        conversationId:
          payload && typeof payload === "object"
            ? String(
                ((payload as { conversation?: { id?: unknown } }).conversation?.id ?? "") || "",
              )
            : "",
      });
      void conversationId;
      return c.json({ ok: true });
    }

    const deliveryId = c.req.header("x-chatwoot-delivery")?.trim();
    if (deliveryId) {
      const claimed = await claimWebhookDelivery(deps.prisma, deliveryId);
      if (!claimed) return c.json({ ok: true, duplicate: true });
    }
    try {
      const reply = readInboundReply(payload);
      if (!reply) return c.json({ ok: true });
      const result = await acceptSupportReply({ ...deps, config }, reply);
      return c.json({ ok: true, result });
    } catch (error) {
      if (deliveryId) await releaseWebhookDelivery(deps.prisma, deliveryId);
      getLogger().error("support webhook failed", error);
      return c.json({ error: "unavailable" }, 500);
    }
  });
}

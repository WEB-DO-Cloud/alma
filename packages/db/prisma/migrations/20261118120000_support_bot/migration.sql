-- Pinned human-support chat. Additive: kind defaults to standard, so the previous release keeps working.

ALTER TABLE "bots" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'standard';
CREATE UNIQUE INDEX "bots_user_support_kind" ON "bots" ("userId") WHERE "kind" = 'support';

CREATE TABLE "support_links" (
  "userId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "chatwootContactId" TEXT,
  "chatwootSourceId" TEXT,
  "chatwootConversationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_links_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX "support_links_botId_key" ON "support_links"("botId");
CREATE INDEX "support_links_chatwootConversationId_idx" ON "support_links"("chatwootConversationId");
ALTER TABLE "support_links" ADD CONSTRAINT "support_links_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_links" ADD CONSTRAINT "support_links_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_links" ADD CONSTRAINT "support_links_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "support_inbound_messages" (
  "chatwootMessageId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_inbound_messages_pkey" PRIMARY KEY ("chatwootMessageId")
);
CREATE UNIQUE INDEX "support_inbound_messages_messageId_key" ON "support_inbound_messages"("messageId");
CREATE INDEX "support_inbound_messages_userId_spaceId_idx" ON "support_inbound_messages"("userId", "spaceId");

CREATE TABLE "support_webhook_deliveries" (
  "deliveryId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_webhook_deliveries_pkey" PRIMARY KEY ("deliveryId")
);

ALTER TABLE "support_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_inbound_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_webhook_deliveries" ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_links_tenant ON "support_links"
  USING (
    "userId" = NULLIF(current_setting('app.user_id', true), '')
    AND "spaceId" = NULLIF(current_setting('app.space_id', true), '')
  );
CREATE POLICY support_links_system ON "support_links"
  USING ((SELECT app_rls_bypass()));

CREATE POLICY support_inbound_messages_tenant ON "support_inbound_messages"
  USING (
    "userId" = NULLIF(current_setting('app.user_id', true), '')
    AND "spaceId" = NULLIF(current_setting('app.space_id', true), '')
  );
CREATE POLICY support_inbound_messages_system ON "support_inbound_messages"
  USING ((SELECT app_rls_bypass()));

CREATE POLICY support_webhook_deliveries_system ON "support_webhook_deliveries"
  USING ((SELECT app_rls_bypass()));

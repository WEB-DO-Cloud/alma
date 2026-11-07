-- Notification policy and held routine pushes.
-- Additive: the previous release does not read these tables.

CREATE TABLE "user_notification_policies" (
  "userId" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'both',
  "quietStartMinute" INTEGER,
  "quietEndMinute" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_notification_policies_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "user_notification_policies_channel_check" CHECK ("channel" IN ('push', 'in_app', 'both')),
  CONSTRAINT "user_notification_policies_quiet_check" CHECK (
    ("quietStartMinute" IS NULL AND "quietEndMinute" IS NULL)
    OR (
      "quietStartMinute" BETWEEN 0 AND 1439
      AND "quietEndMinute" BETWEEN 0 AND 1439
    )
  )
);

CREATE TABLE "notification_batches" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "flushingAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "notification_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_batches_kind_check" CHECK ("kind" = 'routine')
);

CREATE INDEX "notification_batches_userId_sentAt_idx" ON "notification_batches"("userId", "sentAt");
CREATE UNIQUE INDEX "notification_batches_one_unsent" ON "notification_batches"("userId") WHERE "sentAt" IS NULL;

ALTER TABLE "user_notification_policies"
  ADD CONSTRAINT "user_notification_policies_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_batches"
  ADD CONSTRAINT "notification_batches_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_notification_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_batches" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "user_notification_policies", "notification_batches" TO rakazo_app;

CREATE POLICY user_notification_policies_tenant ON "user_notification_policies"
  USING ("userId" = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK ("userId" = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY user_notification_policies_system ON "user_notification_policies"
  USING ((SELECT app_rls_bypass()));

CREATE POLICY notification_batches_tenant ON "notification_batches"
  USING ("userId" = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK ("userId" = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY notification_batches_system ON "notification_batches"
  USING ((SELECT app_rls_bypass()));

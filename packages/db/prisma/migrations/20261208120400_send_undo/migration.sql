-- Per-user undo window. Additive: the previous release does not read this table.

CREATE TABLE "send_undo_settings" (
  "userId" TEXT NOT NULL,
  "seconds" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "send_undo_settings_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "send_undo_settings_seconds_check" CHECK ("seconds" IN (0, 10, 30, 60))
);

ALTER TABLE "send_undo_settings"
  ADD CONSTRAINT "send_undo_settings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "send_undo_settings" ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "send_undo_settings" TO rakazo_app;

CREATE POLICY send_undo_settings_tenant ON "send_undo_settings"
  USING ("userId" = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK ("userId" = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY send_undo_settings_system ON "send_undo_settings"
  USING ((SELECT app_rls_bypass()));

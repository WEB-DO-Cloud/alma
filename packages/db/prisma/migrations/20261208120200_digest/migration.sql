-- Morning and Monday counts. Additive: the previous release does not read these tables.

CREATE TABLE "digest_subscriptions" (
  "userId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "weekly" BOOLEAN NOT NULL DEFAULT true,
  "minuteOfDay" INTEGER NOT NULL DEFAULT 450,
  "email" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "digest_subscriptions_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "digest_subscriptions_minute_check" CHECK ("minuteOfDay" BETWEEN 0 AND 1439)
);

CREATE TABLE "digest_issues" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "localDate" TEXT NOT NULL,
  "draftCount" INTEGER NOT NULL,
  "reminderCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "digest_issues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "digest_issues_kind_check" CHECK ("kind" IN ('daily', 'weekly'))
);

CREATE UNIQUE INDEX "digest_issues_userId_kind_localDate_key" ON "digest_issues"("userId", "kind", "localDate");

ALTER TABLE "digest_subscriptions"
  ADD CONSTRAINT "digest_subscriptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "digest_issues"
  ADD CONSTRAINT "digest_issues_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "digest_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "digest_issues" ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "digest_subscriptions", "digest_issues" TO rakazo_app;

CREATE POLICY digest_subscriptions_tenant ON "digest_subscriptions"
  USING ("userId" = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK ("userId" = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY digest_subscriptions_system ON "digest_subscriptions"
  USING ((SELECT app_rls_bypass()));

CREATE POLICY digest_issues_tenant ON "digest_issues"
  USING ("userId" = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK ("userId" = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY digest_issues_system ON "digest_issues"
  USING ((SELECT app_rls_bypass()));

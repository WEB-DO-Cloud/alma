-- No-card trial, sector profile, and first-party activation events.
-- Additive: the previous release does not read these tables.

CREATE TABLE "alma_trials" (
  "organizationId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "messageCap" INTEGER NOT NULL,
  "messagesUsed" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "alma_trials_pkey" PRIMARY KEY ("organizationId")
);

CREATE TABLE "alma_profiles" (
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "use" TEXT NOT NULL,
  "sector" TEXT,
  "source" TEXT NOT NULL,
  "appliedInstructions" TEXT,
  "checklistDismissedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "alma_profiles_pkey" PRIMARY KEY ("organizationId")
);

CREATE TABLE "activation_events" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "sector" TEXT,
  "use" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activation_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "activation_events_dedupeKey_key" ON "activation_events"("dedupeKey");
CREATE INDEX "activation_events_organizationId_createdAt_idx" ON "activation_events"("organizationId", "createdAt");

ALTER TABLE "alma_trials" ADD CONSTRAINT "alma_trials_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alma_profiles" ADD CONSTRAINT "alma_profiles_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activation_events" ADD CONSTRAINT "activation_events_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rakazo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "alma_trials", "alma_profiles", "activation_events" TO rakazo_app;
  END IF;
END $$;

ALTER TABLE "alma_trials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alma_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activation_events" ENABLE ROW LEVEL SECURITY;

-- A tenant sees the row for the organization that owns the selected space.
CREATE POLICY alma_trials_tenant ON "alma_trials"
  USING (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "alma_trials"."organizationId"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "alma_trials"."organizationId"
  ));
CREATE POLICY alma_trials_system ON "alma_trials"
  USING ((SELECT app_rls_bypass()))
  WITH CHECK ((SELECT app_rls_bypass()));

CREATE POLICY alma_profiles_tenant ON "alma_profiles"
  USING (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "alma_profiles"."organizationId"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "alma_profiles"."organizationId"
  ));
CREATE POLICY alma_profiles_system ON "alma_profiles"
  USING ((SELECT app_rls_bypass()))
  WITH CHECK ((SELECT app_rls_bypass()));

CREATE POLICY activation_events_tenant ON "activation_events"
  USING (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "activation_events"."organizationId"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "activation_events"."organizationId"
  ));
CREATE POLICY activation_events_system ON "activation_events"
  USING ((SELECT app_rls_bypass()))
  WITH CHECK ((SELECT app_rls_bypass()));

-- An organization's own Google OAuth client. Additive: the previous release never reads it.
-- The ciphertext is the client secret. remoteAuthConfigIds holds toolkit slug to auth config id.

CREATE TABLE "organization_google_oauth_clients" (
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "remoteAuthConfigIds" JSONB NOT NULL DEFAULT '{}',
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_google_oauth_clients_pkey" PRIMARY KEY ("organizationId")
);

ALTER TABLE "organization_google_oauth_clients"
  ADD CONSTRAINT "organization_google_oauth_clients_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rakazo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "organization_google_oauth_clients" TO rakazo_app;
  END IF;
END $$;

ALTER TABLE "organization_google_oauth_clients" ENABLE ROW LEVEL SECURITY;

-- A tenant sees the row for the organization that owns the selected space.
CREATE POLICY organization_google_oauth_clients_tenant ON "organization_google_oauth_clients"
  USING (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "organization_google_oauth_clients"."organizationId"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "organization_google_oauth_clients"."organizationId"
  ));

CREATE POLICY organization_google_oauth_clients_system ON "organization_google_oauth_clients"
  USING ((SELECT app_rls_bypass()));

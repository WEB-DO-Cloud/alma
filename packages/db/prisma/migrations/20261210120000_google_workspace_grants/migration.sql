-- Google sign-in for Gmail, Calendar, and Drive. Additive: the previous release does not read it.
-- The ciphertext is the verifier while pending, then the access token, refresh token, and expiry.

CREATE TABLE "google_workspace_grants" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_workspace_grants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "google_workspace_grants_provider_check" CHECK ("provider" IN ('gmail', 'googlecalendar', 'googledrive')),
    CONSTRAINT "google_workspace_grants_status_check" CHECK ("status" IN ('pending', 'connected', 'expired'))
);

CREATE INDEX "google_workspace_grants_spaceId_userId_provider_idx" ON "google_workspace_grants"("spaceId", "userId", "provider");

ALTER TABLE "google_workspace_grants"
  ADD CONSTRAINT "google_workspace_grants_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rakazo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "google_workspace_grants" TO rakazo_app;
  END IF;
END $$;

ALTER TABLE "google_workspace_grants" ENABLE ROW LEVEL SECURITY;

CREATE POLICY google_workspace_grants_tenant ON "google_workspace_grants"
  USING (
    "userId" = NULLIF(current_setting('app.user_id', true), '')
    AND "spaceId" = NULLIF(current_setting('app.space_id', true), '')
  )
  WITH CHECK (
    "userId" = NULLIF(current_setting('app.user_id', true), '')
    AND "spaceId" = NULLIF(current_setting('app.space_id', true), '')
  );

CREATE POLICY google_workspace_grants_system ON "google_workspace_grants"
  USING ((SELECT app_rls_bypass()));

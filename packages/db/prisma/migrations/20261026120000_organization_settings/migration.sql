-- Firm profile, named lawyers, logo metadata, and an append-only settings audit.
-- Additive: the previous release never reads these tables.
-- Lawyers and logos are not deleted by the app. The audit table rejects UPDATE, DELETE, and TRUNCATE.

CREATE TABLE "organization_profiles" (
    "organizationId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL DEFAULT '',
    "tradeName" TEXT NOT NULL DEFAULT '',
    "rnc" TEXT NOT NULL DEFAULT '',
    "logoId" TEXT,
    "addressLine" TEXT NOT NULL DEFAULT '',
    "cityProvince" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "bankAccount" TEXT NOT NULL DEFAULT '',
    "invoiceFooter" TEXT NOT NULL DEFAULT '',
    "accentColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_profiles_pkey" PRIMARY KEY ("organizationId")
);

CREATE TABLE "organization_lawyers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mayApproveDrafts" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_lawyers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_logos" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_logos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_settings_audits" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_settings_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_profiles_logoId_key" ON "organization_profiles"("logoId");
CREATE INDEX "organization_lawyers_organizationId_archivedAt_idx" ON "organization_lawyers"("organizationId", "archivedAt");
CREATE INDEX "organization_logos_organizationId_createdAt_idx" ON "organization_logos"("organizationId", "createdAt");
CREATE INDEX "organization_settings_audits_organizationId_createdAt_idx" ON "organization_settings_audits"("organizationId", "createdAt");

ALTER TABLE "organization_profiles" ADD CONSTRAINT "organization_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_lawyers" ADD CONSTRAINT "organization_lawyers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization_profiles"("organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_logos" ADD CONSTRAINT "organization_logos_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_profiles" ADD CONSTRAINT "organization_profiles_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "organization_logos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION organization_settings_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Organization settings audit records are append-only';
END $$;

CREATE TRIGGER organization_settings_audits_no_mutation
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "organization_settings_audits"
  FOR EACH STATEMENT EXECUTE FUNCTION organization_settings_audit_immutable();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rakazo_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "organization_profiles" TO rakazo_app;
    REVOKE DELETE, TRUNCATE ON "organization_profiles" FROM rakazo_app;
    GRANT SELECT, INSERT, UPDATE ON "organization_lawyers" TO rakazo_app;
    REVOKE DELETE, TRUNCATE ON "organization_lawyers" FROM rakazo_app;
    GRANT SELECT, INSERT ON "organization_logos" TO rakazo_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON "organization_logos" FROM rakazo_app;
    GRANT SELECT, INSERT ON "organization_settings_audits" TO rakazo_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON "organization_settings_audits" FROM rakazo_app;
  END IF;
END $$;

ALTER TABLE "organization_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_lawyers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_logos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_settings_audits" ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_profiles_tenant ON "organization_profiles"
  USING (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "organization_profiles"."organizationId"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "organization_profiles"."organizationId"
  ));
CREATE POLICY organization_profiles_system ON "organization_profiles"
  USING (current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'on');

CREATE POLICY organization_lawyers_tenant ON "organization_lawyers"
  USING (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "organization_lawyers"."organizationId"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "organization_lawyers"."organizationId"
  ));
CREATE POLICY organization_lawyers_system ON "organization_lawyers"
  USING (current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'on');

CREATE POLICY organization_logos_tenant ON "organization_logos"
  USING (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "organization_logos"."organizationId"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "organization_logos"."organizationId"
  ));
CREATE POLICY organization_logos_system ON "organization_logos"
  USING (current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'on');

CREATE POLICY organization_settings_audits_tenant ON "organization_settings_audits"
  USING (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "organization_settings_audits"."organizationId"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "organization_settings_audits"."organizationId"
  ));
CREATE POLICY organization_settings_audits_system ON "organization_settings_audits"
  USING (current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'on');

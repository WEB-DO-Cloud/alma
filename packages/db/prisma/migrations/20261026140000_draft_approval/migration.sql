-- Drafts for review, and an append-only approval log.
-- Additive: the previous release never reads these tables or the new settings column.
-- Drafts are not deleted. The approval log rejects UPDATE, DELETE, and TRUNCATE.
-- The original agent text and the time a lawyer opened the draft cannot be rewritten.

ALTER TABLE "organization_profiles" ADD COLUMN "minimumReviewSeconds" INTEGER NOT NULL DEFAULT 60;

CREATE TABLE "review_drafts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "editedText" TEXT NOT NULL,
    "originalHash" TEXT NOT NULL,
    "finalHash" TEXT,
    "model" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "sourceMessageId" TEXT,
    "sourceArtifactId" TEXT,
    "openedAt" TIMESTAMP(3),
    "openedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "approverLawyerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "draft_approval_logs" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "approverLawyerId" TEXT NOT NULL,
    "approverName" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "reviewDurationMs" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "originalHash" TEXT NOT NULL,
    "finalHash" TEXT NOT NULL,
    "diff" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_approval_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "review_drafts_organizationId_status_createdAt_idx" ON "review_drafts"("organizationId", "status", "createdAt");
CREATE INDEX "review_drafts_sourceMessageId_idx" ON "review_drafts"("sourceMessageId");
CREATE INDEX "review_drafts_sourceArtifactId_idx" ON "review_drafts"("sourceArtifactId");
CREATE INDEX "draft_approval_logs_organizationId_createdAt_idx" ON "draft_approval_logs"("organizationId", "createdAt");
CREATE INDEX "draft_approval_logs_draftId_idx" ON "draft_approval_logs"("draftId");
CREATE INDEX "draft_approval_logs_approverLawyerId_createdAt_idx" ON "draft_approval_logs"("approverLawyerId", "createdAt");

CREATE FUNCTION review_drafts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Review drafts are not deleted';
  END IF;
  IF NEW."originalText" IS DISTINCT FROM OLD."originalText"
     OR NEW."originalHash" IS DISTINCT FROM OLD."originalHash"
     OR NEW."model" IS DISTINCT FROM OLD."model"
     OR NEW."modelVersion" IS DISTINCT FROM OLD."modelVersion"
     OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
     OR NEW."spaceId" IS DISTINCT FROM OLD."spaceId"
     OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
     OR NEW."sourceMessageId" IS DISTINCT FROM OLD."sourceMessageId"
     OR NEW."sourceArtifactId" IS DISTINCT FROM OLD."sourceArtifactId"
     OR NEW."title" IS DISTINCT FROM OLD."title" THEN
    RAISE EXCEPTION 'The original agent draft is immutable';
  END IF;
  IF OLD."openedAt" IS NOT NULL AND NEW."openedAt" IS DISTINCT FROM OLD."openedAt" THEN
    RAISE EXCEPTION 'The review open time is immutable';
  END IF;
  IF OLD.status IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'A finished review draft cannot be changed';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER review_drafts_no_rewrite
  BEFORE UPDATE OR DELETE ON "review_drafts"
  FOR EACH ROW EXECUTE FUNCTION review_drafts_guard();

CREATE TRIGGER review_drafts_no_truncate
  BEFORE TRUNCATE ON "review_drafts"
  FOR EACH STATEMENT EXECUTE FUNCTION review_drafts_guard();

CREATE FUNCTION draft_approval_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Draft approval log records are append-only';
END $$;

CREATE TRIGGER draft_approval_logs_no_mutation
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "draft_approval_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION draft_approval_log_immutable();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rakazo_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "review_drafts" TO rakazo_app;
    REVOKE DELETE, TRUNCATE ON "review_drafts" FROM rakazo_app;
    GRANT SELECT, INSERT ON "draft_approval_logs" TO rakazo_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON "draft_approval_logs" FROM rakazo_app;
  END IF;
END $$;

ALTER TABLE "review_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "draft_approval_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY review_drafts_tenant ON "review_drafts"
  USING (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "review_drafts"."organizationId"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "review_drafts"."organizationId"
  ));
CREATE POLICY review_drafts_system ON "review_drafts"
  USING (current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'on');

CREATE POLICY draft_approval_logs_tenant ON "draft_approval_logs"
  USING (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "draft_approval_logs"."organizationId"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "spaces" s
    WHERE s."id" = NULLIF(current_setting('app.space_id', true), '')
      AND s."organizationId" = "draft_approval_logs"."organizationId"
  ));
CREATE POLICY draft_approval_logs_system ON "draft_approval_logs"
  USING (current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'on');

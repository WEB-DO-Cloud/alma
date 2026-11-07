-- Phase 2A contexts, records, and outbound drafts.
-- Additive: the previous release does not read these tables.

CREATE TABLE "work_contexts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "parentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "work_contexts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_contexts_kind_check" CHECK ("kind" IN ('personal', 'work', 'client'))
);

CREATE TABLE "work_context_roles" (
  "contextId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "grantedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_context_roles_pkey" PRIMARY KEY ("contextId", "userId"),
  CONSTRAINT "work_context_roles_kind_check" CHECK ("kind" IN ('personal', 'work', 'client')),
  CONSTRAINT "work_context_roles_role_check" CHECK ("role" IN ('owner', 'professional', 'assistant', 'reader'))
);

CREATE TABLE "work_records" (
  "id" TEXT NOT NULL,
  "contextId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "work_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_records_kind_check" CHECK ("kind" IN ('contact', 'matter', 'note'))
);

CREATE TABLE "work_links" (
  "id" TEXT NOT NULL,
  "contextId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "targetKind" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_links_target_check" CHECK ("targetKind" IN ('thread', 'artifact'))
);

CREATE TABLE "outbound_drafts" (
  "id" TEXT NOT NULL,
  "contextId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "creatorRole" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "attachmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL,
  "bodyHash" TEXT NOT NULL,
  "actionClass" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "approvedBodyHash" TEXT,
  "dispatchAfter" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outbound_drafts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbound_drafts_channel_check" CHECK ("channel" IN ('whatsapp', 'email', 'other')),
  CONSTRAINT "outbound_drafts_status_check" CHECK ("status" IN ('draft', 'pending', 'approved', 'cancelled', 'dispatching', 'sent', 'failed', 'unknown')),
  CONSTRAINT "outbound_drafts_class_check" CHECK ("actionClass" = 'message'),
  CONSTRAINT "outbound_drafts_creator_role_check" CHECK ("creatorRole" IN ('owner', 'professional', 'assistant', 'reader'))
);

CREATE TABLE "work_approval_events" (
  "id" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "contextId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "bodyHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_approval_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_approval_events_action_check" CHECK ("action" IN ('created', 'edited', 'submitted', 'approved', 'invalidated', 'cancelled'))
);

CREATE INDEX "work_contexts_spaceId_ownerUserId_idx" ON "work_contexts"("spaceId", "ownerUserId");
CREATE INDEX "work_contexts_parentId_idx" ON "work_contexts"("parentId");
CREATE INDEX "work_context_roles_spaceId_userId_idx" ON "work_context_roles"("spaceId", "userId");
CREATE INDEX "work_records_contextId_idx" ON "work_records"("contextId");
CREATE UNIQUE INDEX "work_links_targetKind_targetId_key" ON "work_links"("targetKind", "targetId");
CREATE INDEX "work_links_contextId_idx" ON "work_links"("contextId");
CREATE INDEX "outbound_drafts_contextId_status_idx" ON "outbound_drafts"("contextId", "status");
CREATE INDEX "work_approval_events_draftId_idx" ON "work_approval_events"("draftId");

ALTER TABLE "work_contexts" ADD CONSTRAINT "work_contexts_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_contexts" ADD CONSTRAINT "work_contexts_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_contexts" ADD CONSTRAINT "work_contexts_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_contexts" ADD CONSTRAINT "work_contexts_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "work_contexts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_context_roles" ADD CONSTRAINT "work_context_roles_contextId_fkey"
  FOREIGN KEY ("contextId") REFERENCES "work_contexts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_context_roles" ADD CONSTRAINT "work_context_roles_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_context_roles" ADD CONSTRAINT "work_context_roles_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_context_roles" ADD CONSTRAINT "work_context_roles_grantedByUserId_fkey"
  FOREIGN KEY ("grantedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_records" ADD CONSTRAINT "work_records_contextId_fkey"
  FOREIGN KEY ("contextId") REFERENCES "work_contexts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_records" ADD CONSTRAINT "work_records_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_records" ADD CONSTRAINT "work_records_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_links" ADD CONSTRAINT "work_links_contextId_fkey"
  FOREIGN KEY ("contextId") REFERENCES "work_contexts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_links" ADD CONSTRAINT "work_links_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_links" ADD CONSTRAINT "work_links_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "outbound_drafts" ADD CONSTRAINT "outbound_drafts_contextId_fkey"
  FOREIGN KEY ("contextId") REFERENCES "work_contexts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outbound_drafts" ADD CONSTRAINT "outbound_drafts_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outbound_drafts" ADD CONSTRAINT "outbound_drafts_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_drafts" ADD CONSTRAINT "outbound_drafts_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "work_approval_events" ADD CONSTRAINT "work_approval_events_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "outbound_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_approval_events" ADD CONSTRAINT "work_approval_events_contextId_fkey"
  FOREIGN KEY ("contextId") REFERENCES "work_contexts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_approval_events" ADD CONSTRAINT "work_approval_events_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_approval_events" ADD CONSTRAINT "work_approval_events_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rakazo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "work_contexts", "work_context_roles", "work_records", "work_links", "outbound_drafts", "work_approval_events" TO rakazo_app;
  END IF;
END $$;

ALTER TABLE "work_contexts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_context_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbound_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_approval_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_contexts_tenant ON "work_contexts"
  USING (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND ("kind" <> 'personal' OR "ownerUserId" = NULLIF(current_setting('app.user_id', true), ''))
    AND (
      "ownerUserId" = NULLIF(current_setting('app.user_id', true), '')
      OR EXISTS (
        SELECT 1 FROM "work_context_roles" r
        WHERE r."contextId" = "work_contexts"."id"
          AND r."userId" = NULLIF(current_setting('app.user_id', true), '')
      )
    )
  )
  WITH CHECK (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND "ownerUserId" = NULLIF(current_setting('app.user_id', true), '')
    AND ("kind" <> 'personal' OR "ownerUserId" = NULLIF(current_setting('app.user_id', true), ''))
    AND "organizationId" = (
      SELECT s."organizationId" FROM "spaces" s WHERE s."id" = "work_contexts"."spaceId"
    )
  );
CREATE POLICY work_contexts_system ON "work_contexts"
  USING ((SELECT app_rls_bypass()));

CREATE POLICY work_context_roles_tenant ON "work_context_roles"
  USING (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND (
      "userId" = NULLIF(current_setting('app.user_id', true), '')
      OR "grantedByUserId" = NULLIF(current_setting('app.user_id', true), '')
    )
  )
  WITH CHECK (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND "grantedByUserId" = NULLIF(current_setting('app.user_id', true), '')
    AND (
      "kind" <> 'personal'
      OR "userId" = NULLIF(current_setting('app.user_id', true), '')
    )
  );
CREATE POLICY work_context_roles_system ON "work_context_roles"
  USING ((SELECT app_rls_bypass()));

CREATE POLICY work_records_tenant ON "work_records"
  USING (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND EXISTS (
      SELECT 1 FROM "work_context_roles" r
      WHERE r."contextId" = "work_records"."contextId"
        AND r."spaceId" = "work_records"."spaceId"
        AND r."userId" = NULLIF(current_setting('app.user_id', true), '')
    )
  )
  WITH CHECK (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND "createdByUserId" = NULLIF(current_setting('app.user_id', true), '')
    AND EXISTS (
      SELECT 1 FROM "work_context_roles" r
      WHERE r."contextId" = "work_records"."contextId"
        AND r."userId" = NULLIF(current_setting('app.user_id', true), '')
        AND r."role" IN ('owner', 'professional', 'assistant')
    )
  );
CREATE POLICY work_records_system ON "work_records"
  USING ((SELECT app_rls_bypass()));

CREATE POLICY work_links_tenant ON "work_links"
  USING (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND EXISTS (
      SELECT 1 FROM "work_context_roles" r
      WHERE r."contextId" = "work_links"."contextId"
        AND r."spaceId" = "work_links"."spaceId"
        AND r."userId" = NULLIF(current_setting('app.user_id', true), '')
    )
  )
  WITH CHECK (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND "createdByUserId" = NULLIF(current_setting('app.user_id', true), '')
    AND EXISTS (
      SELECT 1 FROM "work_context_roles" r
      WHERE r."contextId" = "work_links"."contextId"
        AND r."userId" = NULLIF(current_setting('app.user_id', true), '')
        AND r."role" IN ('owner', 'professional', 'assistant')
    )
  );
CREATE POLICY work_links_system ON "work_links"
  USING ((SELECT app_rls_bypass()));

CREATE POLICY outbound_drafts_tenant ON "outbound_drafts"
  USING (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND EXISTS (
      SELECT 1 FROM "work_context_roles" r
      WHERE r."contextId" = "outbound_drafts"."contextId"
        AND r."spaceId" = "outbound_drafts"."spaceId"
        AND r."userId" = NULLIF(current_setting('app.user_id', true), '')
    )
  )
  WITH CHECK (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND EXISTS (
      SELECT 1 FROM "work_context_roles" r
      WHERE r."contextId" = "outbound_drafts"."contextId"
        AND r."userId" = NULLIF(current_setting('app.user_id', true), '')
        AND (
          ("outbound_drafts"."status" = 'approved' AND r."role" IN ('owner', 'professional'))
          OR ("outbound_drafts"."status" <> 'approved' AND r."role" IN ('owner', 'professional', 'assistant'))
        )
    )
  );
CREATE POLICY outbound_drafts_system ON "outbound_drafts"
  USING ((SELECT app_rls_bypass()));

CREATE POLICY work_approval_events_tenant ON "work_approval_events"
  USING (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND EXISTS (
      SELECT 1 FROM "work_context_roles" r
      WHERE r."contextId" = "work_approval_events"."contextId"
        AND r."userId" = NULLIF(current_setting('app.user_id', true), '')
    )
  )
  WITH CHECK (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND "actorUserId" = NULLIF(current_setting('app.user_id', true), '')
    AND EXISTS (
      SELECT 1 FROM "work_context_roles" r
      WHERE r."contextId" = "work_approval_events"."contextId"
        AND r."userId" = NULLIF(current_setting('app.user_id', true), '')
        AND r."role" IN ('owner', 'professional', 'assistant')
    )
  );
CREATE POLICY work_approval_events_system ON "work_approval_events"
  USING ((SELECT app_rls_bypass()));

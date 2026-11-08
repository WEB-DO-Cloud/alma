-- Editable voice transcripts. Additive: the previous release does not read this table.

CREATE TABLE "voice_transcripts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "artifactId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "noteTitle" TEXT,
  "noteBody" TEXT,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_transcripts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "voice_transcripts_status_check" CHECK ("status" IN ('open', 'saved'))
);

CREATE UNIQUE INDEX "voice_transcripts_userId_artifactId_key" ON "voice_transcripts"("userId", "artifactId");
CREATE INDEX "voice_transcripts_spaceId_userId_idx" ON "voice_transcripts"("spaceId", "userId");

ALTER TABLE "voice_transcripts"
  ADD CONSTRAINT "voice_transcripts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_transcripts" ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "voice_transcripts" TO rakazo_app;

CREATE POLICY voice_transcripts_tenant ON "voice_transcripts"
  USING (
    "userId" = NULLIF(current_setting('app.user_id', true), '')
    AND "spaceId" = NULLIF(current_setting('app.space_id', true), '')
  )
  WITH CHECK (
    "userId" = NULLIF(current_setting('app.user_id', true), '')
    AND "spaceId" = NULLIF(current_setting('app.space_id', true), '')
  );
CREATE POLICY voice_transcripts_system ON "voice_transcripts"
  USING ((SELECT app_rls_bypass()));

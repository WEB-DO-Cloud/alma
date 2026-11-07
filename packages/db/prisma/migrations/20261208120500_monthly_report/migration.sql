-- Practice marks for the monthly report. Additive: the previous release does not read this table.

CREATE TABLE "report_run_marks" (
  "runId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "practice" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_run_marks_pkey" PRIMARY KEY ("runId")
);

CREATE INDEX "report_run_marks_userId_spaceId_idx" ON "report_run_marks"("userId", "spaceId");

ALTER TABLE "report_run_marks"
  ADD CONSTRAINT "report_run_marks_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_run_marks" ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "report_run_marks" TO rakazo_app;

CREATE POLICY report_run_marks_tenant ON "report_run_marks"
  USING (
    "userId" = NULLIF(current_setting('app.user_id', true), '')
    AND "spaceId" = NULLIF(current_setting('app.space_id', true), '')
  )
  WITH CHECK (
    "userId" = NULLIF(current_setting('app.user_id', true), '')
    AND "spaceId" = NULLIF(current_setting('app.space_id', true), '')
  );
CREATE POLICY report_run_marks_system ON "report_run_marks"
  USING ((SELECT app_rls_bypass()));

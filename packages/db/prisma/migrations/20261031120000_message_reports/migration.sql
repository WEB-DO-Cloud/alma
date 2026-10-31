-- Reports of assistant responses. The previous release does not read this table.
CREATE TABLE "message_reports" (
  "id" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "message_reports_spaceId_userId_fkey" FOREIGN KEY ("spaceId", "userId")
    REFERENCES "space_members"("spaceId", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "message_reports_threadId_fkey" FOREIGN KEY ("threadId")
    REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "message_reports_messageId_fkey" FOREIGN KEY ("messageId")
    REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "message_reports_userId_messageId_key" ON "message_reports"("userId", "messageId");
CREATE INDEX "message_reports_spaceId_createdAt_idx" ON "message_reports"("spaceId", "createdAt");

ALTER TABLE "message_reports" ENABLE ROW LEVEL SECURITY;
CREATE POLICY message_reports_tenant ON "message_reports"
  USING (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND "userId" = NULLIF(current_setting('app.user_id', true), '')
  );
CREATE POLICY message_reports_system ON "message_reports"
  USING (current_setting('app.rls_bypass', true) = 'on');
GRANT SELECT, INSERT, DELETE ON "message_reports" TO rakazo_app;

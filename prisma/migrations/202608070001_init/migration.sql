CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'EDITING', 'CLIENT_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED', 'CANCELLED');
CREATE TYPE "RecordingStatus" AS ENUM ('SCHEDULED', 'RESCHEDULED', 'DONE', 'CANCELLED');
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED');
CREATE TYPE "ReminderType" AS ENUM ('RECORDING_24H', 'TASK_CLIENT_REVIEW_48H', 'INVOICE_UPCOMING_DUE', 'INVOICE_DUE_TODAY', 'INVOICE_OVERDUE');
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'CLAIMED', 'PROCESSING', 'SENT', 'RETRY_SCHEDULED', 'CANCELLED', 'FAILED', 'SKIPPED', 'NEEDS_REVIEW');
CREATE TYPE "AttemptStatus" AS ENUM ('STARTED', 'SUCCESS', 'FAILED', 'SKIPPED_DRY_RUN');

CREATE TABLE "clients" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
  "timeZone" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "whatsapp_groups" (
  "id" UUID NOT NULL, "clientId" UUID NOT NULL, "jid" TEXT NOT NULL, "label" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false, "enabled" BOOLEAN NOT NULL DEFAULT false,
  "authorizedAt" TIMESTAMP(3) WITH TIME ZONE, "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL, CONSTRAINT "whatsapp_groups_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "recordings" (
  "id" UUID NOT NULL, "clientId" UUID NOT NULL, "title" TEXT NOT NULL, "scheduledAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "durationMinutes" INTEGER, "location" TEXT, "notes" TEXT, "status" "RecordingStatus" NOT NULL DEFAULT 'SCHEDULED',
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "tasks" (
  "id" UUID NOT NULL, "clientId" UUID NOT NULL, "title" TEXT NOT NULL, "status" "TaskStatus" NOT NULL DEFAULT 'DRAFT',
  "clientReviewEnteredAt" TIMESTAMP(3) WITH TIME ZONE, "clientReviewRound" INTEGER NOT NULL DEFAULT 0,
  "dueAt" TIMESTAMP(3) WITH TIME ZONE, "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL, CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "invoices" (
  "id" UUID NOT NULL, "clientId" UUID NOT NULL, "period" TEXT NOT NULL, "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD', "dueDate" DATE NOT NULL, "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMP(3) WITH TIME ZONE, "remindersSent" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "reminders" (
  "id" UUID NOT NULL, "type" "ReminderType" NOT NULL, "clientId" UUID NOT NULL, "recordingId" UUID,
  "taskId" UUID, "invoiceId" UUID, "targetGroupId" UUID, "scheduledFor" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3, "claimedAt" TIMESTAMP(3) WITH TIME ZONE, "claimedBy" TEXT,
  "sentAt" TIMESTAMP(3) WITH TIME ZONE, "nextAttemptAt" TIMESTAMP(3) WITH TIME ZONE, "cancellationReason" TEXT,
  "idempotencyKey" TEXT NOT NULL, "lastError" TEXT, "templateId" TEXT, "templateVersion" INTEGER,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "message_attempts" (
  "id" UUID NOT NULL, "reminderId" UUID NOT NULL, "groupId" UUID, "attemptNumber" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3) WITH TIME ZONE,
  "status" "AttemptStatus" NOT NULL DEFAULT 'STARTED', "templateId" TEXT NOT NULL, "templateVersion" INTEGER NOT NULL,
  "renderedLength" INTEGER, "renderedVariables" JSONB, "providerMessageId" TEXT, "errorCode" TEXT,
  "errorMessage" TEXT, "durationMs" INTEGER, "correlationId" TEXT NOT NULL, CONSTRAINT "message_attempts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "automation_settings" (
  "id" UUID NOT NULL, "clientId" UUID, "globalPaused" BOOLEAN NOT NULL DEFAULT false,
  "businessHoursStart" TEXT NOT NULL DEFAULT '08:00', "businessHoursEnd" TEXT NOT NULL DEFAULT '18:30',
  "sendOnSundays" BOOLEAN NOT NULL DEFAULT false, "maxRemindersPerTask" INTEGER NOT NULL DEFAULT 2,
  "maxRemindersPerInvoice" INTEGER NOT NULL DEFAULT 4, "taskReviewOffsetHours" INTEGER NOT NULL DEFAULT 48,
  "recordingOffsetHours" INTEGER NOT NULL DEFAULT 24, "invoiceOffsetsDays" INTEGER[] NOT NULL DEFAULT ARRAY[-3,0,3,7],
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  CONSTRAINT "automation_settings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "audit_events" (
  "id" UUID NOT NULL, "occurredAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, "actor" TEXT NOT NULL,
  "action" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT, "metadata" JSONB, "correlationId" TEXT,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_groups_jid_key" ON "whatsapp_groups"("jid");
CREATE UNIQUE INDEX "invoices_clientId_period_key" ON "invoices"("clientId", "period");
CREATE UNIQUE INDEX "reminders_idempotencyKey_key" ON "reminders"("idempotencyKey");
CREATE UNIQUE INDEX "message_attempts_reminderId_attemptNumber_key" ON "message_attempts"("reminderId", "attemptNumber");
CREATE UNIQUE INDEX "automation_settings_clientId_key" ON "automation_settings"("clientId");
CREATE INDEX "whatsapp_groups_clientId_idx" ON "whatsapp_groups"("clientId");
CREATE INDEX "recordings_clientId_scheduledAt_idx" ON "recordings"("clientId", "scheduledAt");
CREATE INDEX "tasks_status_clientReviewEnteredAt_idx" ON "tasks"("status", "clientReviewEnteredAt");
CREATE INDEX "invoices_status_dueDate_idx" ON "invoices"("status", "dueDate");
CREATE INDEX "reminders_status_scheduledFor_idx" ON "reminders"("status", "scheduledFor");
CREATE INDEX "reminders_status_nextAttemptAt_idx" ON "reminders"("status", "nextAttemptAt");
CREATE INDEX "reminders_clientId_type_idx" ON "reminders"("clientId", "type");
CREATE INDEX "message_attempts_status_startedAt_idx" ON "message_attempts"("status", "startedAt");
CREATE INDEX "audit_events_occurredAt_idx" ON "audit_events"("occurredAt");
CREATE INDEX "audit_events_entityType_entityId_idx" ON "audit_events"("entityType", "entityId");
CREATE UNIQUE INDEX "whatsapp_groups_one_primary_per_client" ON "whatsapp_groups"("clientId") WHERE "isPrimary";
CREATE INDEX "reminders_due_idx" ON "reminders"("scheduledFor") WHERE "status" IN ('PENDING', 'RETRY_SCHEDULED');

ALTER TABLE "whatsapp_groups" ADD CONSTRAINT "whatsapp_groups_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_targetGroupId_fkey" FOREIGN KEY ("targetGroupId") REFERENCES "whatsapp_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "message_attempts" ADD CONSTRAINT "message_attempts_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_attempts" ADD CONSTRAINT "message_attempts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "whatsapp_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "automation_settings" ADD CONSTRAINT "automation_settings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reminders" ADD CONSTRAINT "reminders_single_source" CHECK ((("recordingId" IS NOT NULL)::int + ("taskId" IS NOT NULL)::int + ("invoiceId" IS NOT NULL)::int) = 1);
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_type_matches_source" CHECK (("type" = 'RECORDING_24H' AND "recordingId" IS NOT NULL) OR ("type" = 'TASK_CLIENT_REVIEW_48H' AND "taskId" IS NOT NULL) OR ("type" IN ('INVOICE_UPCOMING_DUE','INVOICE_DUE_TODAY','INVOICE_OVERDUE') AND "invoiceId" IS NOT NULL));
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_paid_requires_paid_at" CHECK ("status" <> 'PAID' OR "paidAt" IS NOT NULL);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "whatsapp_groups" ADD CONSTRAINT "whatsapp_groups_jid_is_group" CHECK ("jid" LIKE '%@g.us');
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_period_format" CHECK ("period" ~ '^\\d{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_attempts_bounded" CHECK ("attempts" >= 0 AND "attempts" <= "maxAttempts");

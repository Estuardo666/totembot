# docs/DATABASE_DESIGN.md — Diseño de base de datos

PostgreSQL 17 · Prisma 7 · esquema `public` · todos los instantes en `timestamptz` (UTC).

## 1. Convenciones

- Claves primarias: `uuid` v7 generadas en la aplicación (`IdGenerator`), no `gen_random_uuid()`,
  para mantener el dominio determinista en pruebas.
- Nombres de tabla en `snake_case` plural; campos Prisma en `camelCase` con `@map`.
- Dinero: enteros de centavos (`Int`), nunca `float`. Moneda explícita.
- Fechas de negocio sin hora (`dueDate`): tipo `date`.
- Enums en PostgreSQL (no strings libres).
- `created_at` / `updated_at` en todas las tablas mutables.
- Borrado lógico solo en `clients` (`ARCHIVED`); el resto es histórico inmutable o real.

## 2. Esquema Prisma (borrador para M2)

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/infrastructure/database/generated"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum ClientStatus { ACTIVE PAUSED ARCHIVED }
enum TaskStatus { DRAFT EDITING CLIENT_REVIEW CHANGES_REQUESTED APPROVED PUBLISHED CANCELLED }
enum RecordingStatus { SCHEDULED RESCHEDULED DONE CANCELLED }
enum InvoiceStatus { PENDING PAID OVERDUE CANCELLED }
enum ReminderType { RECORDING_24H TASK_CLIENT_REVIEW_48H INVOICE_UPCOMING_DUE INVOICE_DUE_TODAY INVOICE_OVERDUE }
enum ReminderStatus { PENDING CLAIMED PROCESSING SENT RETRY_SCHEDULED CANCELLED FAILED SKIPPED NEEDS_REVIEW }
enum AttemptStatus { STARTED SUCCESS FAILED SKIPPED_DRY_RUN }

model Client {
  id        String       @id @db.Uuid
  name      String
  status    ClientStatus @default(ACTIVE)
  timeZone  String?
  notes     String?
  createdAt DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt DateTime     @updatedAt @db.Timestamptz(3)

  groups     WhatsAppGroup[]
  recordings Recording[]
  tasks      Task[]
  invoices   Invoice[]
  reminders  Reminder[]
  settings   AutomationSetting?

  @@map("clients")
}

model WhatsAppGroup {
  id           String    @id @db.Uuid
  clientId     String    @db.Uuid
  jid          String    @unique
  label        String
  isPrimary    Boolean   @default(false)
  enabled      Boolean   @default(false)
  authorizedAt DateTime? @db.Timestamptz(3)
  createdAt    DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime  @updatedAt @db.Timestamptz(3)

  client   Client           @relation(fields: [clientId], references: [id], onDelete: Restrict)
  attempts MessageAttempt[]
  reminders Reminder[]

  @@index([clientId])
  @@map("whatsapp_groups")
}

model Recording {
  id              String          @id @db.Uuid
  clientId        String          @db.Uuid
  title           String
  scheduledAt     DateTime        @db.Timestamptz(3)
  durationMinutes Int?
  location        String?
  notes           String?
  status          RecordingStatus @default(SCHEDULED)
  createdAt       DateTime        @default(now()) @db.Timestamptz(3)
  updatedAt       DateTime        @updatedAt @db.Timestamptz(3)

  client    Client     @relation(fields: [clientId], references: [id], onDelete: Restrict)
  reminders Reminder[]

  @@index([clientId, scheduledAt])
  @@map("recordings")
}

model Task {
  id                     String     @id @db.Uuid
  clientId               String     @db.Uuid
  title                  String
  status                 TaskStatus @default(DRAFT)
  clientReviewEnteredAt  DateTime?  @db.Timestamptz(3)
  clientReviewRound      Int        @default(0)
  dueAt                  DateTime?  @db.Timestamptz(3)
  createdAt              DateTime   @default(now()) @db.Timestamptz(3)
  updatedAt              DateTime   @updatedAt @db.Timestamptz(3)

  client    Client     @relation(fields: [clientId], references: [id], onDelete: Restrict)
  reminders Reminder[]

  @@index([status, clientReviewEnteredAt])
  @@map("tasks")
}

model Invoice {
  id            String        @id @db.Uuid
  clientId      String        @db.Uuid
  period        String        // YYYY-MM
  amountCents   Int
  currency      String        @default("USD")
  dueDate       DateTime      @db.Date
  status        InvoiceStatus @default(PENDING)
  paidAt        DateTime?     @db.Timestamptz(3)
  remindersSent Int           @default(0)
  createdAt     DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime      @updatedAt @db.Timestamptz(3)

  client    Client     @relation(fields: [clientId], references: [id], onDelete: Restrict)
  reminders Reminder[]

  @@unique([clientId, period])
  @@index([status, dueDate])
  @@map("invoices")
}

model Reminder {
  id                 String         @id @db.Uuid
  type               ReminderType
  clientId           String         @db.Uuid
  recordingId        String?        @db.Uuid
  taskId             String?        @db.Uuid
  invoiceId          String?        @db.Uuid
  targetGroupId      String?        @db.Uuid
  scheduledFor       DateTime       @db.Timestamptz(3)
  status             ReminderStatus @default(PENDING)
  attempts           Int            @default(0)
  maxAttempts        Int            @default(3)
  claimedAt          DateTime?      @db.Timestamptz(3)
  claimedBy          String?
  sentAt             DateTime?      @db.Timestamptz(3)
  nextAttemptAt      DateTime?      @db.Timestamptz(3)
  cancellationReason String?
  idempotencyKey     String         @unique
  lastError          String?
  templateId         String?
  templateVersion    Int?
  createdAt          DateTime       @default(now()) @db.Timestamptz(3)
  updatedAt          DateTime       @updatedAt @db.Timestamptz(3)

  client      Client           @relation(fields: [clientId], references: [id], onDelete: Restrict)
  recording   Recording?       @relation(fields: [recordingId], references: [id], onDelete: Cascade)
  task        Task?            @relation(fields: [taskId], references: [id], onDelete: Cascade)
  invoice     Invoice?         @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  targetGroup WhatsAppGroup?   @relation(fields: [targetGroupId], references: [id], onDelete: SetNull)
  attemptsLog MessageAttempt[]

  @@index([status, scheduledFor])
  @@index([status, nextAttemptAt])
  @@index([clientId, type])
  @@map("reminders")
}

model MessageAttempt {
  id              String        @id @db.Uuid
  reminderId      String        @db.Uuid
  groupId         String?       @db.Uuid
  attemptNumber   Int
  startedAt       DateTime      @default(now()) @db.Timestamptz(3)
  finishedAt      DateTime?     @db.Timestamptz(3)
  status          AttemptStatus @default(STARTED)
  templateId      String
  templateVersion Int
  renderedLength  Int?
  providerMessageId String?
  errorCode       String?
  errorMessage    String?
  durationMs      Int?
  correlationId   String

  reminder Reminder       @relation(fields: [reminderId], references: [id], onDelete: Cascade)
  group    WhatsAppGroup? @relation(fields: [groupId], references: [id], onDelete: SetNull)

  @@unique([reminderId, attemptNumber])
  @@index([status, startedAt])
  @@map("message_attempts")
}

model AutomationSetting {
  id                     String  @id @db.Uuid
  clientId               String? @unique @db.Uuid
  globalPaused           Boolean @default(false)
  businessHoursStart     String  @default("08:00")
  businessHoursEnd       String  @default("18:30")
  sendOnSundays          Boolean @default(false)
  maxRemindersPerTask    Int     @default(2)
  maxRemindersPerInvoice Int     @default(4)
  taskReviewOffsetHours  Int     @default(48)
  recordingOffsetHours   Int     @default(24)
  invoiceOffsetsDays     Int[]   @default([-3, 0, 3, 7])
  createdAt              DateTime @default(now()) @db.Timestamptz(3)
  updatedAt              DateTime @updatedAt @db.Timestamptz(3)

  client Client? @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@map("automation_settings")
}

model AuditEvent {
  id            String   @id @db.Uuid
  occurredAt    DateTime @default(now()) @db.Timestamptz(3)
  actor         String
  action        String
  entityType    String
  entityId      String?
  metadata      Json?
  correlationId String?

  @@index([occurredAt])
  @@index([entityType, entityId])
  @@map("audit_events")
}
```

## 3. Restricciones que Prisma no expresa (SQL manual en la migración)

```sql
-- Exactamente un origen por recordatorio
ALTER TABLE reminders ADD CONSTRAINT reminders_single_source CHECK (
  (recording_id IS NOT NULL)::int
+ (task_id      IS NOT NULL)::int
+ (invoice_id   IS NOT NULL)::int = 1
);

-- El tipo de recordatorio debe corresponder al origen
ALTER TABLE reminders ADD CONSTRAINT reminders_type_matches_source CHECK (
  (type = 'RECORDING_24H'          AND recording_id IS NOT NULL) OR
  (type = 'TASK_CLIENT_REVIEW_48H' AND task_id      IS NOT NULL) OR
  (type IN ('INVOICE_UPCOMING_DUE','INVOICE_DUE_TODAY','INVOICE_OVERDUE')
                                   AND invoice_id   IS NOT NULL)
);

-- Un solo grupo primario por cliente
CREATE UNIQUE INDEX whatsapp_groups_one_primary_per_client
  ON whatsapp_groups (client_id) WHERE is_primary;

-- Coherencia de pagos
ALTER TABLE invoices ADD CONSTRAINT invoices_paid_requires_paid_at CHECK (
  status <> 'PAID' OR paid_at IS NOT NULL
);
ALTER TABLE invoices ADD CONSTRAINT invoices_amount_positive CHECK (amount_cents > 0);

-- Solo JIDs de grupo
ALTER TABLE whatsapp_groups ADD CONSTRAINT whatsapp_groups_jid_is_group CHECK (jid LIKE '%@g.us');

-- Periodo con formato YYYY-MM
ALTER TABLE invoices ADD CONSTRAINT invoices_period_format CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- Coherencia de intentos
ALTER TABLE reminders ADD CONSTRAINT reminders_attempts_bounded CHECK (attempts >= 0 AND attempts <= max_attempts);

-- Índice parcial que sirve la consulta caliente del worker
CREATE INDEX reminders_due_idx ON reminders (scheduled_for)
  WHERE status IN ('PENDING', 'RETRY_SCHEDULED');
```

## 4. Consulta de claim (SQL exacto)

```sql
UPDATE reminders r
SET status = 'CLAIMED', claimed_at = $1, claimed_by = $2, updated_at = $1
WHERE r.id IN (
  SELECT id FROM reminders
  WHERE (
      (status IN ('PENDING','RETRY_SCHEDULED') AND scheduled_for <= $1
       AND (next_attempt_at IS NULL OR next_attempt_at <= $1))
   OR (status IN ('CLAIMED','PROCESSING') AND claimed_at < $3)  -- $3 = now - lockTimeout
  )
  ORDER BY scheduled_for ASC
  LIMIT $4
  FOR UPDATE SKIP LOCKED
)
RETURNING r.*;
```

`FOR UPDATE SKIP LOCKED` es la primitiva que hace seguro tener varios workers. La rama de
`claimed_at < now - lockTimeout` es la recuperación tras caída. Un recordatorio en
`PROCESSING` recuperado se trata con cuidado: si tiene un `MessageAttempt` en `STARTED`
sin desenlace, pasa a `NEEDS_REVIEW` en lugar de reintentarse.

## 5. Retención y respaldos

- `message_attempts` y `audit_events`: purga a los 12 meses (job mensual del worker).
- Respaldo: `pg_dump` diario cifrado, retención 30 días. Ver `OPERATIONS.md`.
- La restauración se prueba trimestralmente (tarea M6-07).

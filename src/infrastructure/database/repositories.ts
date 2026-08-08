import { Prisma, PrismaClient } from "@prisma/client";
import type {
  AutomationSetting,
  Client,
  ClientStatus,
  Invoice,
  Recording,
  Reminder,
  Task,
  WhatsAppGroup,
} from "../../domain/entities/index.js";
import type {
  AuditLogger,
  AutomationSettingsRepository,
  AutomationSettingsAdministrationRepository,
  ClientAdministrationRepository,
  ClientRepository,
  InvoiceRepository,
  MessageAttemptRepository,
  RecordingRepository,
  ReminderRepository,
  ReminderAdministrationRepository,
  RetentionRepository,
  TaskRepository,
  TransactionRepositories,
  TransactionManager,
  WhatsAppGroupRepository,
} from "../../domain/ports/index.js";

type PrismaDbClient = PrismaClient | Prisma.TransactionClient;

const mapClient = (value: {
  id: string;
  name: string;
  status: string;
  timeZone: string | null;
}): Client => ({
  id: value.id,
  name: value.name,
  status: value.status as Client["status"],
  timeZone: value.timeZone,
});
const mapGroup = (value: {
  id: string;
  clientId: string;
  jid: string;
  label: string;
  isPrimary: boolean;
  enabled: boolean;
  authorizedAt: Date | null;
}): WhatsAppGroup => ({
  id: value.id,
  clientId: value.clientId,
  jid: value.jid,
  label: value.label,
  isPrimary: value.isPrimary,
  enabled: value.enabled,
  authorizedAt: value.authorizedAt,
});
const mapRecording = (value: {
  id: string;
  clientId: string;
  title: string;
  scheduledAt: Date;
  location: string | null;
  notes: string | null;
  status: string;
}): Recording => ({
  id: value.id,
  clientId: value.clientId,
  title: value.title,
  scheduledAt: value.scheduledAt,
  location: value.location,
  notes: value.notes,
  status: value.status as Recording["status"],
});
const mapTask = (value: {
  id: string;
  clientId: string;
  title: string;
  status: string;
  clientReviewEnteredAt: Date | null;
  clientReviewRound: number;
}): Task => ({
  id: value.id,
  clientId: value.clientId,
  title: value.title,
  status: value.status as Task["status"],
  clientReviewEnteredAt: value.clientReviewEnteredAt,
  clientReviewRound: value.clientReviewRound,
});
const mapInvoice = (value: {
  id: string;
  clientId: string;
  period: string;
  amountCents: number;
  currency: string;
  dueDate: Date;
  status: string;
  paidAt: Date | null;
  remindersSent: number;
}): Invoice => ({
  id: value.id,
  clientId: value.clientId,
  period: value.period,
  amountCents: value.amountCents,
  currency: value.currency,
  dueDate: value.dueDate,
  status: value.status as Invoice["status"],
  paidAt: value.paidAt,
  remindersSent: value.remindersSent,
});
const mapReminder = (value: {
  id: string;
  type: string;
  clientId: string;
  recordingId: string | null;
  taskId: string | null;
  invoiceId: string | null;
  scheduledFor: Date;
  status: string;
  attempts: number;
  maxAttempts: number;
  claimedAt: Date | null;
  claimedBy: string | null;
  nextAttemptAt: Date | null;
  sentAt: Date | null;
  idempotencyKey: string;
}): Reminder => ({
  id: value.id,
  type: value.type as Reminder["type"],
  clientId: value.clientId,
  recordingId: value.recordingId,
  taskId: value.taskId,
  invoiceId: value.invoiceId,
  scheduledFor: value.scheduledFor,
  status: value.status as Reminder["status"],
  attempts: value.attempts,
  maxAttempts: value.maxAttempts,
  claimedAt: value.claimedAt,
  claimedBy: value.claimedBy,
  nextAttemptAt: value.nextAttemptAt,
  sentAt: value.sentAt,
  idempotencyKey: value.idempotencyKey,
});

export class PrismaClientRepository implements ClientRepository {
  public constructor(private readonly client: PrismaDbClient) {}
  async findById(id: string): Promise<Client | null> {
    const value = await this.client.client.findUnique({ where: { id } });
    return value === null ? null : mapClient(value);
  }
  async findWithPrimaryGroup(
    id: string,
  ): Promise<{ readonly client: Client; readonly group: WhatsAppGroup | null } | null> {
    const value = await this.client.client.findUnique({
      where: { id },
      include: { groups: { where: { isPrimary: true }, take: 1 } },
    });
    if (value === null) return null;
    return {
      client: mapClient(value),
      group: value.groups[0] === undefined ? null : mapGroup(value.groups[0]),
    };
  }
}

export class PrismaClientAdministrationRepository implements ClientAdministrationRepository {
  public constructor(private readonly client: PrismaDbClient) {}

  async create(value: Client): Promise<void> {
    await this.client.client.create({
      data: {
        id: value.id,
        name: value.name,
        status: value.status,
        timeZone: value.timeZone,
      },
    });
  }

  async list(status?: ClientStatus): Promise<readonly Client[]> {
    const values = await this.client.client.findMany({
      ...(status === undefined ? {} : { where: { status } }),
      orderBy: { name: "asc" },
    });
    return values.map(mapClient);
  }
}

export class PrismaWhatsAppGroupRepository implements WhatsAppGroupRepository {
  public constructor(private readonly client: PrismaDbClient) {}
  async findById(id: string): Promise<WhatsAppGroup | null> {
    const value = await this.client.whatsAppGroup.findUnique({ where: { id } });
    return value === null ? null : mapGroup(value);
  }
  async save(group: WhatsAppGroup): Promise<void> {
    await this.client.whatsAppGroup.upsert({
      where: { id: group.id },
      update: {
        clientId: group.clientId,
        jid: group.jid,
        label: group.label,
        isPrimary: group.isPrimary,
        enabled: group.enabled,
        authorizedAt: group.authorizedAt,
      },
      create: {
        id: group.id,
        clientId: group.clientId,
        jid: group.jid,
        label: group.label,
        isPrimary: group.isPrimary,
        enabled: group.enabled,
        authorizedAt: group.authorizedAt,
      },
    });
  }
}

export class PrismaRecordingRepository implements RecordingRepository {
  public constructor(private readonly client: PrismaDbClient) {}
  async findById(id: string): Promise<Recording | null> {
    const value = await this.client.recording.findUnique({ where: { id } });
    return value === null ? null : mapRecording(value);
  }
  async save(recording: Recording): Promise<void> {
    await this.client.recording.upsert({
      where: { id: recording.id },
      update: {
        title: recording.title,
        scheduledAt: recording.scheduledAt,
        location: recording.location,
        notes: recording.notes,
        status: recording.status,
      },
      create: {
        id: recording.id,
        clientId: recording.clientId,
        title: recording.title,
        scheduledAt: recording.scheduledAt,
        location: recording.location,
        notes: recording.notes,
        status: recording.status,
      },
    });
  }
}

export class PrismaTaskRepository implements TaskRepository {
  public constructor(private readonly client: PrismaDbClient) {}
  async findById(id: string): Promise<Task | null> {
    const value = await this.client.task.findUnique({ where: { id } });
    return value === null ? null : mapTask(value);
  }
  async save(task: Task): Promise<void> {
    await this.client.task.update({
      where: { id: task.id },
      data: {
        title: task.title,
        status: task.status,
        clientReviewEnteredAt: task.clientReviewEnteredAt,
        clientReviewRound: task.clientReviewRound,
      },
    });
  }
  async saveIfStatus(task: Task, expectedStatus: Task["status"]): Promise<boolean> {
    const result = await this.client.task.updateMany({
      where: { id: task.id, status: expectedStatus },
      data: {
        title: task.title,
        status: task.status,
        clientReviewEnteredAt: task.clientReviewEnteredAt,
        clientReviewRound: task.clientReviewRound,
      },
    });
    return result.count === 1;
  }
}

export class PrismaInvoiceRepository implements InvoiceRepository {
  public constructor(private readonly client: PrismaDbClient) {}
  async findById(id: string): Promise<Invoice | null> {
    const value = await this.client.invoice.findUnique({ where: { id } });
    return value === null ? null : mapInvoice(value);
  }
  async save(invoice: Invoice): Promise<void> {
    await this.client.invoice.upsert({
      where: { id: invoice.id },
      update: {
        status: invoice.status,
        paidAt: invoice.paidAt,
        remindersSent: invoice.remindersSent,
      },
      create: {
        id: invoice.id,
        clientId: invoice.clientId,
        period: invoice.period,
        amountCents: invoice.amountCents,
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        status: invoice.status,
        paidAt: invoice.paidAt,
        remindersSent: invoice.remindersSent,
      },
    });
  }
  async saveIfStatus(invoice: Invoice, expectedStatus: Invoice["status"]): Promise<boolean> {
    const result = await this.client.invoice.updateMany({
      where: { id: invoice.id, status: expectedStatus },
      data: {
        status: invoice.status,
        paidAt: invoice.paidAt,
        remindersSent: invoice.remindersSent,
      },
    });
    return result.count === 1;
  }
  async incrementRemindersSent(id: string): Promise<boolean> {
    const result = await this.client.invoice.updateMany({
      where: { id, status: { in: ["PENDING", "OVERDUE"] } },
      data: { remindersSent: { increment: 1 } },
    });
    return result.count === 1;
  }
  async markOverdue(now: Date): Promise<number> {
    const result = await this.client.invoice.updateMany({
      where: { status: "PENDING", dueDate: { lt: now } },
      data: { status: "OVERDUE" },
    });
    return result.count;
  }
}

export class PrismaReminderRepository
  implements ReminderRepository, ReminderAdministrationRepository
{
  public constructor(private readonly client: PrismaDbClient) {}
  async findById(id: string): Promise<Reminder | null> {
    const value = await this.client.reminder.findUnique({ where: { id } });
    return value === null ? null : mapReminder(value);
  }
  async resolveNeedsReview(
    id: string,
    outcome: "delivered" | "not-delivered",
    resolvedAt: Date,
  ): Promise<boolean> {
    const result = await this.client.reminder.updateMany({
      where: { id, status: "NEEDS_REVIEW" },
      data:
        outcome === "delivered"
          ? { status: "SENT", sentAt: resolvedAt, cancellationReason: null }
          : { status: "PENDING", sentAt: null, cancellationReason: null },
    });
    return result.count === 1;
  }
  async recoverExpired(lockExpiresAt: Date): Promise<number> {
    await this.client.$executeRaw(
      Prisma.sql`UPDATE reminders r SET "status" = 'SENT', "sentAt" = (SELECT a."finishedAt" FROM message_attempts a WHERE a."reminderId" = r."id" AND a."status" = 'SUCCESS' AND a."finishedAt" IS NOT NULL ORDER BY a."attemptNumber" DESC LIMIT 1), "claimedAt" = NULL, "claimedBy" = NULL WHERE r."status" = 'PROCESSING' AND r."claimedAt" < ${lockExpiresAt} AND EXISTS (SELECT 1 FROM message_attempts a WHERE a."reminderId" = r."id" AND a."status" = 'SUCCESS' AND a."finishedAt" IS NOT NULL)`,
    );
    const uncertain = await this.client.$executeRaw(
      Prisma.sql`UPDATE reminders r SET "status" = 'NEEDS_REVIEW', "cancellationReason" = 'UNCERTAIN_DELIVERY' WHERE r."status" = 'PROCESSING' AND r."claimedAt" < ${lockExpiresAt} AND EXISTS (SELECT 1 FROM message_attempts a WHERE a."reminderId" = r."id" AND a."status" = 'STARTED')`,
    );
    await this.client.$executeRaw(
      Prisma.sql`UPDATE reminders r SET "status" = 'PENDING', "claimedAt" = NULL, "claimedBy" = NULL WHERE r."status" IN ('CLAIMED', 'PROCESSING') AND r."claimedAt" < ${lockExpiresAt} AND NOT EXISTS (SELECT 1 FROM message_attempts a WHERE a."reminderId" = r."id" AND a."status" = 'STARTED')`,
    );
    return uncertain;
  }
  async getMetrics(now: Date, since: Date) {
    const [pending, dueNow, retryScheduled, needsReview, failedLast24h, sentLast24h] =
      await Promise.all([
        this.client.reminder.count({ where: { status: "PENDING" } }),
        this.client.reminder.count({
          where: {
            status: { in: ["PENDING", "RETRY_SCHEDULED"] },
            scheduledFor: { lte: now },
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
        }),
        this.client.reminder.count({ where: { status: "RETRY_SCHEDULED" } }),
        this.client.reminder.count({ where: { status: "NEEDS_REVIEW" } }),
        this.client.reminder.count({ where: { status: "FAILED", updatedAt: { gte: since } } }),
        this.client.reminder.count({ where: { status: "SENT", sentAt: { gte: since } } }),
      ]);
    return { pending, dueNow, retryScheduled, needsReview, failedLast24h, sentLast24h };
  }
  async claimDue(
    now: Date,
    lockExpiresAt: Date,
    workerId: string,
    limit: number,
  ): Promise<Reminder[]> {
    const rows = await this.client.$queryRaw<ReadonlyArray<Record<string, unknown>>>(
      Prisma.sql`UPDATE reminders r SET "status" = 'CLAIMED', "claimedAt" = ${now}, "claimedBy" = ${workerId}, "updatedAt" = ${now} WHERE r.id IN (SELECT id FROM reminders WHERE (("status" IN ('PENDING','RETRY_SCHEDULED') AND "scheduledFor" <= ${now} AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= ${now})) OR ("status" IN ('CLAIMED','PROCESSING') AND "claimedAt" < ${lockExpiresAt})) ORDER BY "scheduledFor" ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED) RETURNING r.*`,
    );
    return rows.map((row) =>
      mapReminder(
        row as {
          id: string;
          type: string;
          clientId: string;
          recordingId: string | null;
          taskId: string | null;
          invoiceId: string | null;
          scheduledFor: Date;
          status: string;
          attempts: number;
          maxAttempts: number;
          claimedAt: Date | null;
          claimedBy: string | null;
          nextAttemptAt: Date | null;
          sentAt: Date | null;
          idempotencyKey: string;
        },
      ),
    );
  }
  async insertIfAbsent(reminder: Reminder): Promise<boolean> {
    // ON CONFLICT DO NOTHING: dentro de una transacción, dejar que el insert falle y
    // atrapar el error aborta la transacción entera (PostgreSQL 25P02).
    const result = await this.client.reminder.createMany({
      data: [
        {
          id: reminder.id,
          type: reminder.type,
          clientId: reminder.clientId,
          recordingId: reminder.recordingId,
          taskId: reminder.taskId,
          invoiceId: reminder.invoiceId,
          scheduledFor: reminder.scheduledFor,
          status: reminder.status,
          attempts: reminder.attempts,
          maxAttempts: reminder.maxAttempts,
          idempotencyKey: reminder.idempotencyKey,
        },
      ],
      skipDuplicates: true,
    });
    return result.count > 0;
  }
  async cancelPendingForSource(
    source: {
      readonly recordingId?: string;
      readonly taskId?: string;
      readonly invoiceId?: string;
    },
    reason: string,
  ): Promise<number> {
    const where: Prisma.ReminderWhereInput = {
      status: { in: ["PENDING", "RETRY_SCHEDULED", "CLAIMED"] },
    };
    if (source.recordingId !== undefined) where.recordingId = source.recordingId;
    if (source.taskId !== undefined) where.taskId = source.taskId;
    if (source.invoiceId !== undefined) where.invoiceId = source.invoiceId;
    const result = await this.client.reminder.updateMany({
      where,
      data: { status: "CANCELLED", cancellationReason: reason },
    });
    return result.count;
  }
  async markStatus(id: string, status: Reminder["status"], reason?: string): Promise<void> {
    await this.client.reminder.update({
      where: { id },
      data: { status, ...(reason === undefined ? {} : { cancellationReason: reason }) },
    });
  }
  async defer(id: string, scheduledFor: Date, reason: string): Promise<void> {
    await this.client.reminder.update({
      where: { id },
      data: { status: "PENDING", scheduledFor, cancellationReason: reason },
    });
  }
  async markProcessing(id: string): Promise<void> {
    await this.client.reminder.update({
      where: { id },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
  }
  async markSent(id: string, sentAt: Date): Promise<void> {
    await this.client.reminder.update({ where: { id }, data: { status: "SENT", sentAt } });
  }
  async scheduleRetry(id: string, nextAttemptAt: Date, error: string): Promise<void> {
    await this.client.reminder.update({
      where: { id },
      data: { status: "RETRY_SCHEDULED", nextAttemptAt, lastError: error },
    });
  }
  async markFailed(id: string, error: string): Promise<void> {
    await this.client.reminder.update({
      where: { id },
      data: { status: "FAILED", lastError: error },
    });
  }
  async markNeedsReview(id: string, reason: string): Promise<void> {
    await this.client.reminder.update({
      where: { id },
      data: { status: "NEEDS_REVIEW", cancellationReason: reason },
    });
  }
}

const defaults: AutomationSetting = {
  globalPaused: false,
  businessHoursStart: "08:00",
  businessHoursEnd: "18:30",
  sendOnSundays: false,
  maxRemindersPerTask: 2,
  maxRemindersPerInvoice: 4,
  taskReviewOffsetHours: 48,
  recordingOffsetHours: 24,
  invoiceOffsetsDays: [-3, 0, 3, 7],
};
const mapSettings = (value: {
  globalPaused: boolean;
  businessHoursStart: string;
  businessHoursEnd: string;
  sendOnSundays: boolean;
  maxRemindersPerTask: number;
  maxRemindersPerInvoice: number;
  taskReviewOffsetHours: number;
  recordingOffsetHours: number;
  invoiceOffsetsDays: number[];
}): AutomationSetting => ({ ...value, invoiceOffsetsDays: value.invoiceOffsetsDays });
export class PrismaAutomationSettingsRepository
  implements AutomationSettingsRepository, AutomationSettingsAdministrationRepository
{
  public constructor(private readonly client: PrismaClient) {}
  async setGlobalPaused(paused: boolean, id: string): Promise<void> {
    const existing = await this.client.automationSetting.findFirst({ where: { clientId: null } });
    if (existing === null) {
      await this.client.automationSetting.create({ data: { id, globalPaused: paused } });
      return;
    }
    await this.client.automationSetting.update({
      where: { id: existing.id },
      data: { globalPaused: paused },
    });
  }
  async setClientPaused(clientId: string, paused: boolean, id: string): Promise<void> {
    const existing = await this.client.automationSetting.findUnique({ where: { clientId } });
    if (existing === null) {
      await this.client.automationSetting.create({ data: { id, clientId, globalPaused: paused } });
      return;
    }
    await this.client.automationSetting.update({
      where: { id: existing.id },
      data: { globalPaused: paused },
    });
  }
  async resolveForClient(clientId: string): Promise<AutomationSetting> {
    const global = await this.client.automationSetting.findFirst({ where: { clientId: null } });
    const client = await this.client.automationSetting.findUnique({ where: { clientId } });
    return {
      ...defaults,
      ...(global === null ? {} : mapSettings(global)),
      ...(client === null ? {} : mapSettings(client)),
    };
  }
}

export class PrismaMessageAttemptRepository implements MessageAttemptRepository {
  public constructor(private readonly client: PrismaDbClient) {}
  async create(input: Parameters<MessageAttemptRepository["create"]>[0]): Promise<void> {
    await this.client.messageAttempt.create({
      data: {
        id: input.id,
        reminderId: input.reminderId,
        groupId: input.groupId,
        attemptNumber: input.attemptNumber,
        templateId: input.templateId,
        templateVersion: input.templateVersion,
        correlationId: input.correlationId,
        renderedLength: input.renderedLength ?? null,
        status: input.status,
      },
    });
  }
  async finish(
    id: string,
    result: Parameters<MessageAttemptRepository["finish"]>[1],
  ): Promise<void> {
    await this.client.messageAttempt.update({
      where: { id },
      data: {
        status: result.status,
        finishedAt: result.finishedAt,
        providerMessageId: result.providerMessageId ?? null,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
      },
    });
  }
}

export class PrismaAuditLogger implements AuditLogger {
  public constructor(
    private readonly client: PrismaClient,
    private readonly ids: { next(): string },
    private readonly actor = "SYSTEM",
  ) {}
  async record(event: Parameters<AuditLogger["record"]>[0]): Promise<void> {
    await this.client.auditEvent.create({
      data: {
        id: this.ids.next(),
        actor: this.actor,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId ?? null,
        metadata: (event.metadata ?? null) as Prisma.InputJsonValue,
      },
    });
  }
}

export class PrismaRetentionRepository implements RetentionRepository {
  public constructor(private readonly client: PrismaDbClient) {}
  async purgeMessageAttemptsBefore(cutoff: Date): Promise<number> {
    const result = await this.client.messageAttempt.deleteMany({
      where: { startedAt: { lt: cutoff } },
    });
    return result.count;
  }
  async purgeAuditEventsBefore(cutoff: Date): Promise<number> {
    const result = await this.client.auditEvent.deleteMany({
      where: { occurredAt: { lt: cutoff } },
    });
    return result.count;
  }
}

export class PrismaTransactionManager implements TransactionManager {
  public constructor(private readonly client: PrismaClient) {}
  async runInTransaction<T>(
    work: (repositories: TransactionRepositories) => Promise<T>,
  ): Promise<T> {
    return this.client.$transaction(async (transactionClient) =>
      work({
        clients: new PrismaClientRepository(transactionClient),
        recordings: new PrismaRecordingRepository(transactionClient),
        tasks: new PrismaTaskRepository(transactionClient),
        invoices: new PrismaInvoiceRepository(transactionClient),
        reminders: new PrismaReminderRepository(transactionClient),
        attempts: new PrismaMessageAttemptRepository(transactionClient),
      }),
    );
  }
}

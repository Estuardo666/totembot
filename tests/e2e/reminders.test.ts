import { describe, expect, it } from "vitest";
import { ProcessDueReminders } from "../../src/application/use-cases/process-due-reminders.js";
import type {
  AutomationSetting,
  Client,
  Invoice,
  Recording,
  Reminder,
  Task,
  WhatsAppGroup,
} from "../../src/domain/entities/index.js";
import type {
  AuditLogger,
  AutomationSettingsRepository,
  ClientRepository,
  Clock,
  IdGenerator,
  InvoiceRepository,
  MessageAttemptRepository,
  RecordingRepository,
  ReminderRepository,
  TaskRepository,
  TransactionManager,
} from "../../src/domain/ports/index.js";
import { EligibilityService } from "../../src/domain/services/eligibility.js";
import { RetryPolicy } from "../../src/domain/services/retry-policy.js";
import { BusinessWindowService } from "../../src/domain/services/business-window.js";
import { TemplateRenderer } from "../../src/modules/messaging/renderer.js";
import { DryRunMessagingGateway } from "../../src/infrastructure/whatsapp/dry-run-gateway.js";
import { FakeMessagingGateway } from "../../src/infrastructure/whatsapp/fake-gateway.js";

const now = new Date("2026-08-07T13:00:00.000Z");
const client: Client = {
  id: "client-1",
  name: "Cliente de prueba",
  status: "ACTIVE",
  timeZone: null,
};
const group: WhatsAppGroup = {
  id: "group-1",
  clientId: client.id,
  jid: "000000000@g.us",
  label: "Grupo de prueba",
  isPrimary: true,
  enabled: true,
  authorizedAt: now,
};
const recording: Recording = {
  id: "recording-1",
  clientId: client.id,
  title: "Producción de prueba",
  scheduledAt: new Date("2026-08-08T13:00:00.000Z"),
  location: null,
  notes: null,
  status: "SCHEDULED",
};
const task: Task = {
  id: "task-1",
  clientId: client.id,
  title: "Revisión de cliente",
  status: "CLIENT_REVIEW",
  clientReviewEnteredAt: new Date("2026-08-05T13:00:00.000Z"),
  clientReviewRound: 1,
};
const invoice: Invoice = {
  id: "invoice-1",
  clientId: client.id,
  period: "2026-08",
  amountCents: 12500,
  currency: "USD",
  dueDate: new Date("2026-08-01T00:00:00.000Z"),
  status: "OVERDUE",
  paidAt: null,
  remindersSent: 0,
};
const settings: AutomationSetting = {
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

class FixedClock implements Clock {
  now(): Date {
    return new Date(now);
  }
  fromEpoch(epochMs: number): Date {
    return new Date(epochMs);
  }
  timeZone(): string {
    return "America/Guayaquil";
  }
}
class SequentialIds implements IdGenerator {
  private value = 0;
  next(): string {
    this.value += 1;
    return `id-${this.value}`;
  }
}
class MemoryClientRepository implements ClientRepository {
  findById(): Promise<Client> {
    return Promise.resolve(client);
  }
  findWithPrimaryGroup(): Promise<{ readonly client: Client; readonly group: WhatsAppGroup }> {
    return Promise.resolve({ client, group });
  }
}
class MemoryRecordingRepository implements RecordingRepository {
  findById(id: string): Promise<Recording | null> {
    return Promise.resolve(id === recording.id ? recording : null);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}
class MemoryTaskRepository implements TaskRepository {
  findById(id: string): Promise<Task | null> {
    return Promise.resolve(id === task.id ? task : null);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  saveIfStatus(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
class MemoryInvoiceRepository implements InvoiceRepository {
  value: Invoice = invoice;
  findById(id: string): Promise<Invoice | null> {
    return Promise.resolve(id === this.value.id ? this.value : null);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  saveIfStatus(): Promise<boolean> {
    return Promise.resolve(true);
  }
  incrementRemindersSent(id: string): Promise<boolean> {
    if (
      id !== this.value.id ||
      (this.value.status !== "PENDING" && this.value.status !== "OVERDUE")
    )
      return Promise.resolve(false);
    this.value = { ...this.value, remindersSent: this.value.remindersSent + 1 };
    return Promise.resolve(true);
  }
  markOverdue(): Promise<number> {
    return Promise.resolve(0);
  }
}
class MemorySettingsRepository implements AutomationSettingsRepository {
  resolveForClient(): Promise<AutomationSetting> {
    return Promise.resolve(settings);
  }
}
class MemoryAudit implements AuditLogger {
  record(): Promise<void> {
    return Promise.resolve();
  }
}
class MemoryAttempts implements MessageAttemptRepository {
  readonly values: Array<{ status: string }> = [];
  create(): Promise<void> {
    this.values.push({ status: "STARTED" });
    return Promise.resolve();
  }
  finish(
    _id: string,
    result: { readonly status: "SUCCESS" | "FAILED" | "SKIPPED_DRY_RUN" },
  ): Promise<void> {
    this.values[this.values.length - 1] = { status: result.status };
    return Promise.resolve();
  }
}
type MemoryReminder = { -readonly [K in keyof Reminder]: Reminder[K] };
class MemoryReminders implements ReminderRepository {
  constructor(readonly values: MemoryReminder[]) {}
  recoverExpired(): Promise<number> {
    return Promise.resolve(0);
  }
  getMetrics(): Promise<{
    readonly pending: number;
    readonly dueNow: number;
    readonly retryScheduled: number;
    readonly needsReview: number;
    readonly failedLast24h: number;
    readonly sentLast24h: number;
  }> {
    return Promise.resolve({
      pending: 0,
      dueNow: 0,
      retryScheduled: 0,
      needsReview: 0,
      failedLast24h: 0,
      sentLast24h: 0,
    });
  }
  claimDue(nowValue: Date): Promise<Reminder[]> {
    const claimed = this.values.filter(
      (value) =>
        (value.status === "PENDING" || value.status === "RETRY_SCHEDULED") &&
        value.scheduledFor <= nowValue,
    );
    for (const value of claimed) value.status = "CLAIMED";
    return Promise.resolve(claimed);
  }
  insertIfAbsent(value: Reminder): Promise<boolean> {
    if (this.values.some((item) => item.idempotencyKey === value.idempotencyKey))
      return Promise.resolve(false);
    this.values.push({ ...value });
    return Promise.resolve(true);
  }
  cancelPendingForSource(): Promise<number> {
    return Promise.resolve(0);
  }
  markStatus(id: string, status: Reminder["status"]): Promise<void> {
    const value = this.values.find((item) => item.id === id);
    if (value !== undefined) value.status = status;
    return Promise.resolve();
  }
  defer(id: string, scheduledFor: Date): Promise<void> {
    const value = this.values.find((item) => item.id === id);
    if (value !== undefined) {
      value.status = "PENDING";
      value.scheduledFor = scheduledFor;
    }
    return Promise.resolve();
  }
  markProcessing(id: string): Promise<void> {
    const value = this.values.find((item) => item.id === id);
    if (value !== undefined) {
      value.status = "PROCESSING";
      value.attempts += 1;
    }
    return Promise.resolve();
  }
  markSent(id: string, sentAt: Date): Promise<void> {
    const value = this.values.find((item) => item.id === id);
    if (value !== undefined) {
      value.status = "SENT";
      value.sentAt = sentAt;
    }
    return Promise.resolve();
  }
  scheduleRetry(id: string, nextAttemptAt: Date): Promise<void> {
    const value = this.values.find((item) => item.id === id);
    if (value !== undefined) {
      value.status = "RETRY_SCHEDULED";
      value.nextAttemptAt = nextAttemptAt;
    }
    return Promise.resolve();
  }
  markFailed(id: string): Promise<void> {
    const value = this.values.find((item) => item.id === id);
    if (value !== undefined) value.status = "FAILED";
    return Promise.resolve();
  }
  markNeedsReview(id: string): Promise<void> {
    const value = this.values.find((item) => item.id === id);
    if (value !== undefined) value.status = "NEEDS_REVIEW";
    return Promise.resolve();
  }
}

function buildProcessor(
  reminders: MemoryReminders,
  gateway: FakeMessagingGateway | DryRunMessagingGateway,
  attempts: MemoryAttempts,
): { readonly processor: ProcessDueReminders; readonly invoices: MemoryInvoiceRepository } {
  const clients = new MemoryClientRepository();
  const recordings = new MemoryRecordingRepository();
  const tasks = new MemoryTaskRepository();
  const invoices = new MemoryInvoiceRepository();
  const settingsRepository = new MemorySettingsRepository();
  const transaction: TransactionManager = {
    runInTransaction: async (work) =>
      work({
        clients,
        recordings,
        tasks,
        invoices,
        reminders,
        attempts,
      }),
  };
  return {
    processor: new ProcessDueReminders({
      reminders,
      clients,
      recordings,
      tasks,
      invoices,
      settings: settingsRepository,
      attempts,
      gateway,
      clock: new FixedClock(),
      ids: new SequentialIds(),
      retry: new RetryPolicy({ next: () => 0 }, 60, 3600),
      window: new BusinessWindowService({ fromEpoch: (epochMs) => new Date(epochMs) }),
      tx: transaction,
      renderer: new TemplateRenderer(),
      eligibility: new EligibilityService(),
      audit: new MemoryAudit(),
      workerId: "test-worker",
      batchSize: 10,
      lockTimeoutMs: 300_000,
      staleAfterHours: 12,
      dryRunMarkSent: false,
    }),
    invoices,
  };
}

describe("safe reminder flow", () => {
  it("sends once and the second tick has no work", async () => {
    const reminder: MemoryReminder = {
      id: "reminder-1",
      type: "RECORDING_24H",
      clientId: client.id,
      recordingId: recording.id,
      taskId: null,
      invoiceId: null,
      scheduledFor: now,
      status: "PENDING",
      attempts: 0,
      maxAttempts: 3,
      claimedAt: null,
      claimedBy: null,
      nextAttemptAt: null,
      sentAt: null,
      idempotencyKey: `recording:recording-1:${Math.floor(recording.scheduledAt.getTime() / 1000)}:24h_before`,
    };
    const reminders = new MemoryReminders([reminder]);
    const gateway = new FakeMessagingGateway();
    const result = buildProcessor(reminders, gateway, new MemoryAttempts()).processor;
    expect((await result.execute()).sent).toBe(1);
    expect((await result.execute()).claimed).toBe(0);
    expect(gateway.sentMessages).toHaveLength(1);
  });
  it("dry-run records the attempt without calling a real gateway", async () => {
    const reminder: MemoryReminder = {
      id: "reminder-2",
      type: "RECORDING_24H",
      clientId: client.id,
      recordingId: recording.id,
      taskId: null,
      invoiceId: null,
      scheduledFor: now,
      status: "PENDING",
      attempts: 0,
      maxAttempts: 3,
      claimedAt: null,
      claimedBy: null,
      nextAttemptAt: null,
      sentAt: null,
      idempotencyKey: `recording:recording-2:${Math.floor(recording.scheduledAt.getTime() / 1000)}:24h_before`,
    };
    const reminders = new MemoryReminders([reminder]);
    const gateway = new FakeMessagingGateway();
    const attempts = new MemoryAttempts();
    const result = buildProcessor(
      reminders,
      new DryRunMessagingGateway(gateway),
      attempts,
    ).processor;
    expect((await result.execute()).skipped).toBe(1);
    expect(gateway.sentMessages).toHaveLength(0);
    expect(attempts.values[0]?.status).toBe("SKIPPED_DRY_RUN");
  });
  it("sends task review reminders", async () => {
    const reminder: MemoryReminder = {
      id: "reminder-task-1",
      type: "TASK_CLIENT_REVIEW_48H",
      clientId: client.id,
      recordingId: null,
      taskId: task.id,
      invoiceId: null,
      scheduledFor: now,
      status: "PENDING",
      attempts: 0,
      maxAttempts: 3,
      claimedAt: null,
      claimedBy: null,
      nextAttemptAt: null,
      sentAt: null,
      idempotencyKey: "task:task-1:client_review:r1:n1",
    };
    const gateway = new FakeMessagingGateway();
    const built = buildProcessor(new MemoryReminders([reminder]), gateway, new MemoryAttempts());
    expect((await built.processor.execute()).sent).toBe(1);
    expect(gateway.sentMessages).toHaveLength(1);
  });
  it("sends overdue invoice reminders and increments the counter", async () => {
    const reminder: MemoryReminder = {
      id: "reminder-invoice-1",
      type: "INVOICE_OVERDUE",
      clientId: client.id,
      recordingId: null,
      taskId: null,
      invoiceId: invoice.id,
      scheduledFor: now,
      status: "PENDING",
      attempts: 0,
      maxAttempts: 3,
      claimedAt: null,
      claimedBy: null,
      nextAttemptAt: null,
      sentAt: null,
      idempotencyKey: "invoice:invoice-1:overdue:d3",
    };
    const built = buildProcessor(
      new MemoryReminders([reminder]),
      new FakeMessagingGateway(),
      new MemoryAttempts(),
    );
    expect((await built.processor.execute()).sent).toBe(1);
    expect(built.invoices.value.remindersSent).toBe(1);
  });
});

import type { Invoice, Recording, Reminder, Task } from "../../domain/entities/index.js";
import { EligibilityService } from "../../domain/services/eligibility.js";
import { RetryPolicy } from "../../domain/services/retry-policy.js";
import { BusinessWindowService } from "../../domain/services/business-window.js";
import {
  asGroupJid,
  type AuditLogger,
  type AutomationSettingsRepository,
  type ClientRepository,
  type Clock,
  type IdGenerator,
  type InvoiceRepository,
  type MessageAttemptRepository,
  type MessagingGateway,
  type ReminderRepository,
  type TaskRepository,
  type RecordingRepository,
  type TransactionManager,
  type TransactionRepositories,
} from "../../domain/ports/index.js";
import { TemplateRenderer } from "../../modules/messaging/renderer.js";
import {
  formatAmountLabel,
  formatDateLabel,
  formatTimeLabel,
} from "../../modules/messaging/formatting.js";

export interface ProcessDueRemindersDependencies {
  readonly reminders: ReminderRepository;
  readonly clients: ClientRepository;
  readonly recordings: RecordingRepository;
  readonly tasks: TaskRepository;
  readonly invoices: InvoiceRepository;
  readonly settings: AutomationSettingsRepository;
  readonly attempts: MessageAttemptRepository;
  readonly gateway: MessagingGateway;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly retry: RetryPolicy;
  readonly window: BusinessWindowService;
  readonly tx: TransactionManager;
  readonly renderer: TemplateRenderer;
  readonly eligibility: EligibilityService;
  readonly audit: AuditLogger;
  readonly workerId: string;
  readonly batchSize: number;
  readonly lockTimeoutMs: number;
  readonly staleAfterHours: number | null;
  readonly dryRunMarkSent: boolean;
}

export interface TickResult {
  readonly claimed: number;
  readonly sent: number;
  readonly skipped: number;
  readonly failed: number;
  readonly needsReview: number;
}

export class ProcessDueReminders {
  public constructor(private readonly deps: ProcessDueRemindersDependencies) {}

  async execute(): Promise<TickResult> {
    const now = this.deps.clock.now();
    await this.deps.invoices.markOverdue(now);
    const recovered = await this.deps.reminders.recoverExpired(
      this.deps.clock.fromEpoch(now.getTime() - this.deps.lockTimeoutMs),
    );
    if (this.deps.gateway.connectionState() !== "open")
      return { claimed: 0, sent: 0, skipped: 0, failed: 0, needsReview: recovered };
    const claimed = await this.deps.reminders.claimDue(
      now,
      this.deps.clock.fromEpoch(now.getTime() - this.deps.lockTimeoutMs),
      this.deps.workerId,
      this.deps.batchSize,
    );
    const result = {
      claimed: claimed.length,
      sent: 0,
      skipped: 0,
      failed: 0,
      needsReview: recovered,
    };
    for (const reminder of claimed) {
      try {
        const outcome = await this.processOne(reminder, now);
        result[outcome] += 1;
      } catch (error: unknown) {
        await this.deps.reminders.markFailed(reminder.id, "PROCESSING_ERROR");
        await this.deps.audit.record({
          action: "REMINDER_PROCESSING_ERROR",
          entityType: "Reminder",
          entityId: reminder.id,
          metadata: { error: error instanceof Error ? error.name : "UnknownError" },
        });
        result.failed += 1;
      }
    }
    return result;
  }

  private async processOne(
    reminder: Reminder,
    now: Date,
  ): Promise<"sent" | "skipped" | "failed" | "needsReview"> {
    const settings = await this.deps.settings.resolveForClient(reminder.clientId);
    const prepared = await this.deps.tx.runInTransaction(async (repositories) => {
      const context = await this.loadContext(reminder, repositories);
      const reminderNumber = this.reminderNumber(reminder);
      const remindersSent =
        context.source !== null && "remindersSent" in context.source
          ? context.source.remindersSent
          : undefined;
      const decision = this.deps.eligibility.evaluate(reminder, {
        ...context,
        globalPaused: settings.globalPaused,
        clientPaused: context.client.status === "PAUSED",
        now,
        nextValidSlot: this.deps.window.nextValidSlot(now, this.windowPolicy(settings)),
        maxReminders: this.maxReminders(
          reminder,
          settings.maxRemindersPerTask,
          settings.maxRemindersPerInvoice,
        ),
        ...(reminderNumber === undefined ? {} : { reminderNumber }),
        ...(remindersSent === undefined ? {} : { remindersSent }),
        staleAfterHours: reminder.type === "INVOICE_OVERDUE" ? null : this.deps.staleAfterHours,
      });
      if (decision.kind === "CANCEL" || decision.kind === "SKIP") {
        await repositories.reminders.markStatus(
          reminder.id,
          decision.kind === "CANCEL" ? "CANCELLED" : "SKIPPED",
          decision.reason,
        );
        return { kind: "skipped" as const };
      }
      if (decision.kind === "DEFER") {
        await repositories.reminders.defer(reminder.id, decision.until, "OUTSIDE_WINDOW");
        return { kind: "skipped" as const };
      }
      const group = context.group;
      if (group === null) {
        await repositories.reminders.markStatus(reminder.id, "CANCELLED", "NO_AUTHORIZED_GROUP");
        return { kind: "skipped" as const };
      }
      const template = this.templateFor(reminder, context.source, context.client.name, settings);
      const attemptId = this.deps.ids.next();
      const rendered = this.deps.renderer.render(template.id, template.variables);
      await repositories.reminders.markProcessing(reminder.id);
      await repositories.attempts.create({
        id: attemptId,
        reminderId: reminder.id,
        groupId: group.id,
        attemptNumber: reminder.attempts + 1,
        templateId: rendered.templateId,
        templateVersion: rendered.version,
        correlationId: this.deps.ids.next(),
        renderedLength: rendered.text.length,
        status: "STARTED",
      });
      return { kind: "send" as const, attemptId, jid: group.jid, text: rendered.text };
    });
    if (prepared.kind === "skipped") return "skipped";
    let sendResult: Awaited<ReturnType<MessagingGateway["sendGroupText"]>>;
    try {
      sendResult = await this.deps.gateway.sendGroupText(asGroupJid(prepared.jid), prepared.text);
    } catch (error: unknown) {
      await this.deps.tx.runInTransaction(async ({ reminders, attempts }) => {
        await attempts.finish(prepared.attemptId, {
          status: "FAILED",
          finishedAt: this.deps.clock.now(),
          errorCode: "GATEWAY_EXCEPTION",
          errorMessage: "GATEWAY_EXCEPTION",
        });
        await reminders.markFailed(reminder.id, "GATEWAY_EXCEPTION");
      });
      await this.deps.audit.record({
        action: "REMINDER_GATEWAY_EXCEPTION",
        entityType: "Reminder",
        entityId: reminder.id,
        metadata: { error: error instanceof Error ? error.name : "UnknownError" },
      });
      return "failed";
    }
    if (sendResult.kind === "sent") {
      const finishedAt = this.deps.clock.now();
      await this.deps.tx.runInTransaction(async ({ reminders, attempts, invoices }) => {
        await attempts.finish(prepared.attemptId, {
          status: "SUCCESS",
          finishedAt,
          providerMessageId: sendResult.providerMessageId,
        });
        await reminders.markSent(reminder.id, finishedAt);
        if (reminder.invoiceId !== null) await invoices.incrementRemindersSent(reminder.invoiceId);
      });
      return "sent";
    }
    if (sendResult.kind === "skipped") {
      await this.deps.tx.runInTransaction(async ({ reminders, attempts }) => {
        await attempts.finish(prepared.attemptId, {
          status: "SKIPPED_DRY_RUN",
          finishedAt: this.deps.clock.now(),
        });
        if (this.deps.dryRunMarkSent) await reminders.markSent(reminder.id, this.deps.clock.now());
        else await reminders.markStatus(reminder.id, "PENDING", "DRY_RUN");
      });
      return "skipped";
    }
    await this.deps.tx.runInTransaction(async ({ reminders, attempts }) => {
      await attempts.finish(prepared.attemptId, {
        status: "FAILED",
        finishedAt: this.deps.clock.now(),
        errorCode: sendResult.code,
        errorMessage: sendResult.code,
      });
      if (
        this.deps.retry.shouldRetry(
          sendResult.classification,
          reminder.attempts + 1,
          reminder.maxAttempts,
        )
      ) {
        const nextAttemptAt = this.deps.window.nextValidSlot(
          this.deps.clock.fromEpoch(
            this.deps.clock.now().getTime() +
              this.deps.retry.delaySeconds(reminder.attempts + 1) * 1000,
          ),
          this.windowPolicy(settings),
        );
        await reminders.scheduleRetry(reminder.id, nextAttemptAt, sendResult.code);
      } else {
        await reminders.markFailed(reminder.id, sendResult.code);
      }
    });
    if (sendResult.classification === "SESSION_INVALID") return "needsReview";
    return "failed";
  }

  private async loadContext(reminder: Reminder, repositories: TransactionRepositories) {
    const clientWithGroup = await repositories.clients.findWithPrimaryGroup(reminder.clientId);
    if (clientWithGroup === null) throw new Error(`Client not found for reminder ${reminder.id}`);
    let source: Recording | Task | Invoice | null = null;
    if (reminder.recordingId !== null)
      source = await repositories.recordings.findById(reminder.recordingId);
    if (reminder.taskId !== null) source = await repositories.tasks.findById(reminder.taskId);
    if (reminder.invoiceId !== null)
      source = await repositories.invoices.findById(reminder.invoiceId);
    return { client: clientWithGroup.client, group: clientWithGroup.group, source };
  }

  private windowPolicy(
    settings: Awaited<ReturnType<AutomationSettingsRepository["resolveForClient"]>>,
  ) {
    return {
      timeZone: this.deps.clock.timeZone(),
      start: settings.businessHoursStart,
      end: settings.businessHoursEnd,
      sendOnSundays: settings.sendOnSundays,
    };
  }

  private maxReminders(reminder: Reminder, taskMax: number, invoiceMax: number): number {
    return reminder.type === "TASK_CLIENT_REVIEW_48H" ? taskMax : invoiceMax;
  }

  private reminderNumber(reminder: Reminder): number | undefined {
    const match = /:n([0-9]+)$/.exec(reminder.idempotencyKey);
    if (match === null) return undefined;
    const value = Number(match[1]);
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }

  private templateFor(
    reminder: Reminder,
    source: Recording | Task | Invoice | null,
    clientName: string,
    settings: Awaited<ReturnType<AutomationSettingsRepository["resolveForClient"]>>,
  ) {
    if (source === null) throw new Error("Reminder source is missing");
    if (reminder.type === "RECORDING_24H" && "scheduledAt" in source)
      return {
        id: "recording.reminder_24h",
        variables: {
          clientName,
          title: source.title,
          dateLabel: formatDateLabel(source.scheduledAt, this.deps.clock.timeZone()),
          timeLabel: formatTimeLabel(source.scheduledAt, this.deps.clock.timeZone()),
          location: source.location ?? undefined,
          notes: source.notes ?? undefined,
          confirmToken: "CONFIRMO",
        },
      };
    if (
      reminder.type === "TASK_CLIENT_REVIEW_48H" &&
      "clientReviewEnteredAt" in source &&
      source.clientReviewEnteredAt !== null
    )
      return {
        id: "task.client_review_48h",
        variables: {
          clientName,
          title: source.title,
          enteredReviewLabel: formatDateLabel(
            source.clientReviewEnteredAt,
            this.deps.clock.timeZone(),
          ),
          reminderNumber: source.clientReviewRound,
          maxReminders: settings.maxRemindersPerTask,
        },
      };
    if ("dueDate" in source) {
      const period = `${source.period.slice(5, 7)}/${source.period.slice(0, 4)}`;
      const dueDateLabel = formatDateLabel(source.dueDate, this.deps.clock.timeZone());
      const daysUntilDue = Math.round(
        (source.dueDate.getTime() - this.deps.clock.now().getTime()) / 86_400_000,
      );
      if (reminder.type === "INVOICE_UPCOMING_DUE")
        return {
          id: "invoice.upcoming_due",
          variables: {
            clientName,
            period,
            amountLabel: formatAmountLabel(source.amountCents, source.currency),
            dueDateLabel,
            daysUntilDue: Math.max(0, daysUntilDue),
          },
        };
      if (reminder.type === "INVOICE_DUE_TODAY")
        return {
          id: "invoice.due_today",
          variables: {
            clientName,
            period,
            amountLabel: formatAmountLabel(source.amountCents, source.currency),
            dueDateLabel,
          },
        };
      return {
        id: "invoice.overdue",
        variables: {
          clientName,
          period,
          amountLabel: formatAmountLabel(source.amountCents, source.currency),
          dueDateLabel,
          daysOverdue: Math.max(1, -daysUntilDue),
        },
      };
    }
    throw new Error(`Unsupported reminder type ${reminder.type}`);
  }
}

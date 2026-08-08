import type {
  AutomationSetting,
  Invoice,
  Recording,
  ReminderType,
  Task,
} from "../entities/index.js";
import { BusinessWindowService } from "./business-window.js";
import { IdempotencyKeyFactory } from "./idempotency-key.js";
import type { Clock } from "../ports/index.js";

export interface ScheduledReminder {
  readonly type: ReminderType;
  readonly sourceId: string;
  readonly scheduledFor: Date;
  readonly idempotencyKey: string;
}

export class ReminderSchedulePolicy {
  public constructor(
    private readonly window: BusinessWindowService,
    private readonly keys: IdempotencyKeyFactory,
    private readonly timeZone: string,
    private readonly clock: Pick<Clock, "fromEpoch">,
  ) {}

  recording(recording: Recording, settings: AutomationSetting): ScheduledReminder | null {
    const target = this.clock.fromEpoch(
      recording.scheduledAt.getTime() - settings.recordingOffsetHours * 3_600_000,
    );
    const scheduledFor = this.window.nextValidSlot(target, this.policy(settings));
    if (scheduledFor >= recording.scheduledAt) return null;
    return {
      type: "RECORDING_24H",
      sourceId: recording.id,
      scheduledFor,
      idempotencyKey: this.keys.recording(
        recording.id,
        recording.scheduledAt,
        settings.recordingOffsetHours,
      ),
    };
  }

  task(task: Task, settings: AutomationSetting): ScheduledReminder[] {
    if (task.clientReviewEnteredAt === null || task.status !== "CLIENT_REVIEW") return [];
    return Array.from({ length: settings.maxRemindersPerTask }, (_, index) => {
      const occurrence = index + 1;
      const target = this.clock.fromEpoch(
        task.clientReviewEnteredAt!.getTime() +
          settings.taskReviewOffsetHours * occurrence * 3_600_000,
      );
      return {
        type: "TASK_CLIENT_REVIEW_48H" as const,
        sourceId: task.id,
        scheduledFor: this.window.nextValidSlot(target, this.policy(settings)),
        idempotencyKey: this.keys.task(task.id, task.clientReviewRound, occurrence),
      };
    });
  }

  invoice(invoice: Invoice, settings: AutomationSetting): ScheduledReminder[] {
    if (invoice.status === "PAID" || invoice.status === "CANCELLED") return [];
    return settings.invoiceOffsetsDays.map((offset) => {
      const target = this.clock.fromEpoch(invoice.dueDate.getTime() + offset * 86_400_000);
      const type: ReminderType =
        offset < 0
          ? "INVOICE_UPCOMING_DUE"
          : offset === 0
            ? "INVOICE_DUE_TODAY"
            : "INVOICE_OVERDUE";
      return {
        type,
        sourceId: invoice.id,
        scheduledFor: this.window.nextValidSlot(target, this.policy(settings)),
        idempotencyKey: this.keys.invoice(invoice.id, type, offset),
      };
    });
  }

  private policy(settings: AutomationSetting) {
    return {
      timeZone: this.timeZone,
      start: settings.businessHoursStart,
      end: settings.businessHoursEnd,
      sendOnSundays: settings.sendOnSundays,
    };
  }
}

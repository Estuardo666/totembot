import type {
  Client,
  Invoice,
  Recording,
  Reminder,
  Task,
  WhatsAppGroup,
} from "../entities/index.js";

export type EligibilityDecision =
  | { readonly kind: "SEND" }
  | { readonly kind: "CANCEL"; readonly reason: string }
  | { readonly kind: "SKIP"; readonly reason: string }
  | { readonly kind: "DEFER"; readonly until: Date };

export interface EligibilityContext {
  readonly client: Client;
  readonly group: WhatsAppGroup | null;
  readonly source: Recording | Task | Invoice | null;
  readonly globalPaused: boolean;
  readonly clientPaused: boolean;
  readonly now: Date;
  readonly maxReminders: number;
  readonly reminderNumber?: number;
  readonly remindersSent?: number;
  readonly staleAfterHours: number | null;
  readonly nextValidSlot?: Date;
}

export class EligibilityService {
  evaluate(reminder: Reminder, context: EligibilityContext): EligibilityDecision {
    if (context.globalPaused || context.clientPaused) return { kind: "SKIP", reason: "PAUSED" };
    if (context.client.status !== "ACTIVE") return { kind: "CANCEL", reason: "CLIENT_INACTIVE" };
    if (
      context.group === null ||
      !context.group.isPrimary ||
      !context.group.enabled ||
      context.group.authorizedAt === null
    )
      return { kind: "CANCEL", reason: "NO_AUTHORIZED_GROUP" };
    if (reminder.status === "SENT") return { kind: "CANCEL", reason: "ALREADY_SENT" };
    if (context.source === null) return { kind: "CANCEL", reason: "SOURCE_MISSING" };
    if (
      "dueDate" in context.source &&
      (context.source.status === "PAID" || context.source.status === "CANCELLED")
    )
      return { kind: "CANCEL", reason: "INVOICE_SETTLED" };
    if (
      "scheduledAt" in context.source &&
      context.now.getTime() >= context.source.scheduledAt.getTime() &&
      context.source.status !== "DONE" &&
      context.source.status !== "CANCELLED"
    )
      return { kind: "CANCEL", reason: "TOO_LATE" };
    if (
      "clientReviewRound" in context.source &&
      (context.source.status !== "CLIENT_REVIEW" ||
        reminder.type !== "TASK_CLIENT_REVIEW_48H" ||
        (this.taskRound(reminder.idempotencyKey) !== undefined &&
          this.taskRound(reminder.idempotencyKey) !== context.source.clientReviewRound))
    )
      return { kind: "CANCEL", reason: "SOURCE_STATE_CHANGED" };
    if (
      "scheduledAt" in context.source &&
      this.recordingScheduledAt(reminder.idempotencyKey) !== undefined &&
      this.recordingScheduledAt(reminder.idempotencyKey) !== context.source.scheduledAt.getTime()
    )
      return { kind: "CANCEL", reason: "SOURCE_STATE_CHANGED" };
    if (
      "scheduledAt" in context.source &&
      (context.source.status === "CANCELLED" || context.source.status === "DONE")
    )
      return { kind: "CANCEL", reason: "SOURCE_STATE_CHANGED" };
    if (
      context.staleAfterHours !== null &&
      context.now.getTime() - reminder.scheduledFor.getTime() > context.staleAfterHours * 3_600_000
    )
      return { kind: "CANCEL", reason: "STALE" };
    if (context.maxReminders <= 0) return { kind: "CANCEL", reason: "MAX_REMINDERS_REACHED" };
    if (
      (context.reminderNumber !== undefined && context.reminderNumber > context.maxReminders) ||
      (context.remindersSent !== undefined && context.remindersSent >= context.maxReminders)
    )
      return { kind: "CANCEL", reason: "MAX_REMINDERS_REACHED" };
    if (
      context.nextValidSlot !== undefined &&
      context.nextValidSlot.getTime() > context.now.getTime()
    )
      return { kind: "DEFER", until: context.nextValidSlot };
    return { kind: "SEND" };
  }

  private taskRound(key: string): number | undefined {
    const match = /:r([0-9]+):n[0-9]+$/.exec(key);
    if (match === null) return undefined;
    const value = Number(match[1]);
    return Number.isSafeInteger(value) ? value : undefined;
  }

  private recordingScheduledAt(key: string): number | undefined {
    const match = /^recording:[^:]+:([0-9]+):/.exec(key);
    if (match === null) return undefined;
    const value = Number(match[1]);
    return Number.isSafeInteger(value) ? value * 1000 : undefined;
  }
}

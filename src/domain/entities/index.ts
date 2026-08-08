export type ClientStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";
export type TaskStatus =
  | "DRAFT"
  | "EDITING"
  | "CLIENT_REVIEW"
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | "PUBLISHED"
  | "CANCELLED";
export type RecordingStatus = "SCHEDULED" | "RESCHEDULED" | "DONE" | "CANCELLED";
export type InvoiceStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
export type ReminderType =
  | "RECORDING_24H"
  | "TASK_CLIENT_REVIEW_48H"
  | "INVOICE_UPCOMING_DUE"
  | "INVOICE_DUE_TODAY"
  | "INVOICE_OVERDUE";
export type ReminderStatus =
  | "PENDING"
  | "CLAIMED"
  | "PROCESSING"
  | "SENT"
  | "RETRY_SCHEDULED"
  | "CANCELLED"
  | "FAILED"
  | "SKIPPED"
  | "NEEDS_REVIEW";

export interface Client {
  readonly id: string;
  readonly name: string;
  readonly status: ClientStatus;
  readonly timeZone: string | null;
}

export interface WhatsAppGroup {
  readonly id: string;
  readonly clientId: string;
  readonly jid: string;
  readonly label: string;
  readonly isPrimary: boolean;
  readonly enabled: boolean;
  readonly authorizedAt: Date | null;
}

export interface Recording {
  readonly id: string;
  readonly clientId: string;
  readonly title: string;
  readonly scheduledAt: Date;
  readonly location: string | null;
  readonly notes: string | null;
  readonly status: RecordingStatus;
}

export interface Task {
  readonly id: string;
  readonly clientId: string;
  readonly title: string;
  readonly status: TaskStatus;
  readonly clientReviewEnteredAt: Date | null;
  readonly clientReviewRound: number;
}

export interface Invoice {
  readonly id: string;
  readonly clientId: string;
  readonly period: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly dueDate: Date;
  readonly status: InvoiceStatus;
  readonly paidAt: Date | null;
  readonly remindersSent: number;
}

export interface Reminder {
  readonly id: string;
  readonly type: ReminderType;
  readonly clientId: string;
  readonly recordingId: string | null;
  readonly taskId: string | null;
  readonly invoiceId: string | null;
  readonly scheduledFor: Date;
  readonly status: ReminderStatus;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly claimedAt: Date | null;
  readonly claimedBy: string | null;
  readonly nextAttemptAt: Date | null;
  readonly sentAt: Date | null;
  readonly idempotencyKey: string;
}

export interface AutomationSetting {
  readonly globalPaused: boolean;
  readonly businessHoursStart: string;
  readonly businessHoursEnd: string;
  readonly sendOnSundays: boolean;
  readonly maxRemindersPerTask: number;
  readonly maxRemindersPerInvoice: number;
  readonly taskReviewOffsetHours: number;
  readonly recordingOffsetHours: number;
  readonly invoiceOffsetsDays: readonly number[];
}

const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  DRAFT: ["EDITING", "CANCELLED"],
  EDITING: ["CLIENT_REVIEW", "CANCELLED"],
  CLIENT_REVIEW: ["CHANGES_REQUESTED", "APPROVED", "CANCELLED"],
  CHANGES_REQUESTED: ["EDITING", "CANCELLED"],
  APPROVED: ["PUBLISHED", "CANCELLED"],
  PUBLISHED: [],
  CANCELLED: [],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransitionTask(from, to)) {
    throw new Error(`Invalid task transition: ${from} -> ${to}`);
  }
}

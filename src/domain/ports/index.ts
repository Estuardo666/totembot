import type {
  AutomationSetting,
  Client,
  ClientStatus,
  Invoice,
  Recording,
  Reminder,
  Task,
  WhatsAppGroup,
} from "../entities/index.js";

export type GroupJid = string & { readonly __brand: "GroupJid" };
export type ConnectionState = "open" | "connecting" | "closed" | "logged_out";
export type SendResult =
  | { readonly kind: "sent"; readonly providerMessageId: string | null }
  | {
      readonly kind: "failed";
      readonly classification: "TRANSIENT" | "PERMANENT" | "SESSION_INVALID";
      readonly code: string;
    }
  | { readonly kind: "skipped"; readonly reason: "DRY_RUN" };

export function asGroupJid(value: string): GroupJid {
  if (!value.endsWith("@g.us")) throw new Error("Only WhatsApp group JIDs are allowed");
  return value as GroupJid;
}

export interface MessagingGateway {
  sendGroupText(jid: GroupJid, text: string): Promise<SendResult>;
  connectionState(): ConnectionState;
  listAuthorizedGroups(): Promise<
    ReadonlyArray<{ readonly jid: GroupJid; readonly subject: string }>
  >;
}

export interface Clock {
  now(): Date;
  fromEpoch(epochMs: number): Date;
  timeZone(): string;
}

export interface IdGenerator {
  next(): string;
}
export interface RandomSource {
  next(): number;
}

export interface ClientRepository {
  findById(id: string): Promise<Client | null>;
  findWithPrimaryGroup(
    id: string,
  ): Promise<{ readonly client: Client; readonly group: WhatsAppGroup | null } | null>;
}
export interface ClientAdministrationRepository {
  create(client: Client): Promise<void>;
  list(status?: ClientStatus): Promise<readonly Client[]>;
}
export interface WhatsAppGroupRepository {
  findById(id: string): Promise<WhatsAppGroup | null>;
  save(group: WhatsAppGroup): Promise<void>;
}
export interface AutomationSettingsAdministrationRepository {
  setGlobalPaused(paused: boolean, id: string): Promise<void>;
  setClientPaused(clientId: string, paused: boolean, id: string): Promise<void>;
}
export interface RecordingRepository {
  findById(id: string): Promise<Recording | null>;
  save(recording: Recording): Promise<void>;
}
export interface TaskRepository {
  findById(id: string): Promise<Task | null>;
  save(task: Task): Promise<void>;
  saveIfStatus(task: Task, expectedStatus: Task["status"]): Promise<boolean>;
}
export interface InvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  save(invoice: Invoice): Promise<void>;
  saveIfStatus(invoice: Invoice, expectedStatus: Invoice["status"]): Promise<boolean>;
  incrementRemindersSent(id: string): Promise<boolean>;
  markOverdue(now: Date): Promise<number>;
}
export interface ReminderMetrics {
  readonly pending: number;
  readonly dueNow: number;
  readonly retryScheduled: number;
  readonly needsReview: number;
  readonly failedLast24h: number;
  readonly sentLast24h: number;
}
export interface ReminderRepository {
  recoverExpired(lockExpiresAt: Date): Promise<number>;
  getMetrics(now: Date, since: Date): Promise<ReminderMetrics>;
  recoverExpired(lockExpiresAt: Date): Promise<number>;
  claimDue(now: Date, lockExpiresAt: Date, workerId: string, limit: number): Promise<Reminder[]>;
  insertIfAbsent(reminder: Reminder): Promise<boolean>;
  cancelPendingForSource(
    source: {
      readonly recordingId?: string;
      readonly taskId?: string;
      readonly invoiceId?: string;
    },
    reason: string,
  ): Promise<number>;
  markStatus(id: string, status: Reminder["status"], reason?: string): Promise<void>;
  defer(id: string, scheduledFor: Date, reason: string): Promise<void>;
  markProcessing(id: string): Promise<void>;
  markSent(id: string, sentAt: Date): Promise<void>;
  scheduleRetry(id: string, nextAttemptAt: Date, error: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  markNeedsReview(id: string, reason: string): Promise<void>;
}
export interface AutomationSettingsRepository {
  resolveForClient(clientId: string): Promise<AutomationSetting>;
}
export interface TransactionManager {
  runInTransaction<T>(work: (repositories: TransactionRepositories) => Promise<T>): Promise<T>;
}

export interface TransactionRepositories {
  readonly clients: ClientRepository;
  readonly recordings: RecordingRepository;
  readonly tasks: TaskRepository;
  readonly invoices: InvoiceRepository;
  readonly reminders: ReminderRepository;
  readonly attempts: MessageAttemptRepository;
}
export interface AuditLogger {
  record(event: {
    readonly action: string;
    readonly entityType: string;
    readonly entityId?: string;
    readonly metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface MessageAttemptRepository {
  create(input: {
    readonly id: string;
    readonly reminderId: string;
    readonly groupId: string;
    readonly attemptNumber: number;
    readonly templateId: string;
    readonly templateVersion: number;
    readonly correlationId: string;
    readonly renderedLength?: number;
    readonly status: "STARTED" | "SUCCESS" | "FAILED" | "SKIPPED_DRY_RUN";
  }): Promise<void>;
  finish(
    id: string,
    result: {
      readonly status: "SUCCESS" | "FAILED" | "SKIPPED_DRY_RUN";
      readonly finishedAt: Date;
      readonly providerMessageId?: string | null;
      readonly errorCode?: string;
      readonly errorMessage?: string;
    },
  ): Promise<void>;
}

export interface ReminderSourceRepository {
  findSource(reminder: Reminder): Promise<Recording | Task | Invoice | null>;
}
export interface ReminderAdministrationRepository {
  findById(id: string): Promise<Reminder | null>;
  resolveNeedsReview(
    id: string,
    outcome: "delivered" | "not-delivered",
    resolvedAt: Date,
  ): Promise<boolean>;
}

export interface RetentionRepository {
  /** Borra los intentos de mensaje con `startedAt` estrictamente anterior al corte. */
  purgeMessageAttemptsBefore(cutoff: Date): Promise<number>;
  /** Borra los eventos de auditoría con `occurredAt` estrictamente anterior al corte. */
  purgeAuditEventsBefore(cutoff: Date): Promise<number>;
}

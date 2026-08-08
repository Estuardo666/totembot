import { ApplicationError } from "../errors.js";
import type {
  AutomationSetting,
  Invoice,
  Recording,
  Task,
  TaskStatus,
} from "../../domain/entities/index.js";
import type {
  AuditLogger,
  AutomationSettingsRepository,
  ClientRepository,
  Clock,
  IdGenerator,
  InvoiceRepository,
  RecordingRepository,
  TaskRepository,
  TransactionManager,
} from "../../domain/ports/index.js";
import { ReminderSchedulePolicy } from "../../domain/services/schedule-policy.js";
import { CreateRecording, RescheduleRecording, CancelRecording } from "./recordings.js";
import { ChangeTaskStatus } from "./tasks.js";
import { CreateInvoice, MarkInvoicePaid } from "./invoices.js";

export interface RecordingAdministration {
  create(input: {
    readonly clientId: string;
    readonly title: string;
    readonly scheduledAt: Date;
    readonly location?: string | null;
    readonly notes?: string | null;
  }): Promise<Recording>;
  reschedule(id: string, scheduledAt: Date): Promise<Recording>;
  cancel(id: string): Promise<Recording>;
}

export interface TaskAdministration {
  changeStatus(id: string, nextStatus: TaskStatus): Promise<Task>;
}

export interface InvoiceAdministration {
  create(input: {
    readonly clientId: string;
    readonly period: string;
    readonly amountCents: number;
    readonly dueDate: Date;
  }): Promise<Invoice>;
  pay(id: string): Promise<Invoice>;
}

export interface ContentAdministrationDependencies {
  readonly clients: ClientRepository;
  readonly recordings: RecordingRepository;
  readonly tasks: TaskRepository;
  readonly invoices: InvoiceRepository;
  readonly settings: AutomationSettingsRepository;
  readonly tx: TransactionManager;
  readonly schedule: ReminderSchedulePolicy;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditLogger;
}

export class ManageRecordings implements RecordingAdministration {
  public constructor(private readonly deps: ContentAdministrationDependencies) {}

  async create(input: {
    readonly clientId: string;
    readonly title: string;
    readonly scheduledAt: Date;
    readonly location?: string | null;
    readonly notes?: string | null;
  }): Promise<Recording> {
    await this.requireClient(input.clientId);
    const result = await new CreateRecording(
      this.deps.tx,
      this.deps.schedule,
      await this.settingsFor(input.clientId),
      this.deps.ids,
    ).execute(input);
    await this.audit("RECORDING_CREATED", result.id, { clientId: result.clientId });
    return result;
  }

  async reschedule(id: string, scheduledAt: Date): Promise<Recording> {
    const current = await this.requireRecording(id);
    const result = await new RescheduleRecording(
      this.deps.tx,
      this.deps.schedule,
      await this.settingsFor(current.clientId),
      this.deps.ids,
    ).execute(id, scheduledAt);
    await this.audit("RECORDING_RESCHEDULED", result.id, {
      scheduledAt: scheduledAt.toISOString(),
    });
    return result;
  }

  async cancel(id: string): Promise<Recording> {
    const result = await new CancelRecording(this.deps.tx).execute(id);
    await this.audit("RECORDING_CANCELLED", result.id, { clientId: result.clientId });
    return result;
  }

  private async requireClient(id: string): Promise<void> {
    if ((await this.deps.clients.findById(id)) === null)
      throw new ApplicationError("CLIENT_NOT_FOUND", `Client not found: ${id}`);
  }

  private async requireRecording(id: string): Promise<Recording> {
    const recording = await this.deps.recordings.findById(id);
    if (recording === null)
      throw new ApplicationError("RECORDING_NOT_FOUND", `Recording not found: ${id}`);
    return recording;
  }

  private settingsFor(clientId: string): Promise<AutomationSetting> {
    return this.deps.settings.resolveForClient(clientId);
  }

  private audit(
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.deps.audit.record({ action, entityType: "Recording", entityId, metadata });
  }
}

export class ManageTasks implements TaskAdministration {
  public constructor(private readonly deps: ContentAdministrationDependencies) {}

  async changeStatus(id: string, nextStatus: TaskStatus): Promise<Task> {
    const current = await this.requireTask(id);
    const result = await new ChangeTaskStatus(
      this.deps.tx,
      this.deps.schedule,
      this.deps.ids,
      this.deps.clock,
      await this.settingsFor(current.clientId),
    ).execute(id, nextStatus);
    await this.deps.audit.record({
      action: "TASK_STATUS_CHANGED",
      entityType: "Task",
      entityId: result.id,
      metadata: { from: current.status, to: result.status },
    });
    return result;
  }

  private async requireTask(id: string): Promise<Task> {
    const task = await this.deps.tasks.findById(id);
    if (task === null) throw new ApplicationError("TASK_NOT_FOUND", `Task not found: ${id}`);
    return task;
  }

  private settingsFor(clientId: string): Promise<AutomationSetting> {
    return this.deps.settings.resolveForClient(clientId);
  }
}

export class ManageInvoices implements InvoiceAdministration {
  public constructor(private readonly deps: ContentAdministrationDependencies) {}

  async create(input: {
    readonly clientId: string;
    readonly period: string;
    readonly amountCents: number;
    readonly dueDate: Date;
  }): Promise<Invoice> {
    await this.requireClient(input.clientId);
    const result = await new CreateInvoice(
      this.deps.tx,
      this.deps.schedule,
      await this.settingsFor(input.clientId),
      this.deps.ids,
    ).execute(input);
    await this.audit("INVOICE_CREATED", result.id, {
      clientId: result.clientId,
      period: result.period,
    });
    return result;
  }

  async pay(id: string): Promise<Invoice> {
    const result = await new MarkInvoicePaid(this.deps.tx, this.deps.clock).execute(id);
    await this.audit("INVOICE_PAID", result.id, { clientId: result.clientId });
    return result;
  }

  private async requireClient(id: string): Promise<void> {
    if ((await this.deps.clients.findById(id)) === null)
      throw new ApplicationError("CLIENT_NOT_FOUND", `Client not found: ${id}`);
  }

  private async settingsFor(clientId: string): Promise<AutomationSetting> {
    return this.deps.settings.resolveForClient(clientId);
  }

  private audit(
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.deps.audit.record({ action, entityType: "Invoice", entityId, metadata });
  }
}

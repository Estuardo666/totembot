import type { AutomationSetting, Recording, Reminder } from "../../domain/entities/index.js";
import type { IdGenerator, TransactionManager } from "../../domain/ports/index.js";
import { ReminderSchedulePolicy } from "../../domain/services/schedule-policy.js";

export interface CreateRecordingInput {
  readonly clientId: string;
  readonly title: string;
  readonly scheduledAt: Date;
  readonly location?: string | null;
  readonly notes?: string | null;
}

export class CreateRecording {
  public constructor(
    private readonly tx: TransactionManager,
    private readonly schedule: ReminderSchedulePolicy,
    private readonly settings: AutomationSetting,
    private readonly ids: IdGenerator,
  ) {}
  async execute(input: CreateRecordingInput): Promise<Recording> {
    const recording: Recording = {
      id: this.ids.next(),
      clientId: input.clientId,
      title: input.title,
      scheduledAt: input.scheduledAt,
      location: input.location ?? null,
      notes: input.notes ?? null,
      status: "SCHEDULED",
    };
    await this.tx.runInTransaction(async ({ recordings, reminders }) => {
      await recordings.save(recording);
      const occurrence = this.schedule.recording(recording, this.settings);
      if (occurrence !== null)
        await reminders.insertIfAbsent(recordingReminder(recording, occurrence, this.ids));
    });
    return recording;
  }
}

export class RescheduleRecording {
  public constructor(
    private readonly tx: TransactionManager,
    private readonly schedule: ReminderSchedulePolicy,
    private readonly settings: AutomationSetting,
    private readonly ids: IdGenerator,
  ) {}

  async execute(id: string, scheduledAt: Date): Promise<Recording> {
    return this.tx.runInTransaction(async ({ recordings, reminders }) => {
      const current = await recordings.findById(id);
      if (current === null) throw new Error("Recording not found");
      if (current.status === "DONE" || current.status === "CANCELLED")
        throw new Error("Recording cannot be rescheduled");
      const recording: Recording = { ...current, scheduledAt, status: "RESCHEDULED" };
      await recordings.save(recording);
      await reminders.cancelPendingForSource({ recordingId: recording.id }, "SOURCE_RESCHEDULED");
      const occurrence = this.schedule.recording(recording, this.settings);
      if (occurrence !== null)
        await reminders.insertIfAbsent(recordingReminder(recording, occurrence, this.ids));
      return recording;
    });
  }
}

export class CancelRecording {
  public constructor(private readonly tx: TransactionManager) {}

  async execute(id: string): Promise<Recording> {
    return this.tx.runInTransaction(async ({ recordings, reminders }) => {
      const current = await recordings.findById(id);
      if (current === null) throw new Error("Recording not found");
      if (current.status === "DONE" || current.status === "CANCELLED") return current;
      const recording: Recording = { ...current, status: "CANCELLED" };
      await recordings.save(recording);
      await reminders.cancelPendingForSource({ recordingId: recording.id }, "SOURCE_CANCELLED");
      return recording;
    });
  }
}

function recordingReminder(
  recording: Recording,
  occurrence: Exclude<ReturnType<ReminderSchedulePolicy["recording"]>, null>,
  ids: IdGenerator,
): Reminder {
  return {
    id: ids.next(),
    type: occurrence.type,
    clientId: recording.clientId,
    recordingId: recording.id,
    taskId: null,
    invoiceId: null,
    scheduledFor: occurrence.scheduledFor,
    status: "PENDING",
    attempts: 0,
    maxAttempts: 3,
    claimedAt: null,
    claimedBy: null,
    nextAttemptAt: null,
    sentAt: null,
    idempotencyKey: occurrence.idempotencyKey,
  };
}

import { describe, expect, it } from "vitest";

import type { AutomationSetting, Recording, Reminder } from "../../../src/domain/entities/index.js";
import type {
  IdGenerator,
  RecordingRepository,
  ReminderRepository,
  TransactionManager,
} from "../../../src/domain/ports/index.js";
import { BusinessWindowService } from "../../../src/domain/services/business-window.js";
import { IdempotencyKeyFactory } from "../../../src/domain/services/idempotency-key.js";
import { ReminderSchedulePolicy } from "../../../src/domain/services/schedule-policy.js";
import {
  CancelRecording,
  RescheduleRecording,
} from "../../../src/application/use-cases/recordings.js";

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
const recording: Recording = {
  id: "recording-1",
  clientId: "client-1",
  title: "Grabación",
  scheduledAt: new Date("2026-08-10T13:00:00.000Z"),
  location: null,
  notes: null,
  status: "SCHEDULED",
};

class SequentialIds implements IdGenerator {
  private value = 0;
  next(): string {
    this.value += 1;
    return `id-${this.value}`;
  }
}

class MemoryRecordingRepository implements RecordingRepository {
  value: Recording = recording;
  findById(id: string): Promise<Recording | null> {
    return Promise.resolve(id === this.value.id ? this.value : null);
  }
  save(value: Recording): Promise<void> {
    this.value = value;
    return Promise.resolve();
  }
}

type MutableReminder = { -readonly [K in keyof Reminder]: Reminder[K] };
class MemoryReminderRepository implements ReminderRepository {
  readonly values: MutableReminder[] = [
    {
      id: "reminder-1",
      type: "RECORDING_24H",
      clientId: recording.clientId,
      recordingId: recording.id,
      taskId: null,
      invoiceId: null,
      scheduledFor: new Date("2026-08-09T13:00:00.000Z"),
      status: "PENDING",
      attempts: 0,
      maxAttempts: 3,
      claimedAt: null,
      claimedBy: null,
      nextAttemptAt: null,
      sentAt: null,
      idempotencyKey: "recording:recording-1:178:24h_before",
    },
  ];
  reasons: string[] = [];
  recoverExpired(): Promise<number> {
    return Promise.resolve(0);
  }
  getMetrics() {
    return Promise.resolve({
      pending: 0,
      dueNow: 0,
      retryScheduled: 0,
      needsReview: 0,
      failedLast24h: 0,
      sentLast24h: 0,
    });
  }
  claimDue(): Promise<Reminder[]> {
    return Promise.resolve([]);
  }
  insertIfAbsent(value: Reminder): Promise<boolean> {
    this.values.push({ ...value });
    return Promise.resolve(true);
  }
  cancelPendingForSource(): Promise<number> {
    for (const value of this.values) {
      if (value.recordingId === recording.id && value.status === "PENDING")
        value.status = "CANCELLED";
    }
    this.reasons.push("SOURCE_RESCHEDULED");
    return Promise.resolve(1);
  }
  markStatus(): Promise<void> {
    return Promise.resolve();
  }
  defer(): Promise<void> {
    return Promise.resolve();
  }
  markProcessing(): Promise<void> {
    return Promise.resolve();
  }
  markSent(): Promise<void> {
    return Promise.resolve();
  }
  scheduleRetry(): Promise<void> {
    return Promise.resolve();
  }
  markFailed(): Promise<void> {
    return Promise.resolve();
  }
  markNeedsReview(): Promise<void> {
    return Promise.resolve();
  }
}

function setup(): {
  readonly recordings: MemoryRecordingRepository;
  readonly reminders: MemoryReminderRepository;
  readonly tx: TransactionManager;
  readonly schedule: ReminderSchedulePolicy;
  readonly ids: IdGenerator;
} {
  const recordings = new MemoryRecordingRepository();
  const reminders = new MemoryReminderRepository();
  const tx: TransactionManager = {
    runInTransaction: async (work) =>
      work({
        clients: undefined as never,
        recordings,
        tasks: undefined as never,
        invoices: undefined as never,
        reminders,
        attempts: undefined as never,
      }),
  };
  const clock = { fromEpoch: (epochMs: number) => new Date(epochMs) };
  return {
    recordings,
    reminders,
    tx,
    schedule: new ReminderSchedulePolicy(
      new BusinessWindowService(clock),
      new IdempotencyKeyFactory(),
      "America/Guayaquil",
      clock,
    ),
    ids: new SequentialIds(),
  };
}

describe("recording lifecycle", () => {
  it("reschedules and replaces pending reminders", async () => {
    const context = setup();
    const useCase = new RescheduleRecording(context.tx, context.schedule, settings, context.ids);

    const result = await useCase.execute(recording.id, new Date("2026-08-12T13:00:00.000Z"));

    expect(result.status).toBe("RESCHEDULED");
    expect(context.recordings.value.scheduledAt).toEqual(new Date("2026-08-12T13:00:00.000Z"));
    expect(context.reminders.values[0]?.status).toBe("CANCELLED");
    expect(context.reminders.values).toHaveLength(2);
  });

  it("cancels the recording and its pending reminder", async () => {
    const context = setup();
    const useCase = new CancelRecording(context.tx);

    const result = await useCase.execute(recording.id);

    expect(result.status).toBe("CANCELLED");
    expect(context.recordings.value.status).toBe("CANCELLED");
    expect(context.reminders.values[0]?.status).toBe("CANCELLED");
  });

  it("does not schedule a reminder when the event is already too late", () => {
    const context = setup();
    const late = { ...recording, scheduledAt: new Date("2026-08-07T10:00:00.000Z") };

    expect(context.schedule.recording(late, { ...settings, recordingOffsetHours: -1 })).toBeNull();
  });
});

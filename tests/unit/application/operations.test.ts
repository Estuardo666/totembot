import { describe, expect, it } from "vitest";
import {
  ManageAutomation,
  ManageReminders,
} from "../../../src/application/use-cases/operations.js";
import type { Client, Reminder } from "../../../src/domain/entities/index.js";
import type {
  AuditLogger,
  AutomationSettingsAdministrationRepository,
  ClientRepository,
  IdGenerator,
  ReminderAdministrationRepository,
} from "../../../src/domain/ports/index.js";

const client: Client = {
  id: "00000000-0000-7000-8000-000000000010",
  name: "Cliente ficticio",
  status: "ACTIVE",
  timeZone: null,
};
const reviewReminder: Reminder = {
  id: "00000000-0000-7000-8000-000000000011",
  type: "RECORDING_24H",
  clientId: client.id,
  recordingId: null,
  taskId: null,
  invoiceId: null,
  scheduledFor: new Date("2026-08-07T13:00:00.000Z"),
  status: "NEEDS_REVIEW",
  attempts: 1,
  maxAttempts: 3,
  claimedAt: null,
  claimedBy: null,
  nextAttemptAt: null,
  sentAt: null,
  idempotencyKey: "fictitious-reminder",
};

class MemoryIds implements IdGenerator {
  private count = 0;
  next(): string {
    this.count += 1;
    return `id-${this.count}`;
  }
}
class MemoryAudit implements AuditLogger {
  readonly actions: string[] = [];
  record(event: { readonly action: string }): Promise<void> {
    this.actions.push(event.action);
    return Promise.resolve();
  }
}
class MemoryClients implements ClientRepository {
  findById(id: string): Promise<Client | null> {
    return Promise.resolve(id === client.id ? client : null);
  }
  findWithPrimaryGroup(): Promise<null> {
    return Promise.resolve(null);
  }
}
class MemorySettings implements AutomationSettingsAdministrationRepository {
  values: Array<{ readonly clientId: string | null; readonly paused: boolean }> = [];
  setGlobalPaused(paused: boolean): Promise<void> {
    this.values.push({ clientId: null, paused });
    return Promise.resolve();
  }
  setClientPaused(clientId: string, paused: boolean): Promise<void> {
    this.values.push({ clientId, paused });
    return Promise.resolve();
  }
}
class MemoryReminders implements ReminderAdministrationRepository {
  value = reviewReminder;
  findById(id: string): Promise<Reminder | null> {
    return Promise.resolve(id === this.value.id ? this.value : null);
  }
  resolveNeedsReview(
    id: string,
    outcome: "delivered" | "not-delivered",
    resolvedAt: Date,
  ): Promise<boolean> {
    if (id !== this.value.id || this.value.status !== "NEEDS_REVIEW") return Promise.resolve(false);
    this.value = {
      ...this.value,
      status: outcome === "delivered" ? "SENT" : "PENDING",
      sentAt: outcome === "delivered" ? resolvedAt : null,
    };
    return Promise.resolve(true);
  }
}

describe("operational use cases", () => {
  it("pauses automation globally or for a known client", async () => {
    const settings = new MemorySettings();
    const audit = new MemoryAudit();
    const useCase = new ManageAutomation(new MemoryClients(), settings, new MemoryIds(), audit);

    await useCase.setPaused({ clientId: null, paused: true });
    await useCase.setPaused({ clientId: client.id, paused: false });

    expect(settings.values).toEqual([
      { clientId: null, paused: true },
      { clientId: client.id, paused: false },
    ]);
    expect(audit.actions).toEqual(["AUTOMATION_PAUSED", "AUTOMATION_RESUMED"]);
  });

  it("resolves delivery uncertainty and refuses ordinary reminders", async () => {
    const reminders = new MemoryReminders();
    const audit = new MemoryAudit();
    const useCase = new ManageReminders(reminders, audit);
    const resolvedAt = new Date("2026-08-07T14:00:00.000Z");

    const resolved = await useCase.resolve(reviewReminder.id, "delivered", resolvedAt);
    expect(resolved.status).toBe("SENT");
    expect(resolved.sentAt).toEqual(resolvedAt);
    expect(audit.actions).toEqual(["REMINDER_RESOLVED"]);

    await expect(useCase.resolve(reviewReminder.id, "delivered", resolvedAt)).rejects.toMatchObject(
      {
        code: "REMINDER_NOT_NEEDS_REVIEW",
      },
    );
  });
});

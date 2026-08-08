import { describe, expect, it } from "vitest";
import { EligibilityService } from "../../../src/domain/services/eligibility.js";
import type { EligibilityContext } from "../../../src/domain/services/eligibility.js";
import type { Invoice, Recording, Reminder } from "../../../src/domain/entities/index.js";

const reminder: Reminder = {
  id: "r1",
  type: "INVOICE_DUE_TODAY",
  clientId: "c1",
  recordingId: null,
  taskId: null,
  invoiceId: "i1",
  scheduledFor: new Date("2026-08-04T13:00:00.000Z"),
  status: "CLAIMED",
  attempts: 0,
  maxAttempts: 3,
  claimedAt: null,
  claimedBy: null,
  nextAttemptAt: null,
  sentAt: null,
  idempotencyKey: "invoice:i1:due_today",
};
const invoice: Invoice = {
  id: "i1",
  clientId: "c1",
  period: "2026-08",
  amountCents: 1000,
  currency: "USD",
  dueDate: new Date("2026-08-04T00:00:00.000Z"),
  status: "PENDING",
  paidAt: null,
  remindersSent: 0,
};
const base: EligibilityContext = {
  client: { id: "c1", name: "Demo", status: "ACTIVE", timeZone: null },
  group: {
    id: "g1",
    clientId: "c1",
    jid: "123@g.us",
    label: "Demo",
    isPrimary: true,
    enabled: true,
    authorizedAt: new Date("2026-08-01T00:00:00.000Z"),
  },
  source: invoice,
  globalPaused: false,
  clientPaused: false,
  now: new Date("2026-08-04T13:00:00.000Z"),
  maxReminders: 4,
  staleAfterHours: 12,
};

describe("EligibilityService", () => {
  const service = new EligibilityService();
  it("cancels paid invoices", () => {
    const result = service.evaluate(reminder, {
      ...base,
      source: { ...invoice, status: "PAID", paidAt: new Date("2026-08-04T12:00:00.000Z") },
    });
    expect(result).toEqual({ kind: "CANCEL", reason: "INVOICE_SETTLED" });
  });
  it("cancels unauthorized groups", () =>
    expect(service.evaluate(reminder, { ...base, group: null })).toEqual({
      kind: "CANCEL",
      reason: "NO_AUTHORIZED_GROUP",
    }));
  it("cancels inactive clients", () =>
    expect(
      service.evaluate(reminder, { ...base, client: { ...base.client, status: "ARCHIVED" } }),
    ).toEqual({
      kind: "CANCEL",
      reason: "CLIENT_INACTIVE",
    }));
  it("cancels reminders already marked as sent", () =>
    expect(service.evaluate({ ...reminder, status: "SENT" }, base)).toEqual({
      kind: "CANCEL",
      reason: "ALREADY_SENT",
    }));
  it("cancels reminders without a source", () =>
    expect(service.evaluate(reminder, { ...base, source: null })).toEqual({
      kind: "CANCEL",
      reason: "SOURCE_MISSING",
    }));
  it("skips paused clients", () =>
    expect(service.evaluate(reminder, { ...base, clientPaused: true }).kind).toBe("SKIP"));
  it("sends when all checks pass", () =>
    expect(service.evaluate(reminder, base)).toEqual({ kind: "SEND" }));
  it("cancels a task occurrence beyond the configured limit", () =>
    expect(
      service.evaluate(
        { ...reminder, type: "TASK_CLIENT_REVIEW_48H", taskId: "t1", invoiceId: null },
        { ...base, reminderNumber: 3, maxReminders: 2 },
      ),
    ).toEqual({ kind: "CANCEL", reason: "MAX_REMINDERS_REACHED" }));
  it("cancels a task reminder from a previous review round", () =>
    expect(
      service.evaluate(
        {
          ...reminder,
          type: "TASK_CLIENT_REVIEW_48H",
          taskId: "t1",
          invoiceId: null,
          idempotencyKey: "task:t1:client_review:r1:n1",
        },
        {
          ...base,
          source: {
            id: "t1",
            clientId: "c1",
            title: "Task",
            status: "CLIENT_REVIEW",
            clientReviewEnteredAt: new Date("2026-08-04T13:00:00.000Z"),
            clientReviewRound: 2,
          },
        },
      ),
    ).toEqual({ kind: "CANCEL", reason: "SOURCE_STATE_CHANGED" }));
  it("cancels an invoice after the counter reaches the configured limit", () =>
    expect(service.evaluate(reminder, { ...base, remindersSent: 4 })).toEqual({
      kind: "CANCEL",
      reason: "MAX_REMINDERS_REACHED",
    }));
  it("cancels a recording reminder after its scheduled time", () => {
    const source: Recording = {
      id: "recording-1",
      clientId: "c1",
      title: "Demo",
      scheduledAt: new Date("2026-08-04T12:00:00.000Z"),
      location: null,
      notes: null,
      status: "SCHEDULED",
    };
    expect(
      service.evaluate(
        { ...reminder, type: "RECORDING_24H", invoiceId: null, recordingId: source.id },
        { ...base, source },
      ),
    ).toEqual({ kind: "CANCEL", reason: "TOO_LATE" });
  });
  it("cancels a recording reminder when its schedule moved", () => {
    const source: Recording = {
      id: "recording-1",
      clientId: "c1",
      title: "Demo",
      scheduledAt: new Date("2026-08-05T12:00:00.000Z"),
      location: null,
      notes: null,
      status: "SCHEDULED",
    };
    expect(
      service.evaluate(
        {
          ...reminder,
          type: "RECORDING_24H",
          invoiceId: null,
          recordingId: source.id,
          idempotencyKey: "recording:recording-1:1754308800:24h_before",
        },
        { ...base, source },
      ),
    ).toEqual({ kind: "CANCEL", reason: "SOURCE_STATE_CHANGED" });
  });
  it("cancels stale reminders", () =>
    expect(
      service.evaluate(reminder, {
        ...base,
        now: new Date("2026-08-06T13:00:00.000Z"),
        staleAfterHours: 12,
      }),
    ).toEqual({ kind: "CANCEL", reason: "STALE" }));
  it("defers reminders until the next valid slot", () => {
    const until = new Date("2026-08-05T13:00:00.000Z");
    expect(service.evaluate(reminder, { ...base, nextValidSlot: until })).toEqual({
      kind: "DEFER",
      until,
    });
  });
});

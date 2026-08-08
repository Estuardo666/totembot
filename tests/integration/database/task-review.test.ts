import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ChangeTaskStatus } from "../../../src/application/use-cases/tasks.js";
import type { AutomationSetting } from "../../../src/domain/entities/index.js";
import type { Clock, IdGenerator } from "../../../src/domain/ports/index.js";
import { BusinessWindowService } from "../../../src/domain/services/business-window.js";
import { IdempotencyKeyFactory } from "../../../src/domain/services/idempotency-key.js";
import { ReminderSchedulePolicy } from "../../../src/domain/services/schedule-policy.js";
import { createPrismaClient } from "../../../src/infrastructure/database/prisma.js";
import { PrismaTransactionManager } from "../../../src/infrastructure/database/repositories.js";

const databaseUrl = process.env["DATABASE_URL"];
const ids = {
  client: "00000000-0000-7000-8000-000000001101",
  task: "00000000-0000-7000-8000-000000001102",
};
const now = new Date("2026-08-05T13:00:00.000Z");
const timeZone = "America/Guayaquil";

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

class FixedClock implements Clock {
  now(): Date {
    return new Date(now);
  }
  fromEpoch(epochMs: number): Date {
    return new Date(epochMs);
  }
  timeZone(): string {
    return timeZone;
  }
}

class SequentialIds implements IdGenerator {
  private value = 0;
  next(): string {
    this.value += 1;
    return `00000000-0000-7000-8000-0000000012${String(this.value).padStart(2, "0")}`;
  }
}

describe.skipIf(databaseUrl === undefined)("CA-04 task review reminder cancellation", () => {
  let prisma!: PrismaClient;

  let sharedIds: SequentialIds;

  function useCase(): ChangeTaskStatus {
    const clock = new FixedClock();
    return new ChangeTaskStatus(
      new PrismaTransactionManager(prisma),
      new ReminderSchedulePolicy(
        new BusinessWindowService(clock),
        new IdempotencyKeyFactory(),
        timeZone,
        clock,
      ),
      sharedIds,
      clock,
      settings,
    );
  }

  beforeAll(async () => {
    if (databaseUrl === undefined) return;
    prisma = createPrismaClient(databaseUrl);
    await prisma.client.create({ data: { id: ids.client, name: "Cliente de prueba CA-04" } });
  });

  beforeEach(() => {
    sharedIds = new SequentialIds();
  });

  afterEach(async () => {
    await prisma.reminder.deleteMany({ where: { clientId: ids.client } });
    await prisma.task.deleteMany({ where: { clientId: ids.client } });
  });

  afterAll(async () => {
    if (databaseUrl === undefined) return;
    await prisma.client.deleteMany({ where: { id: ids.client } });
    await prisma.$disconnect();
  });

  async function enterReview(): Promise<void> {
    await prisma.task.create({
      data: {
        id: ids.task,
        clientId: ids.client,
        title: "Material en revisión",
        status: "EDITING",
        clientReviewRound: 0,
      },
    });
    await useCase().execute(ids.task, "CLIENT_REVIEW");
  }

  it("schedules the review reminders when the task enters CLIENT_REVIEW", async () => {
    await enterReview();

    const reminders = await prisma.reminder.findMany({
      where: { taskId: ids.task },
      orderBy: { scheduledFor: "asc" },
    });
    expect(reminders).toHaveLength(settings.maxRemindersPerTask);
    expect(reminders.every((reminder) => reminder.status === "PENDING")).toBe(true);
    expect(reminders.map((reminder) => reminder.idempotencyKey)).toEqual([
      `task:${ids.task}:client_review:r1:n1`,
      `task:${ids.task}:client_review:r1:n2`,
    ]);
  });

  it("cancels every pending reminder when the task leaves CLIENT_REVIEW", async () => {
    await enterReview();

    await useCase().execute(ids.task, "APPROVED");

    const reminders = await prisma.reminder.findMany({ where: { taskId: ids.task } });
    expect(reminders).toHaveLength(settings.maxRemindersPerTask);
    expect(reminders.every((reminder) => reminder.status === "CANCELLED")).toBe(true);
    expect(reminders.every((reminder) => reminder.cancellationReason === "SOURCE_STATE_CHANGED"));
  });

  it("leaves an already sent reminder untouched when the task leaves CLIENT_REVIEW", async () => {
    await enterReview();
    const [first] = await prisma.reminder.findMany({
      where: { taskId: ids.task },
      orderBy: { scheduledFor: "asc" },
    });
    if (first === undefined) throw new Error("Missing scheduled reminder");
    await prisma.reminder.update({
      where: { id: first.id },
      data: { status: "SENT", sentAt: now, attempts: 1 },
    });

    await useCase().execute(ids.task, "APPROVED");

    const reminders = await prisma.reminder.findMany({ where: { taskId: ids.task } });
    const byStatus = reminders.map((reminder) => reminder.status).sort();
    expect(byStatus).toEqual(["CANCELLED", "SENT"]);
  });

  it("starts a new review round with fresh reminders after re-entering CLIENT_REVIEW", async () => {
    await enterReview();
    await useCase().execute(ids.task, "CHANGES_REQUESTED");
    await useCase().execute(ids.task, "EDITING");
    await useCase().execute(ids.task, "CLIENT_REVIEW");

    const reminders = await prisma.reminder.findMany({ where: { taskId: ids.task } });
    const pending = reminders.filter((reminder) => reminder.status === "PENDING");
    expect(reminders).toHaveLength(settings.maxRemindersPerTask * 2);
    expect(pending.map((reminder) => reminder.idempotencyKey).sort()).toEqual([
      `task:${ids.task}:client_review:r2:n1`,
      `task:${ids.task}:client_review:r2:n2`,
    ]);
  });

  it("absorbs a duplicate idempotency key without aborting the transaction", async () => {
    await enterReview();
    const [existing] = await prisma.reminder.findMany({ where: { taskId: ids.task } });
    if (existing === undefined) throw new Error("Missing scheduled reminder");

    const inserted = await new PrismaTransactionManager(prisma).runInTransaction(
      async ({ reminders }) => {
        const duplicate = {
          ...existing,
          id: "00000000-0000-7000-8000-000000001199",
          type: existing.type as "TASK_CLIENT_REVIEW_48H",
          status: "PENDING" as const,
          claimedAt: null,
          claimedBy: null,
          nextAttemptAt: null,
          sentAt: null,
        };
        const first = await reminders.insertIfAbsent(duplicate);
        // La transacción debe seguir viva tras el conflicto para poder leerla.
        const stillUsable = await reminders.cancelPendingForSource(
          { taskId: ids.task },
          "SOURCE_STATE_CHANGED",
        );
        return { first, stillUsable };
      },
    );

    expect(inserted.first).toBe(false);
    expect(inserted.stillUsable).toBe(settings.maxRemindersPerTask);
  });

  it("rejects an invalid task transition and leaves the reminders alone", async () => {
    await enterReview();

    await expect(useCase().execute(ids.task, "CHANGES_REQUESTED")).resolves.toBeDefined();
    await expect(useCase().execute(ids.task, "APPROVED")).rejects.toThrow();

    const reminders = await prisma.reminder.findMany({ where: { taskId: ids.task } });
    expect(reminders.every((reminder) => reminder.status === "CANCELLED")).toBe(true);
  });
});

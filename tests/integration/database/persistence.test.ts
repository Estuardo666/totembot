import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../../../src/infrastructure/database/prisma.js";
import {
  PrismaInvoiceRepository,
  PrismaRecordingRepository,
  PrismaReminderRepository,
  PrismaTransactionManager,
} from "../../../src/infrastructure/database/repositories.js";
import type { Invoice, Recording } from "../../../src/domain/entities/index.js";

const databaseUrl = process.env["DATABASE_URL"];
const testClientIds = [
  "00000000-0000-7000-8000-000000000501",
  "00000000-0000-7000-8000-000000000502",
  "00000000-0000-7000-8000-000000000503",
  "00000000-0000-7000-8000-000000000504",
];

describe.skipIf(databaseUrl === undefined)("PostgreSQL persistence", () => {
  let prisma!: PrismaClient;

  beforeAll(() => {
    if (databaseUrl !== undefined) prisma = createPrismaClient(databaseUrl);
  });

  afterEach(async () => {
    for (const clientId of testClientIds) {
      await prisma.reminder.deleteMany({ where: { clientId } });
      await prisma.recording.deleteMany({ where: { clientId } });
      await prisma.task.deleteMany({ where: { clientId } });
      await prisma.invoice.deleteMany({ where: { clientId } });
      await prisma.whatsAppGroup.deleteMany({ where: { clientId } });
      await prisma.automationSetting.deleteMany({ where: { clientId } });
      await prisma.client.deleteMany({ where: { id: clientId } });
    }
  });

  afterAll(async () => {
    if (databaseUrl !== undefined) await prisma.$disconnect();
  });

  it("accepts a valid invoice period and rejects an invalid one", async () => {
    const clientId = testClientIds[0];
    if (clientId === undefined) throw new Error("Missing test client id");
    await prisma.client.create({ data: { id: clientId, name: "Constraint test" } });

    const repository = new PrismaInvoiceRepository(prisma);
    const valid: Invoice = {
      id: "00000000-0000-7000-8000-000000000511",
      clientId,
      period: "2026-08",
      amountCents: 1000,
      currency: "USD",
      dueDate: new Date("2026-08-10T00:00:00.000Z"),
      status: "PENDING",
      paidAt: null,
      remindersSent: 0,
    };
    await repository.save(valid);
    await expect(
      repository.save({ ...valid, id: "00000000-0000-7000-8000-000000000512", period: "2026-13" }),
    ).rejects.toThrow();
    await repository.save({
      ...valid,
      id: "00000000-0000-7000-8000-000000000513",
      period: "2026-07",
      dueDate: new Date("2026-08-01T00:00:00.000Z"),
    });
    await expect(repository.markOverdue(new Date("2026-08-07T13:00:00.000Z"))).resolves.toBe(1);
    await expect(
      repository.findById("00000000-0000-7000-8000-000000000513"),
    ).resolves.toMatchObject({
      status: "OVERDUE",
    });
  });

  it("rolls back repository writes made through the transaction manager", async () => {
    const clientId = testClientIds[1];
    if (clientId === undefined) throw new Error("Missing test client id");
    await prisma.client.create({ data: { id: clientId, name: "Rollback test" } });
    const recording: Recording = {
      id: "00000000-0000-7000-8000-000000000521",
      clientId,
      title: "Rollback recording",
      scheduledAt: new Date("2026-08-08T13:00:00.000Z"),
      location: null,
      notes: null,
      status: "SCHEDULED",
    };

    await expect(
      new PrismaTransactionManager(prisma).runInTransaction(async ({ recordings }) => {
        await recordings.save(recording);
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");
    await expect(new PrismaRecordingRepository(prisma).findById(recording.id)).resolves.toBeNull();
  });

  it("claims one due reminder across concurrent workers", async () => {
    const clientId = testClientIds[2];
    if (clientId === undefined) throw new Error("Missing test client id");
    const recordingId = "00000000-0000-7000-8000-000000000531";
    const reminderId = "00000000-0000-7000-8000-000000000532";
    await prisma.client.create({ data: { id: clientId, name: "Claim test" } });
    await prisma.recording.create({
      data: {
        id: recordingId,
        clientId,
        title: "Claim recording",
        scheduledAt: new Date("2026-08-08T13:00:00.000Z"),
      },
    });
    await prisma.reminder.create({
      data: {
        id: reminderId,
        type: "RECORDING_24H",
        clientId,
        recordingId,
        scheduledFor: new Date("2026-08-07T12:00:00.000Z"),
        idempotencyKey: "integration-claim-test",
      },
    });

    const now = new Date("2026-08-07T13:00:00.000Z");
    const [first, second] = await Promise.all([
      new PrismaReminderRepository(prisma).claimDue(
        now,
        new Date("2026-08-07T12:55:00.000Z"),
        "worker-a",
        1,
      ),
      new PrismaReminderRepository(prisma).claimDue(
        now,
        new Date("2026-08-07T12:55:00.000Z"),
        "worker-b",
        1,
      ),
    ]);
    expect(first.length + second.length).toBe(1);
    expect(first.some((value) => second.some((other) => value.id === other.id))).toBe(false);
  });

  it("marks successful recovery as SENT and uncertain recovery as NEEDS_REVIEW", async () => {
    const clientId = testClientIds[3];
    if (clientId === undefined) throw new Error("Missing test client id");
    const recordingId = "00000000-0000-7000-8000-000000000541";
    const successId = "00000000-0000-7000-8000-000000000542";
    const uncertainId = "00000000-0000-7000-8000-000000000543";
    await prisma.client.create({ data: { id: clientId, name: "Recovery test" } });
    await prisma.recording.create({
      data: {
        id: recordingId,
        clientId,
        title: "Recovery recording",
        scheduledAt: new Date("2026-08-08T13:00:00.000Z"),
      },
    });
    for (const [id, idempotencyKey] of [
      [successId, "integration-recovery-success"],
      [uncertainId, "integration-recovery-uncertain"],
    ] as const) {
      await prisma.reminder.create({
        data: {
          id,
          type: "RECORDING_24H",
          clientId,
          recordingId,
          scheduledFor: new Date("2026-08-07T12:00:00.000Z"),
          status: "PROCESSING",
          attempts: 1,
          claimedAt: new Date("2026-08-07T12:00:00.000Z"),
          claimedBy: "dead-worker",
          idempotencyKey,
        },
      });
    }
    await prisma.messageAttempt.create({
      data: {
        id: "00000000-0000-7000-8000-000000000544",
        reminderId: successId,
        attemptNumber: 1,
        status: "SUCCESS",
        finishedAt: new Date("2026-08-07T12:01:00.000Z"),
        templateId: "recording.reminder_24h",
        templateVersion: 1,
        correlationId: "integration-recovery-success",
      },
    });
    await prisma.messageAttempt.create({
      data: {
        id: "00000000-0000-7000-8000-000000000545",
        reminderId: uncertainId,
        attemptNumber: 1,
        status: "STARTED",
        templateId: "recording.reminder_24h",
        templateVersion: 1,
        correlationId: "integration-recovery-uncertain",
      },
    });

    const count = await new PrismaReminderRepository(prisma).recoverExpired(
      new Date("2026-08-07T12:55:00.000Z"),
    );
    const values = await prisma.reminder.findMany({
      where: { id: { in: [successId, uncertainId] } },
      select: { id: true, status: true, sentAt: true },
    });
    expect(count).toBe(1);
    expect(values.find((value) => value.id === successId)?.status).toBe("SENT");
    expect(values.find((value) => value.id === uncertainId)?.status).toBe("NEEDS_REVIEW");
  });

  it("reports live reminder metrics from PostgreSQL", async () => {
    const clientId = testClientIds[0];
    if (clientId === undefined) throw new Error("Missing test client id");
    const now = new Date();
    const since = new Date(now.getTime() - 86_400_000);
    const recordingId = "00000000-0000-7000-8000-000000000560";
    await prisma.client.create({ data: { id: clientId, name: "Metrics test" } });
    await prisma.recording.create({
      data: {
        id: recordingId,
        clientId,
        title: "Metrics recording",
        scheduledAt: new Date(now.getTime() + 86_400_000),
      },
    });
    await prisma.reminder.createMany({
      data: [
        {
          id: "00000000-0000-7000-8000-000000000561",
          type: "RECORDING_24H",
          clientId,
          recordingId,
          scheduledFor: new Date(now.getTime() - 3_600_000),
          idempotencyKey: "integration-metrics-pending",
          status: "PENDING",
        },
        {
          id: "00000000-0000-7000-8000-000000000562",
          type: "RECORDING_24H",
          clientId,
          recordingId,
          scheduledFor: new Date(now.getTime() - 3_600_000),
          nextAttemptAt: new Date(now.getTime() - 1_800_000),
          idempotencyKey: "integration-metrics-retry",
          status: "RETRY_SCHEDULED",
        },
        {
          id: "00000000-0000-7000-8000-000000000563",
          type: "RECORDING_24H",
          clientId,
          recordingId,
          scheduledFor: now,
          idempotencyKey: "integration-metrics-review",
          status: "NEEDS_REVIEW",
        },
        {
          id: "00000000-0000-7000-8000-000000000564",
          type: "RECORDING_24H",
          clientId,
          recordingId,
          scheduledFor: now,
          idempotencyKey: "integration-metrics-failed",
          status: "FAILED",
        },
        {
          id: "00000000-0000-7000-8000-000000000565",
          type: "RECORDING_24H",
          clientId,
          recordingId,
          scheduledFor: now,
          sentAt: now,
          idempotencyKey: "integration-metrics-sent",
          status: "SENT",
        },
      ],
    });

    await expect(new PrismaReminderRepository(prisma).getMetrics(now, since)).resolves.toEqual({
      pending: 1,
      dueNow: 2,
      retryScheduled: 1,
      needsReview: 1,
      failedLast24h: 1,
      sentLast24h: 1,
    });
  });
});

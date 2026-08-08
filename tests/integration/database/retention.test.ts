import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PurgeExpiredRecords } from "../../../src/application/use-cases/retention.js";
import type { Clock } from "../../../src/domain/ports/index.js";
import { RetentionPolicy } from "../../../src/domain/services/retention-policy.js";
import { createPrismaClient } from "../../../src/infrastructure/database/prisma.js";
import {
  PrismaAuditLogger,
  PrismaRetentionRepository,
} from "../../../src/infrastructure/database/repositories.js";
import { UuidV7Generator } from "../../../src/infrastructure/ids.js";

const databaseUrl = process.env["DATABASE_URL"];
const ids = {
  client: "00000000-0000-7000-8000-000000001301",
  reminder: "00000000-0000-7000-8000-000000001302",
};
const now = new Date("2026-08-07T13:00:00.000Z");
const cutoff = new Date("2025-08-07T13:00:00.000Z");
const justInside = new Date("2025-08-07T13:00:00.001Z");
const justOutside = new Date("2025-08-07T12:59:59.999Z");

class FixedClock implements Clock {
  now(): Date {
    return new Date(now);
  }
  fromEpoch(epochMs: number): Date {
    return new Date(epochMs);
  }
  timeZone(): string {
    return "America/Guayaquil";
  }
}

describe.skipIf(databaseUrl === undefined)("M6-08 retention purge", () => {
  let prisma!: PrismaClient;

  function useCase(): PurgeExpiredRecords {
    const clock = new FixedClock();
    return new PurgeExpiredRecords(
      new PrismaRetentionRepository(prisma),
      new RetentionPolicy(clock, 12),
      clock,
      new PrismaAuditLogger(prisma, new UuidV7Generator()),
    );
  }

  beforeAll(async () => {
    if (databaseUrl === undefined) return;
    prisma = createPrismaClient(databaseUrl);
    await prisma.client.create({ data: { id: ids.client, name: "Cliente de prueba M6-08" } });
    await prisma.recording.create({
      data: {
        id: "00000000-0000-7000-8000-000000001303",
        clientId: ids.client,
        title: "Grabación de prueba",
        scheduledAt: now,
      },
    });
    await prisma.reminder.create({
      data: {
        id: ids.reminder,
        type: "RECORDING_24H",
        clientId: ids.client,
        recordingId: "00000000-0000-7000-8000-000000001303",
        scheduledFor: now,
        idempotencyKey: "retention:test:1",
      },
    });
  });

  afterEach(async () => {
    await prisma.messageAttempt.deleteMany({ where: { reminderId: ids.reminder } });
    await prisma.auditEvent.deleteMany({ where: { entityType: "RetentionTest" } });
    await prisma.auditEvent.deleteMany({ where: { entityType: "Retention" } });
  });

  afterAll(async () => {
    if (databaseUrl === undefined) return;
    await prisma.reminder.deleteMany({ where: { clientId: ids.client } });
    await prisma.recording.deleteMany({ where: { clientId: ids.client } });
    await prisma.client.deleteMany({ where: { id: ids.client } });
    await prisma.$disconnect();
  });

  let attemptNumber = 0;

  async function seedAttempt(id: string, startedAt: Date): Promise<void> {
    attemptNumber += 1;
    await prisma.messageAttempt.create({
      data: {
        id,
        reminderId: ids.reminder,
        startedAt,
        status: "SUCCESS",
        attemptNumber,
        templateId: "recording.reminder_24h",
        templateVersion: 1,
        correlationId: `retention-test-${attemptNumber}`,
      },
    });
  }

  async function seedAuditEvent(id: string, occurredAt: Date): Promise<void> {
    await prisma.auditEvent.create({
      data: { id, actor: "TEST", action: "SEED", entityType: "RetentionTest", occurredAt },
    });
  }

  it("deletes only the rows strictly older than the cutoff", async () => {
    await seedAttempt("00000000-0000-7000-8000-000000001311", justOutside);
    await seedAttempt("00000000-0000-7000-8000-000000001312", cutoff);
    await seedAttempt("00000000-0000-7000-8000-000000001313", justInside);
    await seedAuditEvent("00000000-0000-7000-8000-000000001321", justOutside);
    await seedAuditEvent("00000000-0000-7000-8000-000000001322", justInside);

    const result = await useCase().execute();

    expect(result.cutoff).toEqual(cutoff);
    expect(result.messageAttempts).toBe(1);
    expect(result.auditEvents).toBe(1);
    const attempts = await prisma.messageAttempt.findMany({ where: { reminderId: ids.reminder } });
    expect(attempts.map((attempt) => attempt.startedAt).sort()).toEqual([cutoff, justInside]);
    const seeded = await prisma.auditEvent.findMany({ where: { entityType: "RetentionTest" } });
    expect(seeded).toHaveLength(1);
  });

  it("writes an audit event describing the purge", async () => {
    await seedAttempt("00000000-0000-7000-8000-000000001314", justOutside);

    await useCase().execute();

    const events = await prisma.auditEvent.findMany({ where: { entityType: "Retention" } });
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe("RETENTION_PURGED");
    expect(events[0]?.metadata).toMatchObject({
      cutoff: cutoff.toISOString(),
      messageAttempts: 1,
      auditEvents: 0,
    });
  });

  it("is idempotent: a second run purges nothing and adds no audit event", async () => {
    await seedAttempt("00000000-0000-7000-8000-000000001315", justOutside);
    await useCase().execute();

    const second = await useCase().execute();

    expect(second.messageAttempts).toBe(0);
    expect(second.auditEvents).toBe(0);
    const events = await prisma.auditEvent.findMany({ where: { entityType: "Retention" } });
    expect(events).toHaveLength(1);
  });

  it("leaves the reminder that owns the purged attempts in place", async () => {
    await seedAttempt("00000000-0000-7000-8000-000000001316", justOutside);

    await useCase().execute();

    expect(await prisma.reminder.findUnique({ where: { id: ids.reminder } })).not.toBeNull();
  });
});

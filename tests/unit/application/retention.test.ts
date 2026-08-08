import { describe, expect, it } from "vitest";
import { PurgeExpiredRecords } from "../../../src/application/use-cases/retention.js";
import type { AuditLogger, RetentionRepository } from "../../../src/domain/ports/index.js";
import { RetentionPolicy } from "../../../src/domain/services/retention-policy.js";

const now = new Date("2026-08-07T13:00:00.000Z");
const expectedCutoff = new Date("2025-08-07T13:00:00.000Z");

class FixedClock {
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

class MemoryAudit implements AuditLogger {
  readonly events: Array<{
    readonly action: string;
    readonly metadata?: Record<string, unknown>;
  }> = [];
  record(event: {
    readonly action: string;
    readonly entityType: string;
    readonly metadata?: Record<string, unknown>;
  }): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

class MemoryRetention implements RetentionRepository {
  readonly cutoffs: Date[] = [];
  public constructor(
    private readonly attempts: number,
    private readonly audits: number,
  ) {}
  purgeMessageAttemptsBefore(cutoff: Date): Promise<number> {
    this.cutoffs.push(cutoff);
    return Promise.resolve(this.attempts);
  }
  purgeAuditEventsBefore(cutoff: Date): Promise<number> {
    this.cutoffs.push(cutoff);
    return Promise.resolve(this.audits);
  }
}

function useCase(repository: RetentionRepository, audit: AuditLogger): PurgeExpiredRecords {
  const clock = new FixedClock();
  return new PurgeExpiredRecords(repository, new RetentionPolicy(clock, 12), clock, audit);
}

describe("PurgeExpiredRecords", () => {
  it("purges both tables with the same twelve month cutoff", async () => {
    const repository = new MemoryRetention(7, 3);
    const audit = new MemoryAudit();

    const result = await useCase(repository, audit).execute();

    expect(result).toEqual({ cutoff: expectedCutoff, messageAttempts: 7, auditEvents: 3 });
    expect(repository.cutoffs).toEqual([expectedCutoff, expectedCutoff]);
  });

  it("records an audit event with the purged counts", async () => {
    const audit = new MemoryAudit();

    await useCase(new MemoryRetention(7, 3), audit).execute();

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]?.action).toBe("RETENTION_PURGED");
    expect(audit.events[0]?.metadata).toMatchObject({
      cutoff: expectedCutoff.toISOString(),
      messageAttempts: 7,
      auditEvents: 3,
    });
  });

  it("does not record an audit event when nothing was purged", async () => {
    const audit = new MemoryAudit();

    const result = await useCase(new MemoryRetention(0, 0), audit).execute();

    expect(result.messageAttempts).toBe(0);
    expect(audit.events).toEqual([]);
  });

  it("purges message attempts before audit events so the purge itself stays auditable", async () => {
    const order: string[] = [];
    const repository: RetentionRepository = {
      purgeMessageAttemptsBefore: () => {
        order.push("attempts");
        return Promise.resolve(1);
      },
      purgeAuditEventsBefore: () => {
        order.push("audits");
        return Promise.resolve(1);
      },
    };

    await useCase(repository, new MemoryAudit()).execute();

    expect(order).toEqual(["attempts", "audits"]);
  });
});

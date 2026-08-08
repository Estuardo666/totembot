import { describe, expect, it } from "vitest";
import { IdempotencyKeyFactory } from "../../../src/domain/services/idempotency-key.js";

describe("IdempotencyKeyFactory", () => {
  const factory = new IdempotencyKeyFactory();
  it("is deterministic and changes when a recording is rescheduled", () => {
    const first = factory.recording("rec-1", new Date("2026-08-04T15:00:00.000Z"), 24);
    const same = factory.recording("rec-1", new Date("2026-08-04T15:00:00.000Z"), 24);
    const moved = factory.recording("rec-1", new Date("2026-08-04T16:00:00.000Z"), 24);
    expect(first).toBe(same);
    expect(first).not.toBe(moved);
  });
  it("includes the review round and occurrence", () => {
    expect(factory.task("task-1", 2, 1)).toBe("task:task-1:client_review:r2:n1");
  });
});

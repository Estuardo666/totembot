import { describe, expect, it } from "vitest";
import { RetentionPolicy } from "../../../src/domain/services/retention-policy.js";

const clock = { fromEpoch: (epochMs: number): Date => new Date(epochMs) };

describe("RetentionPolicy", () => {
  it("cuts off exactly twelve months before the given instant", () => {
    const policy = new RetentionPolicy(clock, 12);

    expect(policy.cutoff(new Date("2026-08-07T13:00:00.000Z"))).toEqual(
      new Date("2025-08-07T13:00:00.000Z"),
    );
  });

  it("clamps to the last day of a shorter month", () => {
    const policy = new RetentionPolicy(clock, 1);

    expect(policy.cutoff(new Date("2026-03-31T10:00:00.000Z"))).toEqual(
      new Date("2026-02-28T10:00:00.000Z"),
    );
  });

  it("keeps the day of month across a leap year", () => {
    const policy = new RetentionPolicy(clock, 12);

    expect(policy.cutoff(new Date("2025-02-28T00:00:00.000Z"))).toEqual(
      new Date("2024-02-28T00:00:00.000Z"),
    );
  });

  it("crosses the year boundary", () => {
    const policy = new RetentionPolicy(clock, 3);

    expect(policy.cutoff(new Date("2026-01-15T06:30:00.000Z"))).toEqual(
      new Date("2025-10-15T06:30:00.000Z"),
    );
  });

  it("rejects a non-positive or non-integer retention window", () => {
    expect(() => new RetentionPolicy(clock, 0)).toThrow();
    expect(() => new RetentionPolicy(clock, -12)).toThrow();
    expect(() => new RetentionPolicy(clock, 1.5)).toThrow();
  });
});

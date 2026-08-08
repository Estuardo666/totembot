import { describe, expect, it } from "vitest";
import { BusinessWindowService } from "../../../src/domain/services/business-window.js";

const at = (value: string): Date => new Date(value);
const policy = {
  timeZone: "America/Guayaquil",
  start: "08:00",
  end: "18:30",
  sendOnSundays: false,
};

describe("BusinessWindowService", () => {
  const service = new BusinessWindowService({ fromEpoch: (epochMs) => new Date(epochMs) });
  it.each([
    ["2026-08-04T13:00:00.000Z", "2026-08-04T13:00:00.000Z"],
    ["2026-08-04T19:00:00.000Z", "2026-08-04T19:00:00.000Z"],
    ["2026-08-04T23:30:00.000Z", "2026-08-04T23:30:00.000Z"],
    ["2026-08-04T23:31:00.000Z", "2026-08-05T13:00:00.000Z"],
    ["2026-08-04T11:00:00.000Z", "2026-08-04T13:00:00.000Z"],
    ["2026-08-04T10:00:00.000Z", "2026-08-04T13:00:00.000Z"],
    ["2026-08-09T15:00:00.000Z", "2026-08-10T13:00:00.000Z"],
    ["2026-08-09T01:00:00.000Z", "2026-08-10T13:00:00.000Z"],
    ["2026-08-31T23:31:00.000Z", "2026-09-01T13:00:00.000Z"],
    ["2026-12-31T23:31:00.000Z", "2027-01-01T13:00:00.000Z"],
  ])("moves %s to %s", (input, expected) => {
    expect(service.nextValidSlot(at(input), policy).toISOString()).toBe(expected);
  });
  it("preserves a valid instant for a different business timezone", () => {
    expect(
      service
        .nextValidSlot(at("2026-08-04T13:00:00.000Z"), {
          ...policy,
          timeZone: "America/New_York",
        })
        .toISOString(),
    ).toBe("2026-08-04T13:00:00.000Z");
  });
});

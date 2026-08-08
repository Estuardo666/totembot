export interface BusinessWindowPolicy {
  readonly timeZone: string;
  readonly start: string;
  readonly end: string;
  readonly sendOnSundays: boolean;
}

export class BusinessWindowService {
  public constructor(private readonly clock: Pick<Clock, "fromEpoch">) {}
  nextValidSlot(instant: Date, policy: BusinessWindowPolicy): Date {
    let local = this.localParts(instant, policy.timeZone);
    for (let attempts = 0; attempts < 14; attempts += 1) {
      if (local.weekday === 7 && !policy.sendOnSundays) {
        local = this.addDays(local, 1);
        const start = this.parseTime(policy.start);
        local.hour = start.hour;
        local.minute = start.minute;
        continue;
      }
      const start = this.parseTime(policy.start);
      const end = this.parseTime(policy.end);
      const minutes = local.hour * 60 + local.minute;
      const startMinutes = start.hour * 60 + start.minute;
      const endMinutes = end.hour * 60 + end.minute;
      if (minutes < startMinutes) {
        local.hour = start.hour;
        local.minute = start.minute;
        continue;
      }
      if (minutes > endMinutes) {
        local = this.addDays(local, 1);
        local.hour = start.hour;
        local.minute = start.minute;
        continue;
      }
      return this.toInstant(local, policy.timeZone);
    }
    throw new Error("Business window could not find a valid slot within 14 days");
  }

  private parseTime(value: string): { hour: number; minute: number } {
    const parts = value.split(":");
    const hour = Number(parts[0]);
    const minute = Number(parts[1]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute))
      throw new Error("Invalid business time");
    return { hour, minute };
  }

  private localParts(instant: Date, timeZone: string): LocalParts {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    }).formatToParts(instant);
    const value = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((part) => part.type === type)?.value ?? "";
    const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      value("weekday"),
    );
    const weekday = weekdayIndex === 0 ? 7 : weekdayIndex;
    return {
      year: Number(value("year")),
      month: Number(value("month")),
      day: Number(value("day")),
      hour: Number(value("hour")),
      minute: Number(value("minute")),
      weekday,
    };
  }

  private addDays(local: LocalParts, days: number): LocalParts {
    const next = this.clock.fromEpoch(
      Date.UTC(local.year, local.month - 1, local.day + days, local.hour, local.minute),
    );
    return {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour: next.getUTCHours(),
      minute: next.getUTCMinutes(),
      weekday: next.getUTCDay() === 0 ? 7 : next.getUTCDay(),
    };
  }

  private toInstant(local: LocalParts, timeZone: string): Date {
    const naive = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    const probe = this.clock.fromEpoch(naive);
    const probeParts = this.localParts(probe, timeZone);
    const represented = Date.UTC(
      probeParts.year,
      probeParts.month - 1,
      probeParts.day,
      probeParts.hour,
      probeParts.minute,
    );
    return this.clock.fromEpoch(naive - (represented - naive));
  }
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}
import type { Clock } from "../ports/index.js";

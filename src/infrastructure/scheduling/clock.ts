import type { Clock } from "../../domain/ports/index.js";

export class SystemClock implements Clock {
  public constructor(private readonly zone: string) {}
  now(): Date {
    return new Date();
  }
  fromEpoch(epochMs: number): Date {
    return new Date(epochMs);
  }
  timeZone(): string {
    return this.zone;
  }
}

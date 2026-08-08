import type { RandomSource } from "../ports/index.js";

export class RetryPolicy {
  public constructor(
    private readonly random: RandomSource,
    private readonly baseSeconds: number,
    private readonly maxSeconds: number,
  ) {}

  delaySeconds(attemptNumber: number): number {
    const cap = Math.min(this.baseSeconds * 2 ** Math.max(0, attemptNumber - 1), this.maxSeconds);
    return Math.floor(this.random.next() * (cap + 1));
  }

  shouldRetry(
    classification: "TRANSIENT" | "PERMANENT" | "SESSION_INVALID",
    attempts: number,
    maxAttempts: number,
  ): boolean {
    return classification !== "PERMANENT" && attempts < maxAttempts;
  }
}

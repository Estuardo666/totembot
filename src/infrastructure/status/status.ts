export interface StatusSnapshot {
  readonly service: string;
  readonly version: string;
  readonly timeZone: string;
  readonly whatsapp: {
    readonly enabled: boolean;
    readonly dryRun: boolean;
    readonly connection: string;
    readonly sessionValid: boolean;
  };
  readonly worker: {
    readonly enabled: boolean;
    readonly lastTickStartedAt: string | null;
    readonly lastTickDurationMs: number | null;
    readonly lastTickOutcome: string | null;
  };
  readonly reminders: {
    readonly pending: number;
    readonly dueNow: number;
    readonly retryScheduled: number;
    readonly needsReview: number;
    readonly failedLast24h: number;
    readonly sentLast24h: number;
  };
  readonly errorsLast1h: number;
}

export class StatusStore {
  private snapshot: StatusSnapshot;
  public constructor(
    initial: StatusSnapshot,
    private readonly metricsLoader?: () => Promise<ReminderMetrics>,
  ) {
    this.snapshot = initial;
  }
  read(): StatusSnapshot {
    return this.snapshot;
  }
  updateWorker(value: Partial<StatusSnapshot["worker"]>): void {
    this.snapshot = { ...this.snapshot, worker: { ...this.snapshot.worker, ...value } };
  }
  async readFresh(): Promise<StatusSnapshot> {
    if (this.metricsLoader !== undefined) {
      this.updateReminderMetrics(await this.metricsLoader());
    }
    return this.snapshot;
  }
  updateReminderMetrics(value: ReminderMetrics): void {
    this.snapshot = { ...this.snapshot, reminders: { ...value } };
  }
}
import type { ReminderMetrics } from "../../domain/ports/index.js";

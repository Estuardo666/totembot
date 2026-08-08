export interface WorkerTick {
  execute(): Promise<unknown>;
}

export class WorkerLoop {
  private timer: NodeJS.Timeout | undefined;
  private stopping = false;
  private inFlight: Promise<unknown> | null = null;
  public constructor(
    private readonly tick: WorkerTick,
    private readonly intervalMs: number,
    private readonly onError: (error: unknown) => void,
  ) {}

  async runOnce(): Promise<unknown> {
    if (this.inFlight !== null) return this.inFlight;
    this.inFlight = this.tick.execute().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
  start(): void {
    this.timer = setInterval(() => {
      if (!this.stopping) void this.runOnce().catch(this.onError);
    }, this.intervalMs);
  }
  stop(): Promise<void> {
    this.stopping = true;
    if (this.timer !== undefined) clearInterval(this.timer);
    return Promise.resolve();
  }
}

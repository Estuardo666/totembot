import type { ReminderType } from "../entities/index.js";

export class IdempotencyKeyFactory {
  recording(recordingId: string, scheduledAt: Date, offsetHours: number): string {
    return this.build(
      `recording:${recordingId}:${Math.floor(scheduledAt.getTime() / 1000)}:${offsetHours}h_before`,
    );
  }

  task(taskId: string, round: number, occurrence: number): string {
    return this.build(`task:${taskId}:client_review:r${round}:n${occurrence}`);
  }

  invoice(invoiceId: string, type: ReminderType, offsetDays?: number): string {
    const suffix = offsetDays === undefined ? "" : `:d${offsetDays}`;
    const label = type.replace("INVOICE_", "").toLowerCase();
    return this.build(`invoice:${invoiceId}:${label}${suffix}`);
  }

  private build(value: string): string {
    if (value.length > 200 || !/^[a-z0-9:_-]+$/.test(value))
      throw new Error("Invalid idempotency key");
    return value;
  }
}

import type { Task, TaskStatus, Reminder } from "../../domain/entities/index.js";
import { assertTaskTransition } from "../../domain/entities/index.js";
import type { Clock, IdGenerator, TransactionManager } from "../../domain/ports/index.js";
import { ReminderSchedulePolicy } from "../../domain/services/schedule-policy.js";

export class ChangeTaskStatus {
  public constructor(
    private readonly tx: TransactionManager,
    private readonly schedule: ReminderSchedulePolicy,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly settings: Parameters<ReminderSchedulePolicy["task"]>[1],
  ) {}
  async execute(id: string, nextStatus: TaskStatus): Promise<Task> {
    return this.tx.runInTransaction(async ({ tasks, reminders }) => {
      const current = await tasks.findById(id);
      if (current === null) throw new Error(`Task not found: ${id}`);
      assertTaskTransition(current.status, nextStatus);
      const enteredReview = nextStatus === "CLIENT_REVIEW";
      const task: Task = {
        ...current,
        status: nextStatus,
        clientReviewEnteredAt: enteredReview ? this.clock.now() : current.clientReviewEnteredAt,
        clientReviewRound: enteredReview
          ? current.clientReviewRound + 1
          : current.clientReviewRound,
      };
      const saved = await tasks.saveIfStatus(task, current.status);
      if (!saved) throw new Error(`Task changed concurrently: ${id}`);
      if (current.status === "CLIENT_REVIEW" && nextStatus !== "CLIENT_REVIEW")
        await reminders.cancelPendingForSource({ taskId: task.id }, "SOURCE_STATE_CHANGED");
      if (enteredReview)
        for (const occurrence of this.schedule.task(task, this.settings)) {
          const reminder: Reminder = {
            id: this.ids.next(),
            type: occurrence.type,
            clientId: task.clientId,
            recordingId: null,
            taskId: task.id,
            invoiceId: null,
            scheduledFor: occurrence.scheduledFor,
            status: "PENDING",
            attempts: 0,
            maxAttempts: 3,
            claimedAt: null,
            claimedBy: null,
            nextAttemptAt: null,
            sentAt: null,
            idempotencyKey: occurrence.idempotencyKey,
          };
          await reminders.insertIfAbsent(reminder);
        }
      return task;
    });
  }
}

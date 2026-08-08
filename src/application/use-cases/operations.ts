import { ApplicationError } from "../errors.js";
import type { Reminder } from "../../domain/entities/index.js";
import type {
  AuditLogger,
  AutomationSettingsAdministrationRepository,
  ClientRepository,
  IdGenerator,
  ReminderAdministrationRepository,
} from "../../domain/ports/index.js";

export class ManageAutomation {
  public constructor(
    private readonly clients: ClientRepository,
    private readonly settings: AutomationSettingsAdministrationRepository,
    private readonly ids: IdGenerator,
    private readonly audit: AuditLogger,
  ) {}

  async setPaused(scope: {
    readonly clientId: string | null;
    readonly paused: boolean;
  }): Promise<void> {
    if (scope.clientId === null) {
      await this.settings.setGlobalPaused(scope.paused, this.ids.next());
    } else if ((await this.clients.findById(scope.clientId)) === null) {
      throw new ApplicationError("CLIENT_NOT_FOUND", `Client not found: ${scope.clientId}`);
    } else {
      await this.settings.setClientPaused(scope.clientId, scope.paused, this.ids.next());
    }
    await this.audit.record({
      action: scope.paused ? "AUTOMATION_PAUSED" : "AUTOMATION_RESUMED",
      entityType: scope.clientId === null ? "AutomationSetting" : "Client",
      ...(scope.clientId === null ? {} : { entityId: scope.clientId }),
      metadata: { scope: scope.clientId === null ? "global" : "client" },
    });
  }
}

export class ManageReminders {
  public constructor(
    private readonly reminders: ReminderAdministrationRepository,
    private readonly audit: AuditLogger,
  ) {}

  async show(id: string): Promise<Reminder> {
    const reminder = await this.reminders.findById(id);
    if (reminder === null)
      throw new ApplicationError("REMINDER_NOT_FOUND", `Reminder not found: ${id}`);
    return reminder;
  }

  async resolve(
    id: string,
    outcome: "delivered" | "not-delivered",
    resolvedAt: Date,
  ): Promise<Reminder> {
    const reminder = await this.show(id);
    if (reminder.status !== "NEEDS_REVIEW") {
      throw new ApplicationError(
        "REMINDER_NOT_NEEDS_REVIEW",
        `Reminder ${id} is ${reminder.status}; only NEEDS_REVIEW can be resolved`,
      );
    }
    const resolved = await this.reminders.resolveNeedsReview(id, outcome, resolvedAt);
    if (!resolved)
      throw new ApplicationError("REMINDER_CHANGED", `Reminder changed before resolution: ${id}`);
    await this.audit.record({
      action: "REMINDER_RESOLVED",
      entityType: "Reminder",
      entityId: id,
      metadata: { outcome },
    });
    const result = await this.reminders.findById(id);
    if (result === null)
      throw new ApplicationError("REMINDER_NOT_FOUND", `Reminder not found: ${id}`);
    return result;
  }
}

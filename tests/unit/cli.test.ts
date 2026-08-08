import { beforeEach, describe, expect, it } from "vitest";
import { runCli, type CliDependencies, type CliOutput } from "../../src/cli.js";
import { ManageClients, ManageGroups } from "../../src/application/use-cases/administration.js";
import { ManageAutomation, ManageReminders } from "../../src/application/use-cases/operations.js";
import { PurgeExpiredRecords } from "../../src/application/use-cases/retention.js";
import type {
  Client,
  Invoice,
  Recording,
  Reminder,
  Task,
  WhatsAppGroup,
} from "../../src/domain/entities/index.js";
import type {
  AuditLogger,
  AutomationSettingsAdministrationRepository,
  ClientAdministrationRepository,
  ClientRepository,
  IdGenerator,
  ReminderAdministrationRepository,
  RetentionRepository,
  WhatsAppGroupRepository,
} from "../../src/domain/ports/index.js";
import { RetentionPolicy } from "../../src/domain/services/retention-policy.js";

const clientId = "00000000-0000-7000-8000-000000000501";
const reminderId = "00000000-0000-7000-8000-000000000502";
const recordingId = "00000000-0000-7000-8000-000000000503";
const taskId = "00000000-0000-7000-8000-000000000504";
const invoiceId = "00000000-0000-7000-8000-000000000505";

class SequentialIds implements IdGenerator {
  private counter = 0;
  next(): string {
    this.counter += 1;
    return `00000000-0000-7000-8000-0000000006${String(this.counter).padStart(2, "0")}`;
  }
}

class MemoryAudit implements AuditLogger {
  readonly events: Array<{ readonly action: string }> = [];
  record(event: { readonly action: string }): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

class MemoryClients implements ClientAdministrationRepository, ClientRepository {
  readonly values: Client[] = [];
  create(client: Client): Promise<void> {
    this.values.push(client);
    return Promise.resolve();
  }
  list(status?: Client["status"]): Promise<readonly Client[]> {
    return Promise.resolve(
      status === undefined ? this.values : this.values.filter((value) => value.status === status),
    );
  }
  findById(id: string): Promise<Client | null> {
    return Promise.resolve(this.values.find((client) => client.id === id) ?? null);
  }
  findWithPrimaryGroup(
    id: string,
  ): Promise<{ readonly client: Client; readonly group: WhatsAppGroup | null } | null> {
    const client = this.values.find((value) => value.id === id);
    return Promise.resolve(client === undefined ? null : { client, group: null });
  }
}

class MemoryGroups implements WhatsAppGroupRepository {
  readonly values: WhatsAppGroup[] = [];
  findById(id: string): Promise<WhatsAppGroup | null> {
    return Promise.resolve(this.values.find((group) => group.id === id) ?? null);
  }
  save(group: WhatsAppGroup): Promise<void> {
    const index = this.values.findIndex((value) => value.id === group.id);
    if (index < 0) this.values.push(group);
    else this.values[index] = group;
    return Promise.resolve();
  }
}

class MemoryAutomationSettings implements AutomationSettingsAdministrationRepository {
  globalPaused: boolean | null = null;
  readonly perClient = new Map<string, boolean>();
  setGlobalPaused(paused: boolean): Promise<void> {
    this.globalPaused = paused;
    return Promise.resolve();
  }
  setClientPaused(id: string, paused: boolean): Promise<void> {
    this.perClient.set(id, paused);
    return Promise.resolve();
  }
}

class MemoryReminders implements ReminderAdministrationRepository {
  readonly values: Reminder[] = [];
  findById(id: string): Promise<Reminder | null> {
    return Promise.resolve(this.values.find((reminder) => reminder.id === id) ?? null);
  }
  resolveNeedsReview(id: string, outcome: "delivered" | "not-delivered"): Promise<boolean> {
    const index = this.values.findIndex((reminder) => reminder.id === id);
    const current = this.values[index];
    if (current === undefined || current.status !== "NEEDS_REVIEW") return Promise.resolve(false);
    this.values[index] = { ...current, status: outcome === "delivered" ? "SENT" : "FAILED" };
    return Promise.resolve(true);
  }
}

class MemoryRetention implements RetentionRepository {
  readonly cutoffs: Date[] = [];
  purgeMessageAttemptsBefore(cutoff: Date): Promise<number> {
    this.cutoffs.push(cutoff);
    return Promise.resolve(2);
  }
  purgeAuditEventsBefore(cutoff: Date): Promise<number> {
    this.cutoffs.push(cutoff);
    return Promise.resolve(1);
  }
}

function reminder(status: Reminder["status"]): Reminder {
  return {
    id: reminderId,
    type: "RECORDING_24H",
    clientId,
    recordingId: "00000000-0000-7000-8000-000000000503",
    taskId: null,
    invoiceId: null,
    scheduledFor: new Date("2026-08-09T14:00:00.000Z"),
    status,
    attempts: 1,
    maxAttempts: 3,
    claimedAt: null,
    claimedBy: null,
    nextAttemptAt: null,
    sentAt: null,
    idempotencyKey: "test:recording:1",
  };
}

class RecordingOutput implements CliOutput {
  readonly lines: string[] = [];
  writeLine(line: string): void {
    this.lines.push(line);
  }
  json<T>(index = 0): T {
    return JSON.parse(this.lines[index] ?? "null") as T;
  }
}

interface Harness {
  readonly dependencies: CliDependencies;
  readonly clients: MemoryClients;
  readonly groups: MemoryGroups;
  readonly settings: MemoryAutomationSettings;
  readonly reminders: MemoryReminders;
  readonly audit: MemoryAudit;
  readonly retentionRepository: MemoryRetention;
}

function harness(): Harness {
  const clients = new MemoryClients();
  const groups = new MemoryGroups();
  const settings = new MemoryAutomationSettings();
  const reminders = new MemoryReminders();
  const audit = new MemoryAudit();
  const ids = new SequentialIds();
  const now = new Date("2026-08-07T13:00:00.000Z");
  const clock = { now: () => now, fromEpoch: (epochMs: number) => new Date(epochMs) };
  const retentionRepository = new MemoryRetention();
  return {
    clients,
    groups,
    settings,
    reminders,
    audit,
    retentionRepository,
    dependencies: {
      clients: new ManageClients(clients, ids, audit),
      groups: new ManageGroups(clients, groups, ids, audit),
      automation: new ManageAutomation(clients, settings, ids, audit),
      reminders: new ManageReminders(reminders, audit),
      recordings: {
        create: (input) =>
          Promise.resolve<Recording>({
            id: recordingId,
            clientId: input.clientId,
            title: input.title,
            scheduledAt: input.scheduledAt,
            location: input.location ?? null,
            notes: input.notes ?? null,
            status: "SCHEDULED",
          }),
        reschedule: (id, scheduledAt) =>
          Promise.resolve<Recording>({
            id,
            clientId,
            title: "Grabación ficticia",
            scheduledAt,
            location: null,
            notes: null,
            status: "RESCHEDULED",
          }),
        cancel: (id) =>
          Promise.resolve<Recording>({
            id,
            clientId,
            title: "Grabación ficticia",
            scheduledAt: new Date("2026-08-10T13:00:00.000Z"),
            location: null,
            notes: null,
            status: "CANCELLED",
          }),
      },
      tasks: {
        changeStatus: (id, nextStatus) =>
          Promise.resolve<Task>({
            id,
            clientId,
            title: "Tarea ficticia",
            status: nextStatus,
            clientReviewEnteredAt: nextStatus === "CLIENT_REVIEW" ? now : null,
            clientReviewRound: nextStatus === "CLIENT_REVIEW" ? 1 : 0,
          }),
      },
      invoices: {
        create: (input) =>
          Promise.resolve<Invoice>({
            id: invoiceId,
            clientId: input.clientId,
            period: input.period,
            amountCents: input.amountCents,
            currency: "USD",
            dueDate: input.dueDate,
            status: "PENDING",
            paidAt: null,
            remindersSent: 0,
          }),
        pay: (id) =>
          Promise.resolve<Invoice>({
            id,
            clientId,
            period: "2026-08",
            amountCents: 1000,
            currency: "USD",
            dueDate: new Date("2026-08-10T00:00:00.000Z"),
            status: "PAID",
            paidAt: new Date("2026-08-07T13:00:00.000Z"),
            remindersSent: 0,
          }),
      },
      retention: new PurgeExpiredRecords(
        retentionRepository,
        new RetentionPolicy(clock, 12),
        clock,
        audit,
      ),
      clock,
    },
  };
}

describe("CLI command parsing and validation", () => {
  let output: RecordingOutput;

  beforeEach(() => {
    output = new RecordingOutput();
  });

  it("rejects an unknown command", async () => {
    await expect(runCli(["client:destroy"], harness().dependencies, output)).rejects.toThrow();
  });

  it("renders template:preview without database dependencies", async () => {
    await runCli(["template:preview", "recording.reminder_24h", "--sample"], undefined, output);

    expect(output.lines[0]).toContain("Grabación de muestra");
  });

  it("requires --sample on template:preview and rejects an unknown template", async () => {
    await expect(
      runCli(["template:preview", "recording.reminder_24h"], undefined, output),
    ).rejects.toThrow("Usage: pnpm cli template:preview <template-id> --sample");
    await expect(
      runCli(["template:preview", "nope", "--sample"], undefined, output),
    ).rejects.toThrow("Unknown template: nope");
  });

  it("refuses database-backed commands without dependencies", async () => {
    await expect(runCli(["client:list"], undefined, output)).rejects.toThrow(
      "Database-backed CLI dependencies are not configured",
    );
  });

  it("creates a client with the default status and filters the listing", async () => {
    const context = harness();

    await runCli(["client:create", "--name", "Cliente ficticio"], context.dependencies, output);
    const created = output.json<Client>();
    expect(created.status).toBe("ACTIVE");
    expect(created.timeZone).toBeNull();

    await runCli(
      ["client:create", "--name", "Pausado", "--status=PAUSED"],
      context.dependencies,
      output,
    );
    await runCli(["client:list", "--status", "PAUSED"], context.dependencies, output);
    const listed = output.json<readonly Client[]>(2);
    expect(listed.map((client) => client.name)).toEqual(["Pausado"]);
  });

  it("rejects an invalid status, an unknown option and a missing --name", async () => {
    const context = harness();

    await expect(
      runCli(["client:create", "--name", "X", "--status", "DELETED"], context.dependencies, output),
    ).rejects.toThrow();
    await expect(
      runCli(["client:create", "--name", "X", "--colour", "red"], context.dependencies, output),
    ).rejects.toThrow("Unknown option: --colour");
    await expect(runCli(["client:create"], context.dependencies, output)).rejects.toThrow();
  });

  it("rejects an invalid IANA time zone", async () => {
    const context = harness();

    await expect(
      runCli(
        ["client:create", "--name", "X", "--time-zone", "Mars/Olympus"],
        context.dependencies,
        output,
      ),
    ).rejects.toThrow("time-zone must be a valid IANA time zone");
  });

  it("adds a group left unauthorized and authorizes it only with an explicit instant", async () => {
    const context = harness();
    await context.clients.create({
      id: clientId,
      name: "Cliente ficticio",
      status: "ACTIVE",
      timeZone: null,
    });

    await runCli(
      ["group:add", clientId, "--jid", "100000000000001@g.us", "--label", "Grupo", "--primary"],
      context.dependencies,
      output,
    );
    const added = output.json<WhatsAppGroup>();
    expect(added.authorizedAt).toBeNull();
    expect(added.isPrimary).toBe(true);
    expect(added.enabled).toBe(false);

    await runCli(
      ["group:authorize", added.id, "--authorized-at", "2026-08-07T08:00:00-05:00"],
      context.dependencies,
      output,
    );
    expect(output.json<WhatsAppGroup>(1).authorizedAt).toBe("2026-08-07T13:00:00.000Z");
  });

  it("rejects a direct-message JID and a non-UUID client id", async () => {
    const context = harness();

    await expect(
      runCli(
        ["group:add", clientId, "--jid", "593999999999@s.whatsapp.net", "--label", "X"],
        context.dependencies,
        output,
      ),
    ).rejects.toThrow("jid must be a WhatsApp group JID");
    await expect(
      runCli(
        ["group:add", "not-a-uuid", "--jid", "100000000000001@g.us", "--label", "X"],
        context.dependencies,
        output,
      ),
    ).rejects.toThrow();
  });

  it("rejects group:authorize without a timezone offset", async () => {
    const context = harness();

    await expect(
      runCli(
        ["group:authorize", clientId, "--authorized-at", "2026-08-07T08:00:00"],
        context.dependencies,
        output,
      ),
    ).rejects.toThrow();
  });

  it("pauses globally and per client, and refuses ambiguous scopes", async () => {
    const context = harness();
    await context.clients.create({
      id: clientId,
      name: "Cliente ficticio",
      status: "ACTIVE",
      timeZone: null,
    });

    await runCli(["automation:pause", "--global"], context.dependencies, output);
    expect(context.settings.globalPaused).toBe(true);

    await runCli(["automation:resume", "--client", clientId], context.dependencies, output);
    expect(context.settings.perClient.get(clientId)).toBe(false);

    await expect(runCli(["automation:pause"], context.dependencies, output)).rejects.toThrow(
      "Choose exactly one of --global or --client",
    );
    await expect(
      runCli(["automation:pause", "--global", "--client", clientId], context.dependencies, output),
    ).rejects.toThrow("Choose exactly one of --global or --client");
  });

  it("fails to pause an unknown client", async () => {
    const context = harness();

    await expect(
      runCli(["automation:pause", "--client", clientId], context.dependencies, output),
    ).rejects.toMatchObject({ code: "CLIENT_NOT_FOUND" });
  });

  it("shows a reminder and resolves only NEEDS_REVIEW", async () => {
    const context = harness();
    context.reminders.values.push(reminder("NEEDS_REVIEW"));

    await runCli(["reminder:show", reminderId], context.dependencies, output);
    expect(output.json<Reminder>().status).toBe("NEEDS_REVIEW");

    await runCli(
      ["reminder:resolve", reminderId, "--outcome", "delivered"],
      context.dependencies,
      output,
    );
    expect(output.json<Reminder>(1).status).toBe("SENT");
    expect(context.audit.events.map((event) => event.action)).toEqual(["REMINDER_RESOLVED"]);

    await expect(
      runCli(
        ["reminder:resolve", reminderId, "--outcome", "delivered"],
        context.dependencies,
        output,
      ),
    ).rejects.toMatchObject({ code: "REMINDER_NOT_NEEDS_REVIEW" });
  });

  it("rejects an unknown outcome and an unknown reminder", async () => {
    const context = harness();

    await expect(
      runCli(["reminder:resolve", reminderId, "--outcome", "maybe"], context.dependencies, output),
    ).rejects.toThrow();
    await expect(
      runCli(["reminder:show", reminderId], context.dependencies, output),
    ).rejects.toMatchObject({ code: "REMINDER_NOT_FOUND" });
  });

  it("purges expired records with the configured cutoff", async () => {
    const context = harness();

    await runCli(["retention:purge"], context.dependencies, output);

    expect(output.json<{ cutoff: string; messageAttempts: number; auditEvents: number }>()).toEqual(
      {
        cutoff: "2025-08-07T13:00:00.000Z",
        messageAttempts: 2,
        auditEvents: 1,
      },
    );
    expect(context.audit.events.map((event) => event.action)).toEqual(["RETENTION_PURGED"]);
  });

  it("rejects options on retention:purge", async () => {
    const context = harness();

    await expect(
      runCli(["retention:purge", "--months", "1"], context.dependencies, output),
    ).rejects.toThrow("Unknown option: --months");
  });

  it("rejects extra positional arguments", async () => {
    const context = harness();

    await expect(
      runCli(["reminder:show", reminderId, "extra"], context.dependencies, output),
    ).rejects.toThrow("Expected 1 positional argument(s), received 2");
  });

  it("delegates recording, task, and invoice commands with validated dates and values", async () => {
    const context = harness();

    await runCli(
      [
        "recording:create",
        clientId,
        "--title",
        "Grabación CLI",
        "--scheduled-at",
        "2026-08-10T13:00:00.000Z",
        "--location",
        "Estudio ficticio",
      ],
      context.dependencies,
      output,
    );
    expect(output.json<Recording>().scheduledAt).toBe("2026-08-10T13:00:00.000Z");
    expect(output.json<Recording>().location).toBe("Estudio ficticio");

    await runCli(
      ["recording:reschedule", recordingId, "--scheduled-at=2026-08-11T13:00:00.000Z"],
      context.dependencies,
      output,
    );
    expect(output.json<Recording>(1).status).toBe("RESCHEDULED");
    await runCli(["recording:cancel", recordingId], context.dependencies, output);
    expect(output.json<Recording>(2).status).toBe("CANCELLED");

    await runCli(
      ["task:status", taskId, "--status", "CLIENT_REVIEW"],
      context.dependencies,
      output,
    );
    expect(output.json<Task>(3).status).toBe("CLIENT_REVIEW");

    await runCli(
      [
        "invoice:create",
        clientId,
        "--period",
        "2026-08",
        "--amount-cents",
        "12500",
        "--due-date",
        "2026-08-10",
      ],
      context.dependencies,
      output,
    );
    expect(output.json<Invoice>(4).amountCents).toBe(12500);
    expect(output.json<Invoice>(4).dueDate).toBe("2026-08-10T00:00:00.000Z");
    await runCli(["invoice:pay", invoiceId], context.dependencies, output);
    expect(output.json<Invoice>(5).status).toBe("PAID");
  });

  it("rejects invalid recording and invoice input", async () => {
    const context = harness();

    await expect(
      runCli(
        ["recording:create", clientId, "--title", "X", "--scheduled-at", "2026-08-10T13:00:00"],
        context.dependencies,
        output,
      ),
    ).rejects.toThrow();
    await expect(
      runCli(
        [
          "invoice:create",
          clientId,
          "--period",
          "2026-13",
          "--amount-cents",
          "0",
          "--due-date",
          "2026-08-10",
        ],
        context.dependencies,
        output,
      ),
    ).rejects.toThrow();
  });
});

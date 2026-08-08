import { pathToFileURL } from "node:url";
import { z } from "zod";
import { ManageAutomation, ManageReminders } from "./application/use-cases/operations.js";
import { ManageClients, ManageGroups } from "./application/use-cases/administration.js";
import {
  ManageInvoices,
  ManageRecordings,
  ManageTasks,
  type InvoiceAdministration,
  type RecordingAdministration,
  type TaskAdministration,
} from "./application/use-cases/content-administration.js";
import { PurgeExpiredRecords } from "./application/use-cases/retention.js";
import { loadConfig } from "./config/index.js";
import { createPrismaClient } from "./infrastructure/database/prisma.js";
import {
  PrismaAuditLogger,
  PrismaAutomationSettingsRepository,
  PrismaClientAdministrationRepository,
  PrismaClientRepository,
  PrismaInvoiceRepository,
  PrismaReminderRepository,
  PrismaRecordingRepository,
  PrismaRetentionRepository,
  PrismaTaskRepository,
  PrismaTransactionManager,
  PrismaWhatsAppGroupRepository,
} from "./infrastructure/database/repositories.js";
import { RetentionPolicy } from "./domain/services/retention-policy.js";
import { BusinessWindowService } from "./domain/services/business-window.js";
import { IdempotencyKeyFactory } from "./domain/services/idempotency-key.js";
import { ReminderSchedulePolicy } from "./domain/services/schedule-policy.js";
import { UuidV7Generator } from "./infrastructure/ids.js";
import { SystemClock } from "./infrastructure/scheduling/clock.js";
import { TemplateRenderer } from "./modules/messaging/renderer.js";

type FlagValue = string | boolean;
type ParsedArguments = {
  readonly positional: readonly string[];
  readonly flags: Readonly<Record<string, FlagValue>>;
};

export interface CliOutput {
  writeLine(line: string): void;
}

export interface CliDependencies {
  readonly clients: ManageClients;
  readonly groups: ManageGroups;
  readonly automation: ManageAutomation;
  readonly reminders: ManageReminders;
  readonly recordings: RecordingAdministration;
  readonly tasks: TaskAdministration;
  readonly invoices: InvoiceAdministration;
  readonly retention: PurgeExpiredRecords;
  readonly clock: { now(): Date; fromEpoch(epochMs: number): Date };
}

const commandSchema = z.enum([
  "client:create",
  "client:list",
  "group:add",
  "group:authorize",
  "automation:pause",
  "automation:resume",
  "reminder:show",
  "reminder:resolve",
  "recording:create",
  "recording:reschedule",
  "recording:cancel",
  "task:status",
  "invoice:create",
  "invoice:pay",
  "retention:purge",
  "template:preview",
]);

function parseArguments(args: readonly string[]): ParsedArguments {
  const positional: string[] = [];
  const flags: Record<string, FlagValue> = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) continue;
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const raw = argument.slice(2);
    const equalsIndex = raw.indexOf("=");
    if (equalsIndex >= 0) {
      const key = raw.slice(0, equalsIndex);
      const value = raw.slice(equalsIndex + 1);
      flags[key] = value;
      continue;
    }
    const next = args[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[raw] = next;
      index += 1;
    } else {
      flags[raw] = true;
    }
  }
  return { positional, flags };
}

function allowedFlags(
  flags: Readonly<Record<string, FlagValue>>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(flags).find((key) => !allowedSet.has(key));
  if (unknown !== undefined) throw new Error(`Unknown option: --${unknown}`);
}

function requiredString(flags: Readonly<Record<string, FlagValue>>, name: string): string {
  const value = flags[name];
  return z
    .string()
    .trim()
    .min(1)
    .parse(typeof value === "string" ? value : undefined);
}

function optionalString(
  flags: Readonly<Record<string, FlagValue>>,
  name: string,
): string | undefined {
  const value = flags[name];
  if (value === undefined) return undefined;
  return z
    .string()
    .trim()
    .min(1)
    .parse(typeof value === "string" ? value : undefined);
}

function booleanFlag(flags: Readonly<Record<string, FlagValue>>, name: string): boolean {
  const value = flags[name];
  if (value === undefined) return false;
  return z.literal(true).parse(value);
}

function positionalId(parsed: ParsedArguments, index = 1): string {
  return z.uuid().parse(parsed.positional[index]);
}

function expectPositionals(parsed: ParsedArguments, count: number): void {
  if (parsed.positional.length !== count)
    throw new Error(
      `Expected ${count - 1} positional argument(s), received ${parsed.positional.length - 1}`,
    );
}

function json(output: CliOutput, value: unknown): void {
  output.writeLine(JSON.stringify(value));
}

function requiredInstant(
  flags: Readonly<Record<string, FlagValue>>,
  name: string,
  clock: { fromEpoch(epochMs: number): Date },
): Date {
  const text = z.iso.datetime({ offset: true }).parse(requiredString(flags, name));
  const epoch = Date.parse(text);
  if (!Number.isFinite(epoch)) throw new Error(`--${name} must be a valid ISO-8601 instant`);
  return clock.fromEpoch(epoch);
}

function requiredDate(
  flags: Readonly<Record<string, FlagValue>>,
  name: string,
  clock: { fromEpoch(epochMs: number): Date },
): Date {
  const text = z.iso.date().parse(requiredString(flags, name));
  const epoch = Date.parse(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(epoch)) throw new Error(`--${name} must be a valid ISO date`);
  return clock.fromEpoch(epoch);
}

const samples: Record<string, Record<string, unknown>> = {
  "recording.reminder_24h": {
    clientName: "Cliente de prueba",
    title: "Grabación de muestra",
    dateLabel: "martes 4 de agosto de 2026",
    timeLabel: "09:00",
    confirmToken: "CONFIRMO",
  },
  "task.client_review_48h": {
    clientName: "Cliente de prueba",
    title: "Material de muestra",
    enteredReviewLabel: "lunes 3 de agosto de 2026",
    reminderNumber: 1,
    maxReminders: 2,
  },
  "invoice.upcoming_due": {
    clientName: "Cliente de prueba",
    period: "08/2026",
    amountLabel: "USD 100,00",
    dueDateLabel: "viernes 7 de agosto de 2026",
    daysUntilDue: 3,
  },
  "invoice.due_today": {
    clientName: "Cliente de prueba",
    period: "08/2026",
    amountLabel: "USD 100,00",
    dueDateLabel: "viernes 7 de agosto de 2026",
  },
  "invoice.overdue": {
    clientName: "Cliente de prueba",
    period: "08/2026",
    amountLabel: "USD 100,00",
    dueDateLabel: "viernes 7 de agosto de 2026",
    daysOverdue: 3,
  },
};

function preview(templateId: string, output: CliOutput): void {
  const sample = samples[templateId];
  if (sample === undefined) throw new Error(`Unknown template: ${templateId}`);
  const rendered = new TemplateRenderer().render(templateId, sample);
  output.writeLine(rendered.text);
}

export async function runCli(
  args: readonly string[],
  dependencies: CliDependencies | undefined,
  output: CliOutput,
): Promise<void> {
  const parsed = parseArguments(args);
  const command = commandSchema.parse(parsed.positional[0]);
  if (command === "template:preview") {
    if (parsed.positional.length !== 2 || parsed.flags["sample"] !== true)
      throw new Error("Usage: pnpm cli template:preview <template-id> --sample");
    preview(z.string().min(1).parse(parsed.positional[1]), output);
    return;
  }
  if (dependencies === undefined)
    throw new Error("Database-backed CLI dependencies are not configured");

  switch (command) {
    case "client:create": {
      expectPositionals(parsed, 1);
      allowedFlags(parsed.flags, ["name", "status", "time-zone"]);
      const status = z
        .enum(["ACTIVE", "PAUSED", "ARCHIVED"])
        .default("ACTIVE")
        .parse(parsed.flags["status"]);
      const timeZone = optionalString(parsed.flags, "time-zone");
      if (timeZone !== undefined) {
        const timeZoneResult = z
          .string()
          .refine((value) => {
            try {
              Intl.DateTimeFormat(undefined, { timeZone: value });
              return true;
            } catch {
              return false;
            }
          }, "time-zone must be a valid IANA time zone")
          .safeParse(timeZone);
        if (!timeZoneResult.success)
          throw new Error(timeZoneResult.error.issues[0]?.message ?? "Invalid time zone");
      }
      const client = await dependencies.clients.create({
        name: requiredString(parsed.flags, "name"),
        status,
        timeZone: timeZone ?? null,
      });
      json(output, client);
      return;
    }
    case "client:list": {
      expectPositionals(parsed, 1);
      allowedFlags(parsed.flags, ["status"]);
      const status = z
        .enum(["ACTIVE", "PAUSED", "ARCHIVED"])
        .optional()
        .parse(parsed.flags["status"]);
      json(output, await dependencies.clients.list(status));
      return;
    }
    case "group:add": {
      expectPositionals(parsed, 2);
      allowedFlags(parsed.flags, ["jid", "label", "primary", "enabled"]);
      const group = await dependencies.groups.add({
        clientId: positionalId(parsed),
        jid: z
          .string()
          .regex(/^[^\s@]+@g\.us$/, "jid must be a WhatsApp group JID")
          .parse(requiredString(parsed.flags, "jid")),
        label: requiredString(parsed.flags, "label"),
        isPrimary: booleanFlag(parsed.flags, "primary"),
        enabled: booleanFlag(parsed.flags, "enabled"),
      });
      json(output, group);
      return;
    }
    case "group:authorize": {
      expectPositionals(parsed, 2);
      allowedFlags(parsed.flags, ["authorized-at"]);
      const authorizedAtText = z.iso
        .datetime({ offset: true })
        .parse(requiredString(parsed.flags, "authorized-at"));
      const epoch = Date.parse(authorizedAtText);
      if (!Number.isFinite(epoch))
        throw new Error("--authorized-at must be a valid ISO-8601 instant");
      json(
        output,
        await dependencies.groups.authorize(
          positionalId(parsed),
          dependencies.clock.fromEpoch(epoch),
        ),
      );
      return;
    }
    case "recording:create": {
      expectPositionals(parsed, 2);
      allowedFlags(parsed.flags, ["title", "scheduled-at", "location", "notes"]);
      const location = optionalString(parsed.flags, "location");
      const notes = optionalString(parsed.flags, "notes");
      json(
        output,
        await dependencies.recordings.create({
          clientId: positionalId(parsed),
          title: requiredString(parsed.flags, "title"),
          scheduledAt: requiredInstant(parsed.flags, "scheduled-at", dependencies.clock),
          ...(location === undefined ? {} : { location }),
          ...(notes === undefined ? {} : { notes }),
        }),
      );
      return;
    }
    case "recording:reschedule":
      expectPositionals(parsed, 2);
      allowedFlags(parsed.flags, ["scheduled-at"]);
      json(
        output,
        await dependencies.recordings.reschedule(
          positionalId(parsed),
          requiredInstant(parsed.flags, "scheduled-at", dependencies.clock),
        ),
      );
      return;
    case "recording:cancel":
      expectPositionals(parsed, 2);
      allowedFlags(parsed.flags, []);
      json(output, await dependencies.recordings.cancel(positionalId(parsed)));
      return;
    case "task:status":
      expectPositionals(parsed, 2);
      allowedFlags(parsed.flags, ["status"]);
      json(
        output,
        await dependencies.tasks.changeStatus(
          positionalId(parsed),
          z
            .enum([
              "DRAFT",
              "EDITING",
              "CLIENT_REVIEW",
              "CHANGES_REQUESTED",
              "APPROVED",
              "PUBLISHED",
              "CANCELLED",
            ])
            .parse(requiredString(parsed.flags, "status")),
        ),
      );
      return;
    case "invoice:create": {
      expectPositionals(parsed, 2);
      allowedFlags(parsed.flags, ["period", "amount-cents", "due-date"]);
      const period = z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "period must match YYYY-MM")
        .parse(requiredString(parsed.flags, "period"));
      const amountCents = z.coerce
        .number()
        .int()
        .positive()
        .parse(requiredString(parsed.flags, "amount-cents"));
      json(
        output,
        await dependencies.invoices.create({
          clientId: positionalId(parsed),
          period,
          amountCents,
          dueDate: requiredDate(parsed.flags, "due-date", dependencies.clock),
        }),
      );
      return;
    }
    case "invoice:pay":
      expectPositionals(parsed, 2);
      allowedFlags(parsed.flags, []);
      json(output, await dependencies.invoices.pay(positionalId(parsed)));
      return;
    case "automation:pause":
    case "automation:resume": {
      expectPositionals(parsed, 1);
      allowedFlags(parsed.flags, ["global", "client"]);
      const global = booleanFlag(parsed.flags, "global");
      const clientId = optionalString(parsed.flags, "client");
      if (global === (clientId !== undefined))
        throw new Error("Choose exactly one of --global or --client");
      await dependencies.automation.setPaused({
        clientId: clientId ?? null,
        paused: command === "automation:pause",
      });
      json(output, {
        command,
        scope: clientId === undefined ? "global" : "client",
        clientId: clientId ?? null,
      });
      return;
    }
    case "retention:purge": {
      expectPositionals(parsed, 1);
      allowedFlags(parsed.flags, []);
      const result = await dependencies.retention.execute();
      json(output, { ...result, cutoff: result.cutoff.toISOString() });
      return;
    }
    case "reminder:show":
      expectPositionals(parsed, 2);
      allowedFlags(parsed.flags, []);
      json(output, await dependencies.reminders.show(positionalId(parsed)));
      return;
    case "reminder:resolve": {
      expectPositionals(parsed, 2);
      allowedFlags(parsed.flags, ["outcome"]);
      const outcome = z
        .enum(["delivered", "not-delivered"])
        .parse(requiredString(parsed.flags, "outcome"));
      json(
        output,
        await dependencies.reminders.resolve(
          positionalId(parsed),
          outcome,
          dependencies.clock.now(),
        ),
      );
      return;
    }
  }
}

export function buildCliDependencies(): {
  readonly dependencies: CliDependencies;
  readonly close: () => Promise<void>;
} {
  const config = loadConfig();
  const prisma = createPrismaClient(config.databaseUrl);
  const ids = new UuidV7Generator();
  const clock = new SystemClock(config.appTimeZone);
  const audit = new PrismaAuditLogger(prisma, ids, "CLI");
  const clientsRepository = new PrismaClientRepository(prisma);
  const recordingsRepository = new PrismaRecordingRepository(prisma);
  const tasksRepository = new PrismaTaskRepository(prisma);
  const invoicesRepository = new PrismaInvoiceRepository(prisma);
  const settingsRepository = new PrismaAutomationSettingsRepository(prisma);
  const transaction = new PrismaTransactionManager(prisma);
  const schedule = new ReminderSchedulePolicy(
    new BusinessWindowService(clock),
    new IdempotencyKeyFactory(),
    config.appTimeZone,
    clock,
  );
  const contentDependencies = {
    clients: clientsRepository,
    recordings: recordingsRepository,
    tasks: tasksRepository,
    invoices: invoicesRepository,
    settings: settingsRepository,
    tx: transaction,
    schedule,
    ids,
    clock,
    audit,
  };
  return {
    dependencies: {
      clients: new ManageClients(new PrismaClientAdministrationRepository(prisma), ids, audit),
      groups: new ManageGroups(
        new PrismaClientRepository(prisma),
        new PrismaWhatsAppGroupRepository(prisma),
        ids,
        audit,
      ),
      automation: new ManageAutomation(
        new PrismaClientRepository(prisma),
        new PrismaAutomationSettingsRepository(prisma),
        ids,
        audit,
      ),
      reminders: new ManageReminders(new PrismaReminderRepository(prisma), audit),
      recordings: new ManageRecordings(contentDependencies),
      tasks: new ManageTasks(contentDependencies),
      invoices: new ManageInvoices(contentDependencies),
      retention: new PurgeExpiredRecords(
        new PrismaRetentionRepository(prisma),
        new RetentionPolicy(clock, config.retention.months),
        clock,
        audit,
      ),
      clock,
    },
    close: () => prisma.$disconnect(),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const output: CliOutput = { writeLine: (line) => process.stdout.write(`${line}\n`) };
  if (args[0] === "template:preview") {
    await runCli(args, undefined, output);
    return;
  }
  const built = buildCliDependencies();
  try {
    await runCli(args, built.dependencies, output);
  } finally {
    await built.close();
  }
}

const invokedFile = process.argv[1];
if (invokedFile !== undefined && import.meta.url === pathToFileURL(invokedFile).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Unknown CLI error"}\n`);
    process.exitCode = 1;
  });
}

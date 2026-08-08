import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ManageClients, ManageGroups } from "../../../src/application/use-cases/administration.js";
import {
  ManageAutomation,
  ManageReminders,
} from "../../../src/application/use-cases/operations.js";
import { createPrismaClient } from "../../../src/infrastructure/database/prisma.js";
import {
  PrismaAuditLogger,
  PrismaAutomationSettingsRepository,
  PrismaClientAdministrationRepository,
  PrismaClientRepository,
  PrismaReminderRepository,
  PrismaWhatsAppGroupRepository,
} from "../../../src/infrastructure/database/repositories.js";
import { UuidV7Generator } from "../../../src/infrastructure/ids.js";
import { SystemClock } from "../../../src/infrastructure/scheduling/clock.js";

const databaseUrl = process.env["DATABASE_URL"];
const ids = {
  client: "00000000-0000-7000-8000-000000001001",
  group: "00000000-0000-7000-8000-000000001002",
  recording: "00000000-0000-7000-8000-000000001003",
  reminder: "00000000-0000-7000-8000-000000001004",
};

describe.skipIf(databaseUrl === undefined)("CLI administration persistence", () => {
  let prisma!: PrismaClient;

  beforeAll(() => {
    if (databaseUrl !== undefined) prisma = createPrismaClient(databaseUrl);
  });

  afterEach(async () => {
    await prisma.reminder.deleteMany({ where: { clientId: ids.client } });
    await prisma.recording.deleteMany({ where: { clientId: ids.client } });
    await prisma.whatsAppGroup.deleteMany({ where: { clientId: ids.client } });
    await prisma.automationSetting.deleteMany({ where: { clientId: ids.client } });
    await prisma.client.deleteMany({ where: { id: ids.client } });
  });

  afterAll(async () => {
    if (databaseUrl !== undefined) await prisma.$disconnect();
  });

  it("creates a client, authorizes its group manually, pauses it, and resolves a reminder", async () => {
    const audit = new PrismaAuditLogger(prisma, new UuidV7Generator(), "CLI");
    const clientAdministration = new PrismaClientAdministrationRepository(prisma);
    const clientRepository = new PrismaClientRepository(prisma);
    const groupRepository = new PrismaWhatsAppGroupRepository(prisma);
    const idsGenerator = { next: () => ids.client };
    const clients = new ManageClients(clientAdministration, idsGenerator, audit);
    const groups = new ManageGroups(
      clientRepository,
      groupRepository,
      { next: () => ids.group },
      audit,
    );
    const automation = new ManageAutomation(
      clientRepository,
      new PrismaAutomationSettingsRepository(prisma),
      { next: () => "00000000-0000-7000-8000-000000001005" },
      audit,
    );
    const reminders = new ManageReminders(new PrismaReminderRepository(prisma), audit);

    const client = await clients.create({
      name: "Cliente ficticio de integración",
      status: "ACTIVE",
      timeZone: null,
    });
    const group = await groups.add({
      clientId: client.id,
      jid: "100000000000002@g.us",
      label: "Grupo ficticio de integración",
      isPrimary: true,
      enabled: true,
    });
    expect(group.authorizedAt).toBeNull();
    const authorizedAt = new SystemClock("America/Guayaquil").fromEpoch(
      Date.parse("2026-08-07T13:00:00.000Z"),
    );
    await groups.authorize(group.id, authorizedAt);
    await expect(
      prisma.whatsAppGroup.findUnique({ where: { id: group.id } }),
    ).resolves.toMatchObject({
      authorizedAt,
    });

    await automation.setPaused({ clientId: client.id, paused: true });
    await expect(
      new PrismaAutomationSettingsRepository(prisma).resolveForClient(client.id),
    ).resolves.toMatchObject({
      globalPaused: true,
    });

    await prisma.recording.create({
      data: {
        id: ids.recording,
        clientId: client.id,
        title: "Grabación ficticia",
        scheduledAt: new Date("2026-08-08T13:00:00.000Z"),
      },
    });
    await prisma.reminder.create({
      data: {
        id: ids.reminder,
        type: "RECORDING_24H",
        clientId: client.id,
        recordingId: ids.recording,
        scheduledFor: new Date("2026-08-07T13:00:00.000Z"),
        status: "NEEDS_REVIEW",
        attempts: 1,
        claimedAt: new Date("2026-08-07T12:00:00.000Z"),
        cancellationReason: "UNCERTAIN_DELIVERY",
        idempotencyKey: "integration-admin-reminder",
      },
    });
    const shown = await reminders.show(ids.reminder);
    expect(shown.status).toBe("NEEDS_REVIEW");
    const resolved = await reminders.resolve(
      ids.reminder,
      "not-delivered",
      new Date("2026-08-07T14:00:00.000Z"),
    );
    expect(resolved.status).toBe("PENDING");
    await expect(
      prisma.reminder.findUnique({ where: { id: ids.reminder } }),
    ).resolves.toMatchObject({
      status: "PENDING",
      sentAt: null,
      cancellationReason: null,
    });
  });
});

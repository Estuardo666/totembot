import { loadConfig } from "../src/config/index.js";
import { createPrismaClient } from "../src/infrastructure/database/prisma.js";
import { SystemClock } from "../src/infrastructure/scheduling/clock.js";

const ids = {
  client: "00000000-0000-7000-8000-000000000901",
  group: "00000000-0000-7000-8000-000000000902",
  recording: "00000000-0000-7000-8000-000000000903",
  reminder: "00000000-0000-7000-8000-000000000904",
  settings: "00000000-0000-7000-8000-000000000905",
};

async function main(): Promise<void> {
  const config = loadConfig();
  const prisma = createPrismaClient(config.databaseUrl);
  const clock = new SystemClock(config.appTimeZone);
  try {
    await prisma.$transaction(async (database) => {
      await database.client.upsert({
        where: { id: ids.client },
        update: {
          name: "Cliente ficticio de desarrollo",
          status: "ACTIVE",
          timeZone: "America/Guayaquil",
        },
        create: {
          id: ids.client,
          name: "Cliente ficticio de desarrollo",
          status: "ACTIVE",
          timeZone: "America/Guayaquil",
        },
      });
      await database.whatsAppGroup.upsert({
        where: { id: ids.group },
        update: { label: "Grupo ficticio de desarrollo", enabled: false, authorizedAt: null },
        create: {
          id: ids.group,
          clientId: ids.client,
          jid: "100000000000001@g.us",
          label: "Grupo ficticio de desarrollo",
          isPrimary: true,
          enabled: false,
          authorizedAt: null,
        },
      });
      await database.recording.upsert({
        where: { id: ids.recording },
        update: {
          title: "Grabación ficticia de desarrollo",
          scheduledAt: clock.fromEpoch(Date.parse("2026-08-10T14:00:00.000Z")),
        },
        create: {
          id: ids.recording,
          clientId: ids.client,
          title: "Grabación ficticia de desarrollo",
          scheduledAt: clock.fromEpoch(Date.parse("2026-08-10T14:00:00.000Z")),
          status: "SCHEDULED",
        },
      });
      await database.reminder.upsert({
        where: { id: ids.reminder },
        update: {
          status: "PENDING",
          scheduledFor: clock.fromEpoch(Date.parse("2026-08-09T14:00:00.000Z")),
        },
        create: {
          id: ids.reminder,
          type: "RECORDING_24H",
          clientId: ids.client,
          recordingId: ids.recording,
          scheduledFor: clock.fromEpoch(Date.parse("2026-08-09T14:00:00.000Z")),
          idempotencyKey: "seed:recording:development:2026-08-10T14:00:00.000Z",
        },
      });
      await database.automationSetting.upsert({
        where: { id: ids.settings },
        update: { globalPaused: false },
        create: { id: ids.settings, globalPaused: false },
      });
    });
    process.stdout.write("Development seed applied with fictitious data.\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Unknown seed error"}\n`);
  process.exitCode = 1;
});

import { loadConfig } from "./config/index.js";
import { createLogger } from "./infrastructure/logging/logger.js";
import { createServer } from "./infrastructure/http/server.js";
import type { ReadinessCheck } from "./infrastructure/http/routes/health.js";
import { checkDatabaseConnection, createPrismaClient } from "./infrastructure/database/prisma.js";
import { StatusStore } from "./infrastructure/status/status.js";
import { SystemClock } from "./infrastructure/scheduling/clock.js";
import { PrismaReminderRepository } from "./infrastructure/database/repositories.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const prisma = createPrismaClient(config.databaseUrl);
  const clock = new SystemClock(config.appTimeZone);
  const reminderRepository = new PrismaReminderRepository(prisma);
  const metricsLoader = async () => {
    const current = clock.now();
    return reminderRepository.getMetrics(current, clock.fromEpoch(current.getTime() - 86_400_000));
  };
  const statusStore = new StatusStore(
    {
      service: "totem-reminder-bot",
      version: "0.1.0",
      timeZone: config.appTimeZone,
      whatsapp: {
        enabled: config.whatsapp.enabled,
        dryRun: config.whatsapp.dryRun,
        connection: config.whatsapp.enabled ? "connecting" : "closed",
        sessionValid: !config.whatsapp.enabled,
      },
      worker: {
        enabled: config.worker.enabled,
        lastTickStartedAt: null,
        lastTickDurationMs: null,
        lastTickOutcome: null,
      },
      reminders: {
        pending: 0,
        dueNow: 0,
        retryScheduled: 0,
        needsReview: 0,
        failedLast24h: 0,
        sentLast24h: 0,
      },
      errorsLast1h: 0,
    },
    metricsLoader,
  );

  const readinessChecks: ReadinessCheck[] = [
    { name: "configuration", check: () => Promise.resolve(true) },
    { name: "database", check: async () => checkDatabaseConnection(prisma) },
  ];

  const app = await createServer({
    serviceName: "totem-whatsapp-reminder",
    logLevel: config.logLevel,
    readinessChecks,
    statusStore,
    clock,
  });

  await app.listen({ host: config.http.host, port: config.http.port });

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info({ signal }, "shutting down http server");
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.once("SIGTERM", (signal) => void shutdown(signal));
  process.once("SIGINT", (signal) => void shutdown(signal));
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error("fatal error starting server", error);
  process.exit(1);
});

import { loadConfig } from "./config/index.js";
import { ProcessDueReminders } from "./application/use-cases/process-due-reminders.js";
import { PurgeExpiredRecords } from "./application/use-cases/retention.js";
import { EligibilityService } from "./domain/services/eligibility.js";
import { RetryPolicy } from "./domain/services/retry-policy.js";
import { BusinessWindowService } from "./domain/services/business-window.js";
import { RetentionPolicy } from "./domain/services/retention-policy.js";
import { TemplateRenderer } from "./modules/messaging/renderer.js";
import { createPrismaClient } from "./infrastructure/database/prisma.js";
import {
  PrismaAuditLogger,
  PrismaAutomationSettingsRepository,
  PrismaClientRepository,
  PrismaInvoiceRepository,
  PrismaMessageAttemptRepository,
  PrismaRecordingRepository,
  PrismaReminderRepository,
  PrismaRetentionRepository,
  PrismaTaskRepository,
  PrismaTransactionManager,
} from "./infrastructure/database/repositories.js";
import { UuidV7Generator, SystemRandom } from "./infrastructure/ids.js";
import { SystemClock } from "./infrastructure/scheduling/clock.js";
import { WorkerLoop } from "./infrastructure/scheduling/worker-loop.js";
import { createMessagingGateway } from "./infrastructure/whatsapp/factory.js";
import { createLogger } from "./infrastructure/logging/logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const prisma = createPrismaClient(config.databaseUrl);
  const ids = new UuidV7Generator();
  const clock = new SystemClock(config.appTimeZone);
  const gateway = createMessagingGateway(config);
  const reminders = new PrismaReminderRepository(prisma);
  const processor = new ProcessDueReminders({
    reminders,
    clients: new PrismaClientRepository(prisma),
    recordings: new PrismaRecordingRepository(prisma),
    tasks: new PrismaTaskRepository(prisma),
    invoices: new PrismaInvoiceRepository(prisma),
    settings: new PrismaAutomationSettingsRepository(prisma),
    attempts: new PrismaMessageAttemptRepository(prisma),
    gateway,
    clock,
    ids,
    retry: new RetryPolicy(
      new SystemRandom(),
      config.reminders.retryBaseSeconds,
      config.reminders.retryMaxSeconds,
    ),
    window: new BusinessWindowService(clock),
    tx: new PrismaTransactionManager(prisma),
    renderer: new TemplateRenderer(),
    eligibility: new EligibilityService(),
    audit: new PrismaAuditLogger(prisma, ids),
    workerId: `worker:${globalThis.process.pid ?? "unknown"}:${ids.next()}`,
    batchSize: config.worker.batchSize,
    lockTimeoutMs: config.reminders.lockTimeoutSeconds * 1000,
    staleAfterHours: config.reminders.staleAfterHours,
    dryRunMarkSent: config.reminders.dryRunMarkSent,
  });
  const loop = new WorkerLoop(
    processor,
    config.worker.pollIntervalSeconds * 1000,
    (error: unknown) =>
      logger.error(
        { error: error instanceof Error ? error.name : "UnknownError" },
        "worker tick failed",
      ),
  );
  // M6-08: purga de retención en su propio bucle lento; nunca comparte tick con los envíos.
  const purge = new PurgeExpiredRecords(
    new PrismaRetentionRepository(prisma),
    new RetentionPolicy(clock, config.retention.months),
    clock,
    new PrismaAuditLogger(prisma, ids),
  );
  const retentionLoop = new WorkerLoop(
    {
      execute: async () => {
        const result = await purge.execute();
        if (result.messageAttempts > 0 || result.auditEvents > 0)
          logger.info(
            {
              cutoff: result.cutoff.toISOString(),
              messageAttempts: result.messageAttempts,
              auditEvents: result.auditEvents,
            },
            "retention purge completed",
          );
        return result;
      },
    },
    config.retention.purgeIntervalHours * 3_600_000,
    (error: unknown) =>
      logger.error(
        { error: error instanceof Error ? error.name : "UnknownError" },
        "retention purge failed",
      ),
  );

  await loop.runOnce();
  await retentionLoop
    .runOnce()
    .catch((error: unknown) =>
      logger.error(
        { error: error instanceof Error ? error.name : "UnknownError" },
        "retention purge failed",
      ),
    );
  if (config.worker.enabled) {
    loop.start();
    retentionLoop.start();
  }
  const shutdown = async (): Promise<void> => {
    await loop.stop();
    await retentionLoop.stop();
    await prisma.$disconnect();
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}

main().catch((error: unknown) => {
  process.stderr.write(
    `fatal worker error: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
});

import { loadConfig } from "./config/index.js";
import { createLogger } from "./infrastructure/logging/logger.js";
import { createServer } from "./infrastructure/http/server.js";
import type { ReadinessCheck } from "./infrastructure/http/routes/health.js";
import { checkDatabaseConnection, createPrismaClient } from "./infrastructure/database/prisma.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const prisma = createPrismaClient(config.databaseUrl);

  const readinessChecks: ReadinessCheck[] = [
    { name: "configuration", check: () => Promise.resolve(true) },
    { name: "database", check: async () => checkDatabaseConnection(prisma) },
    { name: "worker", check: () => Promise.resolve(!config.worker.enabled) },
    { name: "whatsapp", check: () => Promise.resolve(!config.whatsapp.enabled) },
  ];

  const app = await createServer({
    serviceName: "totem-whatsapp-reminder",
    logLevel: config.logLevel,
    readinessChecks,
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

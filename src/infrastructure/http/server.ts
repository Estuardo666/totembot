import Fastify, { type FastifyInstance } from "fastify";
import type { Logger } from "pino";

import { REDACT_CENSOR, REDACT_PATHS } from "../logging/redact.js";
import { registerHealthRoutes, type ReadinessCheck } from "./routes/health.js";
import { registerStatusRoute } from "./routes/status.js";
import type { StatusStore } from "../status/status.js";
import type { Clock } from "../../domain/ports/index.js";

export interface CreateServerOptions {
  readonly serviceName: string;
  readonly logLevel: Logger["level"];
  readonly readinessChecks: readonly ReadinessCheck[];
  readonly statusStore?: StatusStore;
  readonly clock: Clock;
}

export async function createServer(options: CreateServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: options.logLevel,
      redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },
    },
  });

  registerHealthRoutes(app, {
    serviceName: options.serviceName,
    readinessChecks: options.readinessChecks,
    now: () => options.clock.now(),
  });
  if (options.statusStore !== undefined) registerStatusRoute(app, options.statusStore);

  return app;
}

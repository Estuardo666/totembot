import pino, { type Logger } from "pino";

import type { AppConfig } from "../../config/index.js";
import { getCorrelationId } from "./correlation.js";
import { REDACT_CENSOR, REDACT_PATHS } from "./redact.js";

export function createLogger(config: Pick<AppConfig, "logLevel" | "nodeEnv">): Logger {
  const baseOptions: pino.LoggerOptions = {
    level: config.logLevel,
    base: {
      app: "totem-whatsapp-reminder",
      env: config.nodeEnv,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: REDACT_PATHS,
      censor: REDACT_CENSOR,
    },
    mixin() {
      const correlationId = getCorrelationId();
      return correlationId === undefined ? {} : { correlationId };
    },
  };

  if (config.nodeEnv !== "development") {
    return pino(baseOptions);
  }

  return pino({
    ...baseOptions,
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:standard" },
    },
  });
}

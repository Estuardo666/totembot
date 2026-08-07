import { z } from "zod";

const booleanFromString = (defaultValue: boolean) =>
  z
    .enum(["true", "false"])
    .default(defaultValue ? "true" : "false")
    .transform((value) => value === "true");

const timeZoneSchema = z.string().refine(
  (value) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  { message: "must be a valid IANA time zone identifier" },
);

const businessHourSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must match HH:MM (24h)");

const commaSeparatedIntegers = z
  .string()
  .default("-3,0,3,7")
  .transform((value): number[] => value.split(",").map((part) => Number.parseInt(part.trim(), 10)))
  .pipe(z.array(z.number().int()).min(1));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_TIME_ZONE: timeZoneSchema.default("America/Guayaquil"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  HTTP_HOST: z.string().min(1).default("127.0.0.1"),
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  DATABASE_URL: z.url({ protocol: /^postgresql?$/ }),

  WHATSAPP_ENABLED: booleanFromString(false),
  WHATSAPP_DRY_RUN: booleanFromString(true),
  WHATSAPP_AUTH_DIRECTORY: z.string().min(1).default("./.local/wa-auth"),
  WHATSAPP_SEND_MIN_DELAY_MS: z.coerce.number().int().nonnegative().default(3000),
  WHATSAPP_SEND_MAX_DELAY_MS: z.coerce.number().int().nonnegative().default(8000),
  WHATSAPP_RECONNECT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),

  WORKER_ENABLED: booleanFromString(false),
  WORKER_POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(25),

  REMINDER_DEFAULT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  REMINDER_LOCK_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(300),
  REMINDER_RETRY_BASE_SECONDS: z.coerce.number().int().positive().default(60),
  REMINDER_RETRY_MAX_SECONDS: z.coerce.number().int().positive().default(3600),
  REMINDER_STALE_AFTER_HOURS: z.coerce.number().int().positive().default(12),
  DRY_RUN_MARK_SENT: booleanFromString(false),

  BUSINESS_HOURS_START: businessHourSchema.default("08:00"),
  BUSINESS_HOURS_END: businessHourSchema.default("18:30"),
  BUSINESS_SEND_ON_SUNDAYS: booleanFromString(false),

  RECORDING_REMINDER_OFFSET_HOURS: z.coerce.number().int().positive().default(24),
  TASK_REVIEW_REMINDER_OFFSET_HOURS: z.coerce.number().int().positive().default(48),
  TASK_REVIEW_MAX_REMINDERS: z.coerce.number().int().positive().default(2),
  INVOICE_REMINDER_OFFSETS_DAYS: commaSeparatedIntegers,
  INVOICE_MAX_REMINDERS: z.coerce.number().int().positive().default(4),
});

export interface AppConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly appTimeZone: string;
  readonly logLevel: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  readonly http: {
    readonly host: string;
    readonly port: number;
  };
  readonly databaseUrl: string;
  readonly whatsapp: {
    readonly enabled: boolean;
    readonly dryRun: boolean;
    readonly authDirectory: string;
    readonly sendMinDelayMs: number;
    readonly sendMaxDelayMs: number;
    readonly reconnectMaxAttempts: number;
  };
  readonly worker: {
    readonly enabled: boolean;
    readonly pollIntervalSeconds: number;
    readonly batchSize: number;
  };
  readonly reminders: {
    readonly defaultMaxAttempts: number;
    readonly lockTimeoutSeconds: number;
    readonly retryBaseSeconds: number;
    readonly retryMaxSeconds: number;
    readonly staleAfterHours: number;
    readonly dryRunMarkSent: boolean;
  };
  readonly businessHours: {
    readonly start: string;
    readonly end: string;
    readonly sendOnSundays: boolean;
  };
  readonly offsets: {
    readonly recordingReminderHours: number;
    readonly taskReviewReminderHours: number;
    readonly taskReviewMaxReminders: number;
    readonly invoiceReminderOffsetsDays: readonly number[];
    readonly invoiceMaxReminders: number;
  };
}

class EnvValidationError extends Error {
  public constructor(issues: readonly string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`,
    );
    this.name = "EnvValidationError";
  }
}

const SENSITIVE_KEYS = new Set(["DATABASE_URL"]);

function describeIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.join(".");
  if (SENSITIVE_KEYS.has(path)) {
    return `${path}: invalid value (redacted)`;
  }
  return `${path}: ${issue.message}`;
}

export function parseEnv(source: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues.map(describeIssue));
  }

  const env = result.data;

  return Object.freeze({
    nodeEnv: env.NODE_ENV,
    appTimeZone: env.APP_TIME_ZONE,
    logLevel: env.LOG_LEVEL,
    http: Object.freeze({
      host: env.HTTP_HOST,
      port: env.HTTP_PORT,
    }),
    databaseUrl: env.DATABASE_URL,
    whatsapp: Object.freeze({
      enabled: env.WHATSAPP_ENABLED,
      dryRun: env.WHATSAPP_DRY_RUN,
      authDirectory: env.WHATSAPP_AUTH_DIRECTORY,
      sendMinDelayMs: env.WHATSAPP_SEND_MIN_DELAY_MS,
      sendMaxDelayMs: env.WHATSAPP_SEND_MAX_DELAY_MS,
      reconnectMaxAttempts: env.WHATSAPP_RECONNECT_MAX_ATTEMPTS,
    }),
    worker: Object.freeze({
      enabled: env.WORKER_ENABLED,
      pollIntervalSeconds: env.WORKER_POLL_INTERVAL_SECONDS,
      batchSize: env.WORKER_BATCH_SIZE,
    }),
    reminders: Object.freeze({
      defaultMaxAttempts: env.REMINDER_DEFAULT_MAX_ATTEMPTS,
      lockTimeoutSeconds: env.REMINDER_LOCK_TIMEOUT_SECONDS,
      retryBaseSeconds: env.REMINDER_RETRY_BASE_SECONDS,
      retryMaxSeconds: env.REMINDER_RETRY_MAX_SECONDS,
      staleAfterHours: env.REMINDER_STALE_AFTER_HOURS,
      dryRunMarkSent: env.DRY_RUN_MARK_SENT,
    }),
    businessHours: Object.freeze({
      start: env.BUSINESS_HOURS_START,
      end: env.BUSINESS_HOURS_END,
      sendOnSundays: env.BUSINESS_SEND_ON_SUNDAYS,
    }),
    offsets: Object.freeze({
      recordingReminderHours: env.RECORDING_REMINDER_OFFSET_HOURS,
      taskReviewReminderHours: env.TASK_REVIEW_REMINDER_OFFSET_HOURS,
      taskReviewMaxReminders: env.TASK_REVIEW_MAX_REMINDERS,
      invoiceReminderOffsetsDays: Object.freeze(env.INVOICE_REMINDER_OFFSETS_DAYS),
      invoiceMaxReminders: env.INVOICE_MAX_REMINDERS,
    }),
  });
}

export { EnvValidationError };

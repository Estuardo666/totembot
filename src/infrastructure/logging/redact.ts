export const REDACTED_FIELD_NAMES = [
  "authorization",
  "cookie",
  "token",
  "password",
  "secret",
  "qr",
  "session",
  "credentials",
  "databaseUrl",
] as const;

function buildPathVariants(field: string): string[] {
  return [field, `*.${field}`, `req.headers.${field}`, `req.body.${field}`, `res.headers.${field}`];
}

export const REDACT_PATHS: string[] = REDACTED_FIELD_NAMES.flatMap(buildPathVariants);

export const REDACT_CENSOR = "[redacted]";

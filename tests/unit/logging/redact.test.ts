import { describe, expect, it } from "vitest";
import pino from "pino";

import { REDACT_CENSOR, REDACT_PATHS } from "../../../src/infrastructure/logging/redact.js";

function loggerToBuffer() {
  const chunks: string[] = [];
  const stream = {
    write(chunk: string) {
      chunks.push(chunk);
    },
  };
  const logger = pino({ redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR } }, stream);
  return { logger, chunks };
}

describe("log redaction", () => {
  it("redacts a fake QR payload", () => {
    const { logger, chunks } = loggerToBuffer();
    logger.info({ qr: "fake-qr-data-not-real" }, "session update");

    const line = JSON.parse(chunks[0] ?? "{}") as Record<string, unknown>;
    expect(line["qr"]).toBe(REDACT_CENSOR);
    expect(JSON.stringify(line)).not.toContain("fake-qr-data-not-real");
  });

  it("redacts fake credentials", () => {
    const { logger, chunks } = loggerToBuffer();
    logger.info({ credentials: { token: "fake-token-123" } }, "auth");

    const line = JSON.parse(chunks[0] ?? "{}") as Record<string, unknown>;
    expect(line["credentials"]).toBe(REDACT_CENSOR);
  });

  it("redacts a fake phone-like session field", () => {
    const { logger, chunks } = loggerToBuffer();
    logger.info({ session: "593900000000@s.whatsapp.net" }, "session");

    const line = JSON.parse(chunks[0] ?? "{}") as Record<string, unknown>;
    expect(line["session"]).toBe(REDACT_CENSOR);
    expect(JSON.stringify(line)).not.toContain("593900000000");
  });
});

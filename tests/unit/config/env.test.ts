import { describe, expect, it } from "vitest";

import { EnvValidationError, parseEnv } from "../../../src/config/env.js";

const validEnv = {
  DATABASE_URL: "postgresql://totem:totem@localhost:5432/totem_bot",
};

describe("parseEnv", () => {
  it("loads valid values", () => {
    const config = parseEnv({
      ...validEnv,
      NODE_ENV: "production",
      HTTP_PORT: "4000",
    });

    expect(config.nodeEnv).toBe("production");
    expect(config.http.port).toBe(4000);
    expect(config.databaseUrl).toBe(validEnv.DATABASE_URL);
  });

  it("applies safe defaults", () => {
    const config = parseEnv(validEnv);

    expect(config.whatsapp.enabled).toBe(false);
    expect(config.whatsapp.dryRun).toBe(true);
    expect(config.worker.enabled).toBe(false);
    expect(config.http.host).toBe("127.0.0.1");
    expect(config.appTimeZone).toBe("America/Guayaquil");
  });

  it("keeps WhatsApp disabled by default even with other overrides", () => {
    const config = parseEnv({ ...validEnv, NODE_ENV: "production" });

    expect(config.whatsapp.enabled).toBe(false);
    expect(config.whatsapp.dryRun).toBe(true);
  });

  it("rejects an invalid port", () => {
    expect(() => parseEnv({ ...validEnv, HTTP_PORT: "not-a-number" })).toThrow(EnvValidationError);
  });

  it("rejects an invalid poll interval", () => {
    expect(() => parseEnv({ ...validEnv, WORKER_POLL_INTERVAL_SECONDS: "-5" })).toThrow(
      EnvValidationError,
    );
  });

  it("rejects an invalid time zone", () => {
    expect(() => parseEnv({ ...validEnv, APP_TIME_ZONE: "Not/AZone" })).toThrow(EnvValidationError);
  });

  it("does not leak the invalid value in the error message", () => {
    try {
      parseEnv({ ...validEnv, DATABASE_URL: "not-a-valid-url-with-secret-token" });
      throw new Error("expected parseEnv to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const message = (error as Error).message;
      expect(message).not.toContain("not-a-valid-url-with-secret-token");
    }
  });
});

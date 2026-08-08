import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { createServer } from "../../../src/infrastructure/http/server.js";
import { StatusStore } from "../../../src/infrastructure/status/status.js";

describe("health routes", () => {
  let app: FastifyInstance;
  let ready = true;
  let statusCalls = 0;

  beforeAll(async () => {
    app = await createServer({
      serviceName: "totem-whatsapp-reminder",
      logLevel: "silent",
      readinessChecks: [{ name: "database", check: () => Promise.resolve(ready) }],
      statusStore: new StatusStore(
        {
          service: "totem-reminder-bot",
          version: "test",
          timeZone: "America/Guayaquil",
          whatsapp: {
            enabled: false,
            dryRun: true,
            connection: "closed",
            sessionValid: true,
          },
          worker: {
            enabled: false,
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
        () => {
          statusCalls += 1;
          return Promise.resolve({
            pending: 3,
            dueNow: 2,
            retryScheduled: 1,
            needsReview: 4,
            failedLast24h: 5,
            sentLast24h: 6,
          });
        },
      ),
      clock: {
        now: () => new Date("2026-08-07T13:00:00.000Z"),
        fromEpoch: (epochMs: number) => new Date(epochMs),
        timeZone: () => "UTC",
      },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns 200 without dependencies", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("totem-whatsapp-reminder");
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
  });

  it("GET /ready returns 200 when checks pass", async () => {
    ready = true;
    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ready");
  });

  it("GET /ready returns 503 when the database is unavailable", async () => {
    ready = false;
    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.status).toBe("not_ready");
  });

  it("does not expose secret-shaped fields", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    const raw = response.body;

    expect(raw).not.toMatch(/password|token|secret/i);
  });

  it("GET /status loads current reminder metrics", async () => {
    const response = await app.inject({ method: "GET", url: "/status" });

    expect(response.statusCode).toBe(200);
    expect(response.json().reminders).toEqual({
      pending: 3,
      dueNow: 2,
      retryScheduled: 1,
      needsReview: 4,
      failedLast24h: 5,
      sentLast24h: 6,
    });
    expect(statusCalls).toBe(1);
  });
});

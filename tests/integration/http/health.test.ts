import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { createServer } from "../../../src/infrastructure/http/server.js";

describe("health routes", () => {
  let app: FastifyInstance;
  let ready = true;

  beforeAll(async () => {
    app = await createServer({
      serviceName: "totem-whatsapp-reminder",
      logLevel: "silent",
      readinessChecks: [{ name: "database", check: () => Promise.resolve(ready) }],
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
});

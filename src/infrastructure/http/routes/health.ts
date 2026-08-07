import type { FastifyInstance } from "fastify";

export interface ReadinessCheck {
  readonly name: string;
  check(): Promise<boolean>;
}

export interface HealthRoutesOptions {
  readonly serviceName: string;
  readonly readinessChecks: readonly ReadinessCheck[];
}

export function registerHealthRoutes(app: FastifyInstance, options: HealthRoutesOptions): void {
  app.get("/health", () => ({
    status: "ok" as const,
    service: options.serviceName,
    timestamp: new Date().toISOString(),
  }));

  app.get("/ready", async (_request, reply) => {
    const results = await Promise.all(
      options.readinessChecks.map(async (check) => {
        const ok = await check.check();
        return [check.name, ok] as const;
      }),
    );

    const checks = Object.fromEntries(
      results.map(([name, ok]) => [name, ok ? "ok" : "unavailable"]),
    );
    const allOk = results.every(([, ok]) => ok);

    reply.code(allOk ? 200 : 503);
    return {
      status: allOk ? ("ready" as const) : ("not_ready" as const),
      checks,
    };
  });
}

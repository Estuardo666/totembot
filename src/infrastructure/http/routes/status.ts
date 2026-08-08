import type { FastifyInstance } from "fastify";
import type { StatusStore } from "../../status/status.js";

export function registerStatusRoute(app: FastifyInstance, store: StatusStore): void {
  app.get("/status", async () => store.readFresh());
}

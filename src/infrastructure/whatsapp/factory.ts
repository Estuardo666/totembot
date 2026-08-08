import type { AppConfig } from "../../config/index.js";
import type { MessagingGateway } from "../../domain/ports/index.js";
import { DryRunMessagingGateway } from "./dry-run-gateway.js";
import { FakeMessagingGateway } from "./fake-gateway.js";

export function createMessagingGateway(config: {
  readonly nodeEnv: AppConfig["nodeEnv"];
  readonly whatsapp: Pick<AppConfig["whatsapp"], "enabled" | "dryRun">;
}): MessagingGateway {
  const fake = new FakeMessagingGateway();
  if (!config.whatsapp.enabled) {
    fake.state = "closed";
    return fake;
  }
  if (config.nodeEnv === "test")
    throw new Error("Real WhatsApp adapter is forbidden in NODE_ENV=test");
  if (config.whatsapp.dryRun) return new DryRunMessagingGateway(fake);
  throw new Error("Real Baileys adapter is OWNER_REQUIRED and is not enabled in this build");
}

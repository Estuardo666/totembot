import { describe, expect, it } from "vitest";
import { createMessagingGateway } from "../../../src/infrastructure/whatsapp/factory.js";

const config = {
  nodeEnv: "development" as const,
  whatsapp: { enabled: false, dryRun: true },
};

describe("messaging gateway factory", () => {
  it("keeps the gateway closed when WhatsApp is disabled", () => {
    expect(createMessagingGateway(config).connectionState()).toBe("closed");
  });

  it("refuses a non-dry-run real adapter until owner approval", () => {
    expect(() =>
      createMessagingGateway({
        nodeEnv: "development",
        whatsapp: { enabled: true, dryRun: false },
      }),
    ).toThrow("OWNER_REQUIRED");
  });
});

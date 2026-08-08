import { describe, expect, it } from "vitest";
import { mapWhatsAppError } from "../../../src/infrastructure/whatsapp/error-mapper.js";

describe("mapWhatsAppError", () => {
  it("maps logout to session invalid", () =>
    expect(mapWhatsAppError(new Error("loggedOut"))).toEqual({
      classification: "SESSION_INVALID",
      code: "WA_SESSION_INVALID",
    }));
  it("maps timeout to transient", () =>
    expect(mapWhatsAppError(new Error("socket timeout"))).toEqual({
      classification: "TRANSIENT",
      code: "WA_TRANSIENT",
    }));
  it("maps unknown failures to permanent", () =>
    expect(mapWhatsAppError(new Error("invalid jid"))).toEqual({
      classification: "PERMANENT",
      code: "WA_PERMANENT",
    }));
});

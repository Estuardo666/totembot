import { describe, expect, it } from "vitest";
import { TemplateRenderer } from "../../../src/modules/messaging/renderer.js";

describe("TemplateRenderer", () => {
  it("renders sanitized recording variables", () => {
    const result = new TemplateRenderer().render("recording.reminder_24h", {
      clientName: " Demo\nCliente ",
      title: "Grabación",
      dateLabel: "martes 4 de agosto de 2026",
      timeLabel: "09:00",
      confirmToken: "CONFIRMO",
    });
    expect(result.text).toContain("Cliente: DemoCliente");
    expect(result.text.length).toBeLessThan(1000);
  });
  it("rejects unknown variables", () => {
    expect(() =>
      new TemplateRenderer().render("invoice.due_today", {
        clientName: "Demo",
        period: "08/2026",
        amountLabel: "USD 10,00",
        dueDateLabel: "hoy",
        unexpected: true,
      }),
    ).toThrow(/Invalid variables/);
  });
});

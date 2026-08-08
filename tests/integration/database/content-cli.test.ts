import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildCliDependencies, runCli, type CliOutput } from "../../../src/cli.js";
import { createPrismaClient } from "../../../src/infrastructure/database/prisma.js";
import type { Invoice, Recording, Task } from "../../../src/domain/entities/index.js";

const databaseUrl = process.env["DATABASE_URL"];
const ids = {
  client: "00000000-0000-7000-8000-000000001401",
  task: "00000000-0000-7000-8000-000000001402",
};

class MemoryOutput implements CliOutput {
  readonly lines: string[] = [];
  writeLine(line: string): void {
    this.lines.push(line);
  }
  json<T>(index = this.lines.length - 1): T {
    return JSON.parse(this.lines[index] ?? "null") as T;
  }
}

describe.skipIf(databaseUrl === undefined)("M5-10 content CLI integration", () => {
  let prisma!: PrismaClient;
  let closeCli!: () => Promise<void>;
  let dependencies!: ReturnType<typeof buildCliDependencies>["dependencies"];

  beforeAll(async () => {
    if (databaseUrl === undefined) return;
    prisma = createPrismaClient(databaseUrl);
    const built = buildCliDependencies();
    dependencies = built.dependencies;
    closeCli = built.close;
    await prisma.client.create({
      data: { id: ids.client, name: "Cliente ficticio M5-10", timeZone: "America/Guayaquil" },
    });
  });

  afterAll(async () => {
    if (databaseUrl === undefined) return;
    await prisma.reminder.deleteMany({ where: { clientId: ids.client } });
    await prisma.task.deleteMany({ where: { clientId: ids.client } });
    await prisma.invoice.deleteMany({ where: { clientId: ids.client } });
    await prisma.recording.deleteMany({ where: { clientId: ids.client } });
    await prisma.automationSetting.deleteMany({ where: { clientId: ids.client } });
    await prisma.client.deleteMany({ where: { id: ids.client } });
    await closeCli();
  });

  it("runs recording, task, and invoice commands through the real repositories", async () => {
    const output = new MemoryOutput();

    await runCli(
      [
        "recording:create",
        ids.client,
        "--title",
        "Grabación CLI de integración",
        "--scheduled-at",
        "2026-08-10T13:00:00.000Z",
        "--location",
        "Estudio ficticio",
      ],
      dependencies,
      output,
    );
    const recording = output.json<Recording>();
    expect(recording.status).toBe("SCHEDULED");
    expect(recording.location).toBe("Estudio ficticio");

    await runCli(
      ["recording:reschedule", recording.id, "--scheduled-at", "2026-08-11T13:00:00.000Z"],
      dependencies,
      output,
    );
    expect(output.json<Recording>().status).toBe("RESCHEDULED");
    await runCli(["recording:cancel", recording.id], dependencies, output);
    expect(output.json<Recording>().status).toBe("CANCELLED");

    await prisma.task.create({
      data: {
        id: ids.task,
        clientId: ids.client,
        title: "Tarea CLI de integración",
        status: "EDITING",
      },
    });
    await runCli(["task:status", ids.task, "--status", "CLIENT_REVIEW"], dependencies, output);
    expect(output.json<Task>().status).toBe("CLIENT_REVIEW");
    await expect(
      prisma.reminder.count({ where: { taskId: ids.task, status: "PENDING" } }),
    ).resolves.toBe(2);

    await runCli(
      [
        "invoice:create",
        ids.client,
        "--period",
        "2026-08",
        "--amount-cents",
        "15000",
        "--due-date",
        "2026-08-10",
      ],
      dependencies,
      output,
    );
    const invoice = output.json<Invoice>();
    expect(invoice.status).toBe("PENDING");
    expect(
      await prisma.reminder.count({ where: { invoiceId: invoice.id, status: "PENDING" } }),
    ).toBe(4);

    await runCli(["invoice:pay", invoice.id], dependencies, output);
    expect(output.json<Invoice>().status).toBe("PAID");
    expect(
      await prisma.reminder.count({ where: { invoiceId: invoice.id, status: "CANCELLED" } }),
    ).toBe(4);
  });
});

import { describe, expect, it } from "vitest";
import { ManageClients, ManageGroups } from "../../../src/application/use-cases/administration.js";
import type { Client, WhatsAppGroup } from "../../../src/domain/entities/index.js";
import type {
  AuditLogger,
  ClientAdministrationRepository,
  ClientRepository,
  IdGenerator,
  WhatsAppGroupRepository,
} from "../../../src/domain/ports/index.js";

class SequentialIds implements IdGenerator {
  private counter = 0;
  next(): string {
    this.counter += 1;
    return `00000000-0000-7000-8000-00000000000${this.counter}`;
  }
}

class MemoryAudit implements AuditLogger {
  readonly events: Array<{ readonly action: string }> = [];
  record(event: { readonly action: string }): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

class MemoryClients implements ClientAdministrationRepository, ClientRepository {
  readonly values: Client[] = [];
  create(client: Client): Promise<void> {
    this.values.push(client);
    return Promise.resolve();
  }
  list(): Promise<readonly Client[]> {
    return Promise.resolve(this.values);
  }
  findById(id: string): Promise<Client | null> {
    return Promise.resolve(this.values.find((client) => client.id === id) ?? null);
  }
  findWithPrimaryGroup(
    id: string,
  ): Promise<{ readonly client: Client; readonly group: WhatsAppGroup | null } | null> {
    const client = this.values.find((value) => value.id === id);
    return Promise.resolve(client === undefined ? null : { client, group: null });
  }
}

class MemoryGroups implements WhatsAppGroupRepository {
  readonly values: WhatsAppGroup[] = [];
  findById(id: string): Promise<WhatsAppGroup | null> {
    return Promise.resolve(this.values.find((group) => group.id === id) ?? null);
  }
  save(group: WhatsAppGroup): Promise<void> {
    const index = this.values.findIndex((value) => value.id === group.id);
    if (index < 0) this.values.push(group);
    else this.values[index] = group;
    return Promise.resolve();
  }
}

describe("administrative client and group use cases", () => {
  it("creates and lists a client without authorizing a WhatsApp group", async () => {
    const clients = new MemoryClients();
    const audit = new MemoryAudit();
    const useCase = new ManageClients(clients, new SequentialIds(), audit);

    const created = await useCase.create({
      name: "Cliente ficticio",
      status: "ACTIVE",
      timeZone: null,
    });

    expect(created.name).toBe("Cliente ficticio");
    expect(await useCase.list()).toEqual([created]);
    expect(audit.events.map((event) => event.action)).toEqual(["CLIENT_CREATED"]);
  });

  it("adds a group with authorizedAt null and authorizes it only explicitly", async () => {
    const clients = new MemoryClients();
    const client = {
      id: "00000000-0000-7000-8000-000000000001",
      name: "Cliente ficticio",
      status: "ACTIVE" as const,
      timeZone: null,
    };
    await clients.create(client);
    const groups = new MemoryGroups();
    const audit = new MemoryAudit();
    const useCase = new ManageGroups(clients, groups, new SequentialIds(), audit);

    const added = await useCase.add({
      clientId: client.id,
      jid: "1234567890@g.us",
      label: "Grupo ficticio",
      isPrimary: true,
      enabled: true,
    });
    expect(added.authorizedAt).toBeNull();

    const authorizedAt = new Date("2026-08-07T13:00:00.000Z");
    const authorized = await useCase.authorize(added.id, authorizedAt);
    expect(authorized.authorizedAt).toEqual(authorizedAt);
    expect(audit.events.map((event) => event.action)).toEqual(["GROUP_ADDED", "GROUP_AUTHORIZED"]);
  });

  it("rejects a non-group JID", async () => {
    const clients = new MemoryClients();
    await clients.create({
      id: "00000000-0000-7000-8000-000000000002",
      name: "Cliente ficticio",
      status: "ACTIVE",
      timeZone: null,
    });
    const useCase = new ManageGroups(
      clients,
      new MemoryGroups(),
      new SequentialIds(),
      new MemoryAudit(),
    );

    await expect(
      useCase.add({
        clientId: "00000000-0000-7000-8000-000000000002",
        jid: "593999999999@s.whatsapp.net",
        label: "No es grupo",
        isPrimary: false,
        enabled: false,
      }),
    ).rejects.toMatchObject({ code: "INVALID_GROUP_JID" });
  });
});

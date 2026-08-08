import { ApplicationError } from "../errors.js";
import type { Client, ClientStatus, WhatsAppGroup } from "../../domain/entities/index.js";
import {
  asGroupJid,
  type AuditLogger,
  type ClientAdministrationRepository,
  type ClientRepository,
  type IdGenerator,
  type WhatsAppGroupRepository,
} from "../../domain/ports/index.js";

export interface CreateClientInput {
  readonly name: string;
  readonly status: ClientStatus;
  readonly timeZone: string | null;
}

export class ManageClients {
  public constructor(
    private readonly clients: ClientAdministrationRepository,
    private readonly ids: IdGenerator,
    private readonly audit: AuditLogger,
  ) {}

  async create(input: CreateClientInput): Promise<Client> {
    const client: Client = {
      id: this.ids.next(),
      name: input.name,
      status: input.status,
      timeZone: input.timeZone,
    };
    await this.clients.create(client);
    await this.audit.record({
      action: "CLIENT_CREATED",
      entityType: "Client",
      entityId: client.id,
      metadata: { status: client.status },
    });
    return client;
  }

  list(status?: ClientStatus): Promise<readonly Client[]> {
    return this.clients.list(status);
  }
}

export interface AddGroupInput {
  readonly clientId: string;
  readonly jid: string;
  readonly label: string;
  readonly isPrimary: boolean;
  readonly enabled: boolean;
}

export class ManageGroups {
  public constructor(
    private readonly clients: ClientRepository,
    private readonly groups: WhatsAppGroupRepository,
    private readonly ids: IdGenerator,
    private readonly audit: AuditLogger,
  ) {}

  async add(input: AddGroupInput): Promise<WhatsAppGroup> {
    if ((await this.clients.findById(input.clientId)) === null) {
      throw new ApplicationError("CLIENT_NOT_FOUND", `Client not found: ${input.clientId}`);
    }
    let jid: string;
    try {
      jid = asGroupJid(input.jid);
    } catch (error: unknown) {
      throw new ApplicationError(
        "INVALID_GROUP_JID",
        error instanceof Error ? error.message : "Only WhatsApp group JIDs are allowed",
      );
    }
    const group: WhatsAppGroup = {
      id: this.ids.next(),
      clientId: input.clientId,
      jid,
      label: input.label,
      isPrimary: input.isPrimary,
      enabled: input.enabled,
      authorizedAt: null,
    };
    await this.groups.save(group);
    await this.audit.record({
      action: "GROUP_ADDED",
      entityType: "WhatsAppGroup",
      entityId: group.id,
      metadata: { clientId: group.clientId, isPrimary: group.isPrimary, enabled: group.enabled },
    });
    return group;
  }

  async authorize(groupId: string, authorizedAt: Date): Promise<WhatsAppGroup> {
    const current = await this.groups.findById(groupId);
    if (current === null) {
      throw new ApplicationError("GROUP_NOT_FOUND", `Group not found: ${groupId}`);
    }
    const group: WhatsAppGroup = { ...current, authorizedAt };
    await this.groups.save(group);
    await this.audit.record({
      action: "GROUP_AUTHORIZED",
      entityType: "WhatsAppGroup",
      entityId: group.id,
      metadata: { authorizedAt: authorizedAt.toISOString() },
    });
    return group;
  }
}

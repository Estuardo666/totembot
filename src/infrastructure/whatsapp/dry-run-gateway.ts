import type { GroupJid, MessagingGateway } from "../../domain/ports/index.js";

export class DryRunMessagingGateway implements MessagingGateway {
  public constructor(private readonly delegate: MessagingGateway) {}
  sendGroupText(_jid: GroupJid, _text: string) {
    return Promise.resolve({ kind: "skipped", reason: "DRY_RUN" } as const);
  }
  connectionState() {
    return this.delegate.connectionState();
  }
  listAuthorizedGroups() {
    return this.delegate.listAuthorizedGroups();
  }
}

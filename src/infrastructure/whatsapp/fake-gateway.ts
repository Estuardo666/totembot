import type { GroupJid, MessagingGateway, SendResult } from "../../domain/ports/index.js";

export interface SentMessage {
  readonly jid: GroupJid;
  readonly text: string;
}

export class FakeMessagingGateway implements MessagingGateway {
  public readonly sentMessages: SentMessage[] = [];
  public nextResult: SendResult = { kind: "sent", providerMessageId: "fake-provider-message" };
  public state: "open" | "connecting" | "closed" | "logged_out" = "open";

  sendGroupText(jid: GroupJid, text: string): Promise<SendResult> {
    if (this.nextResult.kind === "sent") this.sentMessages.push({ jid, text });
    return Promise.resolve(this.nextResult);
  }
  connectionState(): "open" | "connecting" | "closed" | "logged_out" {
    return this.state;
  }
  listAuthorizedGroups(): Promise<
    ReadonlyArray<{ readonly jid: GroupJid; readonly subject: string }>
  > {
    return Promise.resolve([]);
  }
}

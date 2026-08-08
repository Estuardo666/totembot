export type MappedWhatsAppError = {
  readonly classification: "TRANSIENT" | "PERMANENT" | "SESSION_INVALID";
  readonly code: string;
};

export function mapWhatsAppError(error: unknown): MappedWhatsAppError {
  const message = error instanceof Error ? error.message.toLowerCase() : "unknown";
  if (message.includes("loggedout") || message.includes("logged out") || message.includes("401"))
    return { classification: "SESSION_INVALID", code: "WA_SESSION_INVALID" };
  if (message.includes("timeout") || message.includes("socket") || message.includes("rate"))
    return { classification: "TRANSIENT", code: "WA_TRANSIENT" };
  return { classification: "PERMANENT", code: "WA_PERMANENT" };
}

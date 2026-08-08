import type { AuditLogger, Clock, RetentionRepository } from "../../domain/ports/index.js";
import type { RetentionPolicy } from "../../domain/services/retention-policy.js";

export interface PurgeResult {
  readonly cutoff: Date;
  readonly messageAttempts: number;
  readonly auditEvents: number;
}

/**
 * Purga de retención (PRI-04, `docs/DATABASE_DESIGN.md` § 5): elimina `MessageAttempt` y
 * `AuditEvent` anteriores a la ventana de retención. Idempotente: una segunda ejecución
 * sobre el mismo corte no borra nada.
 */
export class PurgeExpiredRecords {
  public constructor(
    private readonly repository: RetentionRepository,
    private readonly policy: RetentionPolicy,
    private readonly clock: Pick<Clock, "now">,
    private readonly audit: AuditLogger,
  ) {}

  async execute(): Promise<PurgeResult> {
    const cutoff = this.policy.cutoff(this.clock.now());
    // Los intentos primero: así el evento de auditoría que escribimos abajo describe una
    // purga ya completa y no se borra a sí mismo en la misma pasada.
    const messageAttempts = await this.repository.purgeMessageAttemptsBefore(cutoff);
    const auditEvents = await this.repository.purgeAuditEventsBefore(cutoff);
    const result: PurgeResult = { cutoff, messageAttempts, auditEvents };
    if (messageAttempts > 0 || auditEvents > 0)
      await this.audit.record({
        action: "RETENTION_PURGED",
        entityType: "Retention",
        metadata: {
          cutoff: cutoff.toISOString(),
          messageAttempts,
          auditEvents,
        },
      });
    return result;
  }
}

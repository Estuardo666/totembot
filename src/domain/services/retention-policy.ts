import type { Clock } from "../ports/index.js";

/**
 * Calcula la frontera de retención (PRI-04): todo lo anterior al corte se purga.
 * Trabaja en UTC a propósito: la retención es una obligación de almacenamiento, no una
 * regla de negocio con zona horaria.
 */
export class RetentionPolicy {
  public constructor(
    private readonly clock: Pick<Clock, "fromEpoch">,
    private readonly months: number,
  ) {
    if (!Number.isInteger(months) || months <= 0)
      throw new Error(`Retention window must be a positive whole number of months: ${months}`);
  }

  cutoff(now: Date): Date {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() - this.months;
    // El día se recorta al último del mes destino (31 de marzo - 1 mes = 28/29 de febrero).
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return this.clock.fromEpoch(
      Date.UTC(
        year,
        month,
        Math.min(now.getUTCDate(), lastDay),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds(),
        now.getUTCMilliseconds(),
      ),
    );
  }
}

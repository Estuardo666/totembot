import { z } from "zod";

export interface MessageTemplate<V> {
  readonly id: string;
  readonly version: number;
  readonly schema: z.ZodType<V>;
  render(vars: V): string;
}

const clean = (value: string, max = 240): string =>
  value
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\r?\n/g, " ")
    .slice(0, max);
const line = (label: string, value: string | undefined): string =>
  value === undefined || value.length === 0 ? "" : `${label}: ${clean(value)}\n`;

const recordingSchema = z
  .object({
    clientName: z.string(),
    title: z.string(),
    dateLabel: z.string(),
    timeLabel: z.string(),
    location: z.string().optional(),
    notes: z.string().optional(),
    confirmToken: z.string(),
  })
  .strict();
const taskSchema = z
  .object({
    clientName: z.string(),
    title: z.string(),
    enteredReviewLabel: z.string(),
    reminderNumber: z.number().int().positive(),
    maxReminders: z.number().int().positive(),
  })
  .strict();
const upcomingSchema = z
  .object({
    clientName: z.string(),
    period: z.string(),
    amountLabel: z.string(),
    dueDateLabel: z.string(),
    daysUntilDue: z.number().int(),
  })
  .strict();
const dueTodaySchema = z
  .object({
    clientName: z.string(),
    period: z.string(),
    amountLabel: z.string(),
    dueDateLabel: z.string(),
  })
  .strict();
const overdueSchema = z
  .object({
    clientName: z.string(),
    period: z.string(),
    amountLabel: z.string(),
    dueDateLabel: z.string(),
    daysOverdue: z.number().int().positive(),
  })
  .strict();

const recording: MessageTemplate<z.infer<typeof recordingSchema>> = {
  id: "recording.reminder_24h",
  version: 1,
  schema: recordingSchema,
  render: (v) =>
    `Totem Mass Media - Recordatorio de grabación\n\nCliente: ${clean(v.clientName)}\nProducción: ${clean(v.title)}\nFecha: ${clean(v.dateLabel)}\nHora: ${clean(v.timeLabel)}\n${line("Lugar", v.location)}${line("Detalles", v.notes)}\nLe recordamos que la grabación está programada para dentro de 24 horas.\nPara confirmar su asistencia, responda a este mensaje con: ${clean(v.confirmToken)}\n\nMensaje automático. Si necesita reprogramar, comuníquelo por este medio.`,
};
const task: MessageTemplate<z.infer<typeof taskSchema>> = {
  id: "task.client_review_48h",
  version: 1,
  schema: taskSchema,
  render: (v) =>
    `Totem Mass Media - Material pendiente de revisión\n\nCliente: ${clean(v.clientName)}\nMaterial: ${clean(v.title)}\nEnviado a revisión: ${clean(v.enteredReviewLabel)}\n\nEl material sigue pendiente de su revisión y aprobación. Cuando pueda, indíquenos si lo aprueba o si requiere cambios, para continuar con la producción.\n\nMensaje automático (${v.reminderNumber} de ${v.maxReminders}).`,
};
const upcoming: MessageTemplate<z.infer<typeof upcomingSchema>> = {
  id: "invoice.upcoming_due",
  version: 1,
  schema: upcomingSchema,
  render: (v) =>
    `Totem Mass Media - Recordatorio de pago\n\nCliente: ${clean(v.clientName)}\nPeriodo: ${clean(v.period)}\nValor: ${clean(v.amountLabel)}\nVence: ${clean(v.dueDateLabel)} (en ${v.daysUntilDue} días)\n\nLe recordamos su pago mensual próximo a vencer. Si ya realizó el pago, por favor ignore este mensaje y compártanos el comprobante.\n\nMensaje automático.`,
};
const dueToday: MessageTemplate<z.infer<typeof dueTodaySchema>> = {
  id: "invoice.due_today",
  version: 1,
  schema: dueTodaySchema,
  render: (v) =>
    `Totem Mass Media - Pago con vencimiento hoy\n\nCliente: ${clean(v.clientName)}\nPeriodo: ${clean(v.period)}\nValor: ${clean(v.amountLabel)}\nVence: hoy, ${clean(v.dueDateLabel)}\n\nLe recordamos que su pago mensual vence el día de hoy. Si ya lo realizó, por favor compártanos el comprobante.\n\nMensaje automático.`,
};
const overdue: MessageTemplate<z.infer<typeof overdueSchema>> = {
  id: "invoice.overdue",
  version: 1,
  schema: overdueSchema,
  render: (v) =>
    `Totem Mass Media - Pago vencido\n\nCliente: ${clean(v.clientName)}\nPeriodo: ${clean(v.period)}\nValor: ${clean(v.amountLabel)}\nVenció: ${clean(v.dueDateLabel)} (hace ${v.daysOverdue} días)\n\nRegistramos su pago mensual como pendiente. Si ya lo realizó, por favor compártanos el comprobante para actualizar nuestro registro.\n\nMensaje automático.`,
};

const expose = <V>(template: MessageTemplate<V>): MessageTemplate<unknown> => ({
  id: template.id,
  version: template.version,
  schema: template.schema,
  render: (vars: unknown) => template.render(template.schema.parse(vars)),
});
export const templates = new Map<string, MessageTemplate<unknown>>([
  [recording.id, expose(recording)],
  [task.id, expose(task)],
  [upcoming.id, expose(upcoming)],
  [dueToday.id, expose(dueToday)],
  [overdue.id, expose(overdue)],
]);
export { clean as sanitizeVariable };

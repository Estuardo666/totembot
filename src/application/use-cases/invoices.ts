import type { AutomationSetting, Invoice, Reminder } from "../../domain/entities/index.js";
import type { Clock, IdGenerator, TransactionManager } from "../../domain/ports/index.js";
import { ReminderSchedulePolicy } from "../../domain/services/schedule-policy.js";

export class MarkInvoicePaid {
  public constructor(
    private readonly tx: TransactionManager,
    private readonly clock: Clock,
  ) {}
  async execute(id: string): Promise<Invoice> {
    return this.tx.runInTransaction(async ({ invoices, reminders }) => {
      const invoice = await invoices.findById(id);
      if (invoice === null) throw new Error(`Invoice not found: ${id}`);
      if (invoice.status === "PAID") return invoice;
      const paid: Invoice = { ...invoice, status: "PAID", paidAt: this.clock.now() };
      const saved = await invoices.saveIfStatus(paid, invoice.status);
      if (!saved) throw new Error(`Invoice changed concurrently: ${id}`);
      await reminders.cancelPendingForSource({ invoiceId: id }, "INVOICE_SETTLED");
      return paid;
    });
  }
}

export class CreateInvoice {
  public constructor(
    private readonly tx: TransactionManager,
    private readonly schedule: ReminderSchedulePolicy,
    private readonly settings: AutomationSetting,
    private readonly ids: IdGenerator,
  ) {}
  async execute(input: {
    readonly clientId: string;
    readonly period: string;
    readonly amountCents: number;
    readonly dueDate: Date;
  }): Promise<Invoice> {
    const invoice: Invoice = {
      id: this.ids.next(),
      clientId: input.clientId,
      period: input.period,
      amountCents: input.amountCents,
      currency: "USD",
      dueDate: input.dueDate,
      status: "PENDING",
      paidAt: null,
      remindersSent: 0,
    };
    await this.tx.runInTransaction(async ({ invoices, reminders }) => {
      await invoices.save(invoice);
      for (const occurrence of this.schedule.invoice(invoice, this.settings)) {
        const reminder: Reminder = {
          id: this.ids.next(),
          type: occurrence.type,
          clientId: invoice.clientId,
          recordingId: null,
          taskId: null,
          invoiceId: invoice.id,
          scheduledFor: occurrence.scheduledFor,
          status: "PENDING",
          attempts: 0,
          maxAttempts: 3,
          claimedAt: null,
          claimedBy: null,
          nextAttemptAt: null,
          sentAt: null,
          idempotencyKey: occurrence.idempotencyKey,
        };
        await reminders.insertIfAbsent(reminder);
      }
    });
    return invoice;
  }
}

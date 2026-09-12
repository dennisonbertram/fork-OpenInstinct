import { z } from "zod";
import type { EveEvalToolCall } from "eve/evals";

const customerSchema = z.object({
  family_name: z.string().min(1),
  given_name: z.string().min(1),
  id: z.string().min(1),
});
const customerReadOutputSchema = z.object({
  body: z
    .object({
      customer: z.unknown().optional(),
      customers: z.array(z.unknown()).optional(),
    })
    .optional(),
  customer: z.unknown().optional(),
  customers: z.array(z.unknown()).optional(),
});
const invoiceRecipientOutputSchema = z.union([
  z.object({ invoices: z.array(z.unknown()) }),
  z.object({ body: z.object({ invoices: z.array(z.unknown()) }) }),
]);
const invoiceRecipientSchema = z.object({
  primary_recipient: z.object({ customer_id: z.string().min(1) }),
  status: z.string(),
});
const reportableInvoiceStatuses = new Set([
  "UNPAID",
  "PARTIALLY_PAID",
  "OVERDUE",
]);

/** True when every invoice recipient id is backed by a returned full customer record. */
export function invoiceRecipientsAreResolved(
  calls: readonly EveEvalToolCall[]
): boolean {
  const invoiceReads = calls
    .filter(
      (call) =>
        call.name === "square__ListInvoices" && call.status === "completed"
    )
    .flatMap((call) => {
      const parsed = invoiceRecipientOutputSchema.safeParse(call.output);
      return parsed.success ? [parsed.data] : [];
    });
  if (invoiceReads.length === 0) return false;

  const invoiceRecipientIds = invoiceReads.flatMap((read) => {
    const invoices = "invoices" in read ? read.invoices : read.body.invoices;
    return invoices.flatMap((invoice) => {
      const recipient = invoiceRecipientSchema.safeParse(invoice);
      return recipient.success &&
        reportableInvoiceStatuses.has(recipient.data.status)
        ? [recipient.data.primary_recipient.customer_id]
        : [];
    });
  });

  const customerIds = new Set(
    calls
      .filter(
        (call) =>
          [
            "square__ListCustomers",
            "square__RetrieveCustomer",
            "square__SearchCustomers",
          ].includes(call.name) && call.status === "completed"
      )
      .flatMap((call) => {
        const parsed = customerReadOutputSchema.safeParse(call.output);
        if (!parsed.success) return [];
        return [
          parsed.data.customer,
          parsed.data.body?.customer,
          ...(parsed.data.customers ?? []),
          ...(parsed.data.body?.customers ?? []),
        ].flatMap((customer) => {
          const parsedCustomer = customerSchema.safeParse(customer);
          return parsedCustomer.success ? [parsedCustomer.data.id] : [];
        });
      })
  );
  return invoiceRecipientIds.every((id) => customerIds.has(id));
}

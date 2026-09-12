import { describe, expect, it } from "vitest";
import type { EveEvalToolCall } from "eve/evals";
import { invoiceRecipientsAreResolved } from "@/evals/square/invoice-customer-resolution";

const margaret = {
  family_name: "Hamilton",
  given_name: "Margaret",
  id: "CUST_MARGARET",
};
function call(
  name: string,
  output: EveEvalToolCall["output"],
  status: EveEvalToolCall["status"] = "completed"
): EveEvalToolCall {
  return { input: {}, name, output, status, turnIndex: 0 };
}
function invoiceCall(customerId = "CUST_MARGARET", status = "UNPAID") {
  return call("square__ListInvoices", {
    invoices: [{ primary_recipient: { customer_id: customerId }, status }],
  });
}

describe("invoiceRecipientsAreResolved", () => {
  it("rejects a missing invoice read", () => {
    expect(invoiceRecipientsAreResolved([])).toBe(false);
  });

  it("rejects a failed invoice read", () => {
    expect(
      invoiceRecipientsAreResolved([
        call("square__ListInvoices", undefined, "failed"),
      ])
    ).toBe(false);
  });

  it("rejects a completed invoice read with an error-shaped result", () => {
    expect(
      invoiceRecipientsAreResolved([
        call("square__ListInvoices", { errors: [{ code: "BAD_REQUEST" }] }),
      ])
    ).toBe(false);
  });

  it("rejects a completed invoice read with malformed output", () => {
    expect(
      invoiceRecipientsAreResolved([call("square__ListInvoices", "invalid")])
    ).toBe(false);
  });

  it("accepts a completed empty invoice list", () => {
    expect(
      invoiceRecipientsAreResolved([
        call("square__ListInvoices", { invoices: [] }),
      ])
    ).toBe(true);
  });

  it("accepts a later usable invoice read after an earlier failed read", () => {
    expect(
      invoiceRecipientsAreResolved([
        call("square__ListInvoices", undefined, "failed"),
        invoiceCall(),
        call("square__RetrieveCustomer", { customer: margaret }),
      ])
    ).toBe(true);
  });

  it("accepts a direct RetrieveCustomer result for an id-only invoice recipient", () => {
    expect(
      invoiceRecipientsAreResolved([
        invoiceCall(),
        call("square__RetrieveCustomer", { customer: margaret }),
      ])
    ).toBe(true);
  });

  it("accepts a body-wrapped invoice result", () => {
    expect(
      invoiceRecipientsAreResolved([
        call("square__ListInvoices", {
          body: {
            invoices: [
              {
                primary_recipient: { customer_id: "CUST_MARGARET" },
                status: "UNPAID",
              },
            ],
          },
        }),
        call("square__RetrieveCustomer", { body: { customer: margaret } }),
      ])
    ).toBe(true);
  });

  it("accepts a matching customer returned on a later list page", () => {
    expect(
      invoiceRecipientsAreResolved([
        invoiceCall(),
        call("square__ListCustomers", {
          body: {
            customers: [
              {
                family_name: "Hopper",
                given_name: "Grace",
                id: "CUST_GRACE",
              },
            ],
          },
        }),
        call("square__ListCustomers", { body: { customers: [margaret] } }),
      ])
    ).toBe(true);
  });

  it("rejects an id-only invoice recipient omitted by a partial customer page", () => {
    expect(
      invoiceRecipientsAreResolved([
        invoiceCall(),
        call("square__ListCustomers", {
          customers: [
            { family_name: "Hopper", given_name: "Grace", id: "CUST_GRACE" },
          ],
        }),
      ])
    ).toBe(false);
  });

  it("does not require a customer lookup for a paid invoice", () => {
    expect(
      invoiceRecipientsAreResolved([invoiceCall("CUST_OTHER", "PAID")])
    ).toBe(true);
  });

  it("does not accept a failed customer call", () => {
    expect(
      invoiceRecipientsAreResolved([
        invoiceCall(),
        {
          ...call("square__RetrieveCustomer", { customer: margaret }),
          status: "failed",
        },
      ])
    ).toBe(false);
  });

  it("accepts a matching full customer alongside an unrelated partial customer", () => {
    expect(
      invoiceRecipientsAreResolved([
        invoiceCall(),
        call("square__ListCustomers", {
          customers: [{ id: "CUST_PARTIAL", given_name: "Partial" }, margaret],
        }),
      ])
    ).toBe(true);
  });
});

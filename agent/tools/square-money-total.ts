import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { resolveModeValue } from "@/agent/lib/mode";

const maximumAmounts = 100;

const supportedCurrencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/u, "Use an uppercase ISO 4217 currency code.")
  .refine(
    isSupportedCurrency,
    "Use a known currency with 0, 2, or 3 decimals."
  );

export const squareMoneyTotalInputSchema = z.strictObject({
  amounts: z
    .array(
      z.strictObject({
        amount: z
          .number()
          .int()
          .refine(
            Number.isSafeInteger,
            "Use a safe integer minor-unit amount."
          ),
        currency: supportedCurrencySchema,
      })
    )
    .min(1, "Provide at least one Money amount.")
    .max(maximumAmounts, `Provide at most ${String(maximumAmounts)} amounts.`),
});

export const squareMoneyTotalOutputSchema = z.object({
  currency: supportedCurrencySchema,
  formatted: z.string(),
  totalMinor: z.number().int(),
});

function isSupportedCurrency(currency: string): boolean {
  if (!Intl.supportedValuesOf("currency").includes(currency)) return false;
  try {
    return [0, 2, 3].includes(currencyFractionDigits(currency));
  } catch {
    return false;
  }
}

function currencyFractionDigits(currency: string): number {
  const decimalPlaces = new Intl.NumberFormat("en-US", {
    currency,
    style: "currency",
  }).resolvedOptions().maximumFractionDigits;
  if (decimalPlaces === undefined) {
    throw new Error("Currency formatting returned no decimal precision.");
  }
  return decimalPlaces;
}

function totalMinorUnits(
  amounts: readonly {
    readonly amount: number;
    readonly currency: string;
  }[]
) {
  let total = 0n;
  for (const { amount } of amounts) total += BigInt(amount);
  const maximumSafeMinor = BigInt(Number.MAX_SAFE_INTEGER);
  if (total > maximumSafeMinor || total < -maximumSafeMinor) {
    throw new Error("The total must remain a safe integer minor-unit amount.");
  }
  return total;
}

function formatMinorUnits(total: bigint, currency: string) {
  const negative = total < 0n;
  const absolute = negative ? -total : total;
  const decimalPlaces = currencyFractionDigits(currency);
  const divisor = 10n ** BigInt(decimalPlaces);
  const whole = absolute / divisor;
  const remainder = absolute % divisor;
  const wholeParts = new Intl.NumberFormat("en-US", {
    currency,
    currencySign: "standard",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    style: "currency",
    useGrouping: true,
  }).formatToParts(whole);
  const finalInteger = wholeParts.findLastIndex(
    (part) => part.type === "integer"
  );
  if (finalInteger < 0)
    throw new Error("Currency formatting returned no integer part.");
  const decimal = remainder.toString().padStart(decimalPlaces, "0");
  const formatted = wholeParts
    .map((part, index) =>
      index === finalInteger && decimalPlaces > 0
        ? `${part.value}.${decimal}`
        : part.value
    )
    .join("");
  return `${negative ? "-" : ""}${formatted}`;
}

export const squareMoneyTotal = defineTool({
  description:
    "Sum exact Square Money minor-unit amounts in one supported currency and return a formatted total. Use the returned formatted value verbatim for an aggregate.",
  inputSchema: squareMoneyTotalInputSchema,
  outputSchema: squareMoneyTotalOutputSchema,
  execute({ amounts }) {
    const [first] = amounts;
    if (!first) throw new Error("Provide at least one Money amount.");
    if (amounts.some(({ currency }) => currency !== first.currency)) {
      throw new Error("All Money amounts must use the same currency.");
    }
    const total = totalMinorUnits(amounts);
    return {
      currency: first.currency,
      formatted: formatMinorUnits(total, first.currency),
      totalMinor: Number(total),
    };
  },
});

export default defineDynamic({
  events: {
    "turn.started": (_event, context) =>
      resolveModeValue(context, {
        interactive: { "square-money-total": squareMoneyTotal },
        "scheduled-worker": { "square-money-total": squareMoneyTotal },
      }),
  },
});

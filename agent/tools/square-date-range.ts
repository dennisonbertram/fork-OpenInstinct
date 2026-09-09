import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { resolveModeValue } from "@/agent/lib/mode";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Use a calendar date in YYYY-MM-DD form.")
  .refine((date) => {
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    const day = Number(date.slice(8, 10));
    const candidate = new Date(Date.UTC(year, month - 1, day));
    return (
      candidate.getUTCFullYear() === year &&
      candidate.getUTCMonth() === month - 1 &&
      candidate.getUTCDate() === day
    );
  }, "Use a real calendar date.");

const timezoneSchema = z
  .string()
  .min(1)
  .refine(
    (timezone) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
        return true;
      } catch {
        return false;
      }
    },
    { message: "Use a valid IANA timezone." }
  );

export const squareDateRangeInputSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }).optional(),
  date: dateSchema,
  timezone: timezoneSchema,
});

export const squareDateRangeOutputSchema = z.object({
  endAt: z.iso.datetime({ offset: true }),
  startAt: z.iso.datetime({ offset: true }),
  timezone: z.string(),
});

interface ZonedParts {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly month: number;
  readonly second: number;
  readonly year: number;
}

function zonedParts(at: number, timezone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric",
  });
  const parts = formatter.formatToParts(new Date(at));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0";
  return {
    day: Number(value("day")),
    hour: Number(value("hour")) % 24,
    minute: Number(value("minute")),
    month: Number(value("month")),
    second: Number(value("second")),
    year: Number(value("year")),
  };
}

function zoneOffset(at: number, timezone: string) {
  const parts = zonedParts(at, timezone);
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    ) - at
  );
}

function localMidnight(date: string, timezone: string) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const naive = Date.UTC(year, month - 1, day);
  const firstPass = naive - zoneOffset(naive, timezone);
  const resolved = naive - zoneOffset(firstPass, timezone);
  const readBack = zonedParts(resolved, timezone);
  if (
    readBack.year !== year ||
    readBack.month !== month ||
    readBack.day !== day ||
    readBack.hour !== 0 ||
    readBack.minute !== 0
  ) {
    throw new Error(`The local midnight does not exist in ${timezone}.`);
  }
  return resolved;
}

function nextCalendarDate(date: string) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export const squareDateRange = defineTool({
  description:
    "Derive the inclusive UTC start and end timestamps for a Square lookup on a local calendar date. Use the user's IANA timezone so daylight-saving transitions are handled correctly. An optional as-of timestamp clamps the end of the range.",
  inputSchema: squareDateRangeInputSchema,
  outputSchema: squareDateRangeOutputSchema,
  execute(input) {
    const start = localMidnight(input.date, input.timezone);
    const nextStart = localMidnight(
      nextCalendarDate(input.date),
      input.timezone
    );
    const asOf = input.asOf ? Date.parse(input.asOf) : undefined;
    const end = Math.min(nextStart - 1, asOf ?? Number.POSITIVE_INFINITY);
    if (end < start) throw new Error("asOf must not be before the local date.");
    return {
      endAt: new Date(end).toISOString(),
      startAt: new Date(start).toISOString(),
      timezone: input.timezone,
    };
  },
});

export default defineDynamic({
  events: {
    "turn.started": (_event, context) =>
      resolveModeValue(context, {
        interactive: { "square-date-range": squareDateRange },
        "scheduled-worker": { "square-date-range": squareDateRange },
      }),
  },
});

import { wrapLanguageModel, type ModelMessage } from "ai";
import { z } from "zod";
import type { finalDeliveryStatus } from "./message-delivery";

/**
 * An "[Agents]" announcement, matched by its shape rather than its first word.
 *
 * eve renders it as the label, a newline, then an `<agents>` element
 * (`harness/handles/prompt.js`). Matching only the label would let a user whose
 * own message happens to start with "[Agents]" be discarded as framework text.
 */
const agentsNotePattern = /^\[Agents\]\n<agents[\s>]/u;

const taskStateLabel = "[Task state]\n";

/** A message eve could have authored: plain text riding the USER role. */
const textUserMessageSchema = z.object({
  content: z.string(),
  role: z.literal("user"),
});

/**
 * The cohort listing eve puts after the "[Task state]" label: the JSON
 * `{ tasks: [...] }` that `tasks/delivery-context.js` serialises.
 */
const taskCohortListingSchema = z.object({ tasks: z.array(z.unknown()) });

/**
 * Whether eve, not the user, authored this message.
 *
 * Both of eve's runtime-authored notes ride the USER role, and neither label is
 * exported from an `eve/...` public path, so their text is all there is to go
 * on. The shape is checked as well as the label so a user's own message cannot
 * be mistaken for framework text by opening with the same words: the task note
 * is the label followed by the JSON cohort listing that
 * `tasks/delivery-context.js` emits.
 */
function isFrameworkNote(message: ModelMessage | undefined): boolean {
  const note = textUserMessageSchema.safeParse(message);
  if (!note.success) return false;
  const { content } = note.data;
  if (agentsNotePattern.test(content)) return true;
  if (!content.startsWith(taskStateLabel)) return false;
  try {
    return taskCohortListingSchema.safeParse(
      JSON.parse(content.slice(taskStateLabel.length))
    ).success;
  } catch {
    return false;
  }
}

/**
 * Whether this turn is carrying out a request rather than only owing a report.
 *
 * Reading just the newest message was wrong in both directions, and an outside
 * review caught both against the installed eve:
 *
 * - A background-task wake does not end with its "[Task state]" note.
 *   `harness/tool-loop.js` appends the turn input's `context` entries first and
 *   its `message` after them, so the wake reads as the note followed by an
 *   unlabelled "Background task ... is completed." notification. Judging by the
 *   last message alone called the wake a new user request -- and the wake is
 *   the one turn that exists to deliver the report it was then not forced to
 *   send.
 * - An "[Agents]" announcement can be appended after a tool result while the
 *   user's request is still mid-flight. Judging by the last message alone
 *   called that "no request pending" and forced a report in place of the call
 *   the request still needed.
 *
 * So the whole trailing run of user messages is examined. If any message in it
 * is a framework note, eve wrote the run and what precedes it decides: a tool
 * result means the user's request is still in flight.
 */
export function userRequestPendingIn(
  messages: readonly ModelMessage[]
): boolean {
  let index = messages.length - 1;
  let frameworkAuthored = false;
  while (index >= 0 && messages[index]?.role === "user") {
    if (isFrameworkNote(messages[index])) frameworkAuthored = true;
    index -= 1;
  }
  if (frameworkAuthored) return messages[index]?.role === "tool";
  const newest = messages.at(-1);
  return newest?.role === "user" || newest?.role === "tool";
}

type DeliveryStatus = ReturnType<typeof finalDeliveryStatus>;

interface InteractiveDeliveryGuardContext {
  readonly channelKind: string | undefined;
  readonly deliveryStatus: DeliveryStatus;
  readonly mode: string | undefined;
  /**
   * Whether a written completion summary is owed for settled background work.
   * When it is, a reaction cannot answer the turn, so the guard names the one
   * tool that can instead of leaving the model a choice.
   */
  readonly reportOwed?: boolean;
  /**
   * Whether this turn exists to carry out a request rather than only to
   * deliver an owed report (e.g. a wake with no new user message). See
   * `userRequestPendingIn`, which derives it.
   */
  readonly userRequestPending?: boolean;
}

export function deliveryToolChoiceForInteractiveTurn({
  channelKind,
  deliveryStatus,
  mode,
  reportOwed = false,
  userRequestPending = false,
}: InteractiveDeliveryGuardContext) {
  if (
    (channelKind !== "channel:linq" &&
      channelKind !== "channel:sendblue" &&
      channelKind !== "channel:eve") ||
    mode === "scheduled-report" ||
    deliveryStatus !== undefined
  )
    return undefined;

  // An owed report must not force send_message as the first and only action
  // of a new user request; the debt stays owed and is discharged later. It
  // still forces send_message when there is no pending user request (e.g. a
  // wake with nothing new to act on).
  return reportOwed && !userRequestPending
    ? ({ type: "tool", toolName: "send_message" } as const)
    : ({ type: "required" } as const);
}

export function wrapInteractiveDeliveryGuard(
  model: Parameters<typeof wrapLanguageModel>[0]["model"],
  toolChoice: ReturnType<typeof deliveryToolChoiceForInteractiveTurn>
) {
  if (toolChoice === undefined) return model;

  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v4",
      transformParams: async ({ params }) => ({ ...params, toolChoice }),
    },
  });
}

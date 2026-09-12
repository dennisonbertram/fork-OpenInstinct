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
 * The unlabelled notification eve sends when a background task settles, needs
 * input, reports an update, or needs authorization.
 *
 * `formatTaskNotification` in `execution/tasks/child/steps.js` writes every one
 * of these, and none of them carries a label -- so without this the wake that
 * exists to deliver a report reads as a new user request.
 */
const taskNotificationPattern =
  /^Background task \S+ (?:\([^)]*\) (?:is completed\.|is cancelled\.|failed\.|needs input\.|update: )|needs authorization\.)/u;

/**
 * Whether eve, not the user, authored this message.
 *
 * eve's runtime-authored text rides the USER role and none of it is exported
 * from an `eve/...` public path, so its wording is all there is to go on. Each
 * form is matched by its shape, not just its opening words, so a user's own
 * message cannot be discarded for starting the same way: the task note is its
 * label followed by the JSON cohort listing `tasks/delivery-context.js`
 * serialises, and the announcement is its label followed by an `<agents>`
 * element.
 */
function isFrameworkNote(message: ModelMessage | undefined): boolean {
  const note = textUserMessageSchema.safeParse(message);
  if (!note.success) return false;
  const { content } = note.data;
  if (agentsNotePattern.test(content)) return true;
  if (taskNotificationPattern.test(content)) return true;
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
 * Position alone cannot separate the two, because eve writes on both sides of
 * the user's message: `harness/tool-loop.js` pushes an "[Agents]" announcement
 * onto the history BEFORE appending the turn's own input, so a new request from
 * someone with a worker parked arrives as the announcement followed by their
 * words. So the whole trailing run of user-role messages is examined and the
 * question asked of its contents: is any message in it something eve did not
 * write? That message is the request.
 *
 * When none of them is -- eve wrote the whole run, or there was no trailing
 * user message at all -- what sits underneath decides. A tool result there
 * means a request is already running and still has calls to make.
 */
export function userRequestPendingIn(
  messages: readonly ModelMessage[]
): boolean {
  let index = messages.length - 1;
  while (index >= 0 && messages[index]?.role === "user") {
    if (!isFrameworkNote(messages[index])) return true;
    index -= 1;
  }
  return messages[index]?.role === "tool";
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

import { wrapLanguageModel, type ModelMessage } from "ai";
import { z } from "zod";
import type { finalDeliveryStatus } from "./message-delivery";

/**
 * An "[Agents]" announcement, matched by its shape rather than its first word.
 *
 * eve renders exactly the label, a newline, and an `<agents>` element whose
 * opening tag has no attributes (`harness/handles/prompt.js`; the empty case is
 * `[Agents]\n<agents>\n</agents>`). The closing tag is required too, because a
 * looser match let a person's own message impersonate the note simply by
 * opening with "[Agents]\n<agents> ..." -- which SendBlue's inbound path
 * delivers verbatim.
 */
const agentsNotePattern = /^\[Agents\]\n<agents>\n[\S\s]*<\/agents>$/u;

const taskStateLabel = "[Task state]\n";

/** A message eve could have authored: plain text riding the USER role. */
const textUserMessageSchema = z.object({
  content: z.string(),
  role: z.literal("user"),
});

/**
 * The cohort listing eve puts after the "[Task state]" label.
 *
 * Every field `projectTaskCohort` emits, and nothing else: strict, because a
 * permissive object accepted `{"tasks":[],"request":"..."}` -- a listing shape
 * with a person's request smuggled alongside it, which would then be discarded
 * as framework text.
 */
const taskCohortListingSchema = z.strictObject({
  tasks: z.array(
    z.strictObject({
      name: z.string(),
      output: z.unknown().optional(),
      status: z.string(),
      taskId: z.string(),
    })
  ),
});

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
 * Whether this message is eve telling the parent about background task
 * activity: the "[Task state]" cohort listing, or one of the notifications
 * that accompanies it.
 *
 * Its presence in a turn's own messages is what marks the turn a task wake,
 * which is the turn that exists to deliver an owed report.
 */
function isTaskDeliveryNote(content: string): boolean {
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
 * What eve's own runtime-authored text this message is, if it is any of it.
 *
 * eve's notes ride the USER role and none of their wording is exported from an
 * `eve/...` public path, so their text is all there is to go on. Each form is
 * matched by its whole shape rather than its opening words: matching a label
 * alone would let a person's own message be discarded for starting the same
 * way, and SendBlue delivers their text verbatim.
 */
function frameworkNoteKind(
  message: ModelMessage | undefined
): "agents" | "task-delivery" | undefined {
  const note = textUserMessageSchema.safeParse(message);
  if (!note.success) return undefined;
  const { content } = note.data;
  if (agentsNotePattern.test(content)) return "agents";
  return isTaskDeliveryNote(content) ? "task-delivery" : undefined;
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
 * words. So the whole trailing run of user-role messages is read, and its
 * contents answer in this order:
 *
 * 1. A message eve did not write is the request. Nothing outranks it.
 * 2. Otherwise a task note or notification marks this turn a wake -- the turn
 *    that exists to deliver the owed report, and nothing else.
 * 3. Otherwise only what sits underneath is left to go on, and a tool result
 *    there means a request is already running with calls still to make.
 *
 * Step 2 has to outrank step 3, because a tool result underneath does not
 * always belong to a live request: eve parks a turn that failed recoverably
 * without appending an assistant message, so the receipt of the very lookup
 * being reported can still be the newest thing under the wake.
 */
export function userRequestPendingIn(
  messages: readonly ModelMessage[]
): boolean {
  let index = messages.length - 1;
  let taskWake = false;
  while (index >= 0 && messages[index]?.role === "user") {
    const kind = frameworkNoteKind(messages[index]);
    if (kind === undefined) return true;
    if (kind === "task-delivery") taskWake = true;
    index -= 1;
  }
  if (taskWake) return false;
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

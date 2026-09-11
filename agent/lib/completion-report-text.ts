import {
  extractImageArtifactMarkdownReferences,
  stripImageArtifactMarkdownReferences,
} from "@/agent/lib/browser-image-artifact/markdown";
import {
  taskRecords,
  type BoundedFact,
  type TaskRecord,
} from "@/agent/lib/completion-obligations";
import { recoveryProgress } from "@/agent/lib/recovery-progress";

/**
 * The part of a completion summary the records can vouch for.
 *
 * This exists because of a failure observed in production. A guard required the
 * shape of a final message -- a message kind, non-empty text, `final: true` --
 * and the model satisfied that shape with "i'm checking a public time source
 * for Tokyo now.", which reported nothing about the settled work and described
 * work that had not been started. Marking it final closed the turn, so a
 * statement the records did not support stood in for the summary.
 *
 * A shape check cannot fix that. It can see that text exists, never what the
 * text says, and a model that wants to say something else will simply set
 * `final` on whatever it wanted to say. So the facts stop depending on the
 * model's cooperation: this renders them, and `reportWithRecordedFacts` carries
 * them alongside whatever the model wrote.
 *
 * **Outcomes first, then what is still unknown.** Every settled task's status
 * appears, always, before any supporting claim, and the unresolved remainder
 * comes from `recoveryProgress` rather than being written here -- that module
 * already decides what the records do and do not establish, and a second
 * opinion about the same records would be a second source of truth. An earlier version rendered only the facts, so a failed
 * task whose facts held an observed checkpoint read as a confirmed success and
 * a fourth task's failure could be squeezed out by three earlier successes. A
 * report that can hide a failure is worse than no report.
 *
 * What this honestly guarantees is narrow, and worth stating plainly. Every
 * settled task's outcome reaches the user, tagged with the request it belongs
 * to, with anything that did not complete named first -- across the whole batch,
 * not within each cohort -- so a length limit cannot hide it. Supporting claims are carried
 * whole or not at all, and the ones that did not fit are counted rather than
 * shortened -- a shortened claim can say the opposite of what was recorded. It does not make the model's own
 * sentences true, and it does not make the records true -- a worker's claim
 * carried here is reproduced, not verified.
 */

/** The most supporting claims one report will name, across the whole message. */
const maximumClaims = 3;
/**
 * The most room supporting claims may take in one message.
 *
 * One budget for the whole message, not one per cohort. Rendering each cohort
 * separately and joining them produced 35,462 characters against the channel's
 * 20,000 limit -- which the channel rejects outright, after the obligations were
 * already bound. Appending cohort by cohort instead kept only the last four and
 * dropped the rest, which is worse: an obligation discharged by a message that
 * never mentions it.
 */
const maximumClaimBudget = 4_000;
/** What the channel accepts, so a carried report can never make a send invalid. */
const maximumMessageLength = 20_000;
/**
 * The most of an identifier one outcome shows.
 *
 * Outcomes are never dropped, so their total length has to be bounded by
 * something other than goodwill. Task and cohort ids are validated for shape but
 * not for length, and 64 outcomes built from 150-character ids came to 20,310
 * characters on their own -- past the channel limit before a single claim was
 * added, which the channel rejects after the obligations are already bound.
 *
 * Shortening an identifier is safe in the way shortening a claim is not. An id
 * is a label with no internal meaning to reverse; a sentence whose middle holds
 * "not" becomes its own opposite. Two shortened ids can look alike, and that is
 * visible to a reader, where an unsendable message is not. Eve's own ids are
 * well inside this, so in practice nothing is shortened at all.
 */
const maximumIdentifierLength = 40;

function shortIdentifier(identifier: string) {
  return identifier.length <= maximumIdentifierLength
    ? identifier
    : `${identifier.slice(0, maximumIdentifierLength)}…`;
}

function corroborated(fact: BoundedFact) {
  return fact.evidence === "observed" || fact.evidence === "executor_receipt";
}

/** Sorts anything that did not complete ahead of anything that did. */
function completedLast(task: TaskRecord) {
  return task.terminal?.status === "completed" ? 1 : 0;
}

function outcomeOf(task: TaskRecord) {
  switch (task.terminal?.status) {
    case "completed":
      return "finished";
    case "failed":
      return "failed";
    case "cancelled":
      return "was cancelled";
    default:
      return "has not reported";
  }
}

function provenanceOf(fact: BoundedFact) {
  if (corroborated(fact)) return "confirmed";
  return fact.evidence === "worker_assertion"
    ? "reported by the worker, not confirmed"
    : "recorded with no stated source";
}

/**
 * Renders what the records hold for every cohort this message answers.
 *
 * Outcomes and uncertainty are reserved first and are never trimmed; supporting
 * claims fill what is left and the ones that did not fit are counted. Failures
 * are ranked ahead of successes across the entire batch, because bad news last
 * is bad news a length limit can remove.
 *
 * Keyed by cohort rather than by re-asking the policy, because the caller binds
 * the obligation before composing: by then the cohorts are `delivery_pending`
 * and the policy would correctly say nothing is owed.
 */
export function completionReportText(
  cohortIds: readonly string[]
): string | undefined {
  const members = cohortIds.flatMap((cohortId) =>
    taskRecords(cohortId).map((task) => ({ cohortId, task }))
  );
  if (members.length === 0) return undefined;

  // Every task's outcome, always, and tagged with the request it belongs to:
  // one message about several requests is only useful if a reader can tell
  // which outcome is which.
  const outcomes = members
    .toSorted(
      (left, right) => completedLast(left.task) - completedLast(right.task)
    )
    .map(
      (member) =>
        `${shortIdentifier(member.cohortId)}/${shortIdentifier(member.task.taskId)} ${outcomeOf(member.task)}`
    )
    .join("; ");

  const facts = members.flatMap((member) => member.task.terminal?.facts ?? []);
  const ordered = [
    ...facts.filter((fact) => corroborated(fact)),
    ...facts.filter((fact) => fact.evidence === "worker_assertion"),
    ...facts.filter((fact) => fact.evidence === "unknown"),
  ];

  // Whole or not at all. Shortening a claim can reverse it -- a sentence whose
  // middle holds "not" becomes its own opposite, and a reader cannot tell it
  // was shortened. Omission is visible; mutation is not.
  const shown: BoundedFact[] = [];
  let spent = 0;
  for (const fact of ordered) {
    if (shown.length >= maximumClaims) break;
    if (spent + fact.claim.length > maximumClaimBudget) continue;
    // The channel removes artifact image markdown on its way out, and a claim
    // is not safe from that: "The order was ![not](/artifacts/...) submitted"
    // arrives as "The order was  submitted", which is the opposite of what was
    // recorded. Nothing here can carry such a claim intact, so it is omitted and
    // counted with the rest that did not fit.
    if (extractImageArtifactMarkdownReferences(fact.claim).length > 0) continue;
    shown.push(fact);
    spent += fact.claim.length;
  }

  const lines = [`What the records hold: ${outcomes}.`];
  for (const fact of shown) {
    lines.push(`${fact.claim} (${provenanceOf(fact)}).`);
  }
  if (ordered.length > shown.length) {
    lines.push(
      `${String(ordered.length - shown.length)} further recorded claims are not shown here.`
    );
  }
  if (facts.length === 0) {
    lines.push("There is no recorded evidence of what the work achieved.");
  }
  // What the records leave unresolved, in the words of the module that decides
  // it, for each request separately. Empty for a corroborated completion, so
  // nothing invents a doubt the records do not support.
  //
  // Each line names its request. Untagged, two requests in one message produce
  // "an action was dispatched and its outcome was never confirmed" next to "no
  // stopped part left a dispatch unconfirmed", and a reader cannot tell which
  // request holds the action that must not be repeated.
  for (const cohortId of cohortIds) {
    for (const line of recoveryProgress({ turnId: cohortId })
      .unknownRemainder) {
      lines.push(`${shortIdentifier(cohortId)}: ${line}`);
    }
  }
  return lines.join(" ");
}

/**
 * The text to actually deliver: what the model wrote, carrying the recorded
 * facts with it.
 *
 * The model keeps its own words. It does not get to decide whether the records
 * reach the user, which is the whole point -- the production failure was a
 * message that kept its words and dropped the facts.
 *
 * Two things it refuses to assume. That a report appearing anywhere in the
 * model's text will be seen: the channel strips artifact image markdown before
 * sending, so the check runs against the stripped text. And that a longer
 * message is always deliverable: the records are the obligation, so the model's
 * words are dropped whole rather than cut when there is no room.
 */
export function reportWithRecordedFacts(
  cohortIds: readonly string[],
  modelText: string
): string {
  const report = completionReportText(cohortIds);
  if (report === undefined || report.length === 0) return modelText;

  const written = modelText.trim();
  if (stripImageArtifactMarkdownReferences(written).includes(report)) {
    return modelText;
  }
  if (written.length === 0) return report;

  const separator = "\n\n";
  const room = maximumMessageLength - report.length - separator.length;
  if (room <= 0) return report;
  return written.length <= room ? `${written}${separator}${report}` : report;
}

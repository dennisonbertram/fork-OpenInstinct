import { stripImageArtifactMarkdownReferences } from "@/agent/lib/browser-image-artifact/markdown";
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
 * settled task's outcome reaches the user, with anything that did not complete
 * named first so a length limit cannot hide it. Supporting claims are carried
 * whole or not at all, and the ones that did not fit are counted rather than
 * shortened -- a shortened claim can say the opposite of what was recorded. It does not make the model's own
 * sentences true, and it does not make the records true -- a worker's claim
 * carried here is reproduced, not verified.
 */

/** The most supporting claims one report will name, across the whole message. */
const maximumClaims = 3;
/** The most room supporting claims may take, leaving space for the rest. */
const maximumClaimBudget = 4_000;
/** What the channel accepts, so a carried report can never make a send invalid. */
const maximumMessageLength = 20_000;

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
 * Renders what the records hold for one cohort.
 *
 * Keyed by cohort rather than by re-asking the policy, because the caller binds
 * the obligation before composing: by then the cohort is `delivery_pending` and
 * the policy would correctly say nothing is owed, so re-deriving it here would
 * silently drop every fact.
 */
export function completionReportText(cohortId: string): string | undefined {
  const tasks = taskRecords(cohortId);
  if (tasks.length === 0) return undefined;

  // Every task's outcome, always, and anything that did not complete comes
  // first. Trimming this is how a failure disappears behind an earlier success,
  // and ordering it this way means even a truncated report keeps the bad news.
  const outcomes = tasks
    .toSorted((left, right) => completedLast(left) - completedLast(right))
    .map((task) => `${task.taskId} ${outcomeOf(task)}`)
    .join("; ");

  const facts = tasks.flatMap((task) => task.terminal?.facts ?? []);
  // Corroborated claims first, then the worker's own word, then unattributed.
  const ordered = [
    ...facts.filter((fact) => corroborated(fact)),
    ...facts.filter((fact) => fact.evidence === "worker_assertion"),
    ...facts.filter((fact) => fact.evidence === "unknown"),
  ];
  // Whole or not at all. Shortening a claim can reverse it -- a sentence whose
  // middle holds "not" becomes its own opposite, and a reader cannot tell it was
  // shortened. Omission is visible; mutation is not.
  const shown: BoundedFact[] = [];
  let spent = 0;
  for (const fact of ordered) {
    if (shown.length >= maximumClaims) break;
    if (spent + fact.claim.length > maximumClaimBudget) continue;
    shown.push(fact);
    spent += fact.claim.length;
  }

  const lines = [`What the records hold: ${outcomes}.`];
  for (const fact of shown) {
    lines.push(`${fact.claim} (${provenanceOf(fact)}).`);
  }
  if (ordered.length > shown.length) {
    // Said rather than silently dropped, so nobody reads the list as complete.
    lines.push(
      `${String(ordered.length - shown.length)} further recorded claims are not shown here.`
    );
  }
  if (facts.length === 0) {
    lines.push("There is no recorded evidence of what the work achieved.");
  }
  // What the records leave unresolved, in the words of the module that decides
  // it. Empty for a corroborated completion, so nothing invents a doubt that
  // the records do not support.
  lines.push(...recoveryProgress({ turnId: cohortId }).unknownRemainder);
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
 * sending, so a report hidden in an image reference reaches nobody, and the
 * check runs against the stripped text. And that a longer message is always
 * deliverable: text is capped at both ends, so the model's own words are
 * shortened to make room rather than letting the send be rejected after the
 * obligation was already bound.
 */
export function reportWithRecordedFacts(
  cohortId: string,
  modelText: string
): string {
  const report = completionReportText(cohortId);
  if (report === undefined || report.length === 0) return modelText;

  const written = modelText.trim();
  // Checked against what survives the channel, not against what the model sent.
  if (stripImageArtifactMarkdownReferences(written).includes(report)) {
    return modelText;
  }
  if (written.length === 0) return report;

  const separator = "\n\n";
  const room = maximumMessageLength - report.length - separator.length;
  // The records alone may fill the message. Carrying them is the obligation, so
  // the model's words are what gives way -- and they are dropped whole rather
  // than cut, for the same reason a claim is.
  if (room <= 0) return report;
  return written.length <= room ? `${written}${separator}${report}` : report;
}

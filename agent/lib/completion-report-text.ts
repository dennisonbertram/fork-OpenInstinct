import { stripImageArtifactMarkdownReferences } from "@/agent/lib/browser-image-artifact/markdown";
import {
  taskRecords,
  type BoundedFact,
  type TaskRecord,
} from "@/agent/lib/completion-obligations";

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
 * **Outcomes first.** Every settled task's status appears, always, before any
 * supporting claim. An earlier version rendered only the facts, so a failed
 * task whose facts held an observed checkpoint read as a confirmed success and
 * a fourth task's failure could be squeezed out by three earlier successes. A
 * report that can hide a failure is worse than no report.
 *
 * What this honestly guarantees is narrow, and worth stating plainly. It
 * guarantees every settled task's outcome, and as many supporting claims as fit,
 * reach the user with their provenance. It does not make the model's own
 * sentences true, and it does not make the records true -- a worker's claim
 * carried here is reproduced, not verified.
 */

/** The most claim text one report will carry for a single fact. */
const maximumClaimLength = 240;
/** The most supporting claims one report will name, across the whole message. */
const maximumClaims = 3;
/** What the channel accepts, so a carried report can never make a send invalid. */
const maximumMessageLength = 20_000;

function corroborated(fact: BoundedFact) {
  return fact.evidence === "observed" || fact.evidence === "executor_receipt";
}

/**
 * Shortens a claim from the middle, never from the end.
 *
 * A worker's message tends to put the outcome last: "…reviewed the basket. The
 * payment failed and no order was placed." Cutting the tail keeps the setup and
 * loses the decision, which is the opposite of what a summary is for.
 */
function bound(claim: string) {
  if (claim.length <= maximumClaimLength) return claim;
  const half = Math.floor((maximumClaimLength - 1) / 2);
  return `${claim.slice(0, half)}…${claim.slice(claim.length - half)}`;
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

  // Every task's outcome, always. This is the part that may never be trimmed:
  // trimming it is how a failure disappears behind an earlier success.
  const outcomes = tasks
    .map((task) => `${task.taskId} ${outcomeOf(task)}`)
    .join("; ");

  const facts = tasks.flatMap((task) => task.terminal?.facts ?? []);
  // Corroborated claims first, then the worker's own word, then unattributed.
  const ordered = [
    ...facts.filter((fact) => corroborated(fact)),
    ...facts.filter((fact) => fact.evidence === "worker_assertion"),
    ...facts.filter((fact) => fact.evidence === "unknown"),
  ];
  const shown = ordered.slice(0, maximumClaims);

  const lines = [`What the records hold: ${outcomes}.`];
  for (const fact of shown) {
    lines.push(`${bound(fact.claim)} (${provenanceOf(fact)}).`);
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
  if (written.length === 0) return report.slice(0, maximumMessageLength);

  const separator = "\n\n";
  const room = maximumMessageLength - report.length - separator.length;
  if (room <= 0) {
    // The records alone fill the message. Carrying them is the obligation; the
    // model's words are what gives way.
    return report.slice(0, maximumMessageLength);
  }
  const kept =
    written.length <= room ? written : `${written.slice(0, room - 1)}…`;
  return `${kept}${separator}${report}`;
}

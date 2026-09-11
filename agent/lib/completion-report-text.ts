import {
  taskRecords,
  type BoundedFact,
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
 * What that honestly guarantees is narrow, and worth stating plainly. It
 * guarantees the recorded claims and their provenance reach the user. It does
 * not make the model's own sentences true, and it does not make the records
 * true -- a worker's claim carried here is faithfully reproduced, not verified.
 */

/** The most claim text one report will carry for a single fact. */
const maximumClaimLength = 120;
/** The most facts one report will name, across the whole message. */
const maximumClaims = 3;

function corroborated(fact: BoundedFact) {
  return fact.evidence === "observed" || fact.evidence === "executor_receipt";
}

function bound(claim: string) {
  return claim.length <= maximumClaimLength
    ? claim
    : `${claim.slice(0, maximumClaimLength)}…`;
}

function list(facts: readonly BoundedFact[]) {
  return facts.map((fact) => bound(fact.claim)).join("; ");
}

/**
 * Renders what the records hold for one cohort.
 *
 * Keyed by cohort rather than by re-asking the policy, because the caller binds
 * the obligation before composing: by then the cohort is `delivery_pending` and
 * the policy would correctly say nothing is owed, so re-deriving it here would
 * silently drop every fact.
 *
 * One budget for the whole message rather than one per section, and
 * corroborated facts are taken first because they are the most useful.
 */
export function completionReportText(cohortId: string): string | undefined {
  const facts = taskRecords(cohortId).flatMap(
    (task) => task.terminal?.facts ?? []
  );
  const confirmed = facts
    .filter((fact) => corroborated(fact))
    .slice(0, maximumClaims);
  const remaining = maximumClaims - confirmed.length;
  const asserted = facts
    .filter((fact) => fact.evidence === "worker_assertion")
    .slice(0, remaining);
  const unattributed = facts
    .filter((fact) => fact.evidence === "unknown")
    .slice(0, remaining - asserted.length);

  const lines: string[] = [];
  if (confirmed.length > 0) lines.push(`Confirmed: ${list(confirmed)}.`);
  if (asserted.length > 0) {
    // Attributed, never stated flatly. A worker's own word reported as a
    // finding is how an unverified claim becomes something the user believes.
    lines.push(`Reported by the worker but not confirmed: ${list(asserted)}.`);
  }
  if (unattributed.length > 0) {
    // Unknown provenance does not establish who said it, and naming a source
    // this does not know would invent one.
    lines.push(`Recorded with no stated source: ${list(unattributed)}.`);
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
 * Returns the model's text unchanged when the cohort has nothing recorded, and
 * when the model already reported the facts itself. Callers only reach this
 * when a report is owed; an ordinary turn never gets here.
 */
export function reportWithRecordedFacts(
  cohortId: string,
  modelText: string
): string {
  const report = completionReportText(cohortId);
  if (report === undefined || report.length === 0) return modelText;
  const written = modelText.trim();
  if (written.includes(report)) return modelText;
  return written.length === 0 ? report : `${written}\n\n${report}`;
}

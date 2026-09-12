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
 * A second production failure came from what this actually said. A real person
 * received "What the records hold: turn_0/task_f13d217eb04bc1ab7c152c78
 * finished. ... (reported by the worker, not confirmed)." That is internal
 * machinery -- a cohort id and a task id -- standing in for an answer, and a
 * records dump where a person expected a sentence. Nothing here may show a
 * cohort or task id again. Several pieces of work are told apart by ordinal or
 * description ("the first request", "the other task"), never by id.
 *
 * **Outcomes first, then what is still unknown.** Every settled task's status
 * appears, always, before any supporting claim, and the unresolved remainder
 * comes from `recoveryProgress` rather than being written here -- that module
 * already decides what the records do and do not establish, and a second
 * opinion about the same records would be a second source of truth. An earlier
 * version rendered only the facts, so a failed task whose facts held an
 * observed checkpoint read as a confirmed success and a fourth task's failure
 * could be squeezed out by three earlier successes. A report that can hide a
 * failure is worse than no report.
 *
 * What this honestly guarantees is narrow, and worth stating plainly. Every
 * settled task's outcome reaches the user, with anything that did not complete
 * named first -- across the whole batch, not within each request -- so a
 * length limit cannot hide it. Supporting claims are carried whole or not at
 * all, and the ones that did not fit are counted rather than shortened -- a
 * shortened claim can say the opposite of what was recorded. It does not make
 * the model's own sentences true, and it does not make the records true -- a
 * worker's claim carried here is reproduced, not verified.
 */

/** The most supporting claims one report will name, across the whole message. */
const maximumClaims = 3;
/** What one automatic report body may take, as a whole, including any omission notice. */
const maximumReportBodyLength = 900;
/** What the channel accepts, so a carried report can never make a send invalid. */
const maximumMessageLength = 20_000;

const ordinalWords = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
];

function ordinal(index: number): string {
  return ordinalWords[index] ?? `${String(index + 1)}th`;
}

/** How to refer to one request among several, without ever naming its id. */
function requestLabel(index: number): string {
  return `the ${ordinal(index)} request`;
}

function capitalize(text: string): string {
  const first = text.slice(0, 1);
  return `${first.toUpperCase()}${text.slice(1)}`;
}

/** Joins natural-language labels as "a", "a and b", or "a, b and c". */
function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  const last = labels[labels.length - 1] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${last}`;
}

function corroborated(fact: BoundedFact) {
  return fact.evidence === "observed" || fact.evidence === "executor_receipt";
}

type Status = "completed" | "failed" | "cancelled" | "not_reported";

function statusOf(task: TaskRecord): Status {
  switch (task.terminal?.status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "not_reported";
  }
}

/** Whether every task in this group finished cleanly. */
function allCompleted(tasks: readonly TaskRecord[]): boolean {
  return tasks.every((task) => statusOf(task) === "completed");
}

/** Sorts any request holding an unfinished task ahead of one that fully finished. */
function requestRank(tasks: readonly TaskRecord[]): number {
  return allCompleted(tasks) ? 1 : 0;
}

const singleTaskVerb: Record<Status, string> = {
  completed: "finished",
  failed: "failed",
  cancelled: "was cancelled",
  not_reported: "has not reported",
};

const groupVerb: Record<Status, string> = {
  completed: "finished",
  failed: "failed",
  cancelled: "were cancelled",
  not_reported: "have not reported",
};

/** Bad news before good news, so a length limit removing the tail never removes a failure. */
const statusPriority: readonly Status[] = [
  "failed",
  "cancelled",
  "not_reported",
  "completed",
];

/** Describes what happened to one group of tasks, naming counts, never ids. */
function outcomeBody(tasks: readonly TaskRecord[]): string {
  const [only, ...rest] = tasks;
  if (only !== undefined && rest.length === 0) {
    return singleTaskVerb[statusOf(only)];
  }
  const counts = new Map<Status, number>();
  for (const task of tasks) {
    const status = statusOf(task);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const present = statusPriority.filter(
    (status) => (counts.get(status) ?? 0) > 0
  );
  const [onlyPresent] = present;
  if (onlyPresent !== undefined && present.length === 1) {
    return `all ${String(tasks.length)} tasks ${groupVerb[onlyPresent]}`;
  }
  return present
    .map((status) => {
      const count = counts.get(status) ?? 0;
      const noun = count === 1 ? "task" : "tasks";
      return `${String(count)} ${noun} ${groupVerb[status]}`;
    })
    .join("; ");
}

/**
 * A claim with a sentence ending, so two claims cannot run together.
 *
 * Worker text arrives without a guaranteed terminator, and joining "Ordered the
 * part" to the next claim with only a space produced "Ordered the part According
 * to the worker: Submitted the form" -- one broken sentence in a message a person
 * reads. Adding a full stop cannot change what a claim asserts; leaving two
 * claims fused can.
 */
function endedSentence(claim: string) {
  const text = claim.trim();
  return text.length === 0 || /[.!?]$/u.test(text) ? text : `${text}.`;
}

/** One sentence for one request's tasks, labelled only when more than one request is in play. */
function requestOutcomeSentence(
  tasks: readonly TaskRecord[],
  label: string | undefined
): string {
  const body = outcomeBody(tasks);
  if (label === undefined) return `${capitalize(body)}.`;
  return tasks.length === 1
    ? `${capitalize(label)} ${body}.`
    : `${capitalize(label)}: ${body}.`;
}

function provenanceGroup(
  fact: BoundedFact
): "corroborated" | "worker" | "unknown" {
  if (corroborated(fact)) return "corroborated";
  return fact.evidence === "worker_assertion" ? "worker" : "unknown";
}

/** Renders the claims that fit, grouped so one attribution covers only the claims it is about. */
function renderClaims(facts: readonly BoundedFact[]): string {
  const corroboratedClaims = facts
    .filter((fact) => provenanceGroup(fact) === "corroborated")
    .map((fact) => endedSentence(fact.claim));
  const workerClaims = facts
    .filter((fact) => provenanceGroup(fact) === "worker")
    .map((fact) => endedSentence(fact.claim));
  const unknownClaims = facts
    .filter((fact) => provenanceGroup(fact) === "unknown")
    .map((fact) => endedSentence(fact.claim));

  const sentences: string[] = [];
  if (corroboratedClaims.length > 0)
    sentences.push(corroboratedClaims.join(" "));
  // One attribution for the whole group, placed only next to the claims it
  // covers -- never worded so it could be read as covering the corroborated or
  // unknown-source claims sitting in their own sentences.
  if (workerClaims.length > 0) {
    sentences.push(`According to the worker: ${workerClaims.join(" ")}`);
  }
  if (unknownClaims.length > 0) {
    sentences.push(
      `Also recorded, though the source is unknown: ${unknownClaims.join(" ")}`
    );
  }
  return sentences.join(" ");
}

/**
 * Appends whole candidates, most important first, up to `maxLength`, counting
 * -- never truncating -- whatever does not fit.
 *
 * Candidates are dropped from the end (least important first) until the base
 * text, the surviving candidates, and the omission notice for the rest all fit
 * together. Nothing here ever returns part of a candidate: a candidate is
 * either whole in the result or entirely absent from it and counted.
 */
function appendBounded(
  base: string,
  maxLength: number,
  candidates: readonly string[],
  noticeFor: (omitted: number) => string
): string {
  const kept = [...candidates];
  for (;;) {
    const notice =
      kept.length < candidates.length
        ? noticeFor(candidates.length - kept.length)
        : "";
    const combined = [base, ...kept, notice]
      .filter((part) => part.length > 0)
      .join(" ");
    if (combined.length <= maxLength || kept.length === 0) return combined;
    kept.pop();
  }
}

/**
 * Renders what the records hold for every request this message answers.
 *
 * The result leads with the outcome -- failure first, across the whole batch,
 * never below optional detail -- and never carries a cohort or task id in any
 * form. Several requests are told apart by ordinal ("the first request"), never
 * by the identifiers the records use internally.
 *
 * Keyed by cohort rather than by re-asking the policy, because the caller binds
 * the obligation before composing: by then the cohorts are `delivery_pending`
 * and the policy would correctly say nothing is owed.
 */
export function completionReportText(
  cohortIds: readonly string[]
): string | undefined {
  const requests = cohortIds
    .map((cohortId) => ({ cohortId, tasks: taskRecords(cohortId) }))
    .filter((request) => request.tasks.length > 0)
    // The ordinal is fixed here, in the order the requests were made, BEFORE
    // anything is reordered for display. Numbering after the failure sort made
    // "the first request" mean "the first failure", so a request the user made
    // second was described to them as their first -- a label that reads as fact
    // and is wrong. Failures still lead; only the wording is anchored.
    .map((request, index) => ({
      askedAt: index,
      cohortId: request.cohortId,
      tasks: request.tasks,
    }));
  if (requests.length === 0) return undefined;

  const ordered = requests.toSorted(
    (left, right) => requestRank(left.tasks) - requestRank(right.tasks)
  );
  const multiple = ordered.length > 1;

  const outcomeSentences = ordered.map((request) =>
    requestOutcomeSentence(
      request.tasks,
      multiple ? requestLabel(request.askedAt) : undefined
    )
  );
  const body = outcomeSentences.join(" ");

  // What is still unknown, in the words of the module that decides it. Its
  // text never varies with a request's identity, only with its disposition, so
  // several requests sharing one disposition state it once rather than
  // repeating it -- that is preserving the qualification, not diluting it.
  const unknownByLine = new Map<string, string[]>();
  for (const request of ordered) {
    for (const line of recoveryProgress({ turnId: request.cohortId })
      .unknownRemainder) {
      const labels = unknownByLine.get(line) ?? [];
      // Same anchoring as the outcome sentences: the label names the request
      // the user made, not its position after the failure sort.
      if (multiple) labels.push(requestLabel(request.askedAt));
      unknownByLine.set(line, labels);
    }
  }
  const uncertaintySentences = [...unknownByLine.entries()].map(
    ([line, labels]) => {
      if (labels.length === 0) return line;
      if (labels.length === ordered.length)
        return `For all ${String(ordered.length)} requests: ${line}`;
      return `For ${joinLabels(labels)}: ${line}`;
    }
  );

  let text = appendBounded(
    body,
    maximumReportBodyLength,
    uncertaintySentences,
    (omitted) =>
      `(${String(omitted)} further unresolved-outcome note${omitted === 1 ? " is" : "s are"} not shown here.)`
  );

  const facts = ordered.flatMap((request) =>
    request.tasks.flatMap((task) => task.terminal?.facts ?? [])
  );
  // Whole or not at all. Shortening a claim can reverse it -- a sentence whose
  // middle holds "not" becomes its own opposite, and a reader cannot tell it
  // was shortened. Omission is visible; mutation is not.
  const prioritized = [
    ...facts.filter((fact) => provenanceGroup(fact) === "corroborated"),
    ...facts.filter((fact) => provenanceGroup(fact) === "worker"),
    ...facts.filter((fact) => provenanceGroup(fact) === "unknown"),
  ];
  const eligibleFacts = prioritized.filter(
    // The channel removes artifact image markdown on its way out, and a claim
    // is not safe from that: "The order was ![not](/artifacts/...) submitted"
    // arrives as "The order was  submitted", which is the opposite of what was
    // recorded. Nothing here can carry such a claim intact, so it is omitted
    // and counted with the rest that did not fit.
    (fact) => extractImageArtifactMarkdownReferences(fact.claim).length === 0
  );

  const shownFacts = eligibleFacts.slice(0, maximumClaims);
  // Claims are the optional detail: when the outcome and the uncertainty above
  // have already spent the budget, a claim is dropped -- whole, never cut --
  // before either of those, starting with the ones added last (worker-only,
  // then unknown-source, since corroborated claims were listed first).
  for (;;) {
    const omitted = prioritized.length - shownFacts.length;
    const rendered = shownFacts.length > 0 ? renderClaims(shownFacts) : "";
    const notice =
      omitted > 0
        ? `${String(omitted)} further recorded claim${omitted === 1 ? " is" : "s are"} not shown here.`
        : "";
    const combined = [text, rendered, notice]
      .filter((part) => part.length > 0)
      .join(" ");
    if (combined.length <= maximumReportBodyLength || shownFacts.length === 0) {
      text = combined;
      break;
    }
    shownFacts.pop();
  }

  if (facts.length === 0) {
    const withNoEvidence = `${text} There is no recorded evidence of what the work achieved.`;
    text =
      withNoEvidence.length <= maximumReportBodyLength ? withNoEvidence : text;
  }

  return text;
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

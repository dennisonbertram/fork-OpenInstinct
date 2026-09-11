import { reportableCohorts } from "@/agent/lib/completion-obligations";

/**
 * Whether forced completion reporting is active for this turn.
 *
 * Plan 006 builds the mechanism that makes a written summary the only thing
 * that can answer a turn with settled background work behind it. It is not
 * allowed to change what a user sees yet: Plan 007 must bind a report to exact
 * channel settlement, and Plan 009 must supply authorised live evidence, before
 * forcing is switched on. Until then this returns false, the delivery guard
 * keeps its ordinary behaviour, and reactions stay available.
 *
 * The activation change is this function alone: return whether the root owes a
 * report, which `reportableCohorts()` in `./completion-obligations` answers.
 */
export function completionReportForcingActive(): boolean {
  return reportableCohorts().length > 0;
}

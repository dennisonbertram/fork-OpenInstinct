export interface PaidRunBudget {
  readonly estimatedCostUsd: number;
  readonly maxCostUsd: number;
}

export interface PaidRunCostState {
  readonly actorCostUnaccountable: boolean;
  readonly actorCostsUsd: readonly number[];
}

export function reserveEstimatedCost(
  budget: PaidRunBudget,
  state: PaidRunCostState
) {
  if (state.actorCostUnaccountable) {
    throw new Error(
      "Cannot start another paid eval attempt because a prior attempt has unaccountable actor cost."
    );
  }
  if (budget.estimatedCostUsd > budget.maxCostUsd) {
    throw new Error("--estimated-cost-usd must not exceed --max-cost-usd.");
  }
  const reservedCostUsd = state.actorCostsUsd.reduce(
    (total, actorCostUsd) =>
      total + Math.max(actorCostUsd, budget.estimatedCostUsd),
    0
  );
  if (reservedCostUsd + budget.estimatedCostUsd > budget.maxCostUsd) {
    throw new Error("The next estimated attempt would exceed --max-cost-usd.");
  }
}

export function parsePositiveUsd(option: string, value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000) {
    throw new Error(
      `${option} must be a number greater than 0 and at most 1000.`
    );
  }
  return parsed;
}

export function parseRepetitions(value: string) {
  const repetitions = Number(value);
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5) {
    throw new Error("--repetitions must be an integer from 1 to 5.");
  }
  return repetitions;
}

export function parseTimeoutMs(value: string) {
  const timeoutMs = Number(value);
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1_000 ||
    timeoutMs > 1_800_000
  ) {
    throw new Error(
      "--timeout must be an integer from 1000 to 1800000 milliseconds."
    );
  }
  return timeoutMs;
}

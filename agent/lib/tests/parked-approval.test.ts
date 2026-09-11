import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const resets: (() => void)[] = [];
  return { resets };
});

vi.mock("eve/context", () => ({
  defineState: <T>(_name: string, initial: () => T) => {
    let value = initial();
    state.resets.push(() => {
      value = initial();
    });
    return {
      get: () => value,
      update: (update: (current: T) => T) => {
        value = update(value);
      },
    };
  },
}));

import {
  approvalCapacity,
  clearParkedApproval,
  materialTermsFingerprint,
  parkApproval,
  parkedApprovalFor,
  parkedApprovals,
  resumeParkedApproval,
} from "@/agent/lib/approval-identity";

const terms = {
  action: "submit_form",
  origin: "https://example.com",
  target_ref: "snapshot-1#form",
  terms: { message: "Two tickets please" },
};

function park(overrides: Partial<Parameters<typeof parkApproval>[0]> = {}) {
  return parkApproval({
    cohortId: "turn_1",
    fingerprint: materialTermsFingerprint(terms),
    objectiveRevision: "objective_1",
    requestId: "request_1",
    taskId: "task_a",
    ...overrides,
  });
}

beforeEach(() => {
  for (const reset of state.resets) reset();
});

describe("parking a native approval", () => {
  it("PA-01: a parked approval is visible against the task that is waiting", () => {
    expect(park()).toBe(true);

    expect(parkedApprovalFor("task_a")).toEqual({
      cohortId: "turn_1",
      fingerprint: materialTermsFingerprint(terms),
      objectiveRevision: "objective_1",
      requestId: "request_1",
      taskId: "task_a",
    });
  });

  it("PA-02: nothing about the authorised values is stored, only their digest", () => {
    park();
    const parked = parkedApprovalFor("task_a");

    // The fingerprint is compared, never displayed, and the values behind it
    // must not travel with it. A projection that carried the message body would
    // put authorised content somewhere it was never meant to be.
    expect(JSON.stringify(parked)).not.toContain("Two tickets");
    expect(JSON.stringify(parked)).not.toContain("submit_form");
  });

  it("PA-03: a plain later turn leaves the approval parked", () => {
    park();
    // AR-02. A new question is a new turn, not an answer. Nothing about it may
    // consume an authorisation a person has not given.
    expect(parkedApprovals()).toHaveLength(1);
    expect(parkedApprovalFor("task_a")).toBeDefined();
  });

  it("PA-04: a matching structured answer authorises and retires the request", () => {
    park();

    const outcome = resumeParkedApproval({
      fingerprint: materialTermsFingerprint(terms),
      requestId: "request_1",
      taskId: "task_a",
    });

    expect(outcome.kind).toBe("authorized");
    // Retired on use, so one approval cannot authorise a second attempt.
    expect(parkedApprovalFor("task_a")).toBeUndefined();
  });

  it("PA-05: an answer against changed terms neither authorises nor retires", () => {
    park();

    const outcome = resumeParkedApproval({
      fingerprint: materialTermsFingerprint({
        ...terms,
        terms: { message: "Four tickets please" },
      }),
      requestId: "request_1",
      taskId: "task_a",
    });

    expect(outcome.kind).toBe("terms_changed");
    // Still parked: the person authorised something, and a fresh approval is
    // needed for the changed action rather than this one being discarded.
    expect(parkedApprovalFor("task_a")).toBeDefined();
  });

  it("PA-06: an answer for another task cannot authorise this one", () => {
    park();

    expect(
      resumeParkedApproval({
        fingerprint: materialTermsFingerprint(terms),
        requestId: "request_1",
        taskId: "another_task",
      }).kind
    ).toBe("wrong_task");
    expect(parkedApprovalFor("task_a")).toBeDefined();
  });

  it("PA-07: an answer for an unknown request authorises nothing", () => {
    park();

    expect(
      resumeParkedApproval({
        fingerprint: materialTermsFingerprint(terms),
        requestId: "request_unknown",
        taskId: "task_a",
      }).kind
    ).toBe("unknown");
  });

  it("PA-08: one task parks one request, and a second replaces nothing silently", () => {
    expect(park()).toBe(true);
    // A second request for the same task with a different id would make the
    // question ambiguous: which one does an answer belong to?
    expect(park({ requestId: "request_2" })).toBe(false);

    expect(parkedApprovalFor("task_a")?.requestId).toBe("request_1");
  });

  it("PA-09: cancelling a task's request removes it without authorising it", () => {
    park();

    expect(clearParkedApproval("request_1")).toBe(true);

    expect(parkedApprovalFor("task_a")).toBeUndefined();
    expect(parkedApprovals()).toHaveLength(0);
  });

  it("PA-10: the number of parked requests is bounded", () => {
    for (let index = 0; index < approvalCapacity.parked; index += 1) {
      expect(
        park({ requestId: `request_${String(index)}`, taskId: `task_${String(index)}` })
      ).toBe(true);
    }

    // Refused rather than evicting an older one: dropping a parked request
    // silently would lose the record of something a person was asked.
    expect(park({ requestId: "request_over", taskId: "task_over" })).toBe(false);
    expect(parkedApprovals()).toHaveLength(approvalCapacity.parked);
  });
});

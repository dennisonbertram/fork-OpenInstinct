import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootTools = "agent/tools";
const rootMemory = "agent/memory/profile.ts";
const workerRoot = "agent/subagents/browser-agent";
const workerTools = `${workerRoot}/tools`;

function toolFiles(directory: string, root = directory): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return toolFiles(path, root);
      return entry.name.endsWith(".ts") ? path.slice(root.length + 1) : [];
    })
    .toSorted();
}

describe("root and worker capability boundaries", () => {
  it("keeps root coordination separate from browser execution", () => {
    expect(toolFiles(rootTools)).toEqual([
      "agent.ts",
      "bash.ts",
      "calendar.ts",
      "contacts.ts",
      "gmail.ts",
      "messaging.ts",
      "read_file.ts",
      "schedules.ts",
      "square-date-range.ts",
      "todo.ts",
      "vault.ts",
      "write_file.ts",
    ]);
    expect(existsSync(`${rootTools}/sendMessage.ts`)).toBe(false);
    expect(existsSync("agent/extensions/kernel/extension.ts")).toBe(false);
    expect(existsSync("agent/extensions/kernel/connections/browser.ts")).toBe(
      false
    );
    expect(existsSync("agent/skills/browser-execution/SKILL.md")).toBe(false);
    expect(readFileSync(`${rootTools}/agent.ts`, "utf8")).toContain(
      "disableTool()"
    );
    // The fork keeps load_skill and connection_search at the root: the Square
    // skill and connection depend on them (upstream disables both).
    for (const tool of ["bash", "read_file", "todo", "write_file"]) {
      expect(readFileSync(`${rootTools}/${tool}.ts`, "utf8")).toContain(
        "disableTool()"
      );
    }
    expect(
      toolFiles(rootTools).filter((file) =>
        readFileSync(`${rootTools}/${file}`, "utf8").includes("disableTool()")
      )
    ).toEqual([
      "agent.ts",
      "bash.ts",
      "read_file.ts",
      "todo.ts",
      "write_file.ts",
    ]);
    const rootInstructions = readFileSync(
      "agent/instructions/content/role/interactive.md",
      "utf8"
    );
    expect(rootInstructions).toContain(
      "Perform public research, source discovery, comparisons, and current-information lookups directly with `web_search`"
    );
    expect(rootInstructions).toContain(
      "try `web_fetch` before browser automation"
    );
  });

  it("AR-07: the authored instructions send preparation to the native approval, not to a second question", () => {
    // Plan 008 step 4 would remove a duplicate prose confirmation if one
    // existed. It does not: the instructions already direct preparation
    // straight to the native gate, in three places. So there is nothing to
    // remove, and this case guards those directives against silent removal
    // instead -- which is the regression that would reintroduce the duplicate
    // question the plan is about.
    const safety = readFileSync(
      "agent/instructions/content/execution-safety.md",
      "utf8"
    );
    const interactive = readFileSync(
      "agent/instructions/content/role/interactive.md",
      "utf8"
    );

    expect(safety).toContain(
      "without exposing internals or asking a duplicate permission question"
    );
    expect(safety).toContain("so the native approval gate can park it safely");
    expect(interactive).toContain(
      "Do not expose the tool or ask a duplicate permission question"
    );
    expect(interactive).toContain(
      "after approval, fill from the vault and submit without another confirmation"
    );
    expect(interactive).toContain(
      "do not duplicate them as prose unless the user needs an explanation"
    );
  });

  it("AR-08: nothing tells the root to read verification out of the worker's own wording", () => {
    // Observed on 2026-09-11 in session wrun_01M298YHXQMDK0J8RY2H471FKX. A
    // worker's uncorroborated claim was reported honestly on the turn that owed
    // a summary -- "(reported by the worker, not confirmed)" -- and then, one
    // turn later, described as "successfully opened example.com and verified the
    // page heading", with the qualification gone.
    //
    // The instructions were pointing at the worker's phrasing as the test for
    // verification: "Treat `success` as achieved only when its message includes a
    // verified outcome." That sits two sentences from the rule that a worker's
    // message is never established fact "however confident its wording", and the
    // two cannot both be followed. Confident phrasing is the thing a worker
    // controls and the thing that must not count.
    const coordination = readFileSync(
      "agent/instructions/content/worker-coordination.md",
      "utf8"
    );

    // The contradiction must be gone.
    expect(coordination).not.toContain(
      "Treat `success` as achieved only when its message includes a verified outcome"
    );
    // And what replaces it must name the record, not the wording.
    expect(coordination).toContain(
      "a corroborating record this session owns, never the confidence of the worker's wording"
    );
    // The rule it contradicted stays.
    expect(coordination).toContain(
      "never as established fact, however confident its wording"
    );
  });

  it("keeps durable memory scoped to the authenticated root user", () => {
    const memory = readFileSync(rootMemory, "utf8");

    expect(memory).toContain("defineMemory(");
    expect(memory).toContain("scope: resolveProfileMemoryScope");
  });

  it("gives worker the browser and opaque-vault tools without messaging", () => {
    expect(toolFiles(workerTools)).toEqual([
      "ask_question.ts",
      "bash.ts",
      "capture_browser_image.ts",
      "commit_browser_action.ts",
      "computer_action.ts",
      "fill_from_vault.ts",
      "interact_browser_element.ts",
      "list_vault.ts",
      "load_skill.ts",
      "manage_browsers.ts",
      "personal_info.ts",
      "read_file.ts",
      "semantic_browser.ts",
      "todo.ts",
      "web_fetch.ts",
      "web_search.ts",
      "write_file.ts",
    ]);
    expect(existsSync(`${workerRoot}/tools/sendMessage.ts`)).toBe(false);
    expect(existsSync(`${workerRoot}/tools/request_vault_setup.ts`)).toBe(
      false
    );
    expect(readFileSync(`${workerTools}/ask_question.ts`, "utf8")).toContain(
      "disableTool()"
    );
    expect(readFileSync(`${workerTools}/personal_info.ts`, "utf8")).toContain(
      "disableTool()"
    );
    for (const tool of [
      "bash",
      "load_skill",
      "read_file",
      "todo",
      "web_fetch",
      "web_search",
      "write_file",
    ]) {
      expect(readFileSync(`${workerTools}/${tool}.ts`, "utf8")).toContain(
        "disableTool()"
      );
    }
    expect(existsSync(`${workerRoot}/extensions/kernel/extension.ts`)).toBe(
      false
    );
    expect(readFileSync("package.json", "utf8")).not.toContain(
      "@onkernel/eve-extension"
    );
    for (const tool of [
      "capture_browser_image",
      "computer_action",
      "manage_browsers",
    ]) {
      const source = readFileSync(`${workerTools}/${tool}.ts`, "utf8");
      expect(source).toContain("defineTool(");
      expect(source).not.toContain("defineDynamic(");
      expect(source).toContain("requireWorkerScope(context)");
    }
    expect(existsSync(`${workerRoot}/hooks/session-owner.ts`)).toBe(true);
    expect(existsSync(`${workerRoot}/skills/browser-execution/SKILL.md`)).toBe(
      false
    );
    const semanticBrowser = readFileSync(
      `${workerTools}/semantic_browser.ts`,
      "utf8"
    );
    expect(semanticBrowser).toContain("defineDynamic(");
    expect(semanticBrowser).toContain("requireWorkerScope(context)");
    expect(semanticBrowser).toContain('from "@onkernel/browser-loop"');
    const workerInstructions = readFileSync(
      `${workerRoot}/instructions.md`,
      "utf8"
    );
    expect(workerInstructions).not.toContain("`inspect_autofill`");
    expect(workerInstructions).toContain(
      "native `final_output` tool exactly once"
    );
    expect(workerInstructions).toContain(
      "Never use the browser for general web search"
    );
    expect(workerInstructions).toContain(
      "Use `browser_snapshot`, `browser_text`, or `browser_find`"
    );
    expect(workerInstructions).toContain(
      "Arbitrary Playwright/JavaScript evaluation is not available"
    );
    expect(workerInstructions).toContain(
      "`browser_act` supports bounded non-secret preparation batches and rejects click/key steps"
    );
    expect(existsSync(`${workerRoot}/lib/browser-contract.ts`)).toBe(false);
    expect(existsSync(`${workerRoot}/lib/browser-runtime.ts`)).toBe(false);
    expect(existsSync(`${workerRoot}/lib/owned-browser.ts`)).toBe(true);

    expect(readFileSync("src/lib/kernel.ts", "utf8")).toContain("new Kernel(");
    for (const tool of [
      "capture_browser_image",
      "computer_action",
      "manage_browsers",
    ]) {
      const source = readFileSync(`${workerTools}/${tool}.ts`, "utf8");
      expect(source).toContain('from "@/lib/kernel"');
      expect(source).not.toContain("new Kernel(");
    }
    expect(readFileSync(`${workerTools}/fill_from_vault.ts`, "utf8")).toContain(
      'from "../lib/autofill/native"'
    );
  });

  it("requires structured completion for initial and resumed worker calls", () => {
    const workerCoordination = readFileSync(
      "agent/instructions/content/worker-coordination.md",
      "utf8"
    );
    const workerConfig = readFileSync(`${workerRoot}/agent.ts`, "utf8");

    expect(workerCoordination).toContain(
      "Every initial or resumed `browser-agent` call must set `outputSchema`"
    );
    expect(workerCoordination).toContain(
      '"required": ["status", "message", "images"]'
    );
    expect(workerCoordination).toContain(
      "including when passing an existing `agentId`"
    );
    expect(workerCoordination).toContain(
      "calling Eve's native `final_output` tool exactly once"
    );
    expect(workerConfig).toContain("outputSchema: taskCompletionSchema");
    expect(workerConfig).toContain(
      "Every initial and resumed call must include the task-completion outputSchema"
    );
  });
});

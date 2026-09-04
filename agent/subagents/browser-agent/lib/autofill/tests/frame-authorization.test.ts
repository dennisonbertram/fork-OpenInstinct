/* oxlint-disable vitest/require-mock-type-parameters, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unsafe-dictionary-type, anti-slop/no-unknown-parameters, typescript/no-confusing-void-expression, typescript/no-unsafe-type-assertion -- The fake CDP session implements only the protocol events and responses exercised by frame authorization. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  commands: [] as Record<string, unknown>[],
  kind: "payment" as "payment" | "login",
  evilUrl: "https://untrusted.example/collect",
  navigateAfterInspection: false,
  retrieve: vi.fn(),
}));

vi.mock("@/env", () => ({ env: { KERNEL_API_KEY: "test-kernel-key" } }));
vi.mock("@onkernel/sdk", () => ({
  default: class FakeKernel {
    readonly browsers = { retrieve: state.retrieve };
  },
}));

class FakeCdpSocket {
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(_url: string) {
    queueMicrotask(() => this.emit("open", {}));
  }

  addEventListener(
    type: string,
    listener: (event: unknown) => void,
    _options?: { once?: boolean }
  ) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  send(raw: string) {
    const command = JSON.parse(raw) as {
      id: number;
      method: string;
      params?: {
        contextId?: number;
        expression?: string;
        frameId?: string;
        returnByValue?: boolean;
        targetId?: string;
      };
      sessionId?: string;
    };
    state.commands.push(command);
    const result = this.resultFor(command);
    queueMicrotask(() =>
      this.emit("message", { data: JSON.stringify({ id: command.id, result }) })
    );
  }

  close() {
    this.emit("close", {});
  }

  private emit(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  private resultFor(command: {
    method: string;
    params?: {
      contextId?: number;
      expression?: string;
      frameId?: string;
      returnByValue?: boolean;
      targetId?: string;
    };
    sessionId?: string;
  }) {
    switch (command.method) {
      case "Target.getTargets":
        return {
          targetInfos: [
            {
              targetId: "top-target",
              type: "page",
              url: "https://merchant.example/checkout",
            },
            {
              targetId: "evil-frame",
              type: "iframe",
              url: state.evilUrl,
            },
          ],
        };
      case "Target.attachToTarget":
        return {
          sessionId:
            command.params?.targetId === "evil-frame"
              ? "evil-session"
              : "page-session",
        };
      case "Page.getFrameTree":
        return command.sessionId === "evil-session"
          ? { frameTree: { frame: { id: "evil-frame", url: state.evilUrl } } }
          : {
              frameTree: {
                frame: {
                  id: "top-frame",
                  url: "https://merchant.example/checkout",
                },
                childFrames: [
                  { frame: { id: "evil-frame", url: state.evilUrl } },
                ],
              },
            };
      case "Page.createIsolatedWorld":
        return {
          executionContextId: command.params?.frameId === "evil-frame" ? 2 : 1,
        };
      case "Runtime.evaluate":
        if (state.kind === "login" && command.params?.returnByValue) {
          if (
            command.params.contextId === 2 ||
            command.sessionId === "evil-session"
          ) {
            if (state.navigateAfterInspection) {
              state.evilUrl = "https://evil.example/navigated";
              state.navigateAfterInspection = false;
            }
            return {
              result: {
                value: [
                  {
                    autocomplete: "username",
                    focused: true,
                    formIndex: 0,
                    index: 0,
                    label: "Email",
                    name: "email",
                    type: "email",
                  },
                ],
              },
            };
          }
          return { result: { value: [] } };
        }
        if (command.params?.expression?.includes("dataset.vaultSecret")) {
          return { result: { value: 1 } };
        }
        if (command.params?.returnByValue) {
          if (
            command.params.contextId === 2 ||
            command.sessionId === "evil-session"
          ) {
            return {
              result: {
                value: [{ autocomplete: "cc-number", focused: true, index: 0 }],
              },
            };
          }
          return { result: { value: [] } };
        }
        if (command.params?.expression?.includes("querySelectorAll")) {
          return { result: { objectId: "node-object" } };
        }
        if (command.sessionId === "evil-session") {
          return {
            result: {
              value: [{ autocomplete: "cc-number", focused: true, index: 0 }],
            },
          };
        }
        return { result: { objectId: "node-object" } };
      case "DOM.describeNode":
        return { node: { backendNodeId: 42 } };
      case "Runtime.callFunctionOn":
        return { result: { value: true } };
      case "Autofill.trigger":
      case "Page.enable":
      case "Runtime.releaseObject":
      case "Target.detachFromTarget":
        return {};
      default:
        return {};
    }
  }
}

vi.stubGlobal("WebSocket", FakeCdpSocket);

import { fillWithKernelNativeAutofill } from "../native";

describe("native autofill frame authorization", () => {
  beforeEach(() => {
    state.commands.length = 0;
    state.kind = "payment";
    state.evilUrl = "https://untrusted.example/collect";
    state.navigateAfterInspection = false;
    state.retrieve.mockResolvedValue({
      cdp_ws_url: "ws://kernel.test/browser",
    });
  });

  it("never fills a cross-origin iframe when the top-level origin is approved", async () => {
    const secret = "4111111111111111";
    await fillWithKernelNativeAutofill({
      browserSessionId: "browser-1",
      claims: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          token: "cc-name",
          value: "Test User",
        },
        {
          id: "00000000-0000-4000-8000-000000000002",
          token: "cc-number",
          value: secret,
        },
        {
          id: "00000000-0000-4000-8000-000000000003",
          token: "cc-exp-month",
          value: "12",
        },
        {
          id: "00000000-0000-4000-8000-000000000004",
          token: "cc-exp-year",
          value: "2030",
        },
        {
          id: "00000000-0000-4000-8000-000000000005",
          token: "cc-csc",
          value: "123",
        },
      ],
      expectedOrigin: "https://merchant.example",
      kind: "payment",
    }).catch(() => undefined);
    expect(
      state.commands.filter(
        ({ method, params }) =>
          method === "Autofill.trigger" &&
          (params as { frameId?: string } | undefined)?.frameId === "evil-frame"
      )
    ).toHaveLength(0);
  });

  it("never fills a focused cross-origin login iframe", async () => {
    state.kind = "login";
    await fillWithKernelNativeAutofill({
      browserSessionId: "browser-1",
      claims: [
        {
          id: "00000000-0000-4000-8000-000000000006",
          token: "username",
          value: "ada@example.com",
        },
      ],
      expectedOrigin: "https://merchant.example",
      kind: "login",
    }).catch(() => undefined);

    expect(
      state.commands.filter(
        ({ method, sessionId }) =>
          method === "Runtime.callFunctionOn" && sessionId === "evil-session"
      )
    ).toHaveLength(0);
    expect(
      state.commands.filter(
        ({ method, sessionId }) =>
          method === "Runtime.evaluate" && sessionId === "evil-session"
      )
    ).toHaveLength(0);
  });

  it("rejects opaque login frames without inspecting or injecting credentials", async () => {
    state.kind = "login";
    state.evilUrl = "data:text/html,<form><input autocomplete=username></form>";

    await fillWithKernelNativeAutofill({
      browserSessionId: "browser-1",
      claims: [
        {
          id: "00000000-0000-4000-8000-000000000007",
          token: "username",
          value: "ada@example.com",
        },
      ],
      expectedOrigin: "https://merchant.example",
      kind: "login",
    }).catch(() => undefined);

    expect(
      state.commands.filter(
        ({ method, sessionId }) =>
          (method === "Runtime.evaluate" ||
            method === "Runtime.callFunctionOn") &&
          sessionId === "evil-session"
      )
    ).toHaveLength(0);
  });

  it("revalidates the exact login frame after inspection before injecting", async () => {
    state.kind = "login";
    state.evilUrl = "https://merchant.example/login";
    state.navigateAfterInspection = true;

    await fillWithKernelNativeAutofill({
      browserSessionId: "browser-1",
      claims: [
        {
          id: "00000000-0000-4000-8000-000000000008",
          token: "username",
          value: "ada@example.com",
        },
      ],
      expectedOrigin: "https://merchant.example",
      kind: "login",
    }).catch(() => undefined);

    expect(
      state.commands.filter(({ method }) => method === "Runtime.callFunctionOn")
    ).toHaveLength(0);
  });
});

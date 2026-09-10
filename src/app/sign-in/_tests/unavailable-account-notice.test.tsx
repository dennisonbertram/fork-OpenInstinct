import type * as React from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

interface ButtonProps {
  readonly children?: ReactNode;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
}

interface SignOutResult {
  readonly data: object | null;
  readonly error: { readonly message: string } | null;
}

interface Mocks {
  button: ButtonProps | undefined;
  cursor: number;
  refresh: Mock<() => void>;
  replace: Mock<(path: string) => void>;
  signOut: Mock<() => Promise<SignOutResult>>;
  states: (boolean | string | null)[];
}

const mocks = vi.hoisted<Mocks>(() => ({
  button: undefined,
  cursor: 0,
  refresh: vi.fn<() => void>(),
  replace: vi.fn<(path: string) => void>(),
  signOut: vi.fn<() => Promise<SignOutResult>>(),
  states: [],
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: (initial: boolean | string | null) => {
    const index = mocks.cursor;
    mocks.cursor += 1;
    if (mocks.states.length <= index) mocks.states.push(initial);
    const setState = (value: boolean | string | null) => {
      mocks.states[index] = value;
    };
    return [mocks.states[index], setState];
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));

vi.mock("@/app/_lib/auth-client", () => ({
  authClient: { signOut: mocks.signOut },
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDescription: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertTitle: ({ children }: { readonly children: ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: ButtonProps) => {
    mocks.button = props;
    return (
      <button disabled={props.disabled} onClick={props.onClick} type="button">
        {props.children}
      </button>
    );
  },
}));

import { UnavailableAccountNotice } from "@/app/sign-in/_components/unavailable-account-notice";

function renderNotice() {
  mocks.cursor = 0;
  return renderToStaticMarkup(<UnavailableAccountNotice />);
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>() {
  return Promise.withResolvers<T>();
}

describe("unavailable account notice", () => {
  beforeEach(() => {
    mocks.button = undefined;
    mocks.cursor = 0;
    mocks.states = [];
    vi.clearAllMocks();
  });

  it("disables sign-out while pending and navigates only after success", async () => {
    const pending = deferred<{ readonly data: object; readonly error: null }>();
    mocks.signOut.mockReturnValue(pending.promise);

    renderNotice();
    mocks.button?.onClick?.();

    expect(renderNotice()).toContain("Signing out…");
    expect(mocks.button?.disabled).toBe(true);
    expect(mocks.replace).not.toHaveBeenCalled();

    pending.resolve({ data: {}, error: null });
    await flush();

    expect(renderNotice()).toContain("Sign out");
    expect(mocks.button?.disabled).toBe(false);
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/sign-in");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("shows a returned error without navigating and remains retryable", async () => {
    mocks.signOut.mockResolvedValueOnce({
      data: null,
      error: { message: "rejected" },
    });

    renderNotice();
    mocks.button?.onClick?.();
    await flush();

    expect(renderNotice()).toContain(
      "We could not sign you out. Please try again."
    );
    expect(mocks.button?.disabled).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();

    mocks.signOut.mockResolvedValueOnce({ data: {}, error: null });
    mocks.button?.onClick?.();
    await flush();
    renderNotice();
    expect(mocks.signOut).toHaveBeenCalledTimes(2);
    expect(mocks.replace).toHaveBeenCalledWith("/sign-in");
  });

  it("shows a thrown error without navigating and leaves sign-out enabled", async () => {
    mocks.signOut.mockRejectedValue(new Error("network unavailable"));

    renderNotice();
    mocks.button?.onClick?.();
    await flush();

    expect(renderNotice()).toContain(
      "We could not sign you out. Please try again."
    );
    expect(mocks.button?.disabled).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

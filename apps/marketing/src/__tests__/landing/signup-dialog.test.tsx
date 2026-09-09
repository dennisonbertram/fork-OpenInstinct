import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { SignupButton } from "@/components/landing/signup-button";

describe("SignupButton + SignupDialog", () => {
  it("does not render the dialog by default", () => {
    render(<SignupButton>Get early access</SignupButton>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the dialog when the button is clicked", () => {
    render(<SignupButton>Get early access</SignupButton>);
    fireEvent.click(screen.getByRole("button", { name: /get early access/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes when the close button is clicked", () => {
    render(<SignupButton>Get early access</SignupButton>);
    fireEvent.click(screen.getByRole("button", { name: /get early access/i }));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape", () => {
    render(<SignupButton>Get early access</SignupButton>);
    fireEvent.click(screen.getByRole("button", { name: /get early access/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on scrim click", () => {
    render(<SignupButton>Get early access</SignupButton>);
    fireEvent.click(screen.getByRole("button", { name: /get early access/i }));
    fireEvent.click(screen.getByRole("presentation"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("submits the email, disables the button while pending, then shows success", async () => {
    let resolvePost: () => void;
    const postRequest = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePost = resolve;
        })
    );
    render(
      <SignupButton postRequest={postRequest}>Get early access</SignupButton>
    );
    fireEvent.click(screen.getByRole("button", { name: /get early access/i }));

    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText(/email/i);
    fireEvent.change(input, { target: { value: "sam@example.com" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: /^get early access$/i })
    );

    expect(postRequest).toHaveBeenCalledWith("sam@example.com");
    expect(
      within(dialog).getByRole("button", { name: /sending/i })
    ).toBeDisabled();

    resolvePost!();
    await waitFor(() =>
      expect(screen.getByText(/you're on the list/i)).toBeInTheDocument()
    );
  });

  it("shows an error and keeps the entered email on a failed submit", async () => {
    const postRequest = vi.fn(() => Promise.reject(new Error("fail")));
    render(
      <SignupButton postRequest={postRequest}>Get early access</SignupButton>
    );
    fireEvent.click(screen.getByRole("button", { name: /get early access/i }));

    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText(/email/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sam@example.com" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: /^get early access$/i })
    );

    await waitFor(() =>
      expect(screen.getByText(/couldn't save that email/i)).toBeInTheDocument()
    );
    expect(input.value).toBe("sam@example.com");
  });

  it("resets to the form after a successful submit, close, and reopen", async () => {
    const postRequest = vi.fn(() => Promise.resolve());
    render(
      <SignupButton postRequest={postRequest}>Get early access</SignupButton>
    );
    fireEvent.click(screen.getByRole("button", { name: /get early access/i }));

    let dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText(/email/i);
    fireEvent.change(input, { target: { value: "sam@example.com" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: /^get early access$/i })
    );

    await waitFor(() =>
      expect(screen.getByText(/you're on the list/i)).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /get early access/i }));
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.queryByText(/you're on the list/i)).toBeNull();
  });

  it("renders no phone number and no sms: href", () => {
    render(<SignupButton>Get early access</SignupButton>);
    fireEvent.click(screen.getByRole("button", { name: /get early access/i }));
    expect(screen.queryByText(/\+1 \(615\)/)).toBeNull();
    expect(document.querySelector('a[href^="sms:"]')).toBeNull();
  });
});

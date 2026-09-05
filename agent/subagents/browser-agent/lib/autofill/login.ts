import type { AutofillClaim } from "./protocol";

export type NativeLoginPurpose = "login" | "signup";

export const nativeLoginAutofillTokens = [
  "username",
  "email",
  "tel",
  "current-password",
] as const;

export interface NativeLoginControlDescriptor {
  readonly autocomplete: string;
  readonly focused: boolean;
  readonly formIndex: number | null;
  readonly index: number;
  readonly label: string;
  readonly name: string;
  readonly type: string;
  readonly submitLabels?: readonly string[];
  readonly formLabel?: string;
}

export interface ClassifiedNativeLoginControl extends NativeLoginControlDescriptor {
  readonly score: number;
  readonly token: (typeof nativeLoginAutofillTokens)[number];
}

export function classifyNativeLoginControl(
  descriptor: NativeLoginControlDescriptor,
  purpose: NativeLoginPurpose = "login"
): ClassifiedNativeLoginControl | null {
  const autocompleteTokens = new Set(
    descriptor.autocomplete.toLowerCase().split(/\s+/u).filter(Boolean)
  );
  if (autocompleteTokens.has("one-time-code")) return null;
  if (purpose === "signup") {
    if (autocompleteTokens.has("current-password")) return null;
    if (descriptor.type === "password") {
      return {
        ...descriptor,
        score: autocompleteTokens.has("new-password") ? 100 : 90,
        token: "current-password",
      };
    }
  } else if (autocompleteTokens.has("new-password")) return null;

  for (const token of nativeLoginAutofillTokens) {
    if (autocompleteTokens.has(token)) {
      return { ...descriptor, score: 100, token };
    }
  }

  const searchable = normalizeText(
    [descriptor.name, descriptor.label].filter(Boolean).join(" ")
  );
  if (/\b(?:new|confirm|create|repeat)\s*password\b/u.test(searchable)) {
    return null;
  }
  if (descriptor.type === "password") {
    return { ...descriptor, score: 90, token: "current-password" };
  }
  if (descriptor.type === "email") {
    return { ...descriptor, score: 85, token: "email" };
  }
  if (descriptor.type === "tel") {
    return { ...descriptor, score: 85, token: "tel" };
  }
  if (/\b(?:e-?mail|email address)\b/u.test(searchable)) {
    return { ...descriptor, score: 75, token: "email" };
  }
  if (/\b(?:phone|telephone|mobile)\b/u.test(searchable)) {
    return { ...descriptor, score: 75, token: "tel" };
  }
  if (
    /\b(?:user\s*name|username|login|account|member|membership|mileageplus)\b/u.test(
      searchable
    )
  ) {
    return { ...descriptor, score: 70, token: "username" };
  }
  return null;
}

export function selectNativeLoginFills<T extends ClassifiedNativeLoginControl>(
  controls: readonly T[],
  claims: readonly Pick<AutofillClaim, "token" | "value">[],
  purpose: NativeLoginPurpose = "login"
) {
  const focused = controls.find((control) => control.focused);
  if (!focused) return [];

  const sameSurface = controls
    .filter((control) => control.formIndex === focused.formIndex)
    .toSorted(compareLoginControls);
  const values = new Map(claims.map(({ token, value }) => [token, value]));
  const selected: { readonly control: T; readonly value: string }[] = [];

  const identifier = sameSurface.find(
    (control) =>
      control.token !== "current-password" &&
      (values.has(control.token) || values.has("username"))
  );
  if (identifier) {
    const value = values.get(identifier.token) ?? values.get("username");
    if (value !== undefined) selected.push({ control: identifier, value });
  }

  const passwords = sameSurface.filter(
    (control) =>
      control.token === "current-password" && values.has(control.token)
  );
  for (const password of purpose === "signup"
    ? passwords
    : passwords.slice(0, 1)) {
    const value = values.get(password.token);
    if (value !== undefined) selected.push({ control: password, value });
  }
  return selected;
}

export const nativeLoginControlInspectionExpression = `(() => {
  const elements = Array.from(document.querySelectorAll("input"));
  const forms = Array.from(document.forms);
  return elements.flatMap((element, index) => {
    if (element.disabled || element.readOnly) return [];
    if (["hidden", "submit", "button", "reset", "file", "image", "checkbox", "radio"].includes(element.type)) return [];
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || element.getClientRects().length === 0) return [];
    const labels = element.labels ? Array.from(element.labels, (label) => label.textContent || "") : [];
    const ariaText = (element.getAttribute("aria-labelledby") || "")
      .split(/\\s+/u)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent || "")
      .join(" ");
    const resolvedFormIndex = element.form ? forms.indexOf(element.form) : -1;
    return [{
      submitLabels: element.form ? Array.from(document.querySelectorAll("button,input"))
        .filter(control => control.form === element.form && ["submit", "image"].includes(control.type) && !control.matches(":disabled") && getComputedStyle(control).display !== "none" && getComputedStyle(control).visibility !== "hidden" && control.getClientRects().length > 0)
        .map(control => control.tagName === "BUTTON" ? control.textContent || "" : control.getAttribute(control.type === "image" ? "alt" : "value") || "") : [],
      formLabel: element.form ? [element.form.id, element.form.getAttribute("name") || "", element.form.getAttribute("aria-label") || "", ...Array.from(element.form.querySelectorAll("h1,h2,h3,h4,h5,h6"), heading => heading.textContent || "")].join(" ") : "",
      autocomplete: element.autocomplete || "",
      focused: document.activeElement === element,
      formIndex: resolvedFormIndex >= 0 ? resolvedFormIndex : null,
      index,
      label: [
        ...labels,
        element.getAttribute("aria-label") || "",
        ariaText,
        element.getAttribute("placeholder") || "",
        element.getAttribute("title") || "",
      ].join(" "),
      name: [element.name, element.id].join(" "),
      type: element.type || "",
    }];
  });
})()`;

// Evaluated inside a frame's isolated world. `self.origin` is the origin of the
// document that would receive a value, so it also rejects sandboxed documents.
export const frameOriginExpression = "self.origin";

export const nativeLoginFillFunctionDeclaration = `function(value, expectedOrigin) {
  if (self.origin !== expectedOrigin) return false;
  if (!(this instanceof HTMLInputElement)) return false;
  this.dataset.vaultSecret = "true";
  this.click();
  this.focus();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) return false;
  setter.call(this, value);
  this.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
  this.dispatchEvent(new Event("change", { bubbles: true }));
  return this.value.length > 0;
}`;

function compareLoginControls(
  left: ClassifiedNativeLoginControl,
  right: ClassifiedNativeLoginControl
) {
  if (left.focused !== right.focused) return left.focused ? -1 : 1;
  if (left.score !== right.score) return right.score - left.score;
  return left.index - right.index;
}

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, " ")
    .trim();
}

export function classifyNativeLoginControls(
  descriptors: readonly NativeLoginControlDescriptor[],
  purpose: NativeLoginPurpose = "login",
  allowNewPasswordField = false
) {
  let compatibilityTarget: NativeLoginControlDescriptor | undefined;
  if (allowNewPasswordField) {
    const focused = descriptors.find((control) => control.focused);
    const sameForm = focused
      ? descriptors.filter((control) => control.formIndex === focused.formIndex)
      : [];
    const passwords = sameForm.filter((control) => control.type === "password");
    const candidate = passwords.length === 1 ? passwords[0] : undefined;
    const hintTokens = new Set(
      candidate?.autocomplete.toLowerCase().split(/\s+/u)
    );
    const submitLabels = candidate?.submitLabels?.map(normalizeText) ?? [];
    const hasNonLoginIntent =
      /\b(?:register|registration|signup|sign up|reset|change|recover|new password|confirm|repeat|current password|old password)\b/u.test(
        normalizeText(
          [candidate?.formLabel, candidate?.label, candidate?.name].join(" ")
        )
      );
    if (
      purpose !== "login" ||
      !focused ||
      focused.formIndex === null ||
      !candidate ||
      !hintTokens.has("new-password") ||
      hintTokens.has("current-password") ||
      sameForm.some((control) =>
        control.autocomplete
          .toLowerCase()
          .split(/\s+/u)
          .includes("one-time-code")
      ) ||
      submitLabels.length !== 1 ||
      !/^(?:login|log in|sign in)$/u.test(submitLabels[0] ?? "") ||
      hasNonLoginIntent
    ) {
      throw new Error(
        "New-password compatibility requires one unambiguous sign-in form and password field."
      );
    }
    compatibilityTarget = candidate;
  }
  return descriptors.flatMap((descriptor) => {
    const classified: ClassifiedNativeLoginControl | null =
      descriptor === compatibilityTarget
        ? { ...descriptor, score: 100, token: "current-password" }
        : classifyNativeLoginControl(descriptor, purpose);
    return classified ? [classified] : [];
  });
}

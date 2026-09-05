import { expect, test } from "@playwright/test";
import {
  classifyNativeLoginControls,
  nativeLoginControlInspectionExpression,
  type NativeLoginControlDescriptor,
} from "../../agent/subagents/browser-agent/lib/autofill/login";

for (const extra of [
  '<input type="submit" value="Register" form="signin">',
  '<input type="image" alt="Register" form="signin">',
  '<button type="submit" form="signin">Register</button>',
]) {
  test(`rejects another form-associated submit: ${extra}`, async ({ page }) => {
    await page.setContent(`<form id="signin">
      <input name="username" autocomplete="username">
      <input name="password" type="password" autocomplete="new-password" value="SECRET_SENTINEL">
      <button type="submit">Sign in</button>
    </form>${extra}`);
    await page.locator('[name="username"]').focus();
    const descriptors = await page.evaluate<NativeLoginControlDescriptor[]>(
      nativeLoginControlInspectionExpression
    );
    expect(JSON.stringify(descriptors)).not.toContain("SECRET_SENTINEL");
    expect(() =>
      classifyNativeLoginControls(descriptors, "login", true)
    ).toThrow(/unambiguous sign-in/iu);
  });
}

test("accepts one visible enabled submit without reading credential values", async ({
  page,
}) => {
  await page.setContent(`<form id="signin">
    <input name="username" autocomplete="username" value="IDENTIFIER_SENTINEL">
    <input name="password" type="password" autocomplete="new-password" value="SECRET_SENTINEL">
    <input type="submit" value="Register" hidden>
    <fieldset disabled><button type="submit">Register</button></fieldset>
  </form><input type="submit" value="Sign in" form="signin">`);
  await page.locator('[name="username"]').focus();
  await page.evaluate(() => {
    for (const input of document.querySelectorAll("input[name]")) {
      Object.defineProperty(input, "value", {
        get() {
          throw new Error("Credential value was read");
        },
      });
    }
  });
  const descriptors = await page.evaluate<NativeLoginControlDescriptor[]>(
    nativeLoginControlInspectionExpression
  );
  expect(JSON.stringify(descriptors)).not.toMatch(
    /SECRET_SENTINEL|IDENTIFIER_SENTINEL/u
  );
  expect(
    classifyNativeLoginControls(descriptors, "login", true).map(
      (control) => control.token
    )
  ).toEqual(["username", "current-password"]);
  expect(
    classifyNativeLoginControls(descriptors).map((control) => control.token)
  ).toEqual(["username"]);
});

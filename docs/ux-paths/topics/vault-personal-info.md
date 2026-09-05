# Vault and personal information stories

These five stories are source-derived from the current dashboard and cross-checked with discovery; no browser outcomes are claimed. Use the designated synthetic local account only. Proposed names/emails below are synthetic test data. Never inspect existing vault plaintext, expose it in screenshots/logs, or use real credentials, payment data, contacts, or password exports. Record vault evidence from metadata/list states after form entry is complete. Import and destructive completion remain blocked without explicitly isolated fixtures.

Action counts treat entering a field and activating a control as separate actions; passive inspection is not an action.

## STORY-021: Save personal information and recover from validation feedback

<a id="story-021"></a>

**Provisional ID**: VAULT-01

**Type**: medium
**Topic**: Vault and personal information
**Persona**: A new user who wants Jory to know their basic profile.
**Goal**: Save a small personal profile and understand a rejected country code.
**Preconditions**: Authenticated synthetic account with an empty or explicitly disposable profile at `/personal-info`; never overwrite an existing real profile.
**Ideal path**: 4 — Enter first name, email, and country code, then save; validation/reload are verification variations.
**Alternate paths**: Direct `/personal-info` or sidebar `Personal info`. Vault `Contact info` and `Addresses` hold related concepts but are separate records with different handling, not alternate profile editors.

### Steps

1. Read the explanation under `Personal info`: the agent and browser worker can use these values directly; passwords and payment details belong in Vault.
2. Enter `Alex` in `First name`, `alex.ux@example.com` in `Email`, and `1!` in `Country code`.
3. Choose `Save personal info` → expect `Couldn't save personal info` and the suggestion to check email, birth date, and two-letter country code. Record exact visible behavior.
4. Replace `Country code` with `US` and choose `Save personal info` → pending label `Saving…` should settle to `Saved.`.
5. Reload → the three synthetic values persist.
6. Review `Identity and contact` versus `Mailing address` grouping → determine whether users understand what they can leave empty.

### Variations

- Add a synthetic mailing address only when the disposable profile is expressly available; labels include `Address line 1`, `Address line 2`, `City`, `State / region`, and `Postal code`.
- Clear an optional value and save → blank fields are normalized to null.
- A malformed email may be stopped by browser-native email validation before the application's alert appears.

### Edge Cases

- Client schema rejection and server mutation failure share the same `Couldn't save personal info` alert and input-check advice; that advice may not explain an infrastructure failure.
- The `Saved.` message is cleared on the next submission, not immediately on editing; check whether unsaved edits still appear saved.
- No independent profile record history or undo is exposed in this form.

**Sources**: `src/app/(authenticated)/personal-info/_components/personal-info-form.tsx`; `src/lib/user-profile.ts`.

## STORY-022: Add a passwordless synthetic login and find its metadata

<a id="story-022"></a>

**Provisional ID**: VAULT-02

**Type**: medium
**Topic**: Vault and personal information
**Persona**: A user who signs into a service with an email code.
**Goal**: Save a login that does not require a password and find it afterward.
**Preconditions**: Authenticated synthetic account at `/vault`, disposable synthetic vault fixture, working vault storage. No real credentials. Use a fresh unique label if the named fixture already exists.
**Ideal path**: 6 — Open Logins, choose Add login, fill three required values, save.
**Alternate paths**: Valid agent-provided setup query parameters can open a prefilled add view; do not invent or handcraft unspecified query contracts. Bulk import handles password-based CSV entries and is not equivalent to this passwordless login.

### Steps

1. Open `Logins` → the category list shows its count or `No saved logins yet.`.
2. Choose `Add login` → fields include `Name`, `Website`, `Sign in with`, `Email`, and `Password (optional)`.
3. Enter `UX Reading Club` as `Name`, `https://reading.example.com` as `Website`, and `alex.ux@example.com` as `Email`; leave the default `Email` sign-in type and password blank.
4. Read `Leave blank if you sign in with a one-time code.` and choose `Save login` → expect a return to the Logins list.
5. Enter `UX Reading Club` in `Search logins`, whose placeholder is `Search by name or account` → verify the saved metadata row is present without reading a secret payload.
6. Search `no-such-ux-entry` → `No matches for “no-such-ux-entry”` appears; clear the search to recover the list.
7. Close and reopen `Logins` → the category count and row should remain consistent.

### Variations

- `Sign in with` also offers `Phone` and `Username`; the identifier label changes to `Phone number` or `Username`.
- Username sign-in requires a password; use only blank-form validation unless a synthetic credential fixture is explicitly provided, and never capture the filled secret.
- A bare website host is normalized to an HTTPS origin before validation.

### Edge Cases

- The form has inline validation but no visible mutation-error rendering in its owner; an actual save failure may leave the user in the form without an explanation.
- Search checks label and account, case-insensitively, not the underlying secret fields.
- Login icons request the saved host's `/favicon.ico`; the fallback icon remains if loading fails. Use only a synthetic reserved domain.
- No edit or reveal action is offered in the metadata row.

**Sources**: `src/app/(authenticated)/vault/_components/logins/index.tsx`; `src/app/(authenticated)/vault/_components/logins/form.tsx`; `src/app/(authenticated)/vault/_components/section.tsx`; `src/app/(authenticated)/vault/_components/setup.ts`.

## STORY-023: Inspect category forms, validation, and safe cancellation

<a id="story-023"></a>

**Provisional ID**: VAULT-03

**Type**: medium
**Topic**: Vault and personal information
**Persona**: A new user learning which type of information belongs in each category.
**Goal**: Understand contact, address, and card entry without saving sensitive data.
**Preconditions**: Authenticated synthetic account at `/vault`; no populated sensitive forms or browser autofill of real data. Leave all values empty for this story.
**Ideal path**: 6 — For each of three categories, open the category and choose its Add action; additional validation/back actions are audit assertions.
**Alternate paths**: Valid agent setup links may open the relevant add dialog directly. Sidebar `Personal info` offers contact/address fields with a different direct-use contract; it is not the same saved vault category.

### Steps

1. Open `Contact info`, then `Add contact` → inspect `Name`, `Full name (optional)`, `Email (optional)`, and `Phone (optional)`.
2. Choose `Save contact` with an empty form → inspect `Enter a name for this contact.` and `Enter at least one contact value.` without creating a record.
3. Use the `Contact info` back control, then dismiss the dialog → return to the Vault categories.
4. Open `Addresses`, then `Add address` → inspect the address form and reachable `Save address` control; do not submit populated values.
5. Use the `Addresses` back control and dismiss → no record should have been created.
6. Open `Cards`, then `Add card` → inspect `Name on card`, `Nickname (optional)`, `Card number`, `Expiration`, `CVC`, and `Billing ZIP / postal`.
7. Choose `Save card` with an empty form → inline required/format validation appears without saving a card.
8. Use `Cards` to return to its list, then dismiss → confirm category counts are unchanged.

### Variations

- On a narrow screen, inspect whether the entire form and save control are reachable by scrolling.
- Keyboard Escape/close and category back controls should have understandable, different destinations: page versus list.
- An isolated fixture may add a synthetic address/contact separately, using the existing category form; no real payment data is needed to review validation.

### Edge Cases

- Each contact field is marked optional, but the group requires at least one value; the empty-submit message must make that dependency clear.
- Back navigation unmounts the form; unsaved-draft preservation is not promised.
- Card CVC uses the shared text input without `type="password"`; do not enter or capture actual security codes during audit.
- Cards, Addresses, and Contact info have separate schemas; one category's validation pass does not establish the others work.

**Sources**: `src/app/(authenticated)/vault/_components/contacts/{index,form}.tsx`; `src/app/(authenticated)/vault/_components/addresses/{index,form}.tsx`; `src/app/(authenticated)/vault/_components/cards/{index,form}.tsx`; `src/app/(authenticated)/vault/_components/section.tsx`.

## STORY-024: Review bulk-import preparation and recover from an invalid file

<a id="story-024"></a>

**Provisional ID**: VAULT-04

**Type**: medium
**Topic**: Vault and personal information
**Persona**: A user considering importing saved logins.
**Goal**: Understand the import steps and recover from a wrong file without exposing passwords.
**Preconditions**: Authenticated synthetic account at `/vault`; a deliberately invalid synthetic CSV containing only nonsecret headers such as `title,notes` exists. Successful import requires a separate isolated fixture and is blocked without it. Never export real passwords.
**Ideal path**: 3 — Open Logins, choose Bulk import, choose the intended file; the main story instead uses an invalid file to exercise recovery safely.
**Alternate paths**: `/vault?import=chrome` opens the import view directly. `Open Google Password Manager` opens external export settings; do not follow it to obtain real data during audit.

### Steps

1. Open `Logins`, then `Bulk import` → `Import Chrome passwords` appears with `1. Export your passwords` and `2. Choose the exported CSV`.
2. Review `Your passwords stay in your vault` and the warning that Chrome exports plaintext → evaluate whether the sensitivity is understandable before file selection.
3. Choose the nonsecret invalid CSV in `2. Choose the exported CSV` → expect `Couldn't import this file` and the explanation requiring url, username, and password columns.
4. Check the footer's disabled `Choose a CSV` state → an invalid selection must not look import-ready.
5. Use the `Logins` back control → return to the list without creating records.

### Variations

- Isolated synthetic success fixture only: selecting a valid CSV reports the ready count and invalid rows skipped; `Import N logins` changes to `Importing…`; success reports `N logins imported`; `Done` returns to Logins. Record counts and labels, never passwords/file payload.
- A synthetically malformed quoted value shows `This CSV has an unfinished quoted value.`
- A file beyond the client size limit shows `Choose a CSV smaller than 10 MB.`; do not create large test files merely to cover this branch.

### Edge Cases

- The ready preview reports counts, not individual selectable rows; do not invent per-login checkboxes.
- Invalid rows are skipped while valid rows may still be imported; skipped-count visibility matters.
- Client parser caps valid entries at 3,000 and rejects files with no valid saved passwords.
- Actual import mutation error uses `The import did not finish. Check the vault error and try again.`; determine whether it gives enough context if naturally encountered.

**Sources**: `src/app/(authenticated)/vault/_components/logins/import.tsx`; `src/app/(authenticated)/vault/_components/logins/index.tsx`.

## STORY-025: Remove only an isolated synthetic saved item

<a id="story-025"></a>

**Provisional ID**: VAULT-05

**Type**: short
**Topic**: Vault and personal information
**Persona**: A user cleaning up a disposable duplicate entry.
**Goal**: Remove the intended saved item and verify list/count consistency.
**Preconditions**: Explicitly isolated vault fixture with one known disposable metadata row named `UX Disposable Contact`; no real data. Without that fixture, inspect source and leave browser execution blocked. Do not reuse a real existing row.
**Ideal path**: 2 — Open its category and remove the clearly identified disposable item.
**Alternate paths**: None found. Row removal is the only exposed delete action; there is no visible edit/detail delete path, confirmation, or undo.

### Steps

1. Open `Contact info` → identify the exact disposable metadata row; search by name if other synthetic fixtures exist.
2. Activate `Remove UX Disposable Contact` only within the isolated fixture → the handler immediately requests removal and disables the button while pending.
3. Observe the refreshed list and category count → verify the item is absent and other synthetic items remain.
4. If the category is now empty, inspect `No saved contact info yet.` and the still-available `Add contact` action.

### Variations

- The shared row removal behavior applies to Logins, Cards, Addresses, and additional metadata categories too; do not delete multiple types simply for coverage.
- With many synthetic entries, scrolling progressively reveals batches of 50; searching resets the visible slice and can locate the exact target.

### Edge Cases

- Clicking the trash icon has immediate effect: there is no intermediate confirmation or undo in this component. Report this clearly as source-derived until an isolated observation exists.
- The row component does not render mutation errors; a failed deletion could be difficult to distinguish from an ignored click.
- Similar labels and truncated metadata increase the importance of target identification; do not guess which item to delete.

**Sources**: `src/app/(authenticated)/vault/_components/section.tsx`; `src/app/(authenticated)/vault/_components/contacts/index.tsx`; `src/app/(authenticated)/vault/page.tsx`.

## Redundancy and coverage limits

- Personal info and Vault Contact info/Addresses overlap in field concepts but have different handling; the profile page explicitly explains direct agent use while keeping passwords/payment details in Vault.
- Category counts appear both on the Vault category surface and in the opened list description; inspect consistency after mutations.
- Manual login add and bulk import share an outcome but support distinct inputs and authentication modes.
- One short and four medium stories cover profile save/recovery, passwordless login creation/search, category form inspection/cancel, import validation, and isolated removal.
- Actual card/address save, secret-bearing import, live removal, >50-entry pagination, real server failure, and setup-link variants require appropriate isolated fixtures. The catalog does not count them as observed passes.

# Cards in the vault: product and provider feasibility

Status: **Proposed — research only; no implementation authorized.**
Research date: 2026-09-05. Repository baseline: `43b88611e04effe700423ce2f1d553553388e065`.

## Decision being investigated

Users should be able to bring an existing personal or business card, and
separately obtain a new business card from a third-party provider. The second
choice must say whether it offers credit or only spends deposited money.
Initial research assumes US businesses, particularly Square merchants; this
is a working assumption, not a confirmed audience restriction.

Do not select a provider or build an issuing platform yet. A provider can
offer a card to its own customers without exposing an API that lets
OpenInstinct distribute it. Likewise, issuing a card does not establish that
our browser agent can use it at the intended merchant.

This document records public documentation and source inspection. It does not
prove partner acceptance, an approved card application, sandbox execution,
live merchant acceptance, pricing negotiated for us, or credit availability.
No accounts were opened, bank accounts linked, applications submitted, or
payments made. Provider questions below are drafts; none were sent.

### Current conclusion

The most promising first direction is to let owners use an existing card,
with an optional route to a business-card provider they already know through
their POS. Square has the closest overlap with this repository. A bank
connection is not inherently needed for bringing a card, while a new credit
application can require business verification, financial review and repayment
access. Ramp offers a real partner application path but excludes some small
businesses; Stripe issuing would give us materially more responsibility.
These are feasibility judgments based on the evidence below. Provider access
and real checkout compatibility remain open, so no implementation should start
from this document alone.

## What the user is actually choosing

| Choice                              | Where spending power comes from                             | New bank connection?                                                                               | User obligation                                                             |
| ----------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Add a card I already have           | Existing issuer and existing account                        | Not inherently required merely to save/use the card; provider authentication can still be required | Own or be authorized to use the card; approve delegated use                 |
| Get a funded business spending card | Money deposited before spending                             | Depends on funding rails; bank transfer or wallet top-up, potentially POS proceeds                 | Complete required onboarding and supply funds; wait for spendable balance   |
| Apply for a business charge card    | Provider-approved credit, paid in full each period          | Commonly required for financial review and repayment; exact requirements belong to the provider    | Business verification, underwriting, agreements and repayment authorization |
| Apply for revolving business credit | Provider-approved credit with a balance that can carry over | Product-specific                                                                                   | Credit application and applicable interest/repayment terms                  |

These rows are a product taxonomy, not promises that every provider supports
each choice. "Business card" describes intended use; "virtual" describes the
credential format. Neither term tells the user whether they are borrowing.
Stripe's charge-card documentation explicitly distinguishes pay-in-full cards
from revolving balances. [Charge-card model](https://docs.stripe.com/issuing/credit)

## Proposed user journeys to validate

### 1. Bring an existing card

In Vault → Cards, choose **Add an existing card**. Explain whether it is saved
for user-approved checkout or can support a separately authorized spending
mandate. Open provider-hosted card entry; return to masked metadata and setup
status. The user selects the card for a purchase, reviews merchant, items,
total and recurrence, and completes any issuer authentication.

An existing business card belongs here too. An employee having possession of
a card does not establish permission to enroll the company's whole account.
Plan for an owner/admin handoff rather than asking an agent to accept terms.

Agentcard's wallet documentation describes existing-card enrollment without
an issuing identity check or prefunded balance, with device approval for
purchases. Its separate unattended network-token enrollment excludes business,
prepaid and Chase cards. Thus "can add a business card" must not imply
"can use that card unattended." [Wallet and enrollment](https://docs.agentcard.sh/wallet/how-the-wallet-works)

### 2. Obtain a card through an existing POS relationship

Show **Explore business cards** alongside existing-card setup. If the user has
connected Square, explain the relevant Square offering and direct them to
Square's authenticated application flow where appropriate. Do not claim
eligibility from sales data, invent a credit limit, or advertise a guaranteed
offer. If no authorized status API exists, the user completes the provider
flow and returns to add their card; we cannot label this automatic issuance.

This is the lowest-integration research candidate for POS merchants. It still
needs distribution/branding permission where applicable and confirmation that
the issued credential can be used through the selected checkout provider.

### 3. Apply for a third-party business charge card

The owner chooses a provider, reviews eligibility, then completes the
provider's business application. Expected information to verify with each
provider includes legal entity name, entity type, tax ID, business address,
industry, owner/control-person identity, revenue or cash information, and
authority to act for the business. Do not collect all of this ourselves if the
provider can host the application.

Explain bank access before requesting it: financial information for credit
review and permission to debit repayments serve different purposes. After
provider approval and account setup, connect the account using the approved
partner flow or let the user add the issued card. Pending review, further
documents and declined applications need distinct outcomes. Neither a
successful bank link nor a submitted application means the card is ready.

### 4. Set aside money for an agent

The owner explicitly chooses a funded card, completes onboarding, deposits
money, and sees the available amount after settlement. The agent can spend
only under the user's approved policy and our purchase approval boundary.
Insufficient funds should lead to a user funding action, not an automatic
debit or a surprise switch to another card.

This is useful for a bounded expense budget, but it does not give a
cash-constrained business working capital. Agentcard describes balance-backed
issuance after identity verification. Its personal wallet documentation says
balances are held in USDC, offers Apple Pay/Google Pay funding, and describes
bank withdrawals. Embedded business-program funding, asset custody, fees and
eligibility remain **TBD**; personal CLI behavior is not evidence of our
commercial terms. [Funding and withdrawals](https://docs.agentcard.sh/personal/cli/wallet)

## What "connect a bank account" can mean

1. **Read financial data:** account ownership, balances or transactions for
   underwriting and ongoing limit evaluation. This is not by itself permission
   to withdraw money.
2. **Authorize funding:** transfer money into a card balance, possibly through
   an ACH debit mandate. Funds can be pending before becoming available.
3. **Authorize repayment:** settle a charge/credit-card bill when due. The
   provider must explain schedule, amount calculation and failure consequences.
4. **Send money from the bank:** a push transfer may avoid sharing bank-login
   access. It still moves funds and may have settlement delays.

Stripe's documented funding options illustrate the distinction: US pull
funding requires bank verification and debit authorization; push funding
originates at the user's bank. Pull-funded funds can take up to five business
days, and pending top-ups are not spendable. Availability differs by region
and preview status. [Connect funding](https://docs.stripe.com/issuing/connect/funding)

For the first product, prefer provider-hosted bank linking and applications.
OpenInstinct needs connection/status references, not bank-login credentials.
Disconnecting OpenInstinct should stop delegated access; it must not be
described as closing the provider account or cancelling outstanding debt.

## POS overlap

The strongest overlap is **the merchant's existing financial relationship**.
Publicly documented merchant products are not proof of third-party issuance
access. Negative API findings below mean "not established in the reviewed
public docs," not "no private partnership can exist."

| POS/provider  | Existing merchant product                                                             | Funding or repayment connection                                                                  | Feasible research direction for us                                              |
| ------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Square        | Checking/debit plus a separate invite-only revolving credit card                      | Spend Square proceeds; credit repayments can use an existing linked account or sales withholding | Prioritize provider handoff and bring-existing-card compatibility               |
| Toast         | Current Checking/debit plus a documented business credit card                         | Checking can receive sales; credit obligations can affect bank debits and sales receipts         | Provider handoff; confirm credit availability directly                          |
| Shopify       | Balance spending account plus Credit charge card                                      | Shopify Payments payouts and the existing payout bank/Balance account                            | Relevant to Shopify merchants; not a general issuance API                       |
| Stripe        | Payments ecosystem plus Connect/Issuing infrastructure                                | Separate Issuing balance, with eligible payments-balance transfers                               | Technically coherent, but a card program rather than a simple merchant referral |
| Clover/Fiserv | Clover settlement/financing products; separate Fiserv embedded-finance infrastructure | Clover Rapid Deposit sends sales proceeds to an existing debit card                              | Do not treat Clover connectivity as card-program access                         |

### Square: strongest immediate audience overlap

Square Checking offers a debit card and access to Square sales proceeds after
account setup. A digital card is available through Square's own interfaces.
This can avoid asking a merchant to pre-fund an unrelated agent wallet, but
opening checking remains a financial-account decision with verification.
[Checking setup](https://squareup.com/help/us/en/article/7594-get-started-with-square-checking)

Square Credit Card is a separate, invite-only American Express product issued
by Celtic Bank. Square uses sales/account history in its offer decisions;
the owner checks the offer and applies in Square Dashboard. Eligibility
checking does not itself affect credit, but Square tells users to consult
the offer regarding approval's credit impact. We cannot promise approval or
universal merchant acceptance.
[Credit application](https://squareup.com/help/us/en/article/7471-square-credit-card-faqs)

For credit repayment, the owner can use Square Checking or their existing
linked external bank for manual/autopay payments. Optional Smart Repayment
withholds a portion of daily sales. Carried balances incur interest. Thus a
second bank connection may be unnecessary, but repayment still uses business
cash and can reduce the proceeds arriving for other bills.
[Repayment options](https://squareup.com/help/us/en/article/8656-set-up-and-manage-square-credit-card-smart-repayment)

The public **Cards API stores customer payment cards** for paying Square
sellers; it does not open Square credit/checking accounts or issue merchant
spending cards. Shared cards still concern payments to participating sellers,
not a portable credential for arbitrary supplier websites. Bank Accounts and
Payouts APIs expose linked accounts/settlement information, not an issuing
flow. Our existing read scopes do not include `BANK_ACCOUNTS_READ`.
[Cards API](https://developer.squareup.com/docs/cards-api/overview),
[Bank Accounts API](https://developer.squareup.com/docs/bank-accounts-api),
[Payouts API](https://developer.squareup.com/docs/payouts-api/overview)

### Toast: separate current checking and credit paths

Toast's Checking page, updated August 17, 2026, describes a Thread Bank
checking account and debit Mastercard, automatic allocation from Toast sales,
and vendor payments. Optional instant deposits carry a published 1.75% fee.
Use this current product evidence rather than assuming an older Toast
Restaurant Card announcement establishes today's onboarding or issuer.
[Toast Checking](https://pos.toasttab.com/products/toast-checking)

Toast's credit FAQ, last updated June 12, 2025, describes a WebBank Visa
business credit card, application through Toast Web, business/ownership
verification, interest and minimum payments. It explicitly accommodates a
sole proprietor signing for their restaurant. Missed payments can trigger
bank debits or withholding sales receipts. This is useful evidence of a
product, but current new-applicant availability remains untested.
[Toast credit FAQ](https://pos.toasttab.com/toast-credit-card-faq)

The reviewed Toast API catalog covers restaurant operations and payment
acceptance. Its credit-card authorization endpoint charges a guest; it is
not merchant-card issuance. No public business-card application/issuance
endpoint was established. [Toast APIs](https://doc.toasttab.com/openapi/)

### Shopify: reuse the merchant's payments relationship

Balance requires an eligible US/Puerto Rico merchant, Shopify Payments,
identity/business information and security setup. Shopify Payments payouts
can fund Balance after setup. Moving payouts is a choice the owner must
understand; "add a card" should not silently reroute operating cash.
[Balance eligibility](https://help.shopify.com/en/manual/finance/shopify-balance/eligibility),
[Balance payouts](https://help.shopify.com/en/manual/finance/shopify-balance/payouts)

Shopify Credit is offer-based and uses business performance rather than a
credit-score application check. It requires US/Puerto Rico residence,
SSN/ITIN, Shopify Payments and verification. It uses the bank or Balance
account already connected to Shopify Payments. An invitation is not approval.
[Credit requirements](https://help.shopify.com/en/manual/finance/shopify-credit/getting-started)

Shopify calls Credit a pay-in-full charge card, but currently documents both
monthly full repayment and repayment over ten calendar months from daily
sales for a fee. Do not reduce its actual terms to "pay everything next
month." Stripe powers the card and Celtic Bank issues it: evidence that a
POS/commerce platform can build on issuing infrastructure, not that we can
reuse Shopify's program. Public account/payout queries do not establish
third-party opening or issuing permission.
[Credit terms overview](https://help.shopify.com/en/manual/finance/shopify-credit),
[Finance account query](https://shopify.dev/docs/api/admin-graphql/unstable/queries/balanceAccount)

### Stripe and Clover/Fiserv: infrastructure is a different commitment

Stripe supports moving eligible acquiring balances into Issuing balances;
these balances are separate and some transfer mechanisms are previews.
This overlap is useful if we operate the appropriate Stripe payments/Connect
relationship. Merely connecting an unrelated merchant's POS does not grant
access to its sales proceeds or transfer them to our card program.
[Stripe funding options](https://docs.stripe.com/issuing/adding-funds-to-your-card-program)

Clover Rapid Deposit moves eligible proceeds to a merchant's existing debit
card; Clover Capital is sales-based financing, not a newly issued spending
card. Fiserv separately advertises embedded checking and debit/prepaid/credit
issuing APIs. Those require a separate commercial investigation; Clover POS
access does not establish Fiserv program access, cost, or liability terms.
[Rapid Deposit](https://www.clover.com/financial-solutions/rapid-deposit),
[Clover Capital](https://www.clover.com/financial-solutions/clover-capital),
[Fiserv embedded finance](https://www.fiserv.com/en/solutions/embedded-finance.html)

## How a small-business owner may perceive this

The following are **hypotheses to validate with owners**, not interview
findings. The proposition should be completing a useful purchase with clear
control, rather than getting a card for the sake of giving an AI spending power.

| Owner's likely question                             | What our proposed experience must explain                                                                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| "I already have a business card. Why another one?"  | Existing cards remain the primary path. A new card is optional and must solve a stated cash, control or accounting need.                              |
| "Are you selling me a loan?"                        | Label deposited-money, charge and revolving-credit products plainly, with provider identity, costs and repayment terms before an application.         |
| "Why do you need my bank?"                          | Explain who receives access, what they read, and whether/how they can debit. Do not call a funding/repayment connection read-only.                    |
| "Will this change where my daily sales go?"         | Show any payout rerouting or sales withholding explicitly. Do not treat sales proceeds as spare cash.                                                 |
| "Can it buy things behind my back?"                 | Keep purchase approval as the starting behavior. Explain the actual limit and pause controls; do not advertise unattended spending before proving it. |
| "What if it orders twice or buys the wrong thing?"  | Explain order confirmation, uncertain-result handling, cancellation and who handles the refund. A card limit alone does not solve this.               |
| "Will my bookkeeper understand it?"                 | Preserve merchant, receipt, business purpose, funding source and refund status; validate exports/reconciliation rather than assuming them.            |
| "Who do I call when it goes wrong?"                 | Separate OpenInstinct purchase assistance from issuer disputes, funding and repayment support.                                                        |
| "Can I stop using this without moving my business?" | State what disconnecting stops and what remains with the provider, including bills and recurring merchant charges.                                    |

Proposed presentation: **Add an existing card** first; **Explore business
card options** second. Within options, distinguish **Spend money already in
your account** from **Apply for business credit**. These are research copy
examples, not approved screen designs. Avoid defaulting to "Get an AI credit
card," an unexplained bank-link screen, or a credit offer immediately after a
declined purchase. Let the owner finish ordinary work without applying.

Example to test: a cafe owner asks the agent to reorder packaging. Start
with their current card and explicit order approval. If they ask for another
payment method, explain Square debit as spending their own sales proceeds,
and Square credit as a separate application and repayment obligation. Do not
recommend borrowing merely because the agent cannot complete checkout.

Research should include a sole proprietor with an existing card, an
incorporated shop with fluctuating cash, an owner already using POS banking,
and an employee who lacks financial-account authority. Ask each to describe
their last supplier purchase, bill-payment method, bank-link tolerance,
repayment concerns and what they think "pause" would stop. Record their own
words, observed misunderstandings and drop-off points. Sample size,
recruitment and measured results are **TBD**; no conversion claim exists.

## Distribution models and provider fit

### Established business-card providers: Ramp and Brex

Ramp's US application guide requires a registered corporation/LLC/LP,
physical US address, EIN and at least $25,000 cash in a linked US business
bank account; it excludes sole proprietors. It says no personal guarantee
is required. Application details include business information, an officer's
identity and banking information. This excludes part of a typical
small-business audience before any technical integration is considered.
[Ramp qualifications](https://support.ramp.com/applying-and-signing-up-for-ramp-us-based/)

Ramp uses bank connections for financial review and statement payments;
manual account details and statements are a fallback when direct linking
fails. Its standard card statements require full repayment each cycle.
Do not describe that bank connection as underwriting-only or the card as
revolving credit.
[Bank connections](https://support.ramp.com/ramp-bank-connections-overview/),
[Statements](https://support.ramp.com/ramp-card-statements-and-payments-overview/)

Ramp has a documented partner-only Applications API: it can prefill an
application, but the applicant finishes submission in Ramp. Production
partnership and approved access remain TBD for us. Agent Cards add
purchase-scoped credentials, but currently exclude 3DS and recurring/card-on-file
payments. Those limits apply to the Agent Cards route, not every Ramp card.
[Applications](https://docs.ramp.com/developer-api/v1/applications),
[Agent Cards](https://docs.ramp.com/developer-api/v1/agent-cards)

Brex is another partner-onboarding candidate but publicly focuses on startups
and scaled businesses. Its commercial monthly-card guidance calls for more
than $500,000 annual revenue; funded-startup guidance differs. Applicants need
US incorporation, EIN, operations and a physical address. Meeting published
criteria does not guarantee approval. This is not an inclusive default for
every small merchant.
[Brex requirements](https://www.brex.com/support/brex-account-requirements)

Brex exposes referral/prefill onboarding, with partner credentials, an access
agreement and production approval. Its bank-payment documentation describes
external business-account verification and ACH autopay, not personal-account
funding. Treat this as a provider application relationship, not a self-service
white-label credit program.
[Partner onboarding](https://developer.brex.com/docs/partner_onboarding),
[Referrals](https://developer.brex.com/onboarding/referrals),
[Payment bank accounts](https://www.brex.com/support/manage-bank-accounts-for-payments-to-brex)

### Existing-card and agent-payment providers

Agentcard (`agentcard.sh`) is an existing-card/controlled-spend candidate,
not evidence of an underwritten business credit offer. Its documentation
describes a hosted wallet and a Kernel-specific checkout path with user-device
approval. Kernel overlaps with our runtime, but this is a separate integration
contract from native vault autofill. We must verify supported processors,
merchant failures, approval binding and secrets handling before adopting it.
[Browser checkout](https://docs.agentcard.sh/vault)

Linq documents Agentcard customer connections and payment-specific credential
handoffs. Existing Linq messaging access does not prove payments enrollment.
Several linked onboarding/go-live pages were unavailable during research.
Confirm the exact supported API version and how Linq's handoff relates to
Agentcard's newer wallet flow; do not combine snippets into an assumed
contract. `agentcard.ai` is a different domain/product from `agentcard.sh` and
its limits and funding rules must not be mixed into this evaluation.
[Linq Agentcard overview](https://docs.linqapp.com/guides/agentcard/)

### Issuing infrastructure

Stripe has real third-party issuing APIs through Connect, with onboarding and
capability requirements. An existing ordinary Stripe account is not
automatically eligible for this account model; the documented default assigns
requirements collection and payment loss liability to the platform, with
other configurations requiring access confirmation.
[Issuing with Connect](https://docs.stripe.com/issuing/connect)

Stripe's program-management matrix assigns underwriting and capital to the
platform even when Stripe manages the program. Charge-card APIs are in
private preview and require admission to the US receivables-purchase program.
Therefore this is a larger financial-product commitment than referring a
merchant to an existing card provider. It is not the recommended first step
for a research-stage Cards feature.
[Responsibilities](https://docs.stripe.com/issuing/program-management),
[Credit access and funding](https://docs.stripe.com/issuing/credit)

Lithic also documents commercial charge-card infrastructure; evaluate it only
if we decide to run a card program and obtain explicit terms covering
underwriting, capital, banking and servicing responsibilities. No access or
commercial feasibility is established by its quickstart.
[Lithic commercial charge cards](https://docs.lithic.com/docs/quick-start-commercial-charge-card)

## User tasks that determine feasibility

These are proposed research scenarios, not observed customer behavior:

| Task                                               | Needed behavior                                                     | Failure to investigate                                            |
| -------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Restaurant orders supplies                         | Existing business card or usable POS-funded card; itemized receipt  | Supplier only takes invoice/ACH; card surcharge; checkout failure |
| Retailer restocks inventory before a sales weekend | Credit if current cash is insufficient                              | A prefunded card does not solve the cash shortfall                |
| Owner buys a one-time software license             | Amount-bound approval and payment                                   | Merchant verification charge consumes a single-use credential     |
| Business pays monthly SaaS or ads                  | Recurring/merchant-initiated payments and durable limits            | Single-use agent card fails on renewal or metered billing         |
| Owner books travel                                 | Deposits, incremental authorizations, refunds and issuer challenges | Final charge differs from quote; hotel requires physical card     |
| Employee asks the agent to buy equipment           | Company authority and correct workspace/card                        | Employee enrolls or spends from an account they cannot administer |

POS sales can help explain spending capacity, but gross sales are not
available cash: refunds, fees, reserves, payouts and pending settlements
matter. Do not calculate an "agent budget" directly from a sales chart.

## Current repository boundary

Source inspection at the baseline above establishes only:

- [Cards UI](<../src/app/(authenticated)/vault/_components/cards/index.tsx>)
  lists saved cards and accepts a manual card form.
- [Vault payload](../src/lib/vault.ts) includes a card number and security code;
  [vault service](../db/services/vault.ts) encrypts saved secrets.
- [Purchase execution](../agent/subagents/browser-agent/tools/commit_browser_action.ts)
  always requests approval and verifies worker/browser scope, origin and
  target. Standalone payment autofill is rejected.
- [Square scopes](../src/lib/square.ts) are eight read scopes. The existing
  connector cannot be treated as permission to open banking accounts, apply
  for credit, move proceeds or authorize card spend. See [Square](SQUARE.md).

There is a specific existing-card launch question: PCI SSC says verification
codes cannot be retained after authorization for future card-on-file use.
The current reusable payload includes that code. Encryption alone should
not be treated as resolving that requirement. Provider handling and our exact
role must be reviewed before enabling this workflow for real customer cards;
this research does not change or migrate stored data.
[PCI SSC FAQ 1280](https://www.pcisecuritystandards.org/faqs/1280/)

Proposal: preserve opaque payment handles and current purchase approval;
keep provider-managed secrets with the provider wherever possible. Bank
linking, card application, funding, increased limits and checkout each need
their own clear user authorization. No new schema, generic provider layer,
agent tool or UI has been implemented by this document.

## Feasibility gates before implementation

| Gate               | Evidence needed                                                                             | Current state                        |
| ------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| Audience           | Initial countries, business types and owner/employee roles                                  | US/Square working assumption         |
| Product value      | Merchant interviews showing existing-card, cash-budget or credit need                       | Not conducted                        |
| Provider access    | Written confirmation of partner/distribution access and supported flow                      | TBD; not contacted                   |
| Economics          | Program fees, funding/FX costs, minimums, revenue share, loss allocation and support duties | TBD; no commercial quote             |
| Onboarding         | Hosted flow, required information, bank permissions, review/rejection behavior              | Public documentation only            |
| POS compatibility  | Whether existing seller identity/proceeds can actually be reused via permitted APIs         | Provider-specific; no account tested |
| Agent checkout     | Own-worker compatibility, merchant/category coverage, recurring and challenge support       | Not tested                           |
| Recovery           | Duplicate requests, expired credentials, uncertain charge, refund and revoked access        | Proposed cases only                  |
| Card-data boundary | Provider-approved handling and resolution of reusable security-code storage                 | Open                                 |

Stripe publishes a US virtual-card creation price of $0.10, but that is not
the cost of operating a program. A feasibility budget must also account for
funding, disputes, international use, support and any credit exposure; do not
model profitability from the per-card price alone.
[Virtual-card pricing and service-provider scope](https://docs.stripe.com/issuing/cards/virtual)

### Questions for providers, not yet sent

1. Can we distribute your business card to our customers, or only refer them?
   Is an approved partnership required? Is application status available by API?
2. Who can qualify: sole proprietor, LLC, corporation, owner abroad, no SSN,
   new business, low cash or low revenue? Which countries are supported?
3. Is it debit/prefunded, pay-in-full charge, or revolving credit? Who lends,
   supplies capital, bears nonpayment and handles adverse decisions?
4. What financial data do you access, through which provider, for how long?
   What separate mandate permits funding or repayments? Are statements or
   push transfers alternatives to a connected bank?
5. Can an existing POS merchant reuse verification or receive funds directly
   from sales? Which API scopes and settlement rules apply?
6. Can our own Kernel worker pay with the card while preserving exact-order
   approval? Are 3DS, recurring charges, deposits and refunds supported?
7. What happens after a timeout, decline, partial capture, refund, revoked
   connection or business closure? Which state is authoritative?
8. What are all platform and user fees, minimum volumes, restrictions on
   branding, support responsibilities and data-handling obligations?

### Proposed research sequence

Recommendation for the next research decision: prioritize existing-card use
and a Square-aware provider handoff. Investigate Ramp as an optional partner
for qualifying incorporated businesses. Keep prefunded Agentcard and a
Stripe/Fiserv/Lithic card program as separate choices, not substitutes for a
small merchant's request for credit. No provider is selected.

First validate the two user choices with merchants using the scenarios above.
Then resolve provider access and funding responsibilities on paper. Only
after the user authorizes implementation should a bounded sandbox prototype
exercise onboarding, one approved purchase, decline/retry prevention and a
refund. Sandbox success would not prove live funding, underwriting, or
merchant acceptance. Any real-money pilot needs separately authorized test
accounts, an explicit spending ceiling and observed settlement/reconciliation.

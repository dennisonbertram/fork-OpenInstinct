import { applicationOrigin } from "@/lib/application-origin";
import {
  directChannelOnboardingPayloadSchema,
  type DirectChannelOnboardingPayload,
} from "@/lib/channel-onboarding-contract";
import {
  ONBOARDING_BETA_AND_STOP,
  ONBOARDING_CAPABILITY_EXAMPLES,
  ONBOARDING_EXAMPLE_CARDS,
  ONBOARDING_INTRO,
  ONBOARDING_WELCOME,
} from "@/agent/lib/onboarding/messages";

type WelcomeCardMode = "disabled" | "carousel" | "single_media";

export interface BuildWelcomeOperationsInput {
  readonly from: string;
  readonly to: string;
  readonly cardMode: WelcomeCardMode;
  readonly assetOrigin?: string;
}

export interface WelcomeOperation {
  readonly key: string;
  readonly required: boolean;
  readonly payload: DirectChannelOnboardingPayload;
}

function assetUrls(assetOrigin: string): readonly string[] {
  const origin = new URL(assetOrigin);
  if (origin.protocol !== "https:") {
    throw new Error(
      "Onboarding card assets require an HTTPS application origin."
    );
  }
  return [1, 2, 3].map(
    (number) => `${origin.origin}/onboarding/example-${String(number)}.png`
  );
}

function payload(
  from: string,
  to: string,
  text: string,
  presentation: DirectChannelOnboardingPayload["presentation"],
  media?: DirectChannelOnboardingPayload["media"]
): DirectChannelOnboardingPayload {
  return directChannelOnboardingPayloadSchema.parse({
    from,
    media,
    presentation,
    text,
    to,
    version: 1,
  });
}

/** Builds welcome work; opening-request classification remains caller-owned. */
export function buildWelcomeOperations({
  from,
  to,
  cardMode,
  assetOrigin,
}: BuildWelcomeOperationsInput): readonly WelcomeOperation[] {
  const requestedCardMode: unknown = cardMode;
  if (
    requestedCardMode !== "disabled" &&
    requestedCardMode !== "carousel" &&
    requestedCardMode !== "single_media"
  ) {
    throw new Error("An explicit onboarding card mode is required.");
  }
  const operations: WelcomeOperation[] = [
    {
      key: "onboarding:v1:text:welcome",
      payload: payload(from, to, ONBOARDING_WELCOME, { kind: "text" }),
      required: true,
    },
    {
      key: "onboarding:v1:text:introduction",
      payload: payload(from, to, ONBOARDING_INTRO, { kind: "text" }),
      required: true,
    },
    {
      key: "onboarding:v1:text:examples",
      payload: payload(from, to, ONBOARDING_CAPABILITY_EXAMPLES, {
        kind: "text",
      }),
      required: true,
    },
  ];

  if (cardMode !== "disabled") {
    const urls = assetUrls(assetOrigin ?? applicationOrigin());
    if (cardMode === "carousel") {
      operations.push({
        key: "onboarding:v1:card:album",
        payload: payload(
          from,
          to,
          "",
          { kind: "carousel" },
          urls.map((url) => ({ contentType: "image/png", url }))
        ),
        required: false,
      });
    } else {
      for (const [ordinal] of ONBOARDING_EXAMPLE_CARDS.entries()) {
        const url = urls[ordinal];
        if (!url) throw new Error("Missing onboarding card asset URL.");
        operations.push({
          key: `onboarding:v1:card:${String(ordinal)}`,
          payload: payload(from, to, "", { kind: "single_media" }, [
            { contentType: "image/png", url },
          ]),
          required: false,
        });
      }
    }
  }

  operations.push({
    key: "onboarding:v1:text:beta",
    payload: payload(from, to, ONBOARDING_BETA_AND_STOP, { kind: "text" }),
    required: true,
  });
  return operations;
}

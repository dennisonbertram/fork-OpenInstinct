/** Fixed, bounded text for the first-contact onboarding journey. */
export const ONBOARDING_WELCOME = "You’re in! 🎉";

export const ONBOARDING_INTRO =
  "Welcome! I’m Jory. I help you run your small business, right here in Messages.";

export const ONBOARDING_CAPABILITY_EXAMPLES =
  "Let’s try something useful. Here are a few ways I can help with your Square account, stock, and deliveries.";

export const ONBOARDING_EXAMPLE_CARDS = [
  {
    label: "Example conversation • sample data",
    title: "Daily sales",
    conversation: [
      { speaker: "Owner", text: "How did we do today on Square?" },
      {
        speaker: "Jory",
        text: "$1,248 across 47 sales. Iced coffee was your bestseller.",
      },
      { speaker: "Owner", text: "What were our top sellers?" },
      {
        speaker: "Jory",
        text: "Iced coffee, croissants, and oat milk lattes. Want the item-by-item breakdown?",
      },
    ],
  },
  {
    label: "Example conversation • sample data",
    title: "Low stock",
    conversation: [
      { speaker: "Owner", text: "What needs restocking?" },
      {
        speaker: "Jory",
        text: "Milk, cups, and lids are below their reorder points.",
      },
      { speaker: "Owner", text: "Make me a restock checklist." },
      {
        speaker: "Jory",
        text: "• Milk: confirm quantity\n• Cups: confirm quantity\n• Lids: confirm quantity\nThen confirm all quantities before placing an order.",
      },
    ],
  },
  {
    label: "Example conversation • sample data",
    title: "Receiving a delivery",
    conversation: [
      {
        speaker: "Owner",
        text: "The delivery note says 12 boxes. Only 10 arrived.",
      },
      { speaker: "Jory", text: "Which two boxes are missing?" },
      { speaker: "Owner", text: "The oat milk and paper cups." },
      {
        speaker: "Jory",
        text: "I’ll draft a supplier message for your review: ‘Two boxes were missing from today’s delivery: oat milk and paper cups.’",
      },
    ],
  },
] as const;

export const ONBOARDING_BETA_AND_STOP =
  "I’m in beta, so tell me if something goes wrong. Reply STOP to stop messages.";

export const ONBOARDING_RECOVERY =
  "I couldn’t complete that request right now. Please try again later.";

export const ONBOARDING_RATE_LIMITED =
  "I’m a little busy right now. Please try again later.";

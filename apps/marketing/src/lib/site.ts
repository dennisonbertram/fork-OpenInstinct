const DEFAULT_SITE_URL = "https://heyjory.com";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL;

export const SITE_NAME = "Jory";
export const SITE_TITLE = "Jory — Your AI manager.";
export const SITE_DESCRIPTION =
  "Jory handles the day-to-day so your team can focus on what matters most.";

export const sharedOpenGraph = {
  type: "website" as const,
  url: SITE_URL,
  siteName: SITE_NAME,
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  images: [
    {
      url: "/og-home.png",
      width: 1200,
      height: 630,
      alt: "Jory — Train your staff once. Prove it every shift.",
    },
  ],
};

export const sharedTwitter = {
  card: "summary_large_image" as const,
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  images: ["/og-home.png"],
};

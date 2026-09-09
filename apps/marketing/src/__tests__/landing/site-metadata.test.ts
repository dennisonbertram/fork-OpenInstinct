import { describe, it, expect } from "vitest";
import { SITE_URL, sharedOpenGraph, sharedTwitter } from "@/lib/site";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("site metadata", () => {
  it("uses the production site URL", () => {
    expect(SITE_URL).toBe("https://heyjory.com");
  });

  it("declares Open Graph and Twitter card metadata", () => {
    expect(sharedOpenGraph.siteName).toBe("Jory");
    expect(sharedOpenGraph.url).toBe("https://heyjory.com");
    expect(sharedOpenGraph.images?.length).toBeGreaterThan(0);
    expect(sharedTwitter.card).toBe("summary_large_image");
  });

  it("allows crawling and points robots at the sitemap", () => {
    const result = robots();
    expect(result.sitemap).toBe("https://heyjory.com/sitemap.xml");
    expect(result.rules).toMatchObject({ userAgent: "*", allow: "/" });
  });

  it("lists public marketing routes and excludes internal tooling", () => {
    const entries = sitemap();
    const paths = entries.map((entry) => new URL(entry.url).pathname);
    for (const path of [
      "/",
      "/features",
      "/how-it-works",
      "/pricing",
      "/security",
      "/about",
      "/why",
    ]) {
      expect(paths).toContain(path);
    }
    for (const path of ["/qa", "/behavior-review", "/simulator"]) {
      expect(paths).not.toContain(path);
    }
  });
});

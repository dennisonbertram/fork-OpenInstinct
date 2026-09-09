import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const PUBLIC_ROUTES = [
  "/",
  "/features",
  "/how-it-works",
  "/pricing",
  "/security",
  "/about",
  "/why",
  "/terms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path === "/" ? "/" : path}`,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}

import type { Metadata } from "next";
import { WorldMount } from "./world-mount";

export const metadata: Metadata = {
  title: "The World of Jory",
  description:
    "Scroll to fly through the world of Jory — from the shop floor to the signed record.",
};

export default function WorldPage() {
  return <WorldMount />;
}

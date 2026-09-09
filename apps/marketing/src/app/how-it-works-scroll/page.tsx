import type { Metadata } from "next";
import { HowItWorksMount } from "./how-it-works-mount";

export const metadata: Metadata = {
  title: "How it works — Jory",
  description:
    "Scroll through how Jory works: record a process on your phone, and Jory turns it into a manager-approved handbook your team can reference by text or call.",
};

export default function HowItWorksScrollPage() {
  return <HowItWorksMount />;
}

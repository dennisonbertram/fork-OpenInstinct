"use client";

import dynamic from "next/dynamic";

const Agentation = dynamic(
  () => import("agentation").then((module) => module.Agentation),
  { ssr: false }
);

export function AgentationToolbar({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;

  return <Agentation />;
}

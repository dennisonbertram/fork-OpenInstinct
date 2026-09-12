"use client";

import dynamic from "next/dynamic";

const Agentation = dynamic(
  () => import("agentation").then((module) => module.Agentation),
  { ssr: false }
);
const agentationEndpoint = "http://127.0.0.1:4747";

export function AgentationToolbar({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;

  return <Agentation endpoint={agentationEndpoint} />;
}

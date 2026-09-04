import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import { QueryProvider } from "@/app/_providers/query-provider";
import { AgentationToolbar } from "@/components/dev/agentation-toolbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { env } from "@/env";
import { accessScopeForUser } from "@/lib/access-scope";
import { applicationOrigin } from "@/lib/application-origin";
import { getAuthSession } from "@/auth/session";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(applicationOrigin()),
  title: "OpenInstinct",
  description:
    "A self-hosted personal agent with private credentials and Kernel-powered browser execution.",
};

const interTight = Inter_Tight({
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter-tight",
});

const jetbrainsMono = JetBrains_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getAuthSession(await headers());
  const workspaceId = session
    ? accessScopeForUser(`better-auth:${session.user.id}`).workspaceId
    : undefined;

  return (
    <html
      lang="en"
      className={`${interTight.variable} ${jetbrainsMono.variable}`}
    >
      <body data-workspace-id={workspaceId}>
        <QueryProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </QueryProvider>
        <AgentationToolbar enabled={env.NODE_ENV === "development"} />
      </body>
    </html>
  );
}

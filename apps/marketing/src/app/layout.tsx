import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import "./globals.css";
import { AgentationToolbar } from "@/components/dev/agentation-toolbar";
import {
  SITE_DESCRIPTION,
  SITE_TITLE,
  SITE_URL,
  sharedOpenGraph,
  sharedTwitter,
} from "@/lib/site";
import { TooltipProvider } from "@/components/ui/tooltip";

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-inter-tight",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: sharedOpenGraph,
  twitter: sharedTwitter,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={interTight.variable}>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <AgentationToolbar />
      </body>
    </html>
  );
}

import React from "react";
import Link from "next/link";
import { SignupButton } from "./signup-button";

const NAV_LINKS: { label: string; href: string }[] = [
  { label: "Features", href: "/features" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Security", href: "/security" },
  { label: "About", href: "/about" },
  { label: "Why we're building Jory", href: "/why" },
];

export function Nav() {
  return (
    <nav
      className="landing-nav"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        columnGap: 40,
        alignItems: "center",
        padding: "14px 48px",
        maxWidth: 1440,
        margin: "0 auto",
        height: 72,
        boxSizing: "border-box",
      }}
    >
      {/* Brand */}
      <Link
        href="/"
        aria-label="JORY home"
        style={{
          fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          color: "#031128",
          textDecoration: "none",
          justifySelf: "start",
        }}
      >
        JORY
      </Link>

      {/* Nav links */}
      <div
        className="landing-nav-links"
        style={{
          display: "flex",
          gap: 56,
          fontSize: 16,
          fontWeight: 500,
          color: "#0D1A2F",
          justifySelf: "center",
        }}
      >
        {NAV_LINKS.map(({ label, href }) => (
          <Link
            key={label}
            href={href}
            style={{
              textDecoration: "none",
              color: "inherit",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* CTA */}
      <SignupButton
        className="landing-nav-cta"
        style={{
          background: "#01102B",
          color: "#fff",
          padding: "14px 16px",
          borderRadius: 16,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          display: "inline-flex",
          gap: 10,
          alignItems: "center",
          border: 0,
          cursor: "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          justifySelf: "end",
          height: 52,
          boxSizing: "border-box",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
          }}
          aria-hidden="true"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        Get early access
      </SignupButton>
    </nav>
  );
}

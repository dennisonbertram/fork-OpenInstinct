import React from "react";
import Link from "next/link";

export function Footer() {
  return (
    <footer
      className="landing-section landing-footer"
      style={{
        maxWidth: 1440,
        margin: "0 auto",
        padding: "22px 48px 32px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontSize: 16,
          letterSpacing: "-0.03em",
          color: "rgba(13,26,47,0.7)",
        }}
      >
        © 2026. Jory
      </span>
      <Link
        href="/terms"
        style={{
          fontSize: 16,
          letterSpacing: "-0.03em",
          color: "rgba(13,26,47,0.7)",
          textDecoration: "none",
        }}
      >
        Terms of Service
      </Link>
    </footer>
  );
}

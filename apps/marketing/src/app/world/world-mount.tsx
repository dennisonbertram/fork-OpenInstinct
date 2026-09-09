"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    mountScrollWorld?: (container: HTMLElement, config: unknown) => void;
  }
}

export const WORLD_CONFIG = {
  brand: { name: "Jory", href: "/" },
  cta: { label: "Read why", href: "/why" },
  hint: "scroll to fly in",
  diveScroll: 1.3,
  connScroll: 0.9,
  sections: [
    {
      id: "block",
      label: "Every Business",
      still: "/assets/world/block.webp",
      clip: "/assets/world/vid/block.mp4",
      accent: "#4434E8",
      linger: 0.4,
      eyebrow: "Every business that runs on the floor",
      title: "The manager who never clocks out.",
      body: "Cafes, job sites, cleaning crews, salons — Jory learns how your business runs, wherever the work happens.",
      tags: ["Cafes", "Construction", "Cleaning", "Salons"],
    },
    {
      id: "teach",
      label: "Teach It Once",
      still: "/assets/world/teach.webp",
      clip: "/assets/world/vid/teach.mp4",
      accent: "#7467E8",
      eyebrow: "Onboard without bottlenecks",
      title: "Train your staff once.",
      body: "Turn one good explanation into training every new hire can finish by text.",
      tags: ["Text-based training"],
    },
    {
      id: "shift",
      label: "Prove It",
      still: "/assets/world/shift.webp",
      clip: "/assets/world/vid/shift.mp4",
      accent: "#F7B313",
      eyebrow: "Know who is ready",
      title: "Prove it every shift.",
      body: "See signed proof before someone is put on shift.",
      tags: ["Quick checks", "Signed proof"],
    },
    {
      id: "jobsite",
      label: "The Job Site",
      still: "/assets/world/jobsite.webp",
      clip: "/assets/world/vid/jobsite.mp4",
      accent: "#FF5A32",
      eyebrow: "Standards, wherever work happens",
      title: "Run the check before the work starts.",
      body: "Run PPE checks by text and confirm site safety briefings before the crew picks up a tool.",
      tags: ["PPE checks", "Signed briefings"],
    },
    {
      id: "records",
      label: "The Record",
      still: "/assets/world/records.webp",
      clip: "/assets/world/vid/records.mp4",
      accent: "#7467E8",
      linger: 0.35,
      eyebrow: "Ready for the audit",
      title: "Records that hold up.",
      body: "Keep everything you need for unemployment-insurance compliance and audits ready at hand — automatically.",
      tags: ["Audit trail", "Signed proof"],
    },
    {
      id: "manager",
      label: "Every Location",
      still: "/assets/world/manager.webp",
      clip: "/assets/world/vid/manager.mp4",
      accent: "#4434E8",
      eyebrow: "Keep every location aligned",
      title: "One playbook, every location.",
      body: "Give managers the same checklist, proof, and follow-up loop.",
      tags: ["Every location", "One playbook"],
    },
    {
      id: "hero",
      label: "Jory",
      still: "/assets/world/hero.webp",
      clip: "/assets/world/vid/hero.mp4",
      accent: "#FF5A32",
      scroll: 1.6,
      linger: 0.45,
      eyebrow: "Early access",
      title: "Get early access.",
      body: "Teach Jory how your business should run. It turns your standards into text-based training, quick checks, signed proof, and manager follow-up.",
      tags: [],
      cta: {
        primary: { label: "Read why", href: "/why" },
        secondary: { label: "See how it works", href: "/how-it-works" },
      },
    },
  ],
  connectors: [
    "/assets/world/vid/conn1.mp4",
    "/assets/world/vid/conn2.mp4",
    "/assets/world/vid/conn3.mp4",
    "/assets/world/vid/conn4.mp4",
    "/assets/world/vid/conn5.mp4",
    "/assets/world/vid/conn6.mp4",
  ],
};

export function WorldMount() {
  const ref = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  // Swap the engine's default text brand for the Jory wordmark. The engine may
  // build `.sw-brand` a frame after mount, so retry until it exists rather than
  // querying once (a one-shot query intermittently missed and dropped the mark).
  const applyBrand = (attempt = 0) => {
    const root = ref.current;
    if (!root) return;
    const brandEl = root.querySelector<HTMLAnchorElement>(".sw-brand");
    if (brandEl) {
      if (!brandEl.querySelector("img[data-jory-wordmark]")) {
        brandEl.innerHTML = "";
        const img = document.createElement("img");
        img.src = "/assets/jory-wordmark.svg";
        img.alt = "Jory";
        img.dataset.joryWordmark = "1";
        img.style.height = "20px";
        img.style.width = "auto";
        img.style.display = "block";
        img.style.filter = "drop-shadow(0 2px 10px rgba(250,247,240,0.9))";
        brandEl.appendChild(img);
      }
      return;
    }
    if (attempt < 30) requestAnimationFrame(() => applyBrand(attempt + 1));
  };

  const tryMount = () => {
    if (mountedRef.current) return;
    if (!ref.current || !window.mountScrollWorld) return;
    mountedRef.current = true;
    window.mountScrollWorld(ref.current, WORLD_CONFIG);
    applyBrand();
  };

  useEffect(() => {
    tryMount();
  }, []);

  return (
    <>
      <style jsx global>{`
        .sw-btn--primary,
        .sw-topcta {
          color: #fff;
        }
        .sw-nav__item {
          white-space: nowrap;
        }
      `}</style>
      <div
        id="world"
        ref={ref}
        style={
          {
            "--sw-bg": "#FAF7F0",
            "--sw-ink": "#071B36",
            "--sw-ink-soft": "rgba(7,27,54,0.65)",
            "--sw-accent": "#4434E8",
          } as React.CSSProperties
        }
      />
      <Script
        src="/scroll-world/scrub-engine.js"
        strategy="afterInteractive"
        onReady={tryMount}
        onLoad={tryMount}
      />
    </>
  );
}

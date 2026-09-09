"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    mountScrollWorld?: (container: HTMLElement, config: unknown) => void;
  }
}

// Claymation stills generated to match the landing "world" aesthetic, with
// scroll-world camera-flight clips (dive-in per scene + aerial connectors)
// generated via Higgsfield. Stills double as posters until each clip paints.
const HOW_IT_WORKS_CONFIG = {
  brand: { name: "Jory", href: "/" },
  cta: { label: "Read why", href: "/why" },
  hint: "scroll to see how it works",
  diveScroll: 1.3,
  connScroll: 0.9,
  sections: [
    {
      id: "capture",
      label: "Capture it",
      still: "/assets/how-it-works/record.webp",
      clip: "/assets/how-it-works/vid/record.mp4",
      accent: "#4434E8",
      linger: 0.4,
      eyebrow: "Point your phone at the work",
      title: "Show how it's really done.",
      body: "Record it once — video, photos, and voice notes — right where the work actually happens.",
      tags: ["Video", "Photos", "Voice notes"],
    },
    {
      id: "handbook",
      label: "Durable handbook",
      still: "/assets/how-it-works/handbook.webp",
      clip: "/assets/how-it-works/vid/handbook.mp4",
      accent: "#7467E8",
      linger: 0.4,
      eyebrow: "One source of truth",
      title: "It becomes the handbook.",
      body: "Jory turns your recordings into a durable employee handbook your team can reach from anywhere.",
      tags: ["Always current", "Reachable anywhere"],
    },
    {
      id: "confirm",
      label: "Before the shift",
      still: "/assets/how-it-works/confirm.webp",
      clip: "/assets/how-it-works/vid/confirm.mp4",
      accent: "#0A972F",
      linger: 0.45,
      eyebrow: "Ready before the work starts",
      title: "They know it before they start.",
      body: "Jory makes sure each employee knows the process before they start work — and confirms they've got it.",
      tags: ["Pre-shift check", "Signed confirmation"],
    },
    {
      id: "onsite",
      label: "On the floor",
      still: "/assets/how-it-works/onsite.webp",
      clip: "/assets/how-it-works/vid/onsite.mp4",
      accent: "#F7B313",
      linger: 0.45,
      eyebrow: "Right there on the shift",
      title: "Jory works the floor with you.",
      body: "Onsite, Jory answers questions, confirms tasks, and keeps the crew's work organized — in real time.",
      tags: ["Answers questions", "Confirms tasks", "Organizes work"],
    },
    {
      id: "text",
      label: "Just a text",
      still: "/assets/how-it-works/text.webp",
      clip: "/assets/how-it-works/vid/text.mp4",
      accent: "#FF5A32",
      scroll: 1.6,
      linger: 0.5,
      eyebrow: "No app to install",
      title: "It all happens over text.",
      body: "Jory works over plain text messages — so a new hire is up and running in one message, with nothing to download.",
      tags: ["Just text", "Zero friction to add people"],
      cta: {
        primary: { label: "Read why", href: "/why" },
        secondary: { label: "Back to overview", href: "/how-it-works" },
      },
    },
  ],
  connectors: [
    "/assets/how-it-works/vid/conn1.mp4",
    "/assets/how-it-works/vid/conn2.mp4",
    "/assets/how-it-works/vid/conn3.mp4",
    "/assets/how-it-works/vid/conn4.mp4",
  ],
};

export function HowItWorksMount() {
  const ref = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  // Retry the wordmark swap until `.sw-brand` exists (the engine may build it a
  // frame after mount; a one-shot query intermittently dropped the wordmark).
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
    window.mountScrollWorld(ref.current, HOW_IT_WORKS_CONFIG);
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
        id="how-it-works-world"
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

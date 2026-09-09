"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { WORLD_CONFIG } from "@/app/world/world-mount";

declare global {
  interface Window {
    mountScrollWorld?: (container: HTMLElement, config: unknown) => void;
  }
}

// The world scroll-experience embedded as a pinned section on the homepage: it sticks
// to the viewport and the camera scrubs through the scenes as you scroll past it, then
// releases into the rest of the page. `embed: true` switches the engine into that mode;
// its own topbar/nav are hidden because the page already has a <Nav />.
export function HomeWorld() {
  const ref = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  const tryMount = () => {
    if (mountedRef.current) return;
    if (!ref.current || !window.mountScrollWorld) return;
    mountedRef.current = true;
    window.mountScrollWorld(ref.current, {
      ...WORLD_CONFIG,
      embed: true,
      nav: false,
    });
  };

  useEffect(() => {
    tryMount();
  }, []);

  return (
    <section aria-label="A scroll through the world of Jory">
      <div
        id="home-world"
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
    </section>
  );
}

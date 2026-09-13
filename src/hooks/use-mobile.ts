import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  return useSyncExternalStore(subscribe, readMobileViewport, getServerSnapshot);
}

export function readMobileViewport() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function subscribe(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia("(max-width: 767px)");
  mediaQuery.addEventListener("change", onStoreChange);
  return () => {
    mediaQuery.removeEventListener("change", onStoreChange);
  };
}

function getServerSnapshot() {
  return false;
}

import { defineState } from "eve/context";

const vaultFilledBrowserSessions = defineState<Record<string, true>>(
  "worker.vault-filled-browser-sessions",
  () => ({})
);

export function markVaultFilledBrowserSession(sessionId: string) {
  vaultFilledBrowserSessions.update((current) => ({
    ...current,
    [sessionId]: true,
  }));
}

export function clearVaultFilledBrowserSession(sessionId: string) {
  vaultFilledBrowserSessions.update((current) => {
    const { [sessionId]: _removed, ...remaining } = current;
    return remaining;
  });
}

export function isVaultFilledBrowserSession(sessionId: string) {
  return vaultFilledBrowserSessions.get()[sessionId] === true;
}

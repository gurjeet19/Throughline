"use client";

import { useSyncExternalStore } from "react";

/**
 * The active-project selection: which project the feature-request views are
 * scoped to. `null` means "All projects" (no filter — the workspace-wide view).
 *
 * Backed by localStorage through `useSyncExternalStore` so it survives reloads
 * without a session/schema change and stays in sync across tabs (and across
 * components in this tab via a local listener set). Reading external storage
 * this way — rather than seeding `useState` in an effect — is the pattern React
 * intends for external stores and avoids hydration mismatches: the server
 * snapshot is always "All projects".
 */
const STORAGE_KEY = "throughline:activeProjectId";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot(): string | null {
  return window.localStorage.getItem(STORAGE_KEY);
}

function getServerSnapshot(): string | null {
  return null;
}

function setActiveProjectId(id: string | null) {
  if (id) window.localStorage.setItem(STORAGE_KEY, id);
  else window.localStorage.removeItem(STORAGE_KEY);
  // `storage` events only fire in *other* tabs — notify this tab's subscribers.
  listeners.forEach((l) => l());
}

export function useActiveProject() {
  const activeProjectId = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { activeProjectId, setActiveProjectId };
}

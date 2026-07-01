"use client";

import { createContext, useContext } from "react";

export type SyncStatus = "synced" | "syncing" | "offline" | "pending" | "error";

interface SyncContextValue {
  status: SyncStatus;
  queueLength: number;
  triggerSync: () => void;
}

export const SyncContext = createContext<SyncContextValue>({
  status: "synced",
  queueLength: 0,
  triggerSync: () => {},
});

export function useSyncStatus() {
  return useContext(SyncContext);
}

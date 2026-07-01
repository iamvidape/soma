"use client";

import { useSyncStatus } from "@/contexts/SyncContext";

const CONFIG = {
  synced:  { dot: "#c8931a", label: "synced"   },
  syncing: { dot: "#c8931a", label: "syncing…" },
  pending: { dot: "#b34a2a", label: "pending"  },
  offline: { dot: "#b34a2a", label: "offline"  },
  error:   { dot: "#b34a2a", label: "error"    },
};

export function OnlineBadge() {
  const { status, queueLength } = useSyncStatus();
  const { dot, label } = CONFIG[status];
  const showCount = queueLength > 0 && (status === "pending" || status === "syncing");

  return (
    <span className="online-badge">
      <span className="online-dot" style={{ background: dot }} />
      {label}{showCount ? ` (${queueLength})` : ""}
    </span>
  );
}

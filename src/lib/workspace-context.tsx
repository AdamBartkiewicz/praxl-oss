"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type Workspace = { type: "personal" } | { type: "org"; orgId: string; orgName: string };

interface WorkspaceContextValue {
  workspace: Workspace;
  setWorkspace: (w: Workspace) => void;
  /** Convenience: returns orgId if org workspace, null if personal */
  activeOrgId: string | null;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: { type: "personal" },
  setWorkspace: () => {},
  activeOrgId: null,
});

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

const STORAGE_KEY = "praxl_active_workspace";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspaceState] = useState<Workspace>({ type: "personal" });

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.type === "org" && parsed.orgId) {
          setWorkspaceState(parsed);
        }
      }
    } catch {}
  }, []);

  const setWorkspace = (w: Workspace) => {
    setWorkspaceState(w);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
    } catch {}
  };

  const activeOrgId = workspace.type === "org" ? workspace.orgId : null;

  return (
    <WorkspaceContext.Provider value={{ workspace, setWorkspace, activeOrgId }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

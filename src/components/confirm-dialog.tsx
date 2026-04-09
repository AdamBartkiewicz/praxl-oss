"use client";

import { useState, useCallback, createContext, useContext, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "destructive" | "default";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolve, setResolve] = useState<((v: boolean) => void) | null>(null);

  const confirm: ConfirmFn = useCallback((opts) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((res) => {
      setResolve(() => res);
    });
  }, []);

  const handleClose = (result: boolean) => {
    setOpen(false);
    resolve?.(result);
    setResolve(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              {options?.variant === "destructive" && (
                <div className="flex size-9 items-center justify-center rounded-full bg-destructive/10 shrink-0">
                  <AlertTriangle className="size-4 text-destructive" />
                </div>
              )}
              <div>
                <DialogTitle>{options?.title}</DialogTitle>
                <DialogDescription className="mt-1">{options?.description}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button
              variant={options?.variant === "destructive" ? "destructive" : "default"}
              size="sm"
              onClick={() => handleClose(true)}
            >
              {options?.confirmLabel || "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

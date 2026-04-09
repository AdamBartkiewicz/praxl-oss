"use client";

import { useState } from "react";

export function BetaBadge({ size = "sm" }: { size?: "xs" | "sm" }) {
  const [open, setOpen] = useState(false);
  const cls = size === "xs"
    ? "text-[8px] px-1 py-0 font-semibold"
    : "text-[9px] px-1.5 py-0.5 font-semibold";

  return (
    <span className="relative inline-flex">
      <span
        className={`inline-flex items-center rounded border border-primary/30 bg-primary/10 text-primary uppercase tracking-wider ${cls}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
      >
        Beta
      </span>
      {open && (
        <span
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-50 whitespace-nowrap rounded-md bg-foreground text-background text-[10px] px-2 py-1 font-normal normal-case tracking-normal shadow-lg pointer-events-none"
          style={{ minWidth: "160px" }}
        >
          This feature is in beta - it may occasionally misbehave
          <span
            className="absolute bottom-full left-1/2 -translate-x-1/2 size-0 border-x-4 border-x-transparent border-b-4 border-b-foreground"
          />
        </span>
      )}
    </span>
  );
}

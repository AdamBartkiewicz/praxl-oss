"use client";

import { Shield, ShieldAlert, ShieldCheck, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useMemo, useState } from "react";
import { securityScan, type SecurityFlag } from "@/lib/security-scan";

// ─── Inline badge (for cards / lists) ────────────────────────────────────────

export function SecurityBadge({ content, size = "sm" }: { content: string; size?: "sm" | "xs" }) {
  const result = useMemo(() => securityScan(content), [content]);
  const cls = size === "xs" ? "text-[10px] px-1.5 py-0 gap-1" : "gap-1";
  const iconCls = size === "xs" ? "size-2.5" : "size-3";

  if (result.criticalCount > 0) {
    return (
      <Badge
        variant="destructive"
        className={cls}
        title={`${result.criticalCount} critical security flag${result.criticalCount > 1 ? "s" : ""}`}
      >
        <ShieldAlert className={iconCls} />
        {result.criticalCount} critical
      </Badge>
    );
  }

  if (result.warningCount > 0) {
    return (
      <Badge
        variant="outline"
        className={`border-amber-500/50 text-amber-500 ${cls}`}
        title={`${result.warningCount} security warning${result.warningCount > 1 ? "s" : ""}`}
      >
        <Shield className={iconCls} />
        {result.warningCount} warn
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={`border-emerald-500/50 text-emerald-500 ${cls}`}
      title="No security issues detected"
    >
      <ShieldCheck className={iconCls} />
      safe
    </Badge>
  );
}

// ─── Detailed panel (for edit page / install dialog) ─────────────────────────

export function SecurityPanel({ content, compact = false }: { content: string; compact?: boolean }) {
  const result = useMemo(() => securityScan(content), [content]);
  const [open, setOpen] = useState(result.criticalCount > 0);

  if (result.flags.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-500">
        <ShieldCheck className="size-4" />
        <span>No security issues detected</span>
      </div>
    );
  }

  if (compact) {
    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm w-full">
          <div className="flex items-center gap-2 flex-1">
            {result.criticalCount > 0 ? (
              <ShieldAlert className="size-4 text-red-400" />
            ) : (
              <Shield className="size-4 text-amber-400" />
            )}
            <span className={result.criticalCount > 0 ? "text-red-400" : "text-amber-400"}>
              {result.criticalCount > 0
                ? `${result.criticalCount} critical flag${result.criticalCount > 1 ? "s" : ""}`
                : `${result.warningCount} warning${result.warningCount > 1 ? "s" : ""}`}
              {result.criticalCount > 0 && result.warningCount > 0 && `, ${result.warningCount} warning${result.warningCount > 1 ? "s" : ""}`}
            </span>
          </div>
          <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SecurityFlagList flags={result.flags} />
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {result.criticalCount > 0 ? (
          <ShieldAlert className="size-4 text-red-400" />
        ) : (
          <Shield className="size-4 text-amber-400" />
        )}
        <span className={`text-sm font-medium ${result.criticalCount > 0 ? "text-red-400" : "text-amber-400"}`}>
          {result.criticalCount > 0 && `${result.criticalCount} critical`}
          {result.criticalCount > 0 && result.warningCount > 0 && " · "}
          {result.warningCount > 0 && `${result.warningCount} warning${result.warningCount > 1 ? "s" : ""}`}
        </span>
      </div>
      <SecurityFlagList flags={result.flags} />
    </div>
  );
}

// ─── Flag list ───────────────────────────────────────────────────────────────

function SecurityFlagList({ flags }: { flags: SecurityFlag[] }) {
  const critical = flags.filter(f => f.severity === "critical");
  const warnings = flags.filter(f => f.severity === "warning");

  return (
    <div className="mt-2 space-y-1.5">
      {critical.map((flag, i) => (
        <FlagRow key={`c-${i}`} flag={flag} />
      ))}
      {warnings.map((flag, i) => (
        <FlagRow key={`w-${i}`} flag={flag} />
      ))}
    </div>
  );
}

function FlagRow({ flag }: { flag: SecurityFlag }) {
  const isCritical = flag.severity === "critical";
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
      isCritical ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"
    }`}>
      <span className={`shrink-0 font-mono ${isCritical ? "text-red-400" : "text-amber-400"}`}>
        L{flag.line}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`font-medium ${isCritical ? "text-red-400" : "text-amber-400"}`}>{flag.risk}</p>
        <p className="text-muted-foreground font-mono truncate">{flag.context}</p>
      </div>
      <Badge variant="outline" className={`shrink-0 text-[10px] ${
        isCritical ? "border-red-500/50 text-red-400" : "border-amber-500/50 text-amber-400"
      }`}>
        {flag.severity}
      </Badge>
    </div>
  );
}

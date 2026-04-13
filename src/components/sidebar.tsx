"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useUser, signOut } from "@/lib/auth/use-auth";
import { BetaBadge } from "@/components/beta-badge";
import {
  LayoutDashboard,
  BookOpen,
  FolderKanban,
  Globe,
  RefreshCw,
  Settings,
  Sparkles,
  BarChart3,
  Sun,
  Moon,
  Building2,
  LogOut,
  Shield,
  HelpCircle,
  History,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const sections = [
  {
    label: "MAIN",
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Skills", href: "/skills", icon: BookOpen },
      { name: "Projects", href: "/projects", icon: FolderKanban },
    ],
  },
  {
    label: "TOOLS",
    items: [
      { name: "Sync", href: "/sync", icon: RefreshCw },
      { name: "AI Studio", href: "/ai-studio", icon: Sparkles, beta: true },
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
      { name: "Marketplace", href: "/marketplace", icon: Globe },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { name: "Organization", href: "/org", icon: Building2 },
      { name: "Settings", href: "/settings", icon: Settings },
      { name: "Help", href: "/help", icon: HelpCircle },
    ],
  },
];

function UserSection() {
  const { user, isLoaded } = useUser();

  if (!isLoaded || !user) {
    return (
      <div className="flex items-center gap-2.5 px-1 py-1.5">
        <div className="size-8 rounded-full bg-muted animate-pulse" />
        <div className="flex-1 space-y-1">
          <div className="h-3 w-20 rounded bg-muted animate-pulse" />
          <div className="h-2 w-28 rounded bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  const name = user.name || "User";
  const email = user.email || "";
  const imageUrl = user.imageUrl;

  return (
    <div className="group/user flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-1 transition-colors hover:bg-accent/40 cursor-pointer">
      {imageUrl ? (
        <img src={imageUrl} alt={name} className="size-8 rounded-full ring-1 ring-border/50 object-cover" />
      ) : (
        <div className="size-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold ring-1 ring-border/50">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[13px] font-medium truncate leading-tight">{name}</p>
        </div>
        <p className="text-[10px] text-muted-foreground truncate leading-tight">{email}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); signOut(); }}
        className="opacity-60 group-hover/user:opacity-100 p-1 rounded text-muted-foreground hover:text-foreground transition-all"
        title="Sign out"
        aria-label="Sign out"
      >
        <LogOut className="size-3.5" />
      </button>
    </div>
  );
}

function OrgSwitcher() {
  const orgsQuery = trpc.org.list.useQuery();
  const { workspace, setWorkspace, activeOrgId } = useWorkspace();
  const [open, setOpen] = useState(false);

  const orgs = orgsQuery.data || [];
  if (orgs.length === 0) return null;

  const selected = activeOrgId ? orgs.find((o) => o.id === activeOrgId) : null;
  const label = selected ? selected.name : "My skills";
  const initial = selected ? selected.name.charAt(0).toUpperCase() : null;

  return (
    <div className="px-4 pb-3" style={{ borderBottom: "1px solid hsl(var(--border) / 0.4)" }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-all hover:bg-accent/40"
      >
        {initial ? (
          <div className="size-6 rounded flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: "#6366f1" }}>
            {initial}
          </div>
        ) : (
          <div className="size-6 rounded bg-muted flex items-center justify-center shrink-0">
            <BookOpen className="size-3.5 text-muted-foreground" />
          </div>
        )}
        <span className="truncate flex-1 text-left">{label}</span>
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-1 space-y-0.5">
          <button
            onClick={() => { setWorkspace({ type: "personal" }); setOpen(false); }}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all",
              !activeOrgId ? "bg-primary/10 text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
            )}
          >
            <BookOpen className="size-3.5" />
            <span>My skills</span>
          </button>
          {orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => { setWorkspace({ type: "org", orgId: org.id, orgName: org.name }); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all",
                activeOrgId === org.id ? "bg-primary/10 text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
              )}
            >
              <div className="size-4 rounded flex items-center justify-center text-[8px] font-bold text-white shrink-0" style={{ background: "#6366f1" }}>
                {org.name.charAt(0).toUpperCase()}
              </div>
              <span className="truncate flex-1 text-left">{org.name}</span>
              <span className="text-[9px] text-muted-foreground/50">{org.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { user: currentUser } = useUser();
  const { data: pendingChanges } = trpc.sync.pendingChanges.useQuery();
  const pendingCount = pendingChanges?.length ?? 0;

  // isAdmin comes from /api/auth/me (server-side check against ADMIN_USER_IDS).
  // No NEXT_PUBLIC_* needed — changing the admin list is just an .env edit
  // + `docker compose up -d --force-recreate app` + browser refresh.
  const isAdmin = currentUser?.isAdmin ?? false;

  return (
    <aside
      className={cn(
        "w-[260px] flex flex-col h-screen sticky top-0",
        "border-r border-border/50",
        "bg-gradient-to-b from-card via-card to-card/80",
        "backdrop-blur-xl"
      )}
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-4">
        <Link href="/" aria-label="Home" className="group/logo flex items-center gap-2.5 select-none">
          <img src="/logo-dark.png" alt="Praxl" className="h-8 w-8 rounded-lg object-cover hidden dark:block transition-transform duration-300 group-hover/logo:scale-105" />
          <img src="/logo-light.png" alt="Praxl" className="h-8 w-8 rounded-lg object-cover dark:hidden transition-transform duration-300 group-hover/logo:scale-105" />
          <div className="flex flex-col">
            <span className="text-[15px] font-bold tracking-tight text-foreground">
              Praxl
            </span>
            <span className="text-[9px] text-muted-foreground/80 font-medium tracking-wider uppercase leading-none">
              skill manager
            </span>
          </div>
        </Link>
      </div>

      {/* Org Switcher */}
      <OrgSwitcher />

      {/* Navigation */}
      <nav className="flex-1 px-4 pb-3 overflow-y-auto">
        {sections.map((section, sectionIndex) => (
          <div key={section.label} className={cn(sectionIndex > 0 && "mt-5")}>
            <div className="px-3 mb-1.5">
              <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground/80 uppercase" role="heading" aria-level={2}>
                {section.label}
              </span>
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "group/nav relative flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] font-medium",
                      "transition-all duration-200 ease-out",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isActive
                        ? [
                            "text-foreground font-semibold",
                            "bg-primary/12 dark:bg-primary/18",
                            "border-l-[3px] border-l-primary",
                            "shadow-sm",
                          ]
                        : [
                            "text-muted-foreground",
                            "hover:text-foreground",
                            "hover:bg-accent/40 dark:hover:bg-accent/25",
                            "border-l-[3px] border-l-transparent",
                          ]
                    )}
                  >
                    <item.icon
                      className={cn(
                        "w-4 h-4 shrink-0 transition-colors duration-200",
                        isActive
                          ? "text-foreground"
                          : "text-muted-foreground/70 group-hover/nav:text-muted-foreground"
                      )}
                    />
                    <span>{item.name}</span>
                    {"beta" in item && item.beta && <BetaBadge size="xs" />}
                    {item.name === "Sync" && pendingCount > 0 && (
                      <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Admin link - only visible to admin */}
        {isAdmin && (
          <div className="mt-5">
            <div className="px-3 mb-1.5">
              <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground/80 uppercase">ADMIN</span>
            </div>
            <Link
              href="/admin"
              className={cn(
                "group/nav relative flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200",
                pathname === "/admin"
                  ? "text-foreground bg-primary/10 dark:bg-primary/15"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
              )}
            >
              <Shield className="w-4 h-4 shrink-0" />
              <span>Admin Panel</span>
            </Link>
          </div>
        )}
      </nav>

      {/* Bottom bar */}
      <div className="px-4 py-3 border-t border-border/40 space-y-2">
        <UserSection />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground/50 font-medium tracking-tight select-none">
            Praxl v1.0
          </span>
          {/* Privacy/Terms removed in OSS edition — these are only meaningful
              for the managed cloud where there's a user/operator legal split.
              In a self-hosted deployment, the operator IS the user, so there
              is nothing to disclose. */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative text-muted-foreground hover:text-foreground p-2 lg:p-1.5"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            <Sun className="w-3.5 h-3.5 rotate-0 scale-100 transition-all duration-300 dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute w-3.5 h-3.5 rotate-90 scale-0 transition-all duration-300 dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>
    </aside>
  );
}

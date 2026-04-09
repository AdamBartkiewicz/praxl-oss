"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/use-auth";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const AUTH_ROUTES = ["/sign-in", "/sign-up"];
const PUBLIC_ROUTES = ["/share"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isSignedIn, isLoaded } = useAuth();

  const isAuthPage = AUTH_ROUTES.some((r) => pathname.startsWith(r));
  const isPublicPage = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
  const showSidebar = isLoaded && isSignedIn && !isAuthPage && !isPublicPage;

  if (isAuthPage || isPublicPage) {
    return <>{children}</>;
  }

  // Loading state
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <img src="/logo-light.png" alt="Praxl" className="h-8 dark:hidden animate-pulse" />
          <img src="/logo-dark.png" alt="Praxl" className="h-8 hidden dark:block animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceProvider>
    <div className="flex min-h-full">
      {showSidebar && (
        <>
          {/* Mobile header with hamburger */}
          <div className="lg:hidden fixed inset-x-0 top-0 z-40 flex items-center h-14 border-b px-4 gap-3 bg-background">
            <Sheet>
              <SheetTrigger
                render={<button className="p-2" aria-label="Open menu" />}
              >
                <Menu className="size-5" />
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[280px]" showCloseButton={false}>
                <Sidebar />
              </SheetContent>
            </Sheet>
            <img src="/logo-dark.png" alt="Praxl" className="h-6 w-6 rounded-md hidden dark:block" />
            <img src="/logo-light.png" alt="Praxl" className="h-6 w-6 rounded-md dark:hidden" />
            <span className="text-sm font-bold">Praxl</span>
          </div>

          {/* Desktop sidebar */}
          <div className="hidden lg:block">
            <Sidebar />
          </div>
        </>
      )}
      <main className={`flex-1 overflow-auto ${showSidebar ? "pt-14 lg:pt-0" : ""}`}>
        {children}
      </main>
    </div>
    </WorkspaceProvider>
  );
}

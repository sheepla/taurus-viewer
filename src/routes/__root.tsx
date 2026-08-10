import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TabBar } from "@/features/tabs/TabBar";
import { CommandBar } from "@/features/command-mode/CommandBar";
import { useCommandMode } from "@/features/command-mode/useCommandMode";
import { registerThemeSetter } from "@/features/command-mode/executor";
import { Toaster } from "@/components/ui/sonner";

function ThemeSync() {
  const { setTheme } = useTheme();
  useEffect(() => {
    registerThemeSetter(setTheme);
  }, [setTheme]);
  return null;
}

function RootLayout() {
  useCommandMode();

  return (
    <SidebarProvider>
      <ThemeSync />
      <AppSidebar />
      <CommandBar />
      <Toaster richColors position="top-right" />
      <main className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
        <div className="flex h-10 items-center border-b px-3">
          <SidebarTrigger />
        </div>
        <TabBar />
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </SidebarProvider>
  );
}

export const Route = createRootRoute({
  component: () => (
    <ThemeProvider defaultTheme="system" storageKey="taurus-ui-theme">
      <RootLayout />
    </ThemeProvider>
  ),
});

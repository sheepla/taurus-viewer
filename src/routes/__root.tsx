import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TabBar } from "@/features/tabs/TabBar";
import { CommandBar } from "@/features/command-mode/CommandBar";
import { CommandPalette } from "@/features/command-mode/CommandPalette";
import { useCommandMode } from "@/features/command-mode/useCommandMode";
import { registerThemeSetter, registerSettingsOpener } from "@/features/command-mode/executor";
import { useNavigationKeys } from "@/features/navigation/useNavigationKeys";
import { StatusBar } from "@/features/navigation/StatusBar";
import { ViewerNavButtons } from "@/features/navigation/ViewerNavButtons";
import { Toaster } from "@/components/ui/sonner";
import { SettingsModal } from "@/components/SettingsModal";
import { useSettingsModalStore } from "@/components/settingsModalStore";
import { Settings } from "lucide-react";

function ThemeSync() {
  const { setTheme } = useTheme();
  const openSettings = useSettingsModalStore((s) => s.open);

  useEffect(() => {
    registerThemeSetter(setTheme);
    registerSettingsOpener(openSettings);
  }, [setTheme, openSettings]);

  return null;
}

function RootLayout() {
  useCommandMode();
  useNavigationKeys();
  const openSettings = useSettingsModalStore((s) => s.open);

  // Global shortcut Ctrl+, for settings
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        openSettings();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openSettings]);

  return (
    <SidebarProvider>
      <ThemeSync />
      <AppSidebar />
      <SettingsModal />
      <CommandPalette />
      <Toaster richColors position="top-right" />
      <main className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground relative">
        <div className="flex h-10 items-center justify-between border-b px-3">
          <SidebarTrigger />
          <button
            type="button"
            onClick={openSettings}
            aria-label="Settings"
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors"
          >
            <Settings size={15} />
          </button>
        </div>
        <TabBar />
        <div className="flex-1 overflow-hidden relative">
          <Outlet />
          <CommandBar />
          <ViewerNavButtons />
        </div>
        <StatusBar />
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

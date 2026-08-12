import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { DocumentSidebar } from "@/components/DocumentSidebar";
import { HeaderBar } from "@/components/HeaderBar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { SettingsModal } from "@/components/SettingsModal";
import { useSettingsModalStore } from "@/components/settingsModalStore";
import { Toaster } from "@/components/ui/sonner";
import { CommandBar } from "@/features/command-mode/CommandBar";
import { CommandPalette } from "@/features/command-mode/CommandPalette";
import {
  registerSettingsOpener,
  registerThemeSetter,
} from "@/features/command-mode/executor";
import { useCommandMode } from "@/features/command-mode/useCommandMode";
import { StatusBar } from "@/features/navigation/StatusBar";
import { ViewerNavButtons } from "@/features/navigation/ViewerNavButtons";
import { useKeyDispatcher } from "@/features/shell/useKeyDispatcher";
import { TabBar } from "@/features/tabs/TabBar";
import { useTabPersistence } from "@/features/tabs/useTabPersistence";

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
  useKeyDispatcher();
  useTabPersistence();
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
    <ThemeProvider defaultTheme="system" storageKey="taurus-ui-theme">
      <ThemeSync />
      <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
        <HeaderBar />
        <TabBar />
        <div className="flex flex-1 overflow-hidden">
          <DocumentSidebar />
          <main className="relative flex-1 overflow-hidden">
            <Outlet />
            <CommandBar />
            <ViewerNavButtons />
          </main>
        </div>
        <StatusBar />
        <SettingsModal />
        <CommandPalette />
        <Toaster richColors position="top-right" />
      </div>
    </ThemeProvider>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});

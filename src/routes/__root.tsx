import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { PanelLeft } from "lucide-react";
import { DocumentSidebar } from "@/components/DocumentSidebar";
import { HeaderBar } from "@/components/HeaderBar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { SettingsModal } from "@/components/SettingsModal";
import { HelpModal } from "@/components/HelpModal";
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
import { useUiModeStore } from "@/features/shell/uiModeStore";
import { useTabStore } from "@/features/tabs/TabStore";
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

function SidebarTrigger() {
  const currentMode = useUiModeStore((s) => s.currentMode);
  const setMode = useUiModeStore((s) => s.setMode);
  const activeTabId = useTabStore((s) => s.activeTabId);

  if (!activeTabId) return null;

  return (
    <button
      type="button"
      aria-label="Toggle Sidebar"
      title="Toggle Sidebar (Outline/Search/Bookmarks)"
      onClick={() => setMode(currentMode === "NORMAL" ? "TREE" : "NORMAL")}
      className="absolute top-3 left-3 z-20 flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/90 backdrop-blur shadow-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <PanelLeft size={16} />
    </button>
  );
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
            <SidebarTrigger />
            <CommandBar />
            <ViewerNavButtons />
          </main>
        </div>
        <StatusBar />
        <SettingsModal />
        <HelpModal />
        <CommandPalette />
        <Toaster richColors position="top-right" />
      </div>
    </ThemeProvider>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});

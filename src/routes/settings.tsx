import { invoke } from "@tauri-apps/api/core";
import { createFileRoute } from "@tanstack/react-router";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Config } from "../shared/bindings";
import { useTheme } from "../components/theme-provider";

export const Route = createFileRoute("/settings")({
  component: SettingsView,
});

function SettingsView() {
  const [config, setConfig] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const { setTheme } = useTheme();

  useEffect(() => {
    invoke<Config>("config_load")
      .then(setConfig)
      .catch((err) => console.error("Failed to load config:", err));
  }, []);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      await invoke("config_save", { newConfig: config });
      // Apply theme immediately so it persists across restarts
      setTheme(config.ui.theme as "light" | "dark" | "system");
      toast.success("Settings saved");
    } catch (err) {
      console.error("Failed to save config:", err);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-background p-6">
      <div className="mx-auto max-w-2xl w-full">
        <h1 className="mb-6 font-bold text-2xl">Settings</h1>

        <div className="space-y-6">
          {/* Appearance */}
          <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-4 font-semibold text-lg">Appearance</h2>

            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="theme-select" className="font-medium">Theme</label>
                  <p className="text-xs text-muted-foreground mt-0.5">Applied immediately on save</p>
                </div>
                <select
                  id="theme-select"
                  value={config.ui.theme}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      ui: {
                        ...config.ui,
                        theme: e.target.value as Config["ui"]["theme"],
                      },
                    })
                  }
                  className="rounded border border-input bg-background px-3 py-1.5 text-xs shadow-sm outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="system">System Default</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <label htmlFor="sidebar-toggle" className="font-medium">
                  Default Sidebar Open
                </label>
                <input
                  id="sidebar-toggle"
                  type="checkbox"
                  checked={config.ui.sidebar_open}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      ui: { ...config.ui, sidebar_open: e.target.checked },
                    })
                  }
                  className="h-4 w-4 rounded border-input accent-primary"
                />
              </div>
            </div>
          </section>

          {/* Document Viewer */}
          <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-4 font-semibold text-lg">Document Viewer</h2>

            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <label htmlFor="layout-select" className="font-medium">
                  Default Layout
                </label>
                <select
                  id="layout-select"
                  value={config.document.default_layout}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      document: {
                        ...config.document,
                        default_layout: e.target
                          .value as Config["document"]["default_layout"],
                      },
                    })
                  }
                  className="rounded border border-input bg-background px-3 py-1.5 text-xs shadow-sm outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="scroll">Continuous Scroll</option>
                  <option value="pages">Single Page</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="invert-toggle" className="font-medium">
                    Invert Colors
                  </label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Dark mode for PDF documents
                  </p>
                </div>
                <input
                  id="invert-toggle"
                  type="checkbox"
                  checked={config.document.invert_colors}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      document: {
                        ...config.document,
                        invert_colors: e.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4 rounded border-input accent-primary"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="zoom-input" className="font-medium">
                    Default Zoom
                  </label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    0.25 – 4.0
                  </p>
                </div>
                <input
                  id="zoom-input"
                  type="number"
                  min={0.25}
                  max={4.0}
                  step={0.25}
                  value={config.document.default_zoom?.toString() ?? ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      document: {
                        ...config.document,
                        default_zoom: Number.parseFloat(e.target.value) || 1.0,
                      },
                    })
                  }
                  className="w-20 rounded border border-input bg-background px-3 py-1.5 text-xs shadow-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          </section>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

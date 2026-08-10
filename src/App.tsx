import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "./components/ui/button";
import { ThemeProvider } from "./components/theme-provider";
import { AppSidebar } from "./components/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "./components/ui/sidebar";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <SidebarProvider>
        <AppSidebar />
        <main className="flex min-h-screen w-full flex-col bg-background text-foreground">
          <div className="p-4">
            <SidebarTrigger />
          </div>
          <div className="flex flex-1 items-center justify-center p-4">
            <section className="w-full max-w-xl rounded-xl border border-border bg-card p-8 shadow-sm">
              <div className="mb-6 space-y-2">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Tauri + shadcn/ui</p>
                <h1 className="text-3xl font-semibold">Frontend setup is ready</h1>
                <p className="text-sm text-muted-foreground">
                  This Vite app now uses Tailwind-based shadcn/ui styling with a Tauri-compatible entrypoint.
                </p>
              </div>

              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  greet();
                }}
              >
                <input
                  id="greet-input"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none"
                  onChange={(e) => setName(e.currentTarget.value)}
                  placeholder="Enter a name..."
                  value={name}
                />
                <Button type="submit">Greet</Button>
              </form>

              {greetMsg ? <p className="mt-4 text-sm text-muted-foreground">{greetMsg}</p> : null}
            </section>
          </div>
        </main>
      </SidebarProvider>
    </ThemeProvider>
  );
}

export default App;

import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import "./index.css";

// Mock Tauri IPC for browser/E2E testing environments if not running in native Tauri
if (typeof window !== "undefined" && !(window as any).__TAURI_INTERNALS__) {
  (window as any).__TAURI_INTERNALS__ = {
    convertFileSrc: (path: string, protocol = "asset") =>
      `http://${protocol}.localhost/${encodeURIComponent(path)}`,
    invoke: async (cmd: string, _args: unknown) => {
      if (cmd === 'library_list_folders') return []
      if (cmd === 'library_list_entries') return [
        {
          id: '1',
          title: 'Test PDF Document',
          path: '/test/sample.pdf',
          format: 'pdf',
          size: 1024,
          mtime: Date.now(),
          thumbnail_path: null,
        },
        {
          id: '2',
          title: 'Test EPUB Book',
          path: '/test/sample.epub',
          format: 'epub',
          size: 2048,
          mtime: Date.now(),
          thumbnail_path: null,
        },
      ]
      if (cmd === 'palette_search_library') return [
        {
          id: '1',
          title: 'Test PDF Document',
          path: '/test/sample.pdf',
          format: 'pdf',
          size: 1024,
          mtime: Date.now(),
          thumbnail_path: null,
        },
      ]
      if (cmd === 'config_load') return {
        ui: {
          theme: 'system',
          sidebar_open: true,
        },
        document: {
          default_layout: 'scroll',
          invert_colors: false,
          default_zoom: 1.0,
        },
      }
      if (cmd === 'config_save') return null
      return null
    },
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});
(window as any).__queryClient = queryClient;

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);

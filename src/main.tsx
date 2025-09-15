import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryClient, persister } from "./lib/query-client";
import { router } from "./router";
import { initializeTheme } from "./lib/theme";
import { AuthProvider } from "./components/auth-provider";
import { SelectedSongsProvider } from "./contexts/selected-songs-context";
import "./app.css";

// Initialize theme before render
initializeTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      <AuthProvider>
        <SelectedSongsProvider>
          <RouterProvider router={router} />
        </SelectedSongsProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  </React.StrictMode>
);
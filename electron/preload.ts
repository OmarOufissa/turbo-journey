/**
 * Secure preload script — exposes minimal IPC bridge to the renderer.
 * contextIsolation=true ensures this runs in a separate context from the page.
 * NO Node.js globals are exposed to the renderer.
 */

import { contextBridge, ipcRenderer } from "electron";

// Whitelist of allowed IPC channels
const ALLOWED_RENDERER_TO_MAIN = ["app:quit", "app:minimize", "app:maximize", "app:get-version"] as const;
type AllowedChannel = (typeof ALLOWED_RENDERER_TO_MAIN)[number];

contextBridge.exposeInMainWorld("electronAPI", {
  /** Invoke a whitelisted IPC channel and get a response. */
  invoke: (channel: AllowedChannel, ...args: unknown[]) => {
    if (!ALLOWED_RENDERER_TO_MAIN.includes(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  /** Get the application version string. */
  getVersion: () => ipcRenderer.invoke("app:get-version"),
});

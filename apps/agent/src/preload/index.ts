import { contextBridge, ipcRenderer } from "electron";
import type { ViewModel } from "../core/types";

/** الحاجات الوحيدة اللي الواجهة تقدر تعملها — مفيش أي وصول مباشر للنظام */
const api = {
  view: (): Promise<ViewModel> => ipcRenderer.invoke("view"),
  onView: (fn: (v: ViewModel) => void) => {
    const listener = (_: unknown, v: ViewModel) => fn(v);
    ipcRenderer.on("view", listener);
    return () => {
      ipcRenderer.removeListener("view", listener);
    };
  },
  login: (serverUrl: string, email: string, password: string): Promise<void> => ipcRenderer.invoke("login", serverUrl, email, password),
  consent: (): Promise<void> => ipcRenderer.invoke("consent"),
  checkIn: (): Promise<void> => ipcRenderer.invoke("checkIn"),
  checkOut: (): Promise<void> => ipcRenderer.invoke("checkOut"),
  startBreak: (): Promise<void> => ipcRenderer.invoke("startBreak"),
  endBreak: (): Promise<void> => ipcRenderer.invoke("endBreak"),
  logout: (): Promise<void> => ipcRenderer.invoke("logout"),
  openDashboard: (): Promise<void> => ipcRenderer.invoke("openDashboard"),
};

export type RasedApi = typeof api;
contextBridge.exposeInMainWorld("rased", api);

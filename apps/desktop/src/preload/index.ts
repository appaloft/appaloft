import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("yunduDesktop", {
  selectDirectory: () => ipcRenderer.invoke("yundu:select-directory"),
});

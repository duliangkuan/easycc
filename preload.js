const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fy", {
  launch: (tool) => ipcRenderer.invoke("launch", tool),
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (cfg) => ipcRenderer.invoke("save-config", cfg),
  goConsole: () => ipcRenderer.invoke("go-console"),
});

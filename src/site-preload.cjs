const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('catalog', {
  dashboard: () => ipcRenderer.invoke('catalog-dashboard'),
  arrange: () => ipcRenderer.invoke('catalog-arrange'),
  back: () => ipcRenderer.invoke('catalog-back'),
  reload: () => ipcRenderer.invoke('catalog-reload')
});

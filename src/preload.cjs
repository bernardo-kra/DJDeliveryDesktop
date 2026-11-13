const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('delivery', {
  state: () => ipcRenderer.invoke('get-state'),
  openSite: () => ipcRenderer.invoke('open-site'),
  arrangeWindows: () => ipcRenderer.invoke('arrange-windows'),
  selectAllTracks: selected => ipcRenderer.invoke('select-all-tracks', selected),
  importShazam: () => ipcRenderer.invoke('import-shazam'),
  startBatch: mode => ipcRenderer.invoke('start-batch', mode),
  stopBatch: () => ipcRenderer.invoke('stop-batch'),
  confirmMatch: (id, candidateId) => ipcRenderer.invoke('confirm-match', id, candidateId),
  viewSearch: id => ipcRenderer.invoke('view-search', id),
  selectTrack: (id, selected) => ipcRenderer.invoke('select-track', id, selected),
  removeTrack: id => ipcRenderer.invoke('remove-track', id),
  clearTracks: () => ipcRenderer.invoke('clear-tracks'),
  undoRemoveTrack: () => ipcRenderer.invoke('undo-remove-track'),
  exportTracks: () => ipcRenderer.invoke('export-tracks'),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  showFile: id => ipcRenderer.invoke('show-file', id),
  cancel: id => ipcRenderer.invoke('cancel-download', id),
  logout: () => ipcRenderer.invoke('logout'),
  onState: callback => ipcRenderer.on('state', (_event, state) => callback(state))
});

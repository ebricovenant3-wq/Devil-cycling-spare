const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('steamAPI', {
  unlockAchievement: (achievementId) => ipcRenderer.invoke('steam:unlock-achievement', achievementId),
  clearAchievement: (achievementId) => ipcRenderer.invoke('steam:clear-achievement', achievementId),
  saveCloud: (filename, dataString) => ipcRenderer.invoke('steam:cloud-save', filename, dataString),
  loadCloud: (filename) => ipcRenderer.invoke('steam:cloud-load', filename)
});

contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
  restartAndInstall: () => ipcRenderer.send('restart-and-install')
});

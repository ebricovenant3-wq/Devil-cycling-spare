const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const steamworks = require('steamworks.js');
const { updateElectronApp } = require('update-electron-app');

if (require('electron-squirrel-startup')) {
  app.quit();
}

updateElectronApp({
  repo: 'ebricovenant3-wq/Devil-cycling-spare',
  updateInterval: '1 hour',
  logger: require('electron-log')
});

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('in-process-gpu');

const gotTheLock = app.requestSingleInstanceLock();
let win;
let client = null;

function initSteam() {
  try {
    client = steamworks.init(480);
    console.log('Steamworks initialized successfully!');
    if (client && client.localplayer && client.localplayer.getName) {
      console.log('Logged in user:', client.localplayer.getName());
    }
  } catch (err) {
    console.error('Steamworks failed to initialize:', err);
  }
}

ipcMain.handle('steam:unlock-achievement', (event, achievementId) => {
  if (!client) return false;

  try {
    client.achievement.activate(achievementId);
    console.log(`Unlocked Steam Achievement: ${achievementId}`);
    return true;
  } catch (err) {
    console.error(`Failed to unlock achievement ${achievementId}:`, err);
    return false;
  }
});

ipcMain.handle('steam:clear-achievement', (event, achievementId) => {
  if (!client) return false;

  try {
    client.achievement.clear(achievementId);
    console.log(`Cleared Steam Achievement: ${achievementId}`);
    return true;
  } catch (err) {
    console.error(`Failed to clear achievement ${achievementId}:`, err);
    return false;
  }
});

ipcMain.handle('steam:cloud-save', (event, filename, dataString) => {
  if (!client) return false;

  try {
    const success = client.cloud.writeFile(filename, dataString);
    console.log(`[Steam Cloud] File '${filename}' written: ${success}`);
    return success;
  } catch (err) {
    console.error('[Steam Cloud Save Error]', err);
    return false;
  }
});

ipcMain.handle('steam:cloud-load', (event, filename) => {
  if (!client) return null;

  try {
    if (client.cloud && typeof client.cloud.hasFile === 'function' && client.cloud.hasFile(filename)) {
      const data = client.cloud.readFile(filename);
      console.log(`[Steam Cloud] Loaded '${filename}' successfully.`);
      return data;
    }
    return null;
  } catch (err) {
    console.error('[Steam Cloud Load Error]', err);
    return null;
  }
});

ipcMain.on('restart-and-install', () => {
  autoUpdater.quitAndInstall();
});

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function createWindow() {
  initSteam();

  win = new BrowserWindow({
    width: 1280,
    height: 720,
    title: 'Devils Cycling Spare',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    fullscreen: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webgl: true
    }
  });

  win.webContents.on('did-finish-load', () => {
    if (win) {
      win.webContents.send('app-ready');
    }
  });

  const indexPath = path.join(__dirname, 'dist', 'index.html');
  win.loadFile(indexPath);
}

autoUpdater.on('update-downloaded', () => {
  if (win) {
    win.webContents.send('update-downloaded');
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

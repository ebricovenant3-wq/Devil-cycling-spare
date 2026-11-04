export const isElectron = () => {
  return typeof window !== 'undefined' &&
    !!window.process &&
    window.process.type === 'renderer';
};

const SAVE_FILENAME = 'devils_save_data.json';

export const PlatformAPI = {
  unlockAchievement: (achievementId) => {
    if (window.steamAPI && typeof window.steamAPI.unlockAchievement === 'function') {
      window.steamAPI.unlockAchievement(achievementId);
    } else {
      console.log(`%c[BROWSER MOCK] Achievement Unlocked: ${achievementId}`, 'color: #00ff88; font-weight: bold;');
    }
  },

  async saveGame(key, data) {
    const dataString = JSON.stringify(data);

    try {
      localStorage.setItem(key, dataString);
      console.log('[SAVE] Progress saved to localStorage.');
    } catch (e) {
      console.error('[SAVE ERROR]', e);
    }

    if (window.steamAPI && typeof window.steamAPI.saveCloud === 'function') {
      const cloudSaved = await window.steamAPI.saveCloud(SAVE_FILENAME, dataString);
      if (cloudSaved) {
        console.log('Progress synced to Steam Cloud!');
      }
    }
  },

  async loadGame(key) {
    let loadedData = null;

    if (window.steamAPI && typeof window.steamAPI.loadCloud === 'function') {
      const cloudData = await window.steamAPI.loadCloud(SAVE_FILENAME);
      if (cloudData) {
        loadedData = JSON.parse(cloudData);
        console.log('Loaded game progress from Steam Cloud.');
      }
    }

    if (!loadedData) {
      try {
        const saved = localStorage.getItem(key);
        if (saved) {
          loadedData = JSON.parse(saved);
          console.log('Loaded game progress from Local Storage.');
        }
      } catch (e) {
        console.error('[LOAD ERROR]', e);
      }
    }

    return loadedData || { maxWave: 1, highScore: 0 };
  },

  checkUpdates: () => {
    if (window.electronAPI && typeof window.electronAPI.onUpdateDownloaded === 'function') {
      return true;
    }

    console.log('[BROWSER MOCK] Auto-updater bypassed in web browser context.');
    return false;
  }
};

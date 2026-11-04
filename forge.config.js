const { execSync } = require('child_process');

module.exports = {
  packagerConfig: {
    name: 'Devils Cycling Spare',
    executableName: 'devils-cycling-spare',
    icon: './assets/icon'
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-wix',
      config: {
        language: 1033,
        manufacturer: 'Daily Income Tasks',
        ui: {
          chooseDirectory: true
        }
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux']
    }
  ],
  hooks: {
    postMake: async (forgeConfig, makeResults) => {
      for (const result of makeResults) {
        for (const artifact of result.artifacts) {
          if (artifact.toLowerCase().endsWith('.msi')) {
            console.log(`[Code Signing] Signing installer artifact: ${artifact}`);

            const signtoolPath = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.19041.0\\x64\\signtool.exe';
            const certThumbprint = 'YOUR_CERTIFICATE_THUMBPRINT_HERE';
            const timestampServer = 'http://timestamp.digicert.com';

            const signCommand = `"${signtoolPath}" sign /sha1 "${certThumbprint}" /tr "${timestampServer}" /td sha256 /fd sha256 "${artifact}"`;

            try {
              execSync(signCommand, { stdio: 'inherit' });
              console.log('[Code Signing] Successfully signed MSI installer!');
            } catch (err) {
              console.error('[Code Signing] Failed to sign installer:', err);
              throw err;
            }
          }
        }
      }
    }
  }
};

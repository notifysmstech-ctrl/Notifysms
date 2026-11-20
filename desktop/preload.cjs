const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('relayDesktop', {
  platform: process.platform,
  arch: process.arch,
  versions: process.versions,
});

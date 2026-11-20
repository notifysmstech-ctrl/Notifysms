const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const SERVER_URL = process.env.RELAYSMS_URL || '{{RELAYSMS_SERVER_URL}}';

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    title: 'RelaySMS Desktop',
    backgroundColor: '#F8FAFC',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (SERVER_URL && !SERVER_URL.includes('{{')) {
    win.loadURL(SERVER_URL);
  } else {
    win.loadURL('http://localhost:3000');
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

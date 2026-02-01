const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

let mainWindow = null;
let backendProc = null;

const BACKEND_PORT = process.env.PORT || 3000;
const STARTUP_TIMEOUT_MS = 15000;

app.disableHardwareAcceleration();

function waitForPort(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const tryConnect = () => {
      const socket = net.createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Backend not ready after ${timeoutMs}ms`));
        } else {
          setTimeout(tryConnect, 250);
        }
      });
    };

    tryConnect();
  });
}

function startBackend() {
  const serverPath = path.join(__dirname, 'server.js');
  backendProc = spawn(process.execPath, [serverPath], {
    stdio: 'ignore',
    windowsHide: true
  });

  backendProc.on('exit', () => {
    backendProc = null;
  });
}

async function createWindow() {
  startBackend();
  await waitForPort(BACKEND_PORT, STARTUP_TIMEOUT_MS).catch(() => {});

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0A0A0A',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'app-icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'main.html'));

  mainWindow.on('close', () => {
    app.quit();
  });
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('tts-time-news-alert');
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (backendProc) {
    backendProc.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProc) {
    backendProc.kill();
    backendProc = null;
  }
});

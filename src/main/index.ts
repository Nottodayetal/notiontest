import { BrowserWindow, app, globalShortcut, ipcMain, shell, session } from "electron";
import type { BrowserWindow as BrowserWindowType } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AuthStatus, HotkeyBinding, PlaybackState, Track } from "../shared/types";
import { createSecureVault } from "./services/secureVault";
import { createSettingsStore } from "./services/settingsStore";
import { YandexSessionService } from "./services/authService";
import { YandexMusicService } from "./services/yandexMusicService";
import { HotkeyService } from "./services/hotkeyService";
import { FlowCastMicDriverService } from "./services/driverService";
const currentDir = dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);

let mainWindow: BrowserWindowType | null = null;
let playbackState: PlaybackState = {
  status: "idle",
  positionMs: 0,
  durationMs: 0,
};

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.setAppUserModelId("app.flowcast.desktop");

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 560,
    minWidth: 780,
    minHeight: 500,
    show: false,
    frame: true,
    transparent: false,
    backgroundColor: "#000000",
    roundedCorners: true,
    title: "FlowCast",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#000000",
      symbolColor: "#ffffff",
      height: 40,
    },
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(currentDir, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Yandex stream URLs are cross-origin; the local app needs Web Audio access to split the same stream to monitor and virtual outputs.
      webSecurity: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(join(currentDir, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(["media", "display-capture"].includes(permission));
  });

  const settingsStore = createSettingsStore(app.getPath("userData"));
  const secureVault = createSecureVault(app.getPath("userData"));
  const hotkeys = new HotkeyService(() => mainWindow);
  const notifyAuth = (status: AuthStatus) => mainWindow?.webContents.send("auth:changed", status);
  const auth = new YandexSessionService(secureVault, notifyAuth);
  const music = new YandexMusicService(auth);
  const driver = new FlowCastMicDriverService(app.getPath("userData"));

  registerIpc(settingsStore, auth, music, hotkeys, driver);
  hotkeys.register((await settingsStore.get()).hotkeys);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcutCleanup();
});

function registerIpc(
  settingsStore: ReturnType<typeof createSettingsStore>,
  auth: YandexSessionService,
  music: YandexMusicService,
  hotkeys: HotkeyService,
  driver: FlowCastMicDriverService,
): void {
  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:toggle-maximize", () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
  ipcMain.handle("system:open-external", (_event, url: string) => shell.openExternal(url));

  ipcMain.handle("auth:get-session-status", () => auth.getStatus());
  ipcMain.handle("auth:open-login-window", () => auth.openLoginWindow(mainWindow));
  ipcMain.handle("auth:logout", () => auth.logout());

  ipcMain.handle("music:search-tracks", (_event, query: string) => music.searchTracks(query));
  ipcMain.handle("music:get-favorite-playlists", () => music.getFavoritePlaylists());
  ipcMain.handle("music:get-playlist-tracks", (_event, playlistId: string) => music.getPlaylistTracks(playlistId));
  ipcMain.handle("music:get-stream-url", (_event, trackId: string) => music.getStreamUrl(trackId));

  ipcMain.handle("audio:list-devices", () => ({
    inputs: [],
    outputs: [],
  }));
  ipcMain.handle("audio:get-route", async () => (await settingsStore.get()).audioRoute);
  ipcMain.handle("audio:save-route", (_event, route) => settingsStore.setAudioRoute(route));
  ipcMain.handle("audio:get-microphones", async () => []);
  ipcMain.handle("audio:set-output-mode", async (_event, outputMode) => {
    const route = (await settingsStore.get()).audioRoute;
    return settingsStore.setAudioRoute({ ...route, outputMode });
  });
  ipcMain.handle("audio:set-monitor-device", async (_event, monitorOutputDeviceId) => {
    const route = (await settingsStore.get()).audioRoute;
    return settingsStore.setAudioRoute({ ...route, monitorOutputDeviceId });
  });

  ipcMain.handle("driver:get-flowcast-mic-status", () => driver.getStatus());
  ipcMain.handle("driver:install-flowcast-mic", () => driver.installFlowCastMic());
  ipcMain.handle("driver:open-driver-diagnostics", () => driver.openDiagnostics());

  ipcMain.handle("hotkeys:get-bindings", async () => (await settingsStore.get()).hotkeys);
  ipcMain.handle("hotkeys:set-bindings", async (_event, bindings: HotkeyBinding[]) => {
    const saved = await settingsStore.setHotkeys(bindings);
    hotkeys.register(saved);
    return saved;
  });

  ipcMain.handle("player:set-track", (_event, track: Track) => {
    playbackState = {
      ...playbackState,
      status: "paused",
      currentTrack: track,
      durationMs: track.durationMs,
      positionMs: 0,
    };
    return playbackState;
  });
  ipcMain.handle("player:play", () => setPlayerStatus("playing"));
  ipcMain.handle("player:pause", () => setPlayerStatus("paused"));
  ipcMain.handle("player:stop", () => setPlayerStatus("idle", 0));
  ipcMain.handle("player:seek", (_event, seconds: number) => {
    playbackState = {
      ...playbackState,
      positionMs: Math.max(0, seconds * 1000),
    };
    return playbackState;
  });
  ipcMain.handle("player:set-volume", (_event, value: number) => value);
}

function setPlayerStatus(status: "idle" | "playing" | "paused", positionMs = playbackState.positionMs) {
  playbackState = {
    ...playbackState,
    status,
    positionMs,
  };
  return playbackState;
}

function globalShortcutCleanup(): void {
  try {
    globalShortcut.unregisterAll();
  } catch {
    // Electron can throw while shutting down on some Windows audio-driver stacks.
  }
}

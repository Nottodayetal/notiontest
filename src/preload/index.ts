import { contextBridge, ipcRenderer } from "electron";
import type {
  AudioDeviceInfo,
  AudioDeviceInventory,
  AudioOutputMode,
  AudioRoute,
  AuthStatus,
  FlowCastMicStatus,
  HotkeyBinding,
  PlaybackState,
  PlayerCommand,
  Playlist,
  Track,
} from "../shared/types";

const api = {
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize") as Promise<void>,
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize") as Promise<void>,
    close: () => ipcRenderer.invoke("window:close") as Promise<void>,
  },
  system: {
    openExternal: (url: string) => ipcRenderer.invoke("system:open-external", url) as Promise<void>,
  },
  auth: {
    getSessionStatus: () => ipcRenderer.invoke("auth:get-session-status") as Promise<AuthStatus>,
    openLoginWindow: () => ipcRenderer.invoke("auth:open-login-window") as Promise<AuthStatus>,
    logout: () => ipcRenderer.invoke("auth:logout") as Promise<AuthStatus>,
  },
  music: {
    searchTracks: (query: string) => ipcRenderer.invoke("music:search-tracks", query) as Promise<Track[]>,
    getFavoritePlaylists: () => ipcRenderer.invoke("music:get-favorite-playlists") as Promise<Playlist[]>,
    getPlaylistTracks: (playlistId: string) => ipcRenderer.invoke("music:get-playlist-tracks", playlistId) as Promise<Track[]>,
    getStreamUrl: (trackId: string) => ipcRenderer.invoke("music:get-stream-url", trackId) as Promise<string>,
  },
  audio: {
    listDevices: () => ipcRenderer.invoke("audio:list-devices") as Promise<AudioDeviceInventory>,
    getRoute: () => ipcRenderer.invoke("audio:get-route") as Promise<AudioRoute>,
    saveRoute: (route: AudioRoute) => ipcRenderer.invoke("audio:save-route", route) as Promise<AudioRoute>,
    getMicrophones: () => ipcRenderer.invoke("audio:get-microphones") as Promise<AudioDeviceInfo[]>,
    setOutputMode: (mode: AudioOutputMode) => ipcRenderer.invoke("audio:set-output-mode", mode) as Promise<AudioRoute>,
    setMonitorDevice: (deviceId: string) => ipcRenderer.invoke("audio:set-monitor-device", deviceId) as Promise<AudioRoute>,
  },
  driver: {
    getFlowCastMicStatus: () => ipcRenderer.invoke("driver:get-flowcast-mic-status") as Promise<FlowCastMicStatus>,
    installFlowCastMic: () => ipcRenderer.invoke("driver:install-flowcast-mic") as Promise<FlowCastMicStatus>,
    openDriverDiagnostics: () => ipcRenderer.invoke("driver:open-driver-diagnostics") as Promise<FlowCastMicStatus>,
  },
  player: {
    setTrack: (track: Track) => ipcRenderer.invoke("player:set-track", track) as Promise<PlaybackState>,
    play: () => ipcRenderer.invoke("player:play") as Promise<PlaybackState>,
    pause: () => ipcRenderer.invoke("player:pause") as Promise<PlaybackState>,
    stop: () => ipcRenderer.invoke("player:stop") as Promise<PlaybackState>,
    seek: (seconds: number) => ipcRenderer.invoke("player:seek", seconds) as Promise<PlaybackState>,
    setVolume: (value: number) => ipcRenderer.invoke("player:set-volume", value) as Promise<number>,
  },
  hotkeys: {
    getBindings: () => ipcRenderer.invoke("hotkeys:get-bindings") as Promise<HotkeyBinding[]>,
    setBindings: (bindings: HotkeyBinding[]) => ipcRenderer.invoke("hotkeys:set-bindings", bindings) as Promise<HotkeyBinding[]>,
  },
  events: {
    onAuthChanged: (handler: (status: AuthStatus) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: AuthStatus) => handler(status);
      ipcRenderer.on("auth:changed", listener);
      return () => ipcRenderer.removeListener("auth:changed", listener);
    },
    onPlayerCommand: (handler: (command: PlayerCommand) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, command: PlayerCommand) => handler(command);
      ipcRenderer.on("player:command", listener);
      return () => ipcRenderer.removeListener("player:command", listener);
    },
  },
};

contextBridge.exposeInMainWorld("flowcast", api);

export type FlowCastApi = typeof api;

export type AuthConnectionState = "signed-out" | "connected" | "error";

export interface AuthStatus {
  state: AuthConnectionState;
  accountName?: string;
  login?: string;
  hasMusicToken?: boolean;
  playbackAccess?: "full" | "preview";
  message?: string;
}

export interface Track {
  id: string;
  albumId?: string;
  title: string;
  artists: string[];
  durationMs: number;
  coverUrl?: string;
  available: boolean;
  explicit?: boolean;
}

export interface Playlist {
  id: string;
  uid?: string;
  kind?: string;
  title: string;
  description?: string;
  trackCount: number;
  durationMs?: number;
  coverUrl?: string;
}

export type AudioOutputMode = "music-only" | "music-plus-voice";

export interface AudioRoute {
  outputMode: AudioOutputMode;
  monitorOutputDeviceId?: string;
  broadcastOutputDeviceId?: string;
  micInputDeviceId?: string;
  musicVolume: number;
  micVolume: number;
  fadeOutMs: number;
  reducedTransparency: boolean;
}

export interface AudioDeviceInfo {
  id: string;
  label: string;
  kind: "audioinput" | "audiooutput";
  isFlowCastMic: boolean;
  isDefault: boolean;
}

export interface AudioDeviceInventory {
  inputs: AudioDeviceInfo[];
  outputs: AudioDeviceInfo[];
}

export type FlowCastMicState = "missing" | "installed" | "blocked" | "unsigned" | "development-only" | "error";

export interface FlowCastMicStatus {
  state: FlowCastMicState;
  installed: boolean;
  endpointName: string;
  detectedDevices: string[];
  diagnosticsPath?: string;
  message?: string;
}

export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "error";

export interface PlaybackState {
  status: PlaybackStatus;
  currentTrack?: Track;
  positionMs: number;
  durationMs: number;
  message?: string;
}

export type PlayerCommand = "toggle-playback" | "stop" | "fade-out";

export interface HotkeyBinding {
  command: PlayerCommand;
  accelerator: string;
  enabled: boolean;
}

export interface AppSettings {
  audioRoute: AudioRoute;
  hotkeys: HotkeyBinding[];
}

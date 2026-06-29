import { useEffect, useMemo, useRef, useState } from "react";
import {
  Headphones,
  Heart,
  Home,
  ListMusic,
  Loader2,
  LogIn,
  LogOut,
  Mic,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Search,
  Settings,
  SkipBack,
  SkipForward,
  Waves,
} from "lucide-react";
import type {
  AudioDeviceInfo,
  AudioDeviceInventory,
  AudioRoute,
  AuthStatus,
  Playlist,
  PlayerCommand,
  Track,
} from "../shared/types";
import { createDefaultAudioRoute, isFlowCastMicDevice, mergeRouteWithDevices } from "../shared/audio";
import { useAudioEngine } from "./audio/useAudioEngine";

type ViewKey = "home" | "search" | "favorites" | "playlists" | "queue" | "settings";
const RECENT_TRACKS_KEY = "flowcast:recent-tracks";

export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ state: "signed-out" });
  const [activeView, setActiveView] = useState<ViewKey>("home");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [recentTracks, setRecentTracks] = useState<Track[]>(readRecentTracks);
  const [queue, setQueue] = useState<Track[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [devices, setDevices] = useState<AudioDeviceInventory>({ inputs: [], outputs: [] });
  const [route, setRoute] = useState<AudioRoute>(createDefaultAudioRoute());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const engine = useAudioEngine();

  const visibleTracks = activeView === "home" ? recentTracks : searchResults;
  const microphoneOptions = useMemo(() => {
    const physicalDevices = devices.inputs.filter((device) => !device.isFlowCastMic);

    return {
      physicalDevices,
    };
  }, [devices.inputs]);

  useEffect(() => {
    const offAuth = window.flowcast.events.onAuthChanged((status) => {
      setAuthStatus(status);
      if (status.state === "connected") {
        void loadPlaylists();
      }
    });
    const offCommand = window.flowcast.events.onPlayerCommand((command) => {
      void handlePlayerCommand(command);
    });

    void bootstrap();

    return () => {
      offAuth();
      offCommand();
    };
  }, []);

  useEffect(() => {
    void engine.configureRoute(route);
  }, [engine.configureRoute, route]);

  useEffect(() => {
    document.body.classList.toggle("reduced-transparency", route.reducedTransparency);
  }, [route.reducedTransparency]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  async function bootstrap() {
    const [status, savedRoute] = await Promise.all([
      window.flowcast.auth.getSessionStatus(),
      window.flowcast.audio.getRoute(),
    ]);

    setAuthStatus(status);
    await refreshDevices(true, { ...savedRoute, outputMode: "music-plus-voice" });

    if (status.state === "connected") {
      await loadPlaylists();
    }
  }

  async function refreshDevices(requestPermission = false, baseRoute = route) {
    try {
      if (requestPermission) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach((track) => track.stop());
      }

      const browserDevices = await navigator.mediaDevices.enumerateDevices();
      const mapped = browserDevices
        .filter((device) => device.kind === "audioinput" || device.kind === "audiooutput")
        .map(mapDevice);
      const inventory: AudioDeviceInventory = {
        inputs: mapped.filter((device) => device.kind === "audioinput"),
        outputs: mapped.filter((device) => device.kind === "audiooutput"),
      };

      setDevices(inventory);
      const merged = mergeRouteWithDevices({ ...baseRoute, outputMode: "music-plus-voice" }, mapped);
      setRoute(merged);
      await window.flowcast.audio.saveRoute(merged);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function login() {
    try {
      setMessage(null);
      setAuthStatus(await window.flowcast.auth.openLoginWindow());
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function logout() {
    await engine.stop();
    setAuthStatus(await window.flowcast.auth.logout());
    setPlaylists([]);
    setSearchResults([]);
  }

  async function loadPlaylists() {
    try {
      const loaded = await window.flowcast.music.getFavoritePlaylists();
      setPlaylists(loaded);
    } catch (error) {
      setPlaylists([]);
      if (authStatus.state === "connected") {
        setMessage(errorMessage(error));
      }
    }
  }

  async function searchTracks() {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setActiveView("search");
      setLoading("search");
      setSearchResults(await window.flowcast.music.searchTracks(query));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(null);
    }
  }

  async function openPlaylist(playlist: Playlist) {
    if (authStatus.state !== "connected") {
      setMessage("Войдите в Яндекс, чтобы открыть плейлисты.");
      return;
    }

    try {
      setLoading(`playlist:${playlist.id}`);
      const tracks = await window.flowcast.music.getPlaylistTracks(playlist.id);
      setQuery(playlist.title);
      setSearchResults(tracks);
      setActiveView("search");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(null);
    }
  }

  async function playTrack(track: Track) {
    try {
      setLoading(`play:${track.id}`);
      const streamUrl = await window.flowcast.music.getStreamUrl(track.id);
      await window.flowcast.player.setTrack(track);
      await engine.loadAndPlay(track, streamUrl, route);
      await window.flowcast.player.play();
      setQueue((items) => [track, ...items.filter((item) => item.id !== track.id)].slice(0, 4));
      saveRecentTrack(track, setRecentTracks);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(null);
    }
  }

  async function saveMicInputDevice(deviceId: string) {
    const saved = await window.flowcast.audio.saveRoute({ ...route, outputMode: "music-plus-voice", micInputDeviceId: deviceId || undefined });
    setRoute(saved);
  }

  async function handlePlayerCommand(command: PlayerCommand) {
    if (command === "toggle-playback") {
      await engine.togglePlayback();
      return;
    }

    if (command === "stop") {
      await engine.stop();
      await window.flowcast.player.stop();
      return;
    }

    await engine.fadeOut();
  }

  async function handleMainPlayToggle() {
    if ((engine.playback.status === "idle" || !engine.playback.currentTrack) && currentTrack) {
      await playTrack(currentTrack);
      return;
    }

    await handlePlayerCommand("toggle-playback");
  }

  const authLabel = authStatus.state === "connected" ? authStatus.login ?? "Подключено" : "Войти";
  const foundLabel = getMetaLabel(activeView, searchResults.length, playlists.length, queue.length, recentTracks.length, loading === "search");
  const sectionTitle = getSectionTitle(activeView);
  const currentTrack = engine.playback.currentTrack ?? recentTracks[0] ?? searchResults[0];

  return (
    <main className="flowcast-shell">
      <aside className="flowcast-sidebar">
        <div className="brand-row">
          <Waves size={28} />
          <strong>FlowCast</strong>
        </div>

        <nav className="side-nav">
          <button className={activeView === "home" ? "active" : ""} onClick={() => setActiveView("home")}>
            <Home size={25} />
            Главная
          </button>
          <button
            className={activeView === "search" ? "active" : ""}
            onClick={() => {
              setActiveView("search");
              searchInputRef.current?.focus();
            }}
          >
            <Search size={25} />
            Поиск
          </button>
          <button className={activeView === "favorites" ? "active" : ""} onClick={() => setActiveView("favorites")}>
            <Heart size={25} />
            Избранные треки
          </button>
          <button
            className={activeView === "playlists" ? "active" : ""}
            onClick={() => {
              setActiveView("playlists");
              if (authStatus.state === "connected") {
                void loadPlaylists();
              }
            }}
          >
            <Music2 size={25} />
            Плейлисты
          </button>
          <button className={activeView === "queue" ? "active" : ""} onClick={() => setActiveView("queue")}>
            <ListMusic size={25} />
            Очередь
            {queue.length > 0 && <span className="queue-count">{queue.length}</span>}
          </button>
          <button className={activeView === "settings" ? "active" : ""} onClick={() => setActiveView("settings")}>
            <Settings size={25} />
            Настройки
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="login-button" onClick={() => void (authStatus.state === "connected" ? logout() : login())}>
            {authStatus.state === "connected" ? <LogOut size={19} /> : <LogIn size={19} />}
            {authStatus.state === "connected" ? "Выйти" : authLabel}
          </button>
        </div>
      </aside>

      <section className="main-stage">
        <div className="top-spacer" />

        <div className="search-bar">
          <Search size={32} />
          <input
            ref={searchInputRef}
            value={query}
            placeholder="Найти трек, артиста или альбом"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void searchTracks();
              }
            }}
          />
          <kbd>Ctrl + K</kbd>
        </div>

        <header className="results-header">
          <h1>{sectionTitle}</h1>
          <span>{foundLabel}</span>
        </header>

        <div className="results-list">
          {activeView === "playlists" &&
            (playlists.length ? (
              playlists.map((playlist, index) => (
                <PlaylistRow
                  key={playlist.id}
                  index={index}
                  playlist={playlist}
                  loading={loading === `playlist:${playlist.id}`}
                  onOpen={() => void openPlaylist(playlist)}
                />
              ))
            ) : (
              <EmptyPanel text={authStatus.state === "connected" ? "Избранные плейлисты появятся здесь." : "Войдите, чтобы увидеть плейлисты."} />
            ))}

          {activeView === "queue" &&
            (queue.length ? (
              queue.map((track, index) => (
                <TrackRow
                  key={`${track.id}-${index}`}
                  index={index}
                  track={track}
                  loading={loading === `play:${track.id}`}
                  onPlay={() => void playTrack(track)}
                  onMonitor={() => void playTrack(track)}
                />
              ))
            ) : (
              <EmptyPanel text="Очередь пока пустая." />
            ))}

          {activeView === "favorites" && <EmptyPanel text="Избранные треки будут доступны после подключения Music API FlowCast." />}

          {activeView === "settings" && (
            <SettingsPanel
              authStatus={authStatus}
              onLogin={() => void (authStatus.state === "connected" ? logout() : login())}
            />
          )}

          {(activeView === "home" || activeView === "search") &&
            (visibleTracks.length ? (
              visibleTracks.map((track, index) => (
                <TrackRow
                  key={`${track.id}-${index}`}
                  index={index}
                  track={track}
                  loading={loading === `play:${track.id}`}
                  onPlay={() => void playTrack(track)}
                  onMonitor={() => void playTrack(track)}
                />
              ))
            ) : (
              activeView === "home" ? <HomeWelcome /> : <EmptyPanel text="Введите запрос и нажмите Enter." />
            ))}
        </div>

        <PlayerBar
          currentTrack={currentTrack}
          playbackStatus={engine.playback.status}
          positionMs={engine.playback.positionMs}
          durationMs={engine.playback.durationMs || currentTrack?.durationMs || 0}
          micInputDeviceId={route.micInputDeviceId ?? ""}
          microphoneDevices={microphoneOptions.physicalDevices}
          onPlayToggle={() => void handleMainPlayToggle()}
          onSeek={engine.seek}
          onMicChange={(deviceId) => void saveMicInputDevice(deviceId)}
        />
      </section>

      {message && (
        <button className="toast" onClick={() => setMessage(null)}>
          {message}
        </button>
      )}
    </main>
  );
}

function PlaylistRow({
  playlist,
  index,
  loading,
  onOpen,
}: {
  playlist: Playlist;
  index: number;
  loading: boolean;
  onOpen: () => void;
}) {
  return (
    <article className="result-row playlist-result-row">
      <PlaylistCover playlist={playlist} index={index} />
      <div className="track-copy">
        <strong>{playlist.title}</strong>
        <span>{playlist.description || "Yandex Music"}</span>
      </div>
      <span className="row-duration">{playlist.trackCount} треков</span>
      <button className="circle-button" onClick={onOpen} title="Открыть">
        {loading ? <Loader2 className="spin" size={20} /> : <Play size={22} fill="currentColor" />}
      </button>
      <span />
      <button className="more-button" title="Еще">
        <MoreHorizontal size={28} />
      </button>
    </article>
  );
}

function TrackRow({
  track,
  index,
  loading,
  onPlay,
  onMonitor,
}: {
  track: Track;
  index: number;
  loading: boolean;
  onPlay: () => void;
  onMonitor: () => void;
}) {
  return (
    <article className="result-row">
      <TrackCover track={track} index={index} />
      <div className="track-copy">
        <strong>{track.title}</strong>
        <span>{track.artists.join(", ") || "Yandex Music"}</span>
      </div>
      <span className="row-duration">{formatTime(track.durationMs)}</span>
      <button className="circle-button" onClick={onPlay} title="Играть">
        {loading ? <Loader2 className="spin" size={20} /> : <Play size={22} fill="currentColor" />}
      </button>
      <button className="circle-button" onClick={onMonitor} title="Прослушать">
        <Headphones size={24} />
      </button>
      <button className="more-button" title="Еще">
        <MoreHorizontal size={28} />
      </button>
    </article>
  );
}

function SettingsPanel({
  authStatus,
  onLogin,
}: {
  authStatus: AuthStatus;
  onLogin: () => void;
}) {
  return (
    <div className="settings-grid">
      <article className="settings-row">
        <div>
          <strong>Яндекс Музыка</strong>
          <span>
            {authStatus.state === "connected"
              ? authStatus.hasMusicToken
                ? "Полные треки и плейлисты доступны"
                : "Вход есть, но Music API работает только после OAuth-доступа"
              : "Аккаунт не подключен"}
          </span>
        </div>
        <button className="circle-button" onClick={onLogin} title={authStatus.state === "connected" ? "Выйти" : "Войти"}>
          {authStatus.state === "connected" ? <LogOut size={22} /> : <LogIn size={22} />}
        </button>
      </article>
      <article className="settings-row">
        <div>
          <strong>Микрофон</strong>
          <span>Используется основной микрофон Windows</span>
        </div>
        <button className="circle-button" title="Микрофон">
          <Mic size={22} />
        </button>
      </article>
    </div>
  );
}

function HomeWelcome() {
  return (
    <div className="home-welcome">
      <div className="welcome-visual" aria-hidden="true">
        <svg viewBox="0 0 220 150" role="img">
          <defs>
            <linearGradient id="welcomeGlow" x1="20" x2="190" y1="20" y2="130" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ffffff" stopOpacity="0.92" />
              <stop offset="1" stopColor="#ff5261" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          <path className="welcome-orbit" d="M42 74c27-48 102-53 136-13 31 36 3 77-48 74-61-4-111-27-88-61Z" />
          <path className="welcome-wave one" d="M49 72c17-14 31-14 48 0s32 14 49 0 31-14 48 0" />
          <path className="welcome-wave two" d="M49 91c17-14 31-14 48 0s32 14 49 0 31-14 48 0" />
          <circle className="welcome-dot" cx="111" cy="76" r="15" />
        </svg>
      </div>
      <strong>Добро пожаловать в FlowCast</strong>
      <span>Включи трек из поиска, и здесь появится твоя недавняя музыка.</span>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="empty-panel">{text}</div>;
}

function PlayerBar({
  currentTrack,
  playbackStatus,
  positionMs,
  durationMs,
  micInputDeviceId,
  microphoneDevices,
  onPlayToggle,
  onSeek,
  onMicChange,
}: {
  currentTrack?: Track;
  playbackStatus: string;
  positionMs: number;
  durationMs: number;
  micInputDeviceId: string;
  microphoneDevices: AudioDeviceInfo[];
  onPlayToggle: () => void;
  onSeek: (positionMs: number) => void;
  onMicChange: (deviceId: string) => void;
}) {
  const [micMenuOpen, setMicMenuOpen] = useState(false);
  const selectedMic = microphoneDevices.find((device) => device.id === micInputDeviceId);
  const micLabel = selectedMic?.label ?? "Default - основной микрофон";
  const isPlaying = playbackStatus === "playing";

  return (
    <section className="player-bar">
      <TrackCover track={currentTrack} index={0} compact />
      <div className="player-copy">
        <strong>{currentTrack?.title ?? "Нет трека"}</strong>
        <span>{currentTrack?.artists.join(", ") || "FlowCast готов"}</span>
      </div>

      <span className="time-code">{formatTime(positionMs)}</span>
      <input
        className="player-progress"
        type="range"
        min={0}
        max={Math.max(durationMs, 1)}
        value={Math.min(positionMs, Math.max(durationMs, 1))}
        onChange={(event) => onSeek(Number(event.target.value))}
      />
      <span className="time-code">{formatTime(durationMs)}</span>

      <button className="plain-icon" title="Назад">
        <SkipBack size={22} fill="currentColor" />
      </button>
      <button className="main-play" title={isPlaying ? "Пауза" : "Играть"} onClick={onPlayToggle}>
        {playbackStatus === "loading" ? (
          <Loader2 className="spin" size={25} />
        ) : isPlaying ? (
          <Pause size={24} />
        ) : (
          <Play className="play-glyph" size={25} fill="currentColor" />
        )}
      </button>
      <button className="plain-icon" title="Вперед">
        <SkipForward size={22} fill="currentColor" />
      </button>

      <div
        className="mic-picker"
        onBlur={(event) => {
          const nextTarget = event.relatedTarget;
          if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
            setMicMenuOpen(false);
          }
        }}
      >
        <button className="mic-picker-button" type="button" onClick={() => setMicMenuOpen((open) => !open)}>
          <Mic size={22} />
          <span>
            <strong>Микрофон</strong>
            <small title={micLabel}>{micLabel}</small>
          </span>
          <span className="picker-chevron">⌄</span>
        </button>
        {micMenuOpen && (
          <div className="mic-menu">
            <button
              type="button"
              className={!micInputDeviceId ? "active" : ""}
              onClick={() => {
                onMicChange("");
                setMicMenuOpen(false);
              }}
            >
              Default - основной микрофон
            </button>
            {microphoneDevices.map((device) => (
              <button
                type="button"
                key={device.id}
                className={device.id === micInputDeviceId ? "active" : ""}
                onClick={() => {
                  onMicChange(device.id);
                  setMicMenuOpen(false);
                }}
              >
                {device.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TrackCover({ track, index, compact = false }: { track?: Track; index: number; compact?: boolean }) {
  if (track?.coverUrl) {
    return <img className={compact ? "cover compact" : "cover"} src={track.coverUrl} alt="" />;
  }

  return (
    <div className={compact ? "cover compact generated-cover" : "cover generated-cover"} data-tone={index % 5}>
      <span>{track?.title?.slice(0, 2) ?? "FC"}</span>
    </div>
  );
}

function PlaylistCover({ playlist, index }: { playlist: Playlist; index: number }) {
  if (playlist.coverUrl) {
    return <img className="cover" src={playlist.coverUrl} alt="" />;
  }

  return (
    <div className="cover generated-cover" data-tone={index % 5}>
      <span>{playlist.title.slice(0, 2)}</span>
    </div>
  );
}

function mapDevice(device: MediaDeviceInfo): AudioDeviceInfo {
  const label = device.label || (device.deviceId === "default" ? "Default" : `${device.kind} ${device.deviceId.slice(0, 5)}`);

  return {
    id: device.deviceId,
    label,
    kind: device.kind as "audioinput" | "audiooutput",
    isDefault: device.deviceId === "default" || label.toLowerCase().startsWith("default"),
    isFlowCastMic: isFlowCastMicDevice(label),
  };
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getSectionTitle(view: ViewKey): string {
  if (view === "home") {
    return "Недавние треки";
  }

  if (view === "playlists") {
    return "Плейлисты";
  }

  if (view === "queue") {
    return "Очередь";
  }

  if (view === "favorites") {
    return "Избранные треки";
  }

  if (view === "settings") {
    return "Настройки";
  }

  return "Результаты поиска";
}

function getMetaLabel(
  view: ViewKey,
  searchCount: number,
  playlistCount: number,
  queueCount: number,
  recentCount: number,
  isSearching: boolean,
): string {
  if (isSearching) {
    return "Поиск...";
  }

  if (view === "home") {
    return recentCount ? `Недавние: ${recentCount}` : "Пока пусто";
  }

  if (view === "playlists") {
    return `Найдено: ${playlistCount} плейлистов`;
  }

  if (view === "queue") {
    return `В очереди: ${queueCount}`;
  }

  if (view === "favorites") {
    return "Скоро";
  }

  if (view === "settings") {
    return "FlowCast";
  }

  return searchCount ? `Найдено: ${searchCount} треков` : "Готов к поиску";
}

function readRecentTracks(): Track[] {
  try {
    const raw = window.localStorage.getItem(RECENT_TRACKS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Track[]) : [];
    return Array.isArray(parsed) ? parsed.filter(isTrackLike).slice(0, 12) : [];
  } catch {
    return [];
  }
}

function saveRecentTrack(track: Track, setRecentTracks: (updater: (tracks: Track[]) => Track[]) => void): void {
  setRecentTracks((tracks) => {
    const next = [track, ...tracks.filter((item) => item.id !== track.id)].slice(0, 12);
    window.localStorage.setItem(RECENT_TRACKS_KEY, JSON.stringify(next));
    return next;
  });
}

function isTrackLike(value: unknown): value is Track {
  if (!value || typeof value !== "object") {
    return false;
  }

  const track = value as Partial<Track>;
  return typeof track.id === "string" && typeof track.title === "string" && Array.isArray(track.artists);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Что-то пошло не так.";
}

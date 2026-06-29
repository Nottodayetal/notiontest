import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioRoute, PlaybackState, Track } from "../../shared/types";

interface EngineRefs {
  context: AudioContext | null;
  sourceAudio: HTMLAudioElement | null;
  monitorAudio: HTMLAudioElement | null;
  broadcastAudio: HTMLAudioElement | null;
  sourceNode: MediaElementAudioSourceNode | null;
  musicGain: GainNode | null;
  micGain: GainNode | null;
  monitorDestination: MediaStreamAudioDestinationNode | null;
  broadcastDestination: MediaStreamAudioDestinationNode | null;
  micSource: MediaStreamAudioSourceNode | null;
  micStream: MediaStream | null;
  progressTimer: number | null;
  objectUrl: string | null;
  currentRoute: AudioRoute | null;
}

const idleState: PlaybackState = {
  status: "idle",
  positionMs: 0,
  durationMs: 0,
};

export function useAudioEngine() {
  const refs = useRef<EngineRefs>({
    context: null,
    sourceAudio: null,
    monitorAudio: null,
    broadcastAudio: null,
    sourceNode: null,
    musicGain: null,
    micGain: null,
    monitorDestination: null,
    broadcastDestination: null,
    micSource: null,
    micStream: null,
    progressTimer: null,
    objectUrl: null,
    currentRoute: null,
  });
  const [playback, setPlayback] = useState<PlaybackState>(idleState);

  const clearTimer = useCallback(() => {
    if (refs.current.progressTimer) {
      window.clearInterval(refs.current.progressTimer);
      refs.current.progressTimer = null;
    }
  }, []);

  const updateProgress = useCallback(() => {
    const audio = refs.current.sourceAudio;

    if (!audio) {
      return;
    }

    setPlayback((state) => ({
      ...state,
      positionMs: Number.isFinite(audio.currentTime) ? audio.currentTime * 1000 : 0,
      durationMs: Number.isFinite(audio.duration) ? audio.duration * 1000 : state.durationMs,
    }));
  }, []);

  const stopMic = useCallback(() => {
    refs.current.micSource?.disconnect();
    refs.current.micStream?.getTracks().forEach((track) => track.stop());
    refs.current.micSource = null;
    refs.current.micStream = null;
    refs.current.micGain = null;
  }, []);

  const cleanup = useCallback(async () => {
    clearTimer();
    stopMic();

    for (const audio of [refs.current.sourceAudio, refs.current.monitorAudio, refs.current.broadcastAudio]) {
      if (audio) {
        audio.pause();
        audio.srcObject = null;
        audio.removeAttribute("src");
        audio.load();
      }
    }

    refs.current.sourceNode?.disconnect();
    refs.current.musicGain?.disconnect();
    refs.current.monitorDestination?.disconnect();
    refs.current.broadcastDestination?.disconnect();

    if (refs.current.context?.state !== "closed") {
      await refs.current.context?.close().catch(() => undefined);
    }

    if (refs.current.objectUrl) {
      URL.revokeObjectURL(refs.current.objectUrl);
    }

    refs.current = {
      ...refs.current,
      context: null,
      sourceAudio: null,
      monitorAudio: null,
      broadcastAudio: null,
      sourceNode: null,
      musicGain: null,
      monitorDestination: null,
      broadcastDestination: null,
      objectUrl: null,
    };
  }, [clearTimer, stopMic]);

  const configureMic = useCallback(async (route: AudioRoute) => {
    const context = refs.current.context;
    const destination = refs.current.broadcastDestination;

    stopMic();

    if (!context || !destination || !route.broadcastOutputDeviceId || route.outputMode !== "music-plus-voice") {
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: route.micInputDeviceId ? { deviceId: { exact: route.micInputDeviceId } } : true,
      video: false,
    });
    const micSource = context.createMediaStreamSource(stream);
    const micGain = context.createGain();
    micGain.gain.value = route.micVolume;
    micSource.connect(micGain).connect(destination);

    refs.current.micStream = stream;
    refs.current.micSource = micSource;
    refs.current.micGain = micGain;
  }, [stopMic]);

  const configureRoute = useCallback(async (route: AudioRoute) => {
    refs.current.currentRoute = route;

    if (refs.current.monitorAudio) {
      refs.current.monitorAudio.volume = 1;
    }

    if (refs.current.broadcastAudio) {
      refs.current.broadcastAudio.volume = 1;
    }

    if (refs.current.musicGain) {
      refs.current.musicGain.gain.setTargetAtTime(route.musicVolume, refs.current.musicGain.context.currentTime, 0.015);
    }

    if (refs.current.micGain) {
      refs.current.micGain.gain.setTargetAtTime(route.micVolume, refs.current.micGain.context.currentTime, 0.015);
    }

    await setSink(refs.current.monitorAudio, route.monitorOutputDeviceId);
    await setSink(refs.current.broadcastAudio, route.broadcastOutputDeviceId);
    await configureMic(route);
  }, [configureMic]);

  const loadAndPlay = useCallback(async (track: Track, streamUrl: string, route: AudioRoute) => {
    await cleanup();

    setPlayback({
      status: "loading",
      currentTrack: track,
      positionMs: 0,
      durationMs: track.durationMs,
    });

    const objectUrl = await createObjectUrl(streamUrl);
    const playableUrl = objectUrl ?? streamUrl;
    const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
    const context = new AudioContextConstructor({ latencyHint: "playback" });
    const sourceAudio = new Audio(playableUrl);
    const monitorAudio = new Audio();
    const broadcastAudio = route.broadcastOutputDeviceId ? new Audio() : null;
    sourceAudio.preload = "auto";
    sourceAudio.volume = 1;
    monitorAudio.autoplay = true;
    if (broadcastAudio) {
      broadcastAudio.autoplay = true;
    }

    const sourceNode = context.createMediaElementSource(sourceAudio);
    const musicGain = context.createGain();
    const monitorDestination = context.createMediaStreamDestination();
    const broadcastDestination = context.createMediaStreamDestination();
    musicGain.gain.value = route.musicVolume;
    sourceNode.connect(musicGain);
    musicGain.connect(monitorDestination);
    musicGain.connect(broadcastDestination);
    monitorAudio.srcObject = monitorDestination.stream;
    if (broadcastAudio) {
      broadcastAudio.srcObject = broadcastDestination.stream;
    }

    refs.current = {
      ...refs.current,
      context,
      sourceAudio,
      monitorAudio,
      broadcastAudio,
      sourceNode,
      musicGain,
      monitorDestination,
      broadcastDestination,
      objectUrl,
      currentRoute: route,
    };

    sourceAudio.addEventListener("ended", () => {
      clearTimer();
      setPlayback((state) => ({ ...state, status: "idle", positionMs: 0 }));
      void window.flowcast.player.stop();
    });
    sourceAudio.addEventListener("error", () => {
      clearTimer();
      setPlayback((state) => ({ ...state, status: "error", message: "Не удалось воспроизвести поток." }));
    });
    sourceAudio.addEventListener("loadedmetadata", updateProgress);

    await configureRoute(route);
    await context.resume();
    await Promise.all([
      sourceAudio.play(),
      monitorAudio.play(),
      broadcastAudio?.play().catch(() => undefined),
    ]);

    refs.current.progressTimer = window.setInterval(updateProgress, 250);
    setPlayback({
      status: "playing",
      currentTrack: track,
      positionMs: 0,
      durationMs: track.durationMs,
    });
  }, [cleanup, clearTimer, configureRoute, updateProgress]);

  const play = useCallback(async () => {
    await refs.current.context?.resume();
    await refs.current.sourceAudio?.play();
    await refs.current.monitorAudio?.play().catch(() => undefined);
    await refs.current.broadcastAudio?.play().catch(() => undefined);
    setPlayback((state) => ({ ...state, status: state.currentTrack ? "playing" : "idle" }));
  }, []);

  const pause = useCallback(() => {
    refs.current.sourceAudio?.pause();
    refs.current.monitorAudio?.pause();
    refs.current.broadcastAudio?.pause();
    setPlayback((state) => ({ ...state, status: state.currentTrack ? "paused" : "idle" }));
  }, []);

  const togglePlayback = useCallback(async () => {
    if (refs.current.sourceAudio?.paused) {
      await play();
    } else {
      pause();
    }
  }, [pause, play]);

  const stop = useCallback(async () => {
    await cleanup();
    setPlayback(idleState);
  }, [cleanup]);

  const seek = useCallback((positionMs: number) => {
    if (!refs.current.sourceAudio) {
      return;
    }

    refs.current.sourceAudio.currentTime = Math.max(0, positionMs / 1000);
    updateProgress();
  }, [updateProgress]);

  const fadeOut = useCallback(async () => {
    const gain = refs.current.musicGain;
    const audio = refs.current.sourceAudio;
    const route = refs.current.currentRoute;

    if (!route) {
      return;
    }

    const duration = Math.max(route.fadeOutMs, 250) / 1000;

    if (!gain && audio) {
      const startVolume = audio.volume;
      const startedAt = performance.now();
      const timer = window.setInterval(() => {
        const progress = Math.min(1, (performance.now() - startedAt) / (duration * 1000));
        audio.volume = startVolume * (1 - progress);

        if (progress >= 1) {
          window.clearInterval(timer);
          void stop().then(() => {
            audio.volume = route.musicVolume;
          });
        }
      }, 16);
      return;
    }

    if (!gain) {
      return;
    }

    const now = gain.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + duration);
    window.setTimeout(() => {
      void stop();
      gain.gain.value = route.musicVolume;
    }, duration * 1000);
  }, [stop]);

  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, [cleanup]);

  return {
    playback,
    loadAndPlay,
    configureRoute,
    play,
    pause,
    stop,
    seek,
    togglePlayback,
    fadeOut,
  };
}

async function setSink(audio: HTMLAudioElement | null, sinkId?: string): Promise<void> {
  if (!audio?.setSinkId || !sinkId) {
    return;
  }

  await audio.setSinkId(sinkId).catch(() => undefined);
}

async function createObjectUrl(streamUrl: string): Promise<string | null> {
  try {
    const response = await fetch(streamUrl, { cache: "no-store" });

    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();

    if (!blob.type.startsWith("audio/")) {
      return null;
    }

    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

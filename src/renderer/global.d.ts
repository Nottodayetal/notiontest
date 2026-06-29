import type { FlowCastApi } from "../preload";

declare global {
  interface Window {
    flowcast: FlowCastApi;
    webkitAudioContext?: typeof AudioContext;
  }

  interface HTMLMediaElement {
    setSinkId?: (sinkId: string) => Promise<void>;
  }
}

export {};

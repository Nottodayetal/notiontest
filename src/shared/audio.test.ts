import { describe, expect, it } from "vitest";
import { createDefaultAudioRoute, isFlowCastMicDevice, isVirtualBroadcastOutputDevice, mergeRouteWithDevices } from "./audio";
import type { AudioDeviceInfo } from "./types";

const devices: AudioDeviceInfo[] = [
  { id: "speakers", label: "Realtek Speakers", kind: "audiooutput", isDefault: true, isFlowCastMic: false },
  { id: "headphones", label: "Studio Headphones", kind: "audiooutput", isDefault: false, isFlowCastMic: false },
  { id: "cable-input", label: "CABLE Input (VB-Audio Virtual Cable)", kind: "audiooutput", isDefault: false, isFlowCastMic: false },
  { id: "mic", label: "USB Microphone", kind: "audioinput", isDefault: true, isFlowCastMic: false },
  { id: "flowcast", label: "FlowCast Microphone", kind: "audioinput", isDefault: false, isFlowCastMic: true },
];

describe("audio routing helpers", () => {
  it("detects FlowCast virtual microphone labels", () => {
    expect(isFlowCastMicDevice("FlowCast Microphone")).toBe(true);
    expect(isFlowCastMicDevice("FlowCast Virtual Mic")).toBe(true);
    expect(isFlowCastMicDevice("CABLE Output (VB-Audio Virtual Cable)")).toBe(true);
    expect(isFlowCastMicDevice("Realtek Speakers")).toBe(false);
  });

  it("detects virtual cable playback endpoints", () => {
    expect(isVirtualBroadcastOutputDevice("CABLE Input (VB-Audio Virtual Cable)")).toBe(true);
    expect(isVirtualBroadcastOutputDevice("Realtek Speakers")).toBe(false);
  });

  it("chooses the primary microphone route by default", () => {
    const route = createDefaultAudioRoute(devices);

    expect(route.outputMode).toBe("music-plus-voice");
    expect(route.monitorOutputDeviceId).toBe("speakers");
    expect(route.broadcastOutputDeviceId).toBe("cable-input");
    expect(route.micInputDeviceId).toBe("mic");
  });

  it("repairs stale device ids without changing user volumes", () => {
    const route = mergeRouteWithDevices(
      {
        outputMode: "music-plus-voice",
        monitorOutputDeviceId: "missing-output",
        broadcastOutputDeviceId: "missing-broadcast",
        micInputDeviceId: "missing-input",
        musicVolume: 0.34,
        micVolume: 0.56,
        fadeOutMs: 900,
        reducedTransparency: true,
      },
      devices,
    );

    expect(route.monitorOutputDeviceId).toBe("speakers");
    expect(route.broadcastOutputDeviceId).toBe("cable-input");
    expect(route.micInputDeviceId).toBe("mic");
    expect(route.musicVolume).toBe(0.34);
    expect(route.reducedTransparency).toBe(true);
  });
});

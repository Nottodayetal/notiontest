import type { AudioDeviceInfo, AudioRoute } from "./types";

export function isFlowCastMicDevice(label: string): boolean {
  return /flowcast microphone|flowcast virtual mic|flowcast mic|cable output|vb-audio virtual cable/i.test(label);
}

export function isVirtualBroadcastOutputDevice(label: string): boolean {
  return /flowcast microphone|flowcast virtual mic|flowcast mic|cable input|vb-audio virtual cable/i.test(label);
}

export function createDefaultAudioRoute(devices: AudioDeviceInfo[] = []): AudioRoute {
  const outputs = devices.filter((device) => device.kind === "audiooutput");
  const inputs = devices.filter((device) => device.kind === "audioinput");
  const broadcastOutput = outputs.find((device) => isVirtualBroadcastOutputDevice(device.label));
  const monitorOutput = outputs.find((device) => !isVirtualBroadcastOutputDevice(device.label) && device.isDefault)
    ?? outputs.find((device) => !isVirtualBroadcastOutputDevice(device.label))
    ?? outputs[0];
  const micInput = inputs.find((device) => !device.isFlowCastMic && device.isDefault) ?? inputs.find((device) => !device.isFlowCastMic);

  return {
    outputMode: "music-plus-voice",
    monitorOutputDeviceId: monitorOutput?.id,
    broadcastOutputDeviceId: broadcastOutput?.id,
    micInputDeviceId: micInput?.id,
    musicVolume: 0.78,
    micVolume: 0.92,
    fadeOutMs: 1400,
    reducedTransparency: false,
  };
}

export function mergeRouteWithDevices(route: AudioRoute, devices: AudioDeviceInfo[]): AudioRoute {
  const defaults = createDefaultAudioRoute(devices);
  const hasDevice = (id: string | undefined, kind: AudioDeviceInfo["kind"]) => {
    if (!id) {
      return false;
    }

    return devices.some((device) => device.id === id && device.kind === kind);
  };

  return {
    ...route,
    monitorOutputDeviceId: hasDevice(route.monitorOutputDeviceId, "audiooutput")
      ? route.monitorOutputDeviceId
      : defaults.monitorOutputDeviceId,
    broadcastOutputDeviceId: hasDevice(route.broadcastOutputDeviceId, "audiooutput")
      ? route.broadcastOutputDeviceId
      : defaults.broadcastOutputDeviceId,
    micInputDeviceId: hasDevice(route.micInputDeviceId, "audioinput") ? route.micInputDeviceId : defaults.micInputDeviceId,
  };
}

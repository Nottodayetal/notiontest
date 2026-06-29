import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AppSettings, AudioRoute, HotkeyBinding } from "../../shared/types";
import { createDefaultAudioRoute } from "../../shared/audio";

export function defaultHotkeys(): HotkeyBinding[] {
  return [
    { command: "toggle-playback", accelerator: "Alt+Shift+P", enabled: true },
    { command: "stop", accelerator: "Alt+Shift+S", enabled: true },
    { command: "fade-out", accelerator: "Alt+Shift+F", enabled: true },
  ];
}

export class SettingsStore {
  private settings: AppSettings | null = null;

  constructor(private readonly filePath: string) {}

  async load(): Promise<AppSettings> {
    if (this.settings) {
      return this.settings;
    }

    try {
      const raw = await readFile(this.filePath, "utf8");
      this.settings = this.normalize(JSON.parse(raw) as Partial<AppSettings>);
    } catch {
      this.settings = this.normalize({});
      await this.save(this.settings);
    }

    return this.settings;
  }

  async get(): Promise<AppSettings> {
    return this.load();
  }

  async setAudioRoute(audioRoute: AudioRoute): Promise<AudioRoute> {
    const settings = await this.load();
    settings.audioRoute = audioRoute;
    await this.save(settings);
    return settings.audioRoute;
  }

  async setHotkeys(hotkeys: HotkeyBinding[]): Promise<HotkeyBinding[]> {
    const settings = await this.load();
    settings.hotkeys = hotkeys;
    await this.save(settings);
    return settings.hotkeys;
  }

  private normalize(input: Partial<AppSettings>): AppSettings {
    return {
      audioRoute: {
        ...createDefaultAudioRoute(),
        ...(input.audioRoute ?? {}),
      },
      hotkeys: input.hotkeys?.length ? input.hotkeys : defaultHotkeys(),
    };
  }

  private async save(settings: AppSettings): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(settings, null, 2), "utf8");
    this.settings = settings;
  }
}

export function createSettingsStore(userDataPath: string): SettingsStore {
  return new SettingsStore(join(userDataPath, "settings.json"));
}

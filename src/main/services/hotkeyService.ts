import { globalShortcut } from "electron";
import type { BrowserWindow } from "electron";
import type { HotkeyBinding, PlayerCommand } from "../../shared/types";

export class HotkeyService {
  private bindings: HotkeyBinding[] = [];

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  register(bindings: HotkeyBinding[]): void {
    this.unregister();
    this.bindings = bindings;

    for (const binding of bindings) {
      if (!binding.enabled || !binding.accelerator.trim()) {
        continue;
      }

      globalShortcut.register(binding.accelerator, () => {
        this.sendCommand(binding.command);
      });
    }
  }

  unregister(): void {
    for (const binding of this.bindings) {
      if (binding.accelerator.trim()) {
        globalShortcut.unregister(binding.accelerator);
      }
    }

    this.bindings = [];
  }

  sendCommand(command: PlayerCommand): void {
    this.getWindow()?.webContents.send("player:command", command);
  }
}

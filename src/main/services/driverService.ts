import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FlowCastMicStatus } from "../../shared/types";

const ENDPOINT_NAME = "FlowCast Microphone";

export class FlowCastMicDriverService {
  private readonly diagnosticsDir: string;

  constructor(userDataPath: string) {
    this.diagnosticsDir = join(userDataPath, "drivers", "flowcast-virtual-mic");
  }

  async getStatus(message?: string): Promise<FlowCastMicStatus> {
    const detectedDevices = await this.detectDevices();
    const installed = detectedDevices.some((device) => /flowcast microphone|flowcast virtual mic|flowcast mic/i.test(device));

    return {
      state: installed ? "installed" : "development-only",
      installed,
      endpointName: ENDPOINT_NAME,
      detectedDevices,
      diagnosticsPath: this.diagnosticsDir,
      message:
        message ??
        (installed
          ? "FlowCast Microphone найден в системе."
          : "Драйвер FlowCast Microphone еще не собран и не подписан для production установки."),
    };
  }

  async installFlowCastMic(): Promise<FlowCastMicStatus> {
    await this.writeDiagnostics();
    return this.getStatus(
      "Открыта инструкция по FlowCast Microphone. Для обычной установки нужен собранный и Microsoft-signed драйвер.",
    );
  }

  async openDiagnostics(): Promise<FlowCastMicStatus> {
    await this.writeDiagnostics();
    spawn("explorer.exe", [this.diagnosticsDir], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();

    return this.getStatus("Открыта папка диагностики FlowCast Microphone.");
  }

  private async writeDiagnostics(): Promise<void> {
    await mkdir(this.diagnosticsDir, { recursive: true });
    await writeFile(
      join(this.diagnosticsDir, "README.txt"),
      [
        "FlowCast Microphone: production checklist",
        "",
        "1. Install Visual Studio 2022, Windows SDK, and Windows Driver Kit (WDK).",
        "2. Base the virtual capture endpoint on Microsoft's SYSVAD sample.",
        "3. Rename the endpoint to FlowCast Microphone in the INF/topology.",
        "4. Implement a user-mode bridge service that receives PCM frames from FlowCast.",
        "5. Connect the bridge to the driver through a named pipe, IOCTL path, or shared ring buffer.",
        "6. Test locally with TESTSIGNING enabled on a dedicated test machine only.",
        "7. Package SYS/INF/CAT, sign the package, and submit it through Microsoft Partner Center Hardware Dev Center.",
        "8. Bundle only the Microsoft-signed package in the FlowCast installer.",
        "",
        "Expected endpoint name: FlowCast Microphone",
        "Important: normal Windows 10/11 x64 machines will not load an unsigned kernel audio driver.",
      ].join("\r\n"),
      "utf8",
    );
  }

  private async detectDevices(): Promise<string[]> {
    const command = [
      "$devices = @()",
      "try { $devices += Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'FlowCast Microphone|FlowCast Virtual Mic|FlowCast Mic' } | ForEach-Object { $_.FriendlyName } } catch {}",
      "try { $devices += Get-CimInstance Win32_SoundDevice -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'FlowCast Microphone|FlowCast Virtual Mic|FlowCast Mic' } | ForEach-Object { $_.Name } } catch {}",
      "$devices | Where-Object { $_ } | Sort-Object -Unique | ConvertTo-Json -Compress",
    ].join("; ");
    const output = await runPowerShell(command).catch(() => "");

    if (!output.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(output.trim()) as string | string[] | null;
      return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    } catch {
      return output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    }
  }
}

async function runPowerShell(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.trim() || `PowerShell exited with code ${code}`));
    });
  });
}

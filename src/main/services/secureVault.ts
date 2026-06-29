import { safeStorage } from "electron";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
}

export class SecureVault {
  constructor(private readonly filePath: string) {}

  async readToken(): Promise<StoredToken | null> {
    try {
      const payload = JSON.parse(await readFile(this.filePath, "utf8")) as { encrypted: string; encoding: string };
      const encrypted = Buffer.from(payload.encrypted, "base64");
      const decrypted = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(encrypted)
        : Buffer.from(payload.encrypted, "base64").toString("utf8");

      return JSON.parse(decrypted) as StoredToken;
    } catch {
      return null;
    }
  }

  async writeToken(token: StoredToken): Promise<void> {
    const serialized = JSON.stringify(token);
    const encrypted = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(serialized)
      : Buffer.from(serialized, "utf8");

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(
      this.filePath,
      JSON.stringify({ encoding: safeStorage.isEncryptionAvailable() ? "electron-safe-storage" : "base64", encrypted: encrypted.toString("base64") }, null, 2),
      "utf8",
    );
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}

export function createSecureVault(userDataPath: string): SecureVault {
  return new SecureVault(join(userDataPath, "vault.dat"));
}

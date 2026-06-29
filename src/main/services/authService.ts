import { BrowserWindow, session } from "electron";
import type { AuthStatus } from "../../shared/types";
import type { SecureVault, StoredToken } from "./secureVault";

const YANDEX_PARTITION = "persist:flowcast-yandex";
const LOGIN_URL = "https://passport.yandex.ru/auth?origin=music_button-header&retpath=https%3A%2F%2Fmusic.yandex.ru%2Fhome";
const MUSIC_HOME_URL = "https://music.yandex.ru/home";
const OAUTH_HOSTS = ["oauth.yandex.ru", "oauth.yandex.com"];
const OAUTH_REDIRECT_URI = "https://oauth.yandex.ru/verification_code";

export class YandexSessionService {
  private loginWindow: BrowserWindow | null = null;

  constructor(
    private readonly vault: SecureVault,
    private readonly notifyStatusChanged: (status: AuthStatus) => void,
  ) {}

  async getStatus(message?: string): Promise<AuthStatus> {
    const hasToken = await this.hasAccessToken();
    const hasSession = await this.hasYandexSession();

    if (!hasSession && !hasToken) {
      return {
        state: message ? "error" : "signed-out",
        hasMusicToken: false,
        playbackAccess: "preview",
        message,
      };
    }

    return {
      state: message ? "error" : "connected",
      accountName: "Yandex Music",
      login: hasToken ? "Полный доступ" : "Вход выполнен",
      hasMusicToken: hasToken,
      playbackAccess: hasToken ? "full" : "preview",
      message,
    };
  }

  async openLoginWindow(parent?: BrowserWindow | null): Promise<AuthStatus> {
    if (this.loginWindow && !this.loginWindow.isDestroyed()) {
      this.loginWindow.focus();
      return this.getStatus();
    }

    const yandexSession = session.fromPartition(YANDEX_PARTITION, { cache: true });
    const oauthUrl = this.createOAuthUrl();
    this.loginWindow = new BrowserWindow({
      width: 980,
      height: 720,
      parent: parent ?? undefined,
      modal: Boolean(parent),
      show: false,
      title: "FlowCast - вход в Яндекс",
      autoHideMenuBar: true,
      webPreferences: {
        partition: YANDEX_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.loginWindow.once("ready-to-show", () => this.loginWindow?.show());
    this.loginWindow.on("closed", async () => {
      this.loginWindow = null;
      this.notifyStatusChanged(await this.getStatus());
    });
    const tryCaptureToken = async (url: string) => {
      const token = parseOAuthToken(url);

      if (!token) {
        return false;
      }

      await this.vault.writeToken(token);
      this.notifyStatusChanged(await this.getStatus());
      this.loginWindow?.close();
      return true;
    };
    this.loginWindow.webContents.on("will-redirect", (event, url) => {
      void tryCaptureToken(url).then((captured) => {
        if (captured) {
          event.preventDefault();
        }
      });
    });
    this.loginWindow.webContents.on("did-navigate", async (_event, url) => {
      if (await tryCaptureToken(url)) {
        return;
      }

      if (url.startsWith(MUSIC_HOME_URL) || url.includes("music.yandex.")) {
        this.notifyStatusChanged(await this.getStatus());
      }
    });
    this.loginWindow.webContents.on("did-navigate-in-page", async (_event, url) => {
      await tryCaptureToken(url);
    });

    await yandexSession.cookies.flushStore();
    await this.loginWindow.loadURL(oauthUrl ?? LOGIN_URL);

    return this.getStatus();
  }

  async logout(): Promise<AuthStatus> {
    const yandexSession = session.fromPartition(YANDEX_PARTITION, { cache: true });
    await yandexSession.clearStorageData({ storages: ["cookies", "localstorage", "indexdb", "cachestorage"] });
    await this.vault.clear();
    const status = await this.getStatus();
    this.notifyStatusChanged(status);
    return status;
  }

  async getAccessToken(): Promise<string> {
    const stored = await this.vault.readToken();
    const bundledToken = process.env.FLOWCAST_YANDEX_TOKEN || process.env.YANDEX_MUSIC_TOKEN;
    const token: StoredToken | null = stored?.accessToken ? stored : bundledToken ? { accessToken: bundledToken } : null;

    if (!token?.accessToken) {
      throw new Error("Вход в Яндекс выполнен, но полный поток недоступен: приложению нужен OAuth-доступ к Yandex Music API. Укажите FLOWCAST_YANDEX_CLIENT_ID или YANDEX_MUSIC_TOKEN.");
    }

    return token.accessToken;
  }

  async getYandexCookieHeader(): Promise<string | undefined> {
    const yandexSession = session.fromPartition(YANDEX_PARTITION, { cache: true });
    const cookies = await yandexSession.cookies.get({});
    const pairs = new Map<string, string>();

    for (const cookie of cookies) {
      const domain = (cookie.domain ?? "").replace(/^\./, "").toLowerCase();

      if (!domain.endsWith("yandex.ru") && !domain.endsWith("yandex.com") && !domain.endsWith("yandex.net")) {
        continue;
      }

      pairs.set(cookie.name, cookie.value);
    }

    if (!pairs.size) {
      return undefined;
    }

    return [...pairs.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  private async hasAccessToken(): Promise<boolean> {
    const stored = await this.vault.readToken();
    const bundledToken = process.env.FLOWCAST_YANDEX_TOKEN || process.env.YANDEX_MUSIC_TOKEN;
    return Boolean(stored?.accessToken || bundledToken);
  }

  private createOAuthUrl(): string | null {
    const clientId = process.env.FLOWCAST_YANDEX_CLIENT_ID || process.env.YANDEX_CLIENT_ID;

    if (!clientId) {
      return null;
    }

    const url = new URL("https://oauth.yandex.ru/authorize");
    url.searchParams.set("response_type", "token");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", OAUTH_REDIRECT_URI);
    return url.toString();
  }

  private async hasYandexSession(): Promise<boolean> {
    const yandexSession = session.fromPartition(YANDEX_PARTITION, { cache: true });
    const cookies = await yandexSession.cookies.get({ domain: ".yandex.ru" });
    return cookies.some((cookie) => ["Session_id", "sessionid2", "yandex_login", "yandexuid"].includes(cookie.name));
  }
}

function parseOAuthToken(url: string): StoredToken | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!OAUTH_HOSTS.includes(parsed.hostname)) {
    return null;
  }

  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const accessToken = hashParams.get("access_token");

  if (!accessToken) {
    return null;
  }

  const expiresIn = Number(hashParams.get("expires_in"));

  return {
    accessToken,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : undefined,
    tokenType: hashParams.get("token_type") ?? "bearer",
  };
}

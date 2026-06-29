import { YandexMusicClient } from "ya-music-api-ts-lib";
import type { Playlist, Track } from "../../shared/types";
import type { YandexSessionService } from "./authService";
import { mapPlaylist, mapTrack, pickBestDownloadInfo } from "./yandexMusicMapper";
import { resolveStreamUrl } from "./streamUrl";

interface ClientAuth {
  client: YandexMusicClient;
  token?: string;
  cookieHeader?: string;
}

export class YandexMusicService {
  constructor(private readonly auth: YandexSessionService) {}

  async searchTracks(query: string): Promise<Track[]> {
    const normalized = query.trim();

    if (!normalized) {
      return [];
    }

    const { client } = await this.createClient();
    const result = await client.search.search(normalized, {
      language: "ru",
      pageSize: 25,
      type: "track",
    });
    const trackItems = readSearchTrackItems(result.tracks);

    return trackItems
      .map((track) => mapTrack(track as never))
      .filter((track): track is Track => Boolean(track));
  }

  async getFavoritePlaylists(): Promise<Playlist[]> {
    const { client } = await this.createClient(true);
    const status = await client.account.status({ language: "ru" });
    const userId = status.account?.uid;

    if (!userId) {
      return [];
    }

    const liked = await client.likes.likedPlaylists(userId);
    const playlists = liked
      .map((like) => like.playlist)
      .filter((playlist): playlist is NonNullable<typeof playlist> => Boolean(playlist))
      .map((playlist) => mapPlaylist(playlist as never))
      .filter((playlist): playlist is Playlist => Boolean(playlist));

    if (playlists.length) {
      return playlists;
    }

    const userPlaylists = await client.playlists.list(userId, { language: "ru" });
    return userPlaylists
      .map((playlist) => mapPlaylist(playlist as never))
      .filter((playlist): playlist is Playlist => Boolean(playlist));
  }

  async getPlaylistTracks(playlistId: string): Promise<Track[]> {
    const { client } = await this.createClient(true);
    const [uid, kind] = playlistId.split(":");

    if (!uid || !kind) {
      throw new Error("Некорректный ID плейлиста.");
    }

    const playlist = await client.playlists.get(uid, kind, {
      language: "ru",
      richTracks: true,
    });
    const tracks = playlist.tracks ?? [];

    return tracks
      .map((item) => {
        const raw = item as unknown as { track?: unknown };
        return mapTrack((raw.track ?? item) as never);
      })
      .filter((track): track is Track => Boolean(track));
  }

  async getStreamUrl(trackId: string): Promise<string> {
    const { client, token, cookieHeader } = await this.createClient(true);
    const downloadInfo = await client.tracks.downloadInfo(trackId, {
      language: "ru",
      getDirectLinks: true,
    });
    const best = pickBestDownloadInfo(downloadInfo);

    if (!best) {
      throw new Error("Для этого трека Яндекс Музыка не вернула полный поток.");
    }

    return resolveStreamUrl(best, token, cookieHeader);
  }

  private async createClient(requireAuth = false): Promise<ClientAuth> {
    const token = await this.auth.getAccessToken().catch(() => undefined);

    if (token) {
      return {
        client: new YandexMusicClient({ oauthToken: token }),
        token,
      };
    }

    const cookieHeader = await this.auth.getYandexCookieHeader().catch(() => undefined);

    if (cookieHeader) {
      return {
        client: new YandexMusicClient({
          defaultHeaders: {
            Cookie: cookieHeader,
            Origin: "https://music.yandex.ru",
            Referer: "https://music.yandex.ru/",
          },
        }),
        cookieHeader,
      };
    }

    if (requireAuth) {
      throw new Error("Войдите в Яндекс Музыку. Если сессия уже есть, перелогиньтесь в окне FlowCast.");
    }

    return {
      client: new YandexMusicClient({}),
    };
  }
}

function readSearchTrackItems(tracks: unknown): unknown[] {
  if (!tracks || typeof tracks !== "object") {
    return [];
  }

  const record = tracks as { items?: unknown; results?: unknown };
  const items = Array.isArray(record.items) ? record.items : Array.isArray(record.results) ? record.results : [];
  return items;
}

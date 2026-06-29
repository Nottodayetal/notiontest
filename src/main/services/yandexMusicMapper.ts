import type { DownloadInfo, Playlist as YandexPlaylist, Track as YandexTrack } from "ya-music-api-ts-lib";
import type { Playlist, Track } from "../../shared/types";

type UnknownRecord = Record<string, unknown>;

export function mapTrack(input: Partial<YandexTrack> & UnknownRecord): Track | null {
  const id = valueToString(input.realId ?? input.id);

  if (!id) {
    return null;
  }

  const albums = Array.isArray(input.albums) ? input.albums : [];
  const firstAlbum = albums[0] as UnknownRecord | undefined;
  const artists = Array.isArray(input.artists) ? input.artists : [];
  const artistNames = artists
    .map((artist) => valueToString((artist as UnknownRecord).name))
    .filter((name): name is string => Boolean(name));

  return {
    id,
    albumId: valueToString(firstAlbum?.id),
    title: valueToString(input.title) ?? "Без названия",
    artists: artistNames,
    durationMs: typeof input.durationMs === "number" ? input.durationMs : 0,
    coverUrl: getCoverUrl(input),
    available: input.available !== false,
    explicit: Boolean(input.explicit),
  };
}

export function mapPlaylist(input: Partial<YandexPlaylist> & UnknownRecord): Playlist | null {
  const uid = valueToString(input.uid ?? (input.owner as UnknownRecord | undefined)?.uid);
  const kind = valueToString(input.kind);
  const fallbackId = valueToString(input.id);
  const id = uid && kind ? `${uid}:${kind}` : fallbackId;

  if (!id) {
    return null;
  }

  return {
    id,
    uid,
    kind,
    title: valueToString(input.title) ?? "Плейлист",
    description: valueToString(input.description),
    trackCount: typeof input.trackCount === "number" ? input.trackCount : Array.isArray(input.tracks) ? input.tracks.length : 0,
    durationMs: typeof input.durationMs === "number" ? input.durationMs : undefined,
    coverUrl: getCoverUrl(input),
  };
}

export function pickBestDownloadInfo(items: readonly DownloadInfo[]): DownloadInfo | null {
  const playable = items.filter((item) => !item.preview && (item.direct || item.downloadInfoUrl));
  const byQuality = [...playable].sort((a, b) => (b.bitrateInKbps ?? 0) - (a.bitrateInKbps ?? 0));
  return byQuality.find((item) => item.codec === "mp3") ?? byQuality[0] ?? null;
}

export function pickBestPreviewDownloadInfo(items: readonly DownloadInfo[]): DownloadInfo | null {
  const playable = items.filter((item) => item.preview && (item.direct || item.downloadInfoUrl));
  const byQuality = [...playable].sort((a, b) => (b.bitrateInKbps ?? 0) - (a.bitrateInKbps ?? 0));
  return byQuality.find((item) => item.codec === "mp3") ?? byQuality[0] ?? null;
}

function getCoverUrl(input: UnknownRecord): string | undefined {
  const withMethod = input as { getCoverUrl?: (size?: string) => string | null };
  const fromMethod = withMethod.getCoverUrl?.("300x300");

  if (fromMethod) {
    return fromMethod;
  }

  const coverUri = valueToString(input.coverUri ?? (input.cover as UnknownRecord | undefined)?.uri);

  if (!coverUri) {
    return undefined;
  }

  return `https://${coverUri.replace("%%", "300x300")}`;
}

function valueToString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return undefined;
}

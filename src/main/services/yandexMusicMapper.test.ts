import { describe, expect, it } from "vitest";
import { mapPlaylist, mapTrack, pickBestDownloadInfo, pickBestPreviewDownloadInfo } from "./yandexMusicMapper";
import type { DownloadInfo } from "ya-music-api-ts-lib";

describe("Yandex Music mapper", () => {
  it("maps tracks into renderer-safe data", () => {
    const track = mapTrack({
      id: 42,
      realId: "42",
      title: "Night Drive",
      durationMs: 186000,
      available: true,
      explicit: true,
      coverUri: "avatars.yandex.net/get-music-content/cover/%%",
      artists: [{ name: "Nova" }] as never,
      albums: [{ id: 7 }] as never,
    });

    expect(track).toMatchObject({
      id: "42",
      albumId: "7",
      title: "Night Drive",
      artists: ["Nova"],
      durationMs: 186000,
      available: true,
      explicit: true,
    });
    expect(track?.coverUrl).toContain("300x300");
  });

  it("maps playlist owner and kind to stable id", () => {
    const playlist = mapPlaylist({
      uid: 100,
      kind: 200,
      title: "Favorites",
      trackCount: 12,
    });

    expect(playlist).toMatchObject({
      id: "100:200",
      uid: "100",
      kind: "200",
      title: "Favorites",
      trackCount: 12,
    });
  });

  it("prefers playable high bitrate mp3 stream descriptors", () => {
    const best = pickBestDownloadInfo([
      { codec: "aac", bitrateInKbps: 256, direct: "https://aac.example" },
      { codec: "mp3", bitrateInKbps: 192, direct: "https://mp3.example" },
      { codec: "mp3", bitrateInKbps: 320, preview: true, direct: "https://preview.example" },
    ] as DownloadInfo[]);

    expect(best?.codec).toBe("mp3");
    expect(best?.bitrateInKbps).toBe(192);
  });

  it("uses preview descriptors for unauthenticated listening fallback", () => {
    const best = pickBestPreviewDownloadInfo([
      { codec: "aac", bitrateInKbps: 256, preview: true, direct: "https://aac-preview.example" },
      { codec: "mp3", bitrateInKbps: 128, preview: true, downloadInfoUrl: "https://mp3-preview.example" },
      { codec: "mp3", bitrateInKbps: 320, direct: "https://full.example" },
    ] as DownloadInfo[]);

    expect(best?.codec).toBe("mp3");
    expect(best?.preview).toBe(true);
  });
});

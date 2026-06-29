import { createHash } from "node:crypto";
import type { DownloadInfo } from "ya-music-api-ts-lib";

const DOWNLOAD_SALT = "XGRlBW9FXlekgbPrRHuSiA";

export async function resolveStreamUrl(downloadInfo: DownloadInfo, oauthToken?: string, cookieHeader?: string): Promise<string> {
  if (typeof downloadInfo.direct === "string" && downloadInfo.direct.startsWith("http")) {
    return downloadInfo.direct;
  }

  if (!downloadInfo.downloadInfoUrl) {
    throw new Error("У трека нет доступного downloadInfoUrl.");
  }

  const headers: Record<string, string> = {};

  if (oauthToken) {
    headers.Authorization = `OAuth ${oauthToken}`;
  }

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
    headers.Referer = "https://music.yandex.ru/";
    headers.Origin = "https://music.yandex.ru";
  }

  const response = await fetch(downloadInfo.downloadInfoUrl, {
    headers: Object.keys(headers).length ? headers : undefined,
  });

  if (!response.ok) {
    throw new Error(`Не удалось получить данные потока: ${response.status}`);
  }

  const xml = await response.text();
  const host = readXmlTag(xml, "host");
  const path = readXmlTag(xml, "path");
  const salt = readXmlTag(xml, "s");
  const timestamp = readXmlTag(xml, "ts");

  if (!host || !path || !salt || !timestamp) {
    throw new Error("Yandex Music вернул неполные данные потока.");
  }

  const sign = createHash("md5")
    .update(`${DOWNLOAD_SALT}${path.slice(1)}${salt}`)
    .digest("hex");

  return `https://${host}/get-mp3/${sign}/${timestamp}${path}`;
}

export function readXmlTag(xml: string, tagName: string): string | undefined {
  const match = xml.match(new RegExp(`<${tagName}>([^<]+)</${tagName}>`, "i"));
  return match?.[1];
}

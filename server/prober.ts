import path from "node:path";
import type { Category, FeaturePack, PackId, ProbeResult } from "../src/shared/types.js";
import { inferMediaKind, matchCategoryByName, toSafeFilename } from "./presets.js";

const FILEHOSTER_HOSTS = [
  "tezfiles.com",
  "fileboom.me",
  "fboom.me",
  "k2s.cc",
  "keep2share.cc",
  "keepshare.net",
];

function unwrapSpecialLink(rawUrl: string): { unwrapped: string; wasWrapped: boolean } {
  const trimmed = rawUrl.trim();
  if (/^thunder:\/\//i.test(trimmed)) {
    try {
      const decoded = Buffer.from(trimmed.slice("thunder://".length), "base64").toString("utf-8");
      if (decoded.startsWith("AA") && decoded.endsWith("ZZ")) {
        return { unwrapped: decoded.slice(2, -2), wasWrapped: true };
      }
    } catch {
      // fall through
    }
  }
  if (/^flashget:\/\//i.test(trimmed)) {
    try {
      const payload = trimmed.slice("flashget://".length).split("&")[0];
      const decoded = Buffer.from(payload, "base64").toString("utf-8");
      const stripped = decoded.replace(/^\[FLASHGET\]|\[FLASHGET\]$/g, "");
      if (stripped) {
        return { unwrapped: stripped, wasWrapped: true };
      }
    } catch {
      // fall through
    }
  }
  if (/^qqdl:\/\//i.test(trimmed)) {
    try {
      const decoded = Buffer.from(trimmed.slice("qqdl://".length), "utf-8");
      if (decoded) {
        return { unwrapped: decoded.toString("utf-8"), wasWrapped: true };
      }
    } catch {
      // fall through
    }
  }
  return { unwrapped: trimmed, wasWrapped: false };
}

function resolveKnownHttpUrl(urlStr: string): { resolvedUrl: string; preferredPack?: PackId } {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();

    if (FILEHOSTER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
      return { resolvedUrl: urlStr, preferredPack: "filehoster_pack" };
    }

    if (host === "arxiv.org" || host === "www.arxiv.org") {
      const absMatch = parsed.pathname.match(/^\/abs\/(.+?)(?:\.pdf)?$/i);
      if (absMatch) {
        return {
          resolvedUrl: `https://arxiv.org/pdf/${absMatch[1]}.pdf`,
          preferredPack: "arxiv_pack",
        };
      }
      return { resolvedUrl: urlStr, preferredPack: "arxiv_pack" };
    }

    if (host === "huggingface.co" || host === "hf-mirror.com") {
      if (parsed.pathname.includes("/blob/")) {
        parsed.pathname = parsed.pathname.replace("/blob/", "/resolve/");
        return { resolvedUrl: parsed.toString(), preferredPack: "huggingface_pack" };
      }
      return { resolvedUrl: urlStr, preferredPack: "huggingface_pack" };
    }

    if (host === "github.com" || host === "raw.githubusercontent.com" || host === "objects.githubusercontent.com") {
      if (host === "github.com" && parsed.pathname.includes("/blob/")) {
        const parts = parsed.pathname.split("/").filter(Boolean);
        const blobIndex = parts.indexOf("blob");
        if (blobIndex === 2 && parts.length > 3) {
          const owner = parts[0];
          const repo = parts[1];
          const rest = parts.slice(3).join("/");
          return {
            resolvedUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${rest}`,
            preferredPack: "github_pack",
          };
        }
      }
      return { resolvedUrl: urlStr, preferredPack: "github_pack" };
    }

    if (host.includes("youtube.com") || host === "youtu.be") {
      return { resolvedUrl: urlStr, preferredPack: "yt_dlp_pack" };
    }

    if (host.includes("bilibili.com") || host === "b23.tv") {
      return { resolvedUrl: urlStr, preferredPack: "bili_pack" };
    }
  } catch {
    // ignore invalid URL
  }
  return { resolvedUrl: urlStr };
}

export function matchPack(rawUrl: string, packs: FeaturePack[]): { packId: PackId; resolvedUrl: string; wasWrapped: boolean } {
  const enabled = new Set(packs.filter((p) => p.enabled).map((p) => p.packId));
  const { unwrapped, wasWrapped } = unwrapSpecialLink(rawUrl);
  const target = unwrapped.trim();
  const lower = target.toLowerCase();

  if (lower.startsWith("magnet:") || lower.endsWith(".torrent")) {
    return { packId: enabled.has("bittorrent_pack") ? "bittorrent_pack" : "http_pack", resolvedUrl: target, wasWrapped };
  }
  if (lower.startsWith("ed2k://")) {
    return { packId: enabled.has("ed2k_pack") ? "ed2k_pack" : "http_pack", resolvedUrl: target, wasWrapped };
  }
  if (lower.startsWith("ftp://") || lower.startsWith("ftps://")) {
    return { packId: enabled.has("ftp_pack") ? "ftp_pack" : "http_pack", resolvedUrl: target, wasWrapped };
  }

  const { resolvedUrl, preferredPack } = resolveKnownHttpUrl(target);
  if (preferredPack && enabled.has(preferredPack)) {
    return { packId: preferredPack, resolvedUrl, wasWrapped };
  }

  try {
    const pathname = new URL(resolvedUrl).pathname.toLowerCase();
    if ((pathname.endsWith(".m3u8") || pathname.endsWith(".mpd")) && enabled.has("m3u8_pack")) {
      return { packId: "m3u8_pack", resolvedUrl, wasWrapped };
    }
    if (pathname.endsWith(".zip") && enabled.has("zip_pack")) {
      return { packId: "zip_pack", resolvedUrl, wasWrapped };
    }
  } catch {
    // ignore
  }

  return { packId: "http_pack", resolvedUrl, wasWrapped };
}

function parseContentDispositionFilename(header: string | null): string {
  if (!header) return "";
  const utf8Match = header.match(/filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^["']|["']$/g, ""));
    } catch {
      return utf8Match[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  const plainMatch = header.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i);
  return (plainMatch?.[1] || plainMatch?.[2] || "").trim();
}

export function filenameFromUrl(urlStr: string, contentType = ""): string {
  try {
    const parsed = new URL(urlStr);
    const base = decodeURIComponent(path.posix.basename(parsed.pathname));
    if (base && base !== "/") {
      if (!path.posix.extname(base) && contentType.includes("pdf")) {
        return `${base}.pdf`;
      }
      return base;
    }
    if (parsed.hostname) {
      return `${parsed.hostname}.html`;
    }
  } catch {
    // ignore
  }
  return "download";
}

function extractDirectVideoFromHtml(html: string, baseUrl: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:video(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i,
    /<video[^>]+src=["']([^"']+)["']/i,
    /<source[^>]+src=["']([^"']+)["']/i,
    /["'](?:video_url|preview_url|hlsUrl|mp4Url|streamUrl|file)["']\s*:\s*["'](https?:[^"']+\.(?:mp4|webm|m3u8|mov)[^"']*)["']/i,
    /(https?:\/\/[^\s"'<>\\]+\.(?:mp4|webm|m3u8)(?:\?[^\s"'<>\\]+)?)/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      try {
        return new URL(m[1].replace(/\\u002F/g, "/").replace(/\\\//g, "/"), baseUrl).toString();
      } catch {
        // ignore
      }
    }
  }
  return null;
}

export async function probeUrl(
  rawUrl: string,
  headers: Record<string, string>,
  categories: Category[],
  packs: FeaturePack[],
): Promise<ProbeResult> {
  const trimmed = rawUrl.trim();
  const { packId, resolvedUrl, wasWrapped } = matchPack(trimmed, packs);

  if (packId === "bittorrent_pack") {
    let name = "torrent_download";
    if (resolvedUrl.startsWith("magnet:")) {
      const params = new URLSearchParams(resolvedUrl.slice("magnet:?".length));
      name = params.get("dn") || `bt_${(params.get("xt") || "task").slice(-8)}`;
    } else {
      name = filenameFromUrl(resolvedUrl);
    }
    const safeName = toSafeFilename(name);
    return {
      url: trimmed,
      resolvedUrl,
      packId,
      mediaKind: inferMediaKind(safeName),
      name: safeName,
      fileSize: 0,
      contentType: "application/x-bittorrent",
      canUseRangeRequests: false,
      lastModified: "",
      category: matchCategoryByName(safeName, categories) || "cat_other",
      isSimulated: true,
      note: "BitTorrent / Magnet parsed.",
    };
  }

  if (packId === "ed2k_pack") {
    const parts = resolvedUrl.split("|");
    const name = parts[2] ? decodeURIComponent(parts[2]) : "ed2k_file";
    const size = parts[3] ? Number.parseInt(parts[3], 10) || 0 : 0;
    const safeName = toSafeFilename(name);
    return {
      url: trimmed,
      resolvedUrl,
      packId,
      mediaKind: inferMediaKind(safeName),
      name: safeName,
      fileSize: size,
      contentType: "application/octet-stream",
      canUseRangeRequests: false,
      lastModified: "",
      category: matchCategoryByName(safeName, categories) || "cat_other",
      isSimulated: true,
      note: "eD2k metadata parsed.",
    };
  }

  if (packId === "ftp_pack") {
    const safeName = toSafeFilename(filenameFromUrl(resolvedUrl));
    return {
      url: trimmed,
      resolvedUrl,
      packId,
      mediaKind: inferMediaKind(safeName),
      name: safeName,
      fileSize: 0,
      contentType: "application/octet-stream",
      canUseRangeRequests: false,
      lastModified: "",
      category: matchCategoryByName(safeName, categories),
      isSimulated: true,
      note: "FTP target parsed.",
    };
  }

  if (packId === "yt_dlp_pack" || packId === "bili_pack" || packId === "m3u8_pack") {
    let baseName = filenameFromUrl(resolvedUrl);
    if (packId === "yt_dlp_pack") {
      try {
        const u = new URL(resolvedUrl);
        const vid = u.searchParams.get("v") || path.posix.basename(u.pathname) || "video";
        baseName = `youtube_${vid}.mp4`;
      } catch {
        baseName = "youtube_video.mp4";
      }
    } else if (packId === "bili_pack") {
      const bvMatch = resolvedUrl.match(/(BV[0-9A-Za-z]+)/);
      baseName = `${bvMatch?.[1] || "bilibili_video"}.mp4`;
    } else if (packId === "m3u8_pack") {
      baseName = baseName.replace(/\.(m3u8|mpd)$/i, ".mp4");
    }
    const safeName = toSafeFilename(baseName);
    return {
      url: trimmed,
      resolvedUrl,
      packId,
      mediaKind: "video",
      name: safeName,
      fileSize: 0,
      contentType: "video/mp4",
      canUseRangeRequests: false,
      lastModified: "",
      category: "cat_video",
      isSimulated: true,
      note: `${packId} stream parsed.`,
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(resolvedUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Unsupported URL scheme");
    }
  } catch {
    return {
      url: trimmed,
      resolvedUrl,
      packId,
      mediaKind: "other",
      name: toSafeFilename(trimmed.slice(0, 48), "download"),
      fileSize: 0,
      contentType: "",
      canUseRangeRequests: false,
      lastModified: "",
      category: "",
      isSimulated: false,
      error: "Invalid URL format",
    };
  }

  const requestHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (k && v && k.toLowerCase() !== "accept-encoding") {
      requestHeaders[k] = v;
    }
  }
  if (!requestHeaders.referer && !requestHeaders.Referer) {
    requestHeaders.Referer = `${parsedUrl.protocol}//${parsedUrl.host}/`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    let targetUrl = parsedUrl.toString();
    let extractedNote = wasWrapped ? "Wrapped link decoded." : undefined;

    if (packId === "filehoster_pack") {
      const pageRes = await fetch(targetUrl, {
        method: "GET",
        headers: requestHeaders,
        redirect: "follow",
        signal: controller.signal,
      });
      const ct = pageRes.headers.get("content-type") || "";
      if (ct.includes("text/html")) {
        const html = await pageRes.text();
        const extracted = extractDirectVideoFromHtml(html, pageRes.url || targetUrl);
        if (extracted) {
          targetUrl = extracted;
          extractedNote = "Extracted embedded video/preview stream from filehoster page.";
        } else {
          const base = filenameFromUrl(targetUrl, "video/mp4");
          const safeName = toSafeFilename(path.posix.extname(base) ? base : `${base}.mp4`);
          return {
            url: trimmed,
            resolvedUrl: targetUrl,
            packId,
            mediaKind: "video",
            name: safeName,
            fileSize: 0,
            contentType: "video/mp4",
            canUseRangeRequests: true,
            lastModified: "",
            category: "cat_video",
            isSimulated: false,
            isPartialBypass: true,
            note: "Filehoster protected page — add session Cookie/Referer or use Link Aggregator to inspect unlocked segments.",
            error: pageRes.status >= 400 ? `HTTP ${pageRes.status}` : undefined,
          };
        }
      }
    }

    let res = await fetch(targetUrl, {
      method: "HEAD",
      headers: requestHeaders,
      redirect: "follow",
      signal: controller.signal,
    });

    if (res.status === 405 || res.status === 501 || !res.ok) {
      const rangeRes = await fetch(targetUrl, {
        method: "GET",
        headers: { ...requestHeaders, Range: "bytes=0-0" },
        redirect: "follow",
        signal: controller.signal,
      });
      rangeRes.body?.cancel().catch(() => {});
      if (rangeRes.ok || rangeRes.status === 206) {
        res = rangeRes;
      }
    }

    const finalUrl = res.url || targetUrl;
    const contentType = res.headers.get("content-type") || "";
    const contentDisposition = res.headers.get("content-disposition");
    const acceptRanges = (res.headers.get("accept-ranges") || "").toLowerCase();
    const contentRange = res.headers.get("content-range") || "";
    const lastModified = res.headers.get("last-modified") || "";

    let fileSize = 0;
    const rangeTotalMatch = contentRange.match(/\/(\d+)$/);
    if (rangeTotalMatch) {
      fileSize = Number.parseInt(rangeTotalMatch[1], 10) || 0;
    } else if (res.status !== 206) {
      const lenHeader = res.headers.get("content-length");
      if (lenHeader) {
        fileSize = Number.parseInt(lenHeader, 10) || 0;
      }
    }

    const canUseRangeRequests = res.status === 206 || acceptRanges.includes("bytes");
    const rawName = parseContentDispositionFilename(contentDisposition) || filenameFromUrl(finalUrl, contentType);
    const safeName = toSafeFilename(rawName);
    const category = matchCategoryByName(safeName, categories);
    const mediaKind = inferMediaKind(safeName, contentType);

    return {
      url: trimmed,
      resolvedUrl: finalUrl,
      packId,
      mediaKind,
      name: safeName,
      fileSize,
      contentType,
      canUseRangeRequests,
      lastModified,
      category,
      isSimulated: false,
      isPartialBypass: canUseRangeRequests && res.status === 206,
      note: extractedNote,
      error: res.ok || res.status === 206 ? undefined : `HTTP ${res.status} ${res.statusText}`,
    };
  } catch (err) {
    const safeName = toSafeFilename(filenameFromUrl(resolvedUrl));
    return {
      url: trimmed,
      resolvedUrl,
      packId,
      mediaKind: inferMediaKind(safeName),
      name: safeName,
      fileSize: 0,
      contentType: "",
      canUseRangeRequests: false,
      lastModified: "",
      category: matchCategoryByName(safeName, categories),
      isSimulated: false,
      error: err instanceof Error ? err.message : "Probe request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

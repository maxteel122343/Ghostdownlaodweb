import crypto from "node:crypto";
import path from "node:path";
import type {
  AggregatedItem,
  AggregatorFilter,
  Category,
  FeaturePack,
  MediaKind,
  QualityTag,
} from "../src/shared/types.js";
import { inferMediaKind, toSafeFilename } from "./presets.js";
import { filenameFromUrl, matchPack } from "./prober.js";

const QUALITY_RANK: Record<QualityTag, number> = {
  all: 0,
  original: 1,
  "480p": 2,
  "720p": 3,
  "1080p": 4,
  "4k": 5,
};

const MEDIA_EXT_REGEX =
  /\.(mp4|mkv|webm|mov|avi|flv|m4v|ts|m3u8|mpd|pdf|png|jpe?g|webp|avif|gif|svg|bmp|mp3|flac|wav|ogg|m4a|aac|opus|zip|rar|7z)(?:$|[?#])/i;

export function inferQualityHint(urlStr: string, hintText = ""): QualityTag {
  const combined = `${urlStr} ${hintText}`.toLowerCase();
  if (/2160p|4k|uhd/.test(combined)) return "4k";
  if (/1080p|fhd|fullhd/.test(combined)) return "1080p";
  if (/720p|hd/.test(combined)) return "720p";
  if (/480p|sd/.test(combined)) return "480p";
  if (/orig|original|raw|master|source/.test(combined)) return "original";
  return "all";
}

export function passesAggregatorFilter(
  item: AggregatedItem,
  filter: AggregatorFilter,
  currentQueuedCount: number,
  currentTotalQueuedBytes: number,
): { ok: boolean; reason?: "skipped_filter" | "skipped_limit" } {
  if (filter.mediaTypes.length > 0 && !filter.mediaTypes.includes(item.mediaKind)) {
    return { ok: false, reason: "skipped_filter" };
  }
  if (filter.formats.length > 0) {
    const normalized = filter.formats.map((f) => f.trim().replace(/^\./, "").toLowerCase()).filter(Boolean);
    if (normalized.length > 0 && !normalized.includes(item.format.toLowerCase())) {
      return { ok: false, reason: "skipped_filter" };
    }
  }
  if (filter.minQuality !== "all") {
    const itemRank = QUALITY_RANK[inferQualityHint(item.url, item.quality)] ?? 0;
    const minRank = QUALITY_RANK[filter.minQuality] ?? 0;
    if (itemRank > 0 && itemRank < minRank) {
      return { ok: false, reason: "skipped_filter" };
    }
  }
  if (filter.maxFileSizeMb > 0 && item.fileSize > 0) {
    if (item.fileSize > filter.maxFileSizeMb * 1024 * 1024) {
      return { ok: false, reason: "skipped_limit" };
    }
  }
  if (filter.maxItems > 0 && currentQueuedCount >= filter.maxItems) {
    return { ok: false, reason: "skipped_limit" };
  }
  if (filter.maxTotalSizeMb > 0 && item.fileSize > 0) {
    if (currentTotalQueuedBytes + item.fileSize > filter.maxTotalSizeMb * 1024 * 1024) {
      return { ok: false, reason: "skipped_limit" };
    }
  }
  return { ok: true };
}

function extractCandidatesFromHtml(html: string, baseUrl: string): Array<{ url: string; hint: string }> {
  const seen = new Set<string>();
  const results: Array<{ url: string; hint: string }> = [];

  const pushCandidate = (raw: string, hint = "") => {
    const cleaned = raw.replace(/&amp;/g, "&").replace(/\\u002F/g, "/").replace(/\\\//g, "/").trim();
    if (!cleaned || cleaned.startsWith("data:") || cleaned.startsWith("javascript:") || cleaned.startsWith("#")) {
      return;
    }
    try {
      const abs = new URL(cleaned, baseUrl).toString();
      if (!/^https?:/i.test(abs)) return;
      if (!seen.has(abs)) {
        seen.add(abs);
        results.push({ url: abs, hint });
      }
    } catch {
      // ignore invalid URL
    }
  };

  // 1. Meta tags (og:video, og:image, twitter:player:stream)
  const metaRe = /<meta[^>]+(?:property|name)=["']([^"']+)["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
  for (const m of html.matchAll(metaRe)) {
    const prop = m[1].toLowerCase();
    if (prop.includes("video") || prop.includes("image") || prop.includes("audio")) {
      pushCandidate(m[2], prop);
    }
  }

  // 2. <video>, <source>, <audio>, <embed>, <object>, <iframe>, <img>
  const tagAttrRe =
    /<(?:video|source|audio|img|embed|object|iframe)[^>]+(?:src|data-src|data-original|data-url|data)=["']([^"']+)["'][^>]*>/gi;
  for (const m of html.matchAll(tagAttrRe)) {
    pushCandidate(m[1], m[0].slice(0, 80));
  }

  // 3. srcset attributes
  const srcsetRe = /srcset=["']([^"']+)["']/gi;
  for (const m of html.matchAll(srcsetRe)) {
    const parts = m[1].split(",");
    for (const part of parts) {
      const [u, descriptor] = part.trim().split(/\s+/);
      if (u) pushCandidate(u, descriptor || "");
    }
  }

  // 4. <a href="..."> pointing to media/documents/archives
  const anchorRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(anchorRe)) {
    if (MEDIA_EXT_REGEX.test(m[1])) {
      pushCandidate(m[1], m[2].replace(/<[^>]+>/g, "").trim());
    }
  }

  // 5. Embedded JSON / inline script direct media links
  const scriptUrlRe = /(https?:\\?\/\\?\/[^\s"'<>\\]+\.(?:mp4|webm|mkv|m3u8|mpd|pdf|gif|png|jpe?g|webp|mp3|flac|wav|ogg)(?:\?[^\s"'<>\\]*)?)/gi;
  for (const m of html.matchAll(scriptUrlRe)) {
    pushCandidate(m[1], "script");
  }

  return results;
}

export async function crawlUrlForMedia(
  sourceUrl: string,
  baseHeaders: Record<string, string>,
  customHeaders: Record<string, string>,
  _categories: Category[],
  packs: FeaturePack[],
  onItemDiscovered: (item: AggregatedItem) => void,
  signal: AbortSignal,
): Promise<void> {
  const parsed = new URL(sourceUrl);
  const reqHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...baseHeaders, ...customHeaders })) {
    if (k && v && k.toLowerCase() !== "accept-encoding") {
      reqHeaders[k] = v;
    }
  }
  if (!reqHeaders.Referer && !reqHeaders.referer) {
    reqHeaders.Referer = `${parsed.protocol}//${parsed.host}/`;
  }

  const headOrGet = await fetch(sourceUrl, {
    method: "GET",
    headers: reqHeaders,
    redirect: "follow",
    signal,
  });

  const finalUrl = headOrGet.url || sourceUrl;
  const contentType = (headOrGet.headers.get("content-type") || "").toLowerCase();

  let candidates: Array<{ url: string; hint: string }> = [];
  if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
    const html = await headOrGet.text();
    candidates = extractCandidatesFromHtml(html, finalUrl);
  } else {
    headOrGet.body?.cancel().catch(() => {});
    candidates = [{ url: finalUrl, hint: contentType }];
  }

  const BATCH_SIZE = 4;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    if (signal.aborted) break;
    const batch = candidates.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (cand) => {
        if (signal.aborted) return;
        const { packId, resolvedUrl } = matchPack(cand.url, packs);
        let fileSize = 0;
        let candCt = "";
        let canRange = false;
        let isBlockedOrPartial = false;
        let blockReason: string | undefined;

        try {
          const probeCtrl = new AbortController();
          const timer = setTimeout(() => probeCtrl.abort(), 6000);
          try {
            let pRes = await fetch(resolvedUrl, {
              method: "HEAD",
              headers: { ...reqHeaders, Referer: finalUrl },
              redirect: "follow",
              signal: probeCtrl.signal,
            });
            if (pRes.status === 405 || pRes.status === 403 || !pRes.ok) {
              const rRes = await fetch(resolvedUrl, {
                method: "GET",
                headers: { ...reqHeaders, Referer: finalUrl, Range: "bytes=0-0" },
                redirect: "follow",
                signal: probeCtrl.signal,
              });
              rRes.body?.cancel().catch(() => {});
              pRes = rRes;
            }
            candCt = pRes.headers.get("content-type") || "";
            const cr = pRes.headers.get("content-range") || "";
            const m = cr.match(/\/(\d+)$/);
            if (m) {
              fileSize = Number.parseInt(m[1], 10) || 0;
            } else {
              fileSize = Number.parseInt(pRes.headers.get("content-length") || "0", 10) || 0;
            }
            canRange = pRes.status === 206 || (pRes.headers.get("accept-ranges") || "").includes("bytes");
            if (pRes.status === 403 || pRes.status === 401) {
              isBlockedOrPartial = true;
              blockReason = `HTTP ${pRes.status} (Referer/Cookie protected)`;
            } else if (pRes.status === 206) {
              isBlockedOrPartial = true;
              blockReason = "Partial Range stream (stitchable)";
            }
          } finally {
            clearTimeout(timer);
          }
        } catch {
          // keep basic metadata even if quick probe timed out
        }

        const rawName = filenameFromUrl(resolvedUrl, candCt);
        const safeName = toSafeFilename(rawName);
        const ext = path.posix.extname(safeName).replace(/^\./, "").toLowerCase();
        const mediaKind: MediaKind = inferMediaKind(safeName, candCt);
        const qualityTag = inferQualityHint(resolvedUrl, cand.hint);

        // Skip plain HTML/JS/CSS noise unless it's a recognized media/document/archive
        if (mediaKind === "other" && !MEDIA_EXT_REGEX.test(resolvedUrl)) {
          return;
        }

        const item: AggregatedItem = {
          id: `agg_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`,
          url: resolvedUrl,
          sourcePageUrl: finalUrl,
          name: safeName,
          mediaKind,
          format: ext || mediaKind,
          quality: qualityTag === "all" ? "standard" : qualityTag,
          fileSize,
          contentType: candCt,
          canUseRangeRequests: canRange,
          isBlockedOrPartial,
          blockReason,
          packId,
          headers: { Referer: finalUrl, ...customHeaders },
          status: "discovered",
          discoveredAt: Math.floor(Date.now() / 1000),
        };

        onItemDiscovered(item);
      }),
    );
  }
}

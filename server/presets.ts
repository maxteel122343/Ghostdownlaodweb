import crypto from "node:crypto";
import path from "node:path";
import type { AggregatorFilter, AppSettings, Category, FeaturePack, MediaKind } from "../src/shared/types.js";

export const APP_VERSION = "4.6";

export const DEFAULT_HEADERS: Record<string, string> = {
  "accept-encoding": "deflate, br, gzip",
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.8,zh-CN;q=0.7",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
};

export function createDefaultCategories(): Category[] {
  return [
    {
      categoryId: "cat_video",
      name: "Video",
      nameZh: "视频",
      namePt: "Vídeos",
      icon: "VIDEO",
      folder: "{default}/Video",
      extensions: [
        "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "rmvb",
        "rm", "mpg", "mpeg", "mpe", "mpa", "3gp", "ts", "m2ts", "ogv", "asf", "qt",
      ],
    },
    {
      categoryId: "cat_audio",
      name: "Audio",
      nameZh: "音频",
      namePt: "Áudio",
      icon: "MUSIC",
      folder: "{default}/Audio",
      extensions: ["mp3", "flac", "wav", "aac", "ogg", "m4a", "wma", "ape", "opus", "mid", "ra", "aif"],
    },
    {
      categoryId: "cat_image",
      name: "Images",
      nameZh: "图片",
      namePt: "Imagens",
      icon: "PHOTO",
      folder: "{default}/Images",
      extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp", "avif", "svg", "tif", "tiff", "ico", "heic", "heif"],
    },
    {
      categoryId: "cat_subtitle",
      name: "Subtitles",
      nameZh: "字幕",
      namePt: "Legendas",
      icon: "CHAT",
      folder: "{default}/Subtitles",
      extensions: ["srt", "ass", "ssa", "sub", "sup", "idx", "vtt", "lrc", "smi", "psb"],
    },
    {
      categoryId: "cat_document",
      name: "Documents",
      nameZh: "文档",
      namePt: "Documentos / PDF",
      icon: "DOCUMENT",
      folder: "{default}/Documents",
      extensions: [
        "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "epub",
        "mobi", "azw3", "rtf", "odt", "ods", "odp", "md", "csv", "nfo", "chm",
      ],
    },
    {
      categoryId: "cat_archive",
      name: "Archives",
      nameZh: "压缩包",
      namePt: "Arquivos",
      icon: "ZIP_FOLDER",
      folder: "{default}/Archives",
      extensions: [
        "zip", "rar", "7z", "tar", "gz", "gzip", "bz2", "xz", "tgz", "tbz2",
        "zst", "ace", "arj", "cab", "lzh", "sea", "sit", "sitx", "z", "001",
        "tar.gz", "tar.bz2", "tar.xz", "tar.zst",
      ],
    },
    {
      categoryId: "cat_program",
      name: "Programs",
      nameZh: "程序",
      namePt: "Programas",
      icon: "APPLICATION",
      folder: "{default}/Programs",
      extensions: [
        "exe", "msi", "msu", "msp", "apk", "apks", "apkm", "dmg", "pkg",
        "deb", "rpm", "appimage", "iso", "img", "esd", "wim", "bin", "jar", "bat", "sh", "com",
      ],
    },
    {
      categoryId: "cat_other",
      name: "Other",
      nameZh: "其他",
      namePt: "Outros",
      icon: "HELP",
      folder: null,
      extensions: [],
    },
  ];
}

export function createDefaultFeaturePacks(): FeaturePack[] {
  return [
    {
      packId: "http_pack",
      name: "HTTP / HTTPS Pack",
      nameZh: "HTTP / HTTPS 下载包",
      namePt: "Pacote HTTP / HTTPS",
      version: "1.2.2",
      description: "Multi-range concurrent HTTP/HTTPS downloader with resumable transfers & progressive streaming.",
      descriptionZh: "支持多线程分块、断点续传与边下边播的 HTTP/HTTPS 下载引擎。",
      descriptionPt: "Downloader HTTP/HTTPS com retomada por Range, streaming em tempo real e quebra de limites parciais.",
      protocols: ["http://", "https://"],
      dependencies: [],
      enabled: true,
      canRealDownload: true,
    },
    {
      packId: "filehoster_pack",
      name: "FileHoster & Partial Video Extractor",
      nameZh: "网盘与分段视频提取包",
      namePt: "Extrator TezFiles / FileBoom / KeepShare",
      version: "1.0.4",
      description: "Extracts direct streams, preview segments, and stitched byte ranges from TezFiles, FileBoom, KeepShare, and locked media embeds.",
      descriptionZh: "解析 TezFiles、FileBoom、KeepShare 等站点页面，支持 Referer/Cookie 注入与分段 Range 拼接。",
      descriptionPt: "Extrai vídeos, previews e streams com bloqueio parcial de TezFiles, FileBoom, KeepShare e embeds com Referer/Cookie.",
      protocols: ["tezfiles.com", "fileboom.me", "fboom.me", "k2s.cc", "keep2share.cc", "keepshare"],
      dependencies: ["http_pack"],
      enabled: true,
      canRealDownload: true,
    },
    {
      packId: "media_aggregator_pack",
      name: "Media Link Aggregator",
      nameZh: "媒体链接聚合器",
      namePt: "Agregador Automático de Mídia",
      version: "1.0.0",
      description: "Crawls pages for videos, PDFs, images, GIFs, and audio with format, quality, count, and MB quota automation.",
      descriptionZh: "自动抓取网页中的视频、PDF、图片、GIF 与音频，支持格式/画质过滤与数量/容量上限控制。",
      descriptionPt: "Varre páginas e captura vídeos, PDFs, imagens, GIFs e áudios com filtros de qualidade, formato e limites de quantidade/MB.",
      protocols: ["crawl", "scrape"],
      dependencies: ["http_pack"],
      enabled: true,
      canRealDownload: true,
    },
    {
      packId: "github_pack",
      name: "GitHub Pack",
      nameZh: "GitHub 加速包",
      namePt: "Pacote GitHub",
      version: "1.2.1",
      description: "Detects GitHub releases, raw files, and repository archives with direct resolution.",
      descriptionZh: "识别 GitHub Release、Raw 文件及仓库归档链接并解析直链。",
      descriptionPt: "Detecta releases, arquivos raw e repositórios do GitHub com resolução direta.",
      protocols: ["github.com", "raw.githubusercontent.com"],
      dependencies: ["http_pack"],
      enabled: true,
      canRealDownload: true,
    },
    {
      packId: "huggingface_pack",
      name: "HuggingFace Pack",
      nameZh: "HuggingFace 加速包",
      namePt: "Pacote HuggingFace",
      version: "1.2.1",
      description: "Resolves HuggingFace model/dataset blob links to direct download endpoints.",
      descriptionZh: "将 HuggingFace 模型与数据集页面链接转换为直链下载。",
      descriptionPt: "Converte links blob do HuggingFace para endpoints diretos de download.",
      protocols: ["huggingface.co", "hf-mirror.com"],
      dependencies: ["http_pack"],
      enabled: true,
      canRealDownload: true,
    },
    {
      packId: "arxiv_pack",
      name: "arXiv Paper Pack",
      nameZh: "arXiv 论文包",
      namePt: "Pacote arXiv PDF",
      version: "1.1.1",
      description: "Automatically resolves arXiv abstract URLs to direct PDF downloads.",
      descriptionZh: "自动将 arXiv 摘要页链接解析为 PDF 原文下载。",
      descriptionPt: "Converte links de resumo do arXiv diretamente para download de PDF.",
      protocols: ["arxiv.org"],
      dependencies: ["http_pack"],
      enabled: true,
      canRealDownload: true,
    },
    {
      packId: "zip_pack",
      name: "Remote ZIP Pack",
      nameZh: "远程 ZIP 文件包",
      namePt: "Pacote ZIP Remoto",
      version: "1.1.2",
      description: "Streams remote ZIP archives and supports selective file inspection.",
      descriptionZh: "支持远程 ZIP 归档文件探测与流式下载。",
      descriptionPt: "Faz streaming de arquivos ZIP remotos.",
      protocols: [".zip"],
      dependencies: ["http_pack"],
      enabled: true,
      canRealDownload: true,
    },
    {
      packId: "wrapped_link_pack",
      name: "Wrapped Link Unpacker",
      nameZh: "加密链接解包器",
      namePt: "Decodificador de Links",
      version: "1.1.3",
      description: "Decodes thunder://, flashget://, qqdl://, and redirect-wrapped URLs.",
      descriptionZh: "自动解码迅雷 thunder://、快车 flashget://、旋风 qqdl:// 等封装链接。",
      descriptionPt: "Decodifica links thunder://, flashget://, qqdl:// e links encapsulados.",
      protocols: ["thunder://", "flashget://", "qqdl://"],
      dependencies: [],
      enabled: true,
      canRealDownload: true,
    },
    {
      packId: "m3u8_pack",
      name: "M3U8 / DASH Stream Pack",
      nameZh: "M3U8 / DASH 流媒体包",
      namePt: "Pacote M3U8 / DASH",
      version: "1.3.3",
      description: "Parses HLS playlists and MPD manifests.",
      descriptionZh: "解析 HLS (.m3u8) 与 MPEG-DASH (.mpd) 流媒体清单。",
      descriptionPt: "Analisa playlists HLS (.m3u8) e manifestos MPD.",
      protocols: [".m3u8", ".mpd"],
      dependencies: ["ffmpeg_pack"],
      enabled: true,
      canRealDownload: false,
    },
    {
      packId: "bittorrent_pack",
      name: "BitTorrent / Magnet Pack",
      nameZh: "BitTorrent / 磁力包",
      namePt: "Pacote BitTorrent / Magnet",
      version: "1.4.2",
      description: "Parses Magnet links and .torrent metadata with real-time playback preview.",
      descriptionZh: "解析 Magnet 磁力链接与种子信息。",
      descriptionPt: "Analisa links Magnet e metadados .torrent.",
      protocols: ["magnet:", ".torrent"],
      dependencies: [],
      enabled: true,
      canRealDownload: false,
    },
    {
      packId: "ed2k_pack",
      name: "eD2k (Kelpie) Pack",
      nameZh: "eD2k 电驴包",
      namePt: "Pacote eD2k (Kelpie)",
      version: "2.1.1",
      description: "Parses ed2k:// file links, byte sizes, and MD4 hashes.",
      descriptionZh: "解析 ed2k:// 电驴链接文件名、大小与哈希校验信息。",
      descriptionPt: "Analisa links ed2k://, tamanhos e hashes.",
      protocols: ["ed2k://"],
      dependencies: [],
      enabled: true,
      canRealDownload: false,
    },
    {
      packId: "ftp_pack",
      name: "FTP / FTPS Pack",
      nameZh: "FTP 文件传输包",
      namePt: "Pacote FTP / FTPS",
      version: "1.2.1",
      description: "Parses FTP server paths and directory targets.",
      descriptionZh: "识别 FTP 服务器地址与远程文件路径。",
      descriptionPt: "Analisa caminhos e arquivos em servidores FTP.",
      protocols: ["ftp://", "ftps://"],
      dependencies: [],
      enabled: true,
      canRealDownload: false,
    },
    {
      packId: "yt_dlp_pack",
      name: "YouTube (yt-dlp) Pack",
      nameZh: "YouTube 视频解析包",
      namePt: "Pacote YouTube (yt-dlp)",
      version: "1.4.2",
      description: "Identifies YouTube watch/shorts URLs for multi-quality stream extraction.",
      descriptionZh: "识别 YouTube 视频与 Shorts 链接。",
      descriptionPt: "Identifica URLs do YouTube e Shorts.",
      protocols: ["youtube.com", "youtu.be"],
      dependencies: ["http_pack", "ffmpeg_pack"],
      enabled: true,
      canRealDownload: false,
    },
    {
      packId: "bili_pack",
      name: "Bilibili Pack",
      nameZh: "哔哩哔哩视频包",
      namePt: "Pacote Bilibili",
      version: "1.4.3",
      description: "Recognizes Bilibili BV/av videos, bangumi, and danmaku metadata.",
      descriptionZh: "识别 Bilibili BV/av 视频与番剧链接。",
      descriptionPt: "Reconhece vídeos BV/av e metadados do Bilibili.",
      protocols: ["bilibili.com", "b23.tv"],
      dependencies: ["http_pack", "ffmpeg_pack"],
      enabled: true,
      canRealDownload: false,
    },
    {
      packId: "ffmpeg_pack",
      name: "FFmpeg Muxer Pack",
      nameZh: "FFmpeg 混流器包",
      namePt: "Pacote FFmpeg Muxer",
      version: "1.2.2",
      description: "Handles audio/video track muxing and subtitle sidecar assembly.",
      descriptionZh: "用于音视频轨合并与流媒体封装的基础依赖包。",
      descriptionPt: "Gerencia muxing de faixas de áudio/vídeo e legendas.",
      protocols: ["mux"],
      dependencies: ["http_pack"],
      enabled: true,
      canRealDownload: false,
    },
  ];
}

export function createDefaultSettings(): AppSettings {
  return {
    maxTaskNum: 3,
    preBlockNum: 8,
    autoSpeedUp: true,
    isSpeedLimitEnabled: false,
    speedLimitation: 4 * 1024 * 1024,
    nameConflict: "keepBoth",
    isCategoryEnabled: true,
    shouldVerifySsl: true,
    proxyServer: "Auto",
    clientProfile: "auto",
    headers: { ...DEFAULT_HEADERS },
    isBrowserExtensionEnabled: true,
    browserExtensionPairToken: crypto.randomBytes(12).toString("base64url"),
    shouldDraftTakenDownload: false,
    isAria2RpcEnabled: true,
    aria2RpcToken: "",
    aria2RpcEmulateFingerprint: false,
    themeMode: "auto",
    language: "pt",
    isNoticeSoundEnabled: true,
    isClipboardAutoPasteEnabled: true,
  };
}

export function createDefaultAggregatorFilter(): AggregatorFilter {
  return {
    autoDownload: false,
    mediaTypes: ["video", "pdf", "image", "gif", "audio"],
    formats: [],
    minQuality: "all",
    maxItems: 50,
    maxFileSizeMb: 50,
    maxTotalSizeMb: 500,
  };
}

export function toSafeFilename(raw: string, fallback = "download"): string {
  const cleaned = raw
    .replace(/[\x00-\x1f<>:"/\\|?*]+/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .trim();
  return cleaned || fallback;
}

export function inferMediaKind(filename: string, contentType = ""): MediaKind {
  const ext = path.posix.extname(filename).replace(/^\./, "").toLowerCase();
  const ct = contentType.toLowerCase();

  if (ext === "gif" || ct.includes("image/gif")) return "gif";
  if (ext === "pdf" || ct.includes("application/pdf")) return "pdf";
  if (
    ["mp4", "mkv", "webm", "mov", "avi", "flv", "m4v", "ts", "m2ts", "3gp", "ogv", "m3u8", "mpd"].includes(ext) ||
    ct.startsWith("video/")
  ) {
    return "video";
  }
  if (["mp3", "flac", "wav", "aac", "ogg", "m4a", "opus", "wma", "ape"].includes(ext) || ct.startsWith("audio/")) {
    return "audio";
  }
  if (
    ["jpg", "jpeg", "png", "webp", "avif", "svg", "bmp", "ico", "tiff", "tif", "heic"].includes(ext) ||
    ct.startsWith("image/")
  ) {
    return "image";
  }
  if (["zip", "rar", "7z", "tar", "gz", "xz", "bz2", "tgz", "zst"].includes(ext)) {
    return "archive";
  }
  return "other";
}

export function inferMimeType(filename: string, fallback = "application/octet-stream"): string {
  const ext = path.posix.extname(filename).replace(/^\./, "").toLowerCase();
  const map: Record<string, string> = {
    mp4: "video/mp4",
    m4v: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    ogv: "video/ogg",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    m4a: "audio/mp4",
    aac: "audio/aac",
    opus: "audio/opus",
    txt: "text/plain; charset=utf-8",
    md: "text/markdown; charset=utf-8",
    json: "application/json; charset=utf-8",
    zip: "application/zip",
  };
  return map[ext] || fallback;
}

export function matchCategoryByName(filename: string, categories: Category[]): string {
  const lower = filename.toLowerCase();
  const base = path.posix.basename(lower);
  const parts = base.split(".");
  if (parts.length < 2) {
    return "";
  }
  const candidates: string[] = [];
  if (parts.length >= 3) {
    candidates.push(`${parts[parts.length - 2]}.${parts[parts.length - 1]}`);
  }
  candidates.push(parts[parts.length - 1]);

  for (const candidate of candidates) {
    for (const cat of categories) {
      if (cat.extensions.includes(candidate)) {
        return cat.categoryId;
      }
    }
  }
  return "";
}

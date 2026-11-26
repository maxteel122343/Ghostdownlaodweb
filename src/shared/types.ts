export type TaskStatus = "waiting" | "running" | "paused" | "completed" | "failed";

export type MediaKind = "video" | "pdf" | "image" | "gif" | "audio" | "archive" | "other";

export type QualityTag = "all" | "4k" | "1080p" | "720p" | "480p" | "original";

export type PackId =
  | "http_pack"
  | "bittorrent_pack"
  | "m3u8_pack"
  | "ftp_pack"
  | "ed2k_pack"
  | "yt_dlp_pack"
  | "bili_pack"
  | "github_pack"
  | "huggingface_pack"
  | "arxiv_pack"
  | "zip_pack"
  | "ffmpeg_pack"
  | "wrapped_link_pack"
  | "filehoster_pack"
  | "media_aggregator_pack";

export interface TaskFile {
  index: number;
  relativePath: string;
  size: number;
  selected: boolean;
  downloadedBytes: number;
  completed: boolean;
}

export interface Task {
  taskId: string;
  name: string;
  url: string;
  resolvedUrl: string;
  packId: PackId;
  mediaKind: MediaKind;
  status: TaskStatus;
  progress: number;
  receivedBytes: number;
  fileSize: number;
  speed: number;
  createdAt: number;
  completedAt: number;
  category: string;
  subworkerCount: number;
  canPause: boolean;
  canUseRangeRequests: boolean;
  contentType: string;
  lastModified: string;
  headers: Record<string, string>;
  checksums: Record<string, string>;
  error: string | null;
  hasOutputFile: boolean;
  isFileAvailable: boolean;
  isSimulated: boolean;
  isPartialBypass?: boolean;
  files?: TaskFile[];
}

export interface Category {
  categoryId: string;
  name: string;
  nameZh: string;
  namePt?: string;
  icon: string;
  extensions: string[];
  folder: string | null;
}

export interface FeaturePack {
  packId: PackId;
  name: string;
  nameZh: string;
  namePt?: string;
  version: string;
  description: string;
  descriptionZh: string;
  descriptionPt?: string;
  protocols: string[];
  dependencies: PackId[];
  enabled: boolean;
  canRealDownload: boolean;
}

export type NameConflictMode = "keepBoth" | "overwrite" | "ask";
export type ThemePreference = "auto" | "light" | "dark";
export type LanguagePreference = "pt" | "en" | "zh";
export type PlanAction = "notify" | "pause_all" | "clear_completed" | null;

export interface AppSettings {
  maxTaskNum: number;
  preBlockNum: number;
  autoSpeedUp: boolean;
  isSpeedLimitEnabled: boolean;
  speedLimitation: number;
  nameConflict: NameConflictMode;
  isCategoryEnabled: boolean;
  shouldVerifySsl: boolean;
  proxyServer: string;
  clientProfile: string;
  headers: Record<string, string>;
  isBrowserExtensionEnabled: boolean;
  browserExtensionPairToken: string;
  shouldDraftTakenDownload: boolean;
  isAria2RpcEnabled: boolean;
  aria2RpcToken: string;
  aria2RpcEmulateFingerprint: boolean;
  themeMode: ThemePreference;
  language: LanguagePreference;
  isNoticeSoundEnabled: boolean;
  isClipboardAutoPasteEnabled: boolean;
}

export interface ProbeResult {
  url: string;
  resolvedUrl: string;
  packId: PackId;
  mediaKind: MediaKind;
  name: string;
  fileSize: number;
  contentType: string;
  canUseRangeRequests: boolean;
  lastModified: string;
  category: string;
  isSimulated: boolean;
  isPartialBypass?: boolean;
  note?: string;
  files?: TaskFile[];
  error?: string;
}

export interface AggregatorFilter {
  autoDownload: boolean;
  mediaTypes: MediaKind[];
  formats: string[];
  minQuality: QualityTag;
  maxItems: number;
  maxFileSizeMb: number;
  maxTotalSizeMb: number;
}

export interface AggregatedItem {
  id: string;
  url: string;
  sourcePageUrl: string;
  name: string;
  mediaKind: MediaKind;
  format: string;
  quality: string;
  fileSize: number;
  contentType: string;
  canUseRangeRequests: boolean;
  isBlockedOrPartial: boolean;
  blockReason?: string;
  packId: PackId;
  headers: Record<string, string>;
  status: "discovered" | "queued" | "skipped_limit" | "skipped_filter" | "error";
  taskId?: string;
  discoveredAt: number;
}

export interface AggregatorState {
  isRunning: boolean;
  capturedCount: number;
  queuedCount: number;
  totalQueuedBytes: number;
  overlayVisible: boolean;
  lastSourceUrl: string;
  filter: AggregatorFilter;
  items: AggregatedItem[];
}

export interface PlanState {
  action: PlanAction;
  triggeredAt: number | null;
}

export interface AppStateSnapshot {
  tasks: Task[];
  waitingOrder: string[];
  globalSpeed: number;
  settings: AppSettings;
  categories: Category[];
  packs: FeaturePack[];
  plan: PlanState;
  aggregator: AggregatorState;
  version: string;
}

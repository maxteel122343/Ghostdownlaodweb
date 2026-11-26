import type {
  AggregatorFilter,
  AggregatorState,
  AppSettings,
  AppStateSnapshot,
  Category,
  MediaKind,
  PackId,
  PlanAction,
  ProbeResult,
  Task,
} from "./shared/types";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  getState: () => jsonFetch<AppStateSnapshot>("/api/state"),
  probeUrls: (urls: string[], headers?: Record<string, string>) =>
    jsonFetch<{ results: ProbeResult[] }>("/api/probe", {
      method: "POST",
      body: JSON.stringify({ urls, headers }),
    }),
  addTasks: (
    tasks: Array<{
      url: string;
      resolvedUrl?: string;
      name?: string;
      packId?: PackId;
      mediaKind?: MediaKind;
      fileSize?: number;
      contentType?: string;
      canUseRangeRequests?: boolean;
      lastModified?: string;
      category?: string;
      subworkerCount?: number;
      headers?: Record<string, string>;
      isSimulated?: boolean;
      isPartialBypass?: boolean;
      startImmediately?: boolean;
    }>,
  ) =>
    jsonFetch<{ tasks: Task[] }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ tasks }),
    }),
  startTask: (taskId: string) => jsonFetch<{ task: Task }>(`/api/tasks/${taskId}/start`, { method: "POST" }),
  pauseTask: (taskId: string) => jsonFetch<{ task: Task }>(`/api/tasks/${taskId}/pause`, { method: "POST" }),
  redownloadTask: (taskId: string) => jsonFetch<{ task: Task }>(`/api/tasks/${taskId}/redownload`, { method: "POST" }),
  editTask: (taskId: string, patch: { name?: string; url?: string; category?: string }) =>
    jsonFetch<{ task: Task }>(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteTask: (taskId: string, deleteFiles = true) =>
    jsonFetch<{ ok: boolean }>(`/api/tasks/${taskId}?deleteFiles=${deleteFiles}`, { method: "DELETE" }),
  computeChecksum: (taskId: string, algorithm: "md5" | "sha1" | "sha256" | "sha512") =>
    jsonFetch<{ algorithm: string; digest: string }>(`/api/tasks/${taskId}/checksum`, {
      method: "POST",
      body: JSON.stringify({ algorithm }),
    }),
  startAll: () => jsonFetch<{ ok: boolean }>("/api/tasks/start-all", { method: "POST" }),
  pauseAll: () => jsonFetch<{ ok: boolean }>("/api/tasks/pause-all", { method: "POST" }),
  batchAction: (body: { action: string; taskIds: string[]; deleteFiles?: boolean; category?: string }) =>
    jsonFetch<{ ok: boolean }>("/api/tasks/batch", { method: "POST", body: JSON.stringify(body) }),

  // Link Aggregator
  aggregatorCrawl: (urls: string[], headers?: Record<string, string>) =>
    jsonFetch<{ started: boolean }>("/api/aggregator/crawl", {
      method: "POST",
      body: JSON.stringify({ urls, headers }),
    }),
  aggregatorStop: () => jsonFetch<{ ok: boolean }>("/api/aggregator/stop", { method: "POST" }),
  updateAggregatorFilter: (patch: Partial<AggregatorFilter>) =>
    jsonFetch<{ aggregator: AggregatorState }>("/api/aggregator/filter", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  queueAggregatedItems: (itemIds?: string[]) =>
    jsonFetch<{ tasks: Task[] }>("/api/aggregator/queue", {
      method: "POST",
      body: JSON.stringify({ itemIds }),
    }),
  clearAggregatorItems: () => jsonFetch<{ ok: boolean }>("/api/aggregator/clear", { method: "POST" }),
  dismissAggregatorOverlay: () => jsonFetch<{ ok: boolean }>("/api/aggregator/dismiss-overlay", { method: "POST" }),

  updateSettings: (patch: Partial<AppSettings>) =>
    jsonFetch<{ settings: AppSettings }>("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  regeneratePairToken: () => jsonFetch<{ token: string }>("/api/browser/regenerate-token", { method: "POST" }),
  resetCategories: () => jsonFetch<{ categories: Category[] }>("/api/categories/reset", { method: "POST" }),
  togglePack: (packId: PackId, enabled: boolean) =>
    jsonFetch<{ packs: AppStateSnapshot["packs"] }>(`/api/packs/${packId}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),
  setPlan: (action: PlanAction) =>
    jsonFetch<{ plan: AppStateSnapshot["plan"] }>("/api/plan", {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  sendAria2Rpc: (payload: unknown) =>
    jsonFetch<unknown>("/jsonrpc", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

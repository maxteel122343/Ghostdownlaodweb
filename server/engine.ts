import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";
import type {
  AggregatedItem,
  AggregatorFilter,
  AggregatorState,
  AppSettings,
  AppStateSnapshot,
  Category,
  FeaturePack,
  MediaKind,
  PackId,
  PlanAction,
  PlanState,
  ProbeResult,
  Task,
} from "../src/shared/types.js";
import { crawlUrlForMedia, passesAggregatorFilter } from "./aggregator.js";
import {
  APP_VERSION,
  createDefaultAggregatorFilter,
  createDefaultCategories,
  createDefaultFeaturePacks,
  createDefaultSettings,
  inferMediaKind,
  inferMimeType,
  matchCategoryByName,
  toSafeFilename,
} from "./presets.js";
import { probeUrl } from "./prober.js";

const DOWNLOAD_ROOT = process.env.GD3_DOWNLOAD_DIR || "/tmp/gd3-downloads";

interface CreateTaskInput {
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
}

export class DownloadEngine {
  private tasks = new Map<string, Task>();
  private waitingOrder: string[] = [];
  private runningIds = new Set<string>();
  private controllers = new Map<string, AbortController>();
  private simTimers = new Map<string, NodeJS.Timeout>();
  private settings: AppSettings = createDefaultSettings();
  private categories: Category[] = createDefaultCategories();
  private packs: FeaturePack[] = createDefaultFeaturePacks();
  private plan: PlanState = { action: null, triggeredAt: null };
  private aggregator: AggregatorState = {
    isRunning: false,
    capturedCount: 0,
    queuedCount: 0,
    totalQueuedBytes: 0,
    overlayVisible: false,
    lastSourceUrl: "",
    filter: createDefaultAggregatorFilter(),
    items: [],
  };
  private aggregatorController: AbortController | null = null;
  private sseClients = new Set<Response>();
  private broadcastTimer: NodeJS.Timeout | null = null;

  constructor() {
    fs.mkdirSync(DOWNLOAD_ROOT, { recursive: true });
    setInterval(() => {
      if (this.runningIds.size > 0 || this.aggregator.isRunning) {
        this.broadcast();
      }
    }, 300);
  }

  public getDownloadDir(): string {
    return DOWNLOAD_ROOT;
  }

  public getTaskFilePath(task: Task): string {
    return path.join(DOWNLOAD_ROOT, `${task.taskId}_${toSafeFilename(task.name)}`);
  }

  public getSnapshot(): AppStateSnapshot {
    const taskList = Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
    const globalSpeed = taskList.reduce((sum, t) => sum + (t.status === "running" ? t.speed : 0), 0);
    return {
      tasks: taskList,
      waitingOrder: [...this.waitingOrder],
      globalSpeed,
      settings: { ...this.settings, headers: { ...this.settings.headers } },
      categories: this.categories.map((c) => ({ ...c, extensions: [...c.extensions] })),
      packs: this.packs.map((p) => ({ ...p })),
      plan: { ...this.plan },
      aggregator: {
        ...this.aggregator,
        filter: {
          ...this.aggregator.filter,
          mediaTypes: [...this.aggregator.filter.mediaTypes],
          formats: [...this.aggregator.filter.formats],
        },
        items: [...this.aggregator.items],
      },
      version: APP_VERSION,
    };
  }

  public subscribeSse(res: Response): void {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    this.sseClients.add(res);
    res.write(`data: ${JSON.stringify(this.getSnapshot())}\n\n`);
    res.on("close", () => {
      this.sseClients.delete(res);
    });
  }

  private broadcast(): void {
    if (this.sseClients.size === 0) return;
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      const payload = `data: ${JSON.stringify(this.getSnapshot())}\n\n`;
      for (const client of this.sseClients) {
        try {
          client.write(payload);
        } catch {
          this.sseClients.delete(client);
        }
      }
    }, 35);
  }

  public async probe(urls: string[], customHeaders?: Record<string, string>): Promise<ProbeResult[]> {
    const hdrs = { ...this.settings.headers, ...(customHeaders || {}) };
    return Promise.all(urls.map((u) => probeUrl(u, hdrs, this.categories, this.packs)));
  }

  private resolveUniqueName(desiredName: string): string {
    const safe = toSafeFilename(desiredName);
    if (this.settings.nameConflict === "overwrite") {
      return safe;
    }
    const existingNames = new Set(Array.from(this.tasks.values()).map((t) => t.name));
    if (!existingNames.has(safe)) {
      return safe;
    }
    const ext = path.posix.extname(safe);
    const stem = ext ? safe.slice(0, -ext.length) : safe;
    let i = 1;
    while (existingNames.has(`${stem}(${i})${ext}`)) {
      i += 1;
    }
    return `${stem}(${i})${ext}`;
  }

  public addTask(input: CreateTaskInput): Task {
    const taskId = `tsk_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const rawName = input.name || "download";
    const name = this.resolveUniqueName(rawName);
    const category =
      input.category !== undefined
        ? input.category
        : this.settings.isCategoryEnabled
          ? matchCategoryByName(name, this.categories)
          : "";
    const mediaKind = input.mediaKind || inferMediaKind(name, input.contentType || "");

    const task: Task = {
      taskId,
      name,
      url: input.url.trim(),
      resolvedUrl: (input.resolvedUrl || input.url).trim(),
      packId: input.packId || "http_pack",
      mediaKind,
      status: input.startImmediately === false ? "paused" : "waiting",
      progress: 0,
      receivedBytes: 0,
      fileSize: input.fileSize || 0,
      speed: 0,
      createdAt: Math.floor(Date.now() / 1000),
      completedAt: 0,
      category,
      subworkerCount: input.subworkerCount || this.settings.preBlockNum,
      canPause: true,
      canUseRangeRequests: Boolean(input.canUseRangeRequests),
      contentType: input.contentType || inferMimeType(name, ""),
      lastModified: input.lastModified || "",
      headers: { ...this.settings.headers, ...(input.headers || {}) },
      checksums: {},
      error: null,
      hasOutputFile: !input.isSimulated,
      isFileAvailable: false,
      isSimulated: Boolean(input.isSimulated),
      isPartialBypass: Boolean(input.isPartialBypass),
    };

    this.tasks.set(taskId, task);
    if (task.status === "waiting") {
      this.waitingOrder.push(taskId);
      this.scheduleQueue();
    }
    this.broadcast();
    return task;
  }

  public getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  public startTask(taskId: string): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;
    if (task.status === "running" || task.status === "completed") return task;
    task.error = null;
    if (task.status === "failed") {
      task.receivedBytes = 0;
      task.progress = 0;
    }
    task.status = "waiting";
    task.speed = 0;
    if (!this.waitingOrder.includes(taskId)) {
      this.waitingOrder.push(taskId);
    }
    this.scheduleQueue();
    this.broadcast();
    return task;
  }

  public pauseTask(taskId: string): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;
    this.waitingOrder = this.waitingOrder.filter((id) => id !== taskId);
    if (task.status === "running") {
      this.abortRunner(taskId);
      task.status = "paused";
      task.speed = 0;
      this.runningIds.delete(taskId);
      this.scheduleQueue();
    } else if (task.status === "waiting") {
      task.status = "paused";
      task.speed = 0;
    }
    this.broadcast();
    return task;
  }

  public async redownloadTask(taskId: string): Promise<Task | undefined> {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;
    this.abortRunner(taskId);
    this.runningIds.delete(taskId);
    this.waitingOrder = this.waitingOrder.filter((id) => id !== taskId);
    await fsp.rm(this.getTaskFilePath(task), { force: true }).catch(() => {});
    task.status = "waiting";
    task.progress = 0;
    task.receivedBytes = 0;
    task.speed = 0;
    task.completedAt = 0;
    task.checksums = {};
    task.error = null;
    task.isFileAvailable = false;
    this.waitingOrder.push(taskId);
    this.scheduleQueue();
    this.broadcast();
    return task;
  }

  public async deleteTask(taskId: string, deleteFiles = true): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    this.abortRunner(taskId);
    this.runningIds.delete(taskId);
    this.waitingOrder = this.waitingOrder.filter((id) => id !== taskId);
    if (deleteFiles) {
      await fsp.rm(this.getTaskFilePath(task), { force: true }).catch(() => {});
    }
    this.tasks.delete(taskId);
    this.scheduleQueue();
    this.broadcast();
    return true;
  }

  public startAll(): void {
    for (const task of this.tasks.values()) {
      if (task.status === "paused" || task.status === "failed") {
        task.error = null;
        if (task.status === "failed") {
          task.receivedBytes = 0;
          task.progress = 0;
        }
        task.status = "waiting";
        if (!this.waitingOrder.includes(task.taskId)) {
          this.waitingOrder.push(task.taskId);
        }
      }
    }
    this.scheduleQueue();
    this.broadcast();
  }

  public pauseAll(): void {
    this.waitingOrder = [];
    for (const task of this.tasks.values()) {
      if (task.status === "running" || task.status === "waiting") {
        this.abortRunner(task.taskId);
        this.runningIds.delete(task.taskId);
        task.status = "paused";
        task.speed = 0;
      }
    }
    this.broadcast();
  }

  public moveToFront(taskIds: string[]): void {
    const idSet = new Set(taskIds);
    const prioritized = taskIds.filter((id) => this.waitingOrder.includes(id));
    const rest = this.waitingOrder.filter((id) => !idSet.has(id));
    this.waitingOrder = [...prioritized, ...rest];
    this.broadcast();
  }

  public setCategory(taskId: string, category: string): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;
    task.category = category;
    this.broadcast();
    return task;
  }

  public editTask(taskId: string, patch: { name?: string; url?: string; category?: string }): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;
    const oldPath = this.getTaskFilePath(task);
    if (patch.name && patch.name.trim()) {
      task.name = toSafeFilename(patch.name.trim(), task.name);
      task.mediaKind = inferMediaKind(task.name, task.contentType);
      const newPath = this.getTaskFilePath(task);
      if (oldPath !== newPath && fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
      }
    }
    if (patch.url && patch.url.trim()) {
      task.url = patch.url.trim();
      task.resolvedUrl = patch.url.trim();
    }
    if (patch.category !== undefined) {
      task.category = patch.category;
    }
    this.broadcast();
    return task;
  }

  public async computeChecksum(taskId: string, algorithm: "md5" | "sha1" | "sha256" | "sha512"): Promise<string> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error("Task not found");
    }
    if (task.checksums[algorithm]) {
      return task.checksums[algorithm];
    }
    const filePath = this.getTaskFilePath(task);
    if (fs.existsSync(filePath)) {
      const hash = crypto.createHash(algorithm);
      await new Promise<void>((resolve, reject) => {
        const stream = fs.createReadStream(filePath);
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("end", () => resolve());
        stream.on("error", reject);
      });
      const digest = hash.digest("hex");
      task.checksums[algorithm] = digest;
      this.broadcast();
      return digest;
    }
    if (task.isSimulated && task.status === "completed") {
      const digest = crypto.createHash(algorithm).update(`${task.url}:${task.name}:${task.fileSize}`).digest("hex");
      task.checksums[algorithm] = digest;
      this.broadcast();
      return digest;
    }
    throw new Error("Downloaded file is not available on disk");
  }

  // Real-time progressive streaming while downloading!
  public async streamTaskFile(req: Request, res: Response, taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const filePath = this.getTaskFilePath(task);

    // Wait briefly if task just started and file isn't created yet
    const waitStart = Date.now();
    while (!fs.existsSync(filePath) && task.status === "running" && Date.now() - waitStart < 4000) {
      await new Promise((r) => setTimeout(r, 150));
    }

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File stream not available yet on disk" });
      return;
    }

    const mime = inferMimeType(task.name, task.contentType || "application/octet-stream");
    const rangeHeader = req.headers.range;
    let stat = fs.statSync(filePath);

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        res.status(416).end();
        return;
      }
      const start = Number.parseInt(match[1], 10);
      // If player seeks slightly ahead of current downloaded bytes while downloading, wait up to 3s
      const seekWait = Date.now();
      while (start >= stat.size && task.status === "running" && Date.now() - seekWait < 3000) {
        await new Promise((r) => setTimeout(r, 150));
        if (fs.existsSync(filePath)) {
          stat = fs.statSync(filePath);
        }
      }

      if (start >= stat.size) {
        const total = Math.max(stat.size, task.fileSize || 0);
        res.status(416).setHeader("Content-Range", `bytes */${total}`).end();
        return;
      }

      const requestedEnd = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;
      const end = Math.min(requestedEnd, stat.size - 1);
      const chunkSize = end - start + 1;
      const totalSize = task.status === "completed" ? stat.size : Math.max(stat.size, task.fileSize || stat.size);

      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", String(chunkSize));
      res.setHeader("Content-Type", mime);
      res.setHeader("Cache-Control", "no-store");

      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.status(200);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", String(stat.size));
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(task.name)}"`);
    fs.createReadStream(filePath).pipe(res);
  }

  // Link Aggregator lifecycle
  public updateAggregatorFilter(patch: Partial<AggregatorFilter>): AggregatorState {
    this.aggregator.filter = {
      ...this.aggregator.filter,
      ...patch,
      mediaTypes: patch.mediaTypes ? [...patch.mediaTypes] : this.aggregator.filter.mediaTypes,
      formats: patch.formats ? [...patch.formats] : this.aggregator.filter.formats,
    };
    this.broadcast();
    return this.aggregator;
  }

  public dismissAggregatorOverlay(): void {
    this.aggregator.overlayVisible = false;
    this.broadcast();
  }

  public clearAggregatorItems(): void {
    this.aggregator.items = [];
    this.aggregator.capturedCount = 0;
    this.aggregator.queuedCount = 0;
    this.aggregator.totalQueuedBytes = 0;
    this.broadcast();
  }

  public stopAggregator(): void {
    if (this.aggregatorController) {
      this.aggregatorController.abort();
      this.aggregatorController = null;
    }
    this.aggregator.isRunning = false;
    this.broadcast();
  }

  public async startAggregate(urls: string[], customHeaders: Record<string, string> = {}): Promise<void> {
    this.stopAggregator();
    const controller = new AbortController();
    this.aggregatorController = controller;
    this.aggregator.isRunning = true;
    this.aggregator.overlayVisible = true;
    this.aggregator.lastSourceUrl = urls[0] || "";
    this.broadcast();

    try {
      for (const rawUrl of urls) {
        if (controller.signal.aborted) break;
        const trimmed = rawUrl.trim();
        if (!trimmed) continue;

        await crawlUrlForMedia(
          trimmed,
          this.settings.headers,
          customHeaders,
          this.categories,
          this.packs,
          (item: AggregatedItem) => {
            if (controller.signal.aborted) return;
            // Avoid duplicates by URL
            if (this.aggregator.items.some((existing) => existing.url === item.url)) {
              return;
            }

            this.aggregator.capturedCount += 1;
            const check = passesAggregatorFilter(
              item,
              this.aggregator.filter,
              this.aggregator.queuedCount,
              this.aggregator.totalQueuedBytes,
            );

            if (!check.ok) {
              item.status = check.reason || "skipped_filter";
            } else if (this.aggregator.filter.autoDownload) {
              const task = this.addTask({
                url: item.url,
                resolvedUrl: item.url,
                name: item.name,
                packId: item.packId,
                mediaKind: item.mediaKind,
                fileSize: item.fileSize,
                contentType: item.contentType,
                canUseRangeRequests: item.canUseRangeRequests,
                headers: item.headers,
                isPartialBypass: item.isBlockedOrPartial,
                startImmediately: true,
              });
              item.status = "queued";
              item.taskId = task.taskId;
              this.aggregator.queuedCount += 1;
              this.aggregator.totalQueuedBytes += item.fileSize;
            } else {
              item.status = "discovered";
            }

            this.aggregator.items.unshift(item);
            this.broadcast();
          },
          controller.signal,
        );
      }
    } finally {
      if (this.aggregatorController === controller) {
        this.aggregatorController = null;
      }
      this.aggregator.isRunning = false;
      this.broadcast();
    }
  }

  public queueAggregatedItems(itemIds?: string[]): Task[] {
    const targets = itemIds
      ? this.aggregator.items.filter((i) => itemIds.includes(i.id))
      : this.aggregator.items.filter((i) => i.status === "discovered");

    const created: Task[] = [];
    for (const item of targets) {
      const check = passesAggregatorFilter(
        item,
        this.aggregator.filter,
        this.aggregator.queuedCount,
        this.aggregator.totalQueuedBytes,
      );
      if (!check.ok) {
        item.status = check.reason || "skipped_limit";
        continue;
      }
      const task = this.addTask({
        url: item.url,
        resolvedUrl: item.url,
        name: item.name,
        packId: item.packId,
        mediaKind: item.mediaKind,
        fileSize: item.fileSize,
        contentType: item.contentType,
        canUseRangeRequests: item.canUseRangeRequests,
        headers: item.headers,
        isPartialBypass: item.isBlockedOrPartial,
        startImmediately: true,
      });
      item.status = "queued";
      item.taskId = task.taskId;
      this.aggregator.queuedCount += 1;
      this.aggregator.totalQueuedBytes += item.fileSize;
      created.push(task);
    }
    this.aggregator.overlayVisible = true;
    this.broadcast();
    return created;
  }

  public updateSettings(patch: Partial<AppSettings>): AppSettings {
    this.settings = {
      ...this.settings,
      ...patch,
      headers: patch.headers ? { ...patch.headers } : this.settings.headers,
    };
    this.scheduleQueue();
    this.broadcast();
    return { ...this.settings };
  }

  public regeneratePairToken(): string {
    this.settings.browserExtensionPairToken = crypto.randomBytes(12).toString("base64url");
    this.broadcast();
    return this.settings.browserExtensionPairToken;
  }

  public setCategories(next: Category[]): Category[] {
    this.categories = next;
    this.broadcast();
    return this.categories;
  }

  public resetCategories(): Category[] {
    this.categories = createDefaultCategories();
    this.broadcast();
    return this.categories;
  }

  public togglePack(packId: PackId, enabled: boolean): FeaturePack[] {
    this.packs = this.packs.map((p) => (p.packId === packId ? { ...p, enabled } : p));
    this.broadcast();
    return this.packs;
  }

  public setPlan(action: PlanAction): PlanState {
    this.plan = { action, triggeredAt: null };
    this.broadcast();
    return this.plan;
  }

  private abortRunner(taskId: string): void {
    const ctrl = this.controllers.get(taskId);
    if (ctrl) {
      ctrl.abort();
      this.controllers.delete(taskId);
    }
    const timer = this.simTimers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.simTimers.delete(taskId);
    }
  }

  private scheduleQueue(): void {
    while (this.runningIds.size < this.settings.maxTaskNum && this.waitingOrder.length > 0) {
      const nextId = this.waitingOrder.shift()!;
      const task = this.tasks.get(nextId);
      if (!task || task.status !== "waiting") continue;
      this.startRunner(task);
    }
    this.checkPlanCompletion();
  }

  private checkPlanCompletion(): void {
    if (!this.plan.action) return;
    const hasPending = Array.from(this.tasks.values()).some(
      (t) => t.status === "running" || t.status === "waiting",
    );
    if (!hasPending && this.tasks.size > 0) {
      const action = this.plan.action;
      this.plan = { action: null, triggeredAt: Math.floor(Date.now() / 1000) };
      if (action === "clear_completed") {
        for (const [id, task] of this.tasks.entries()) {
          if (task.status === "completed") {
            void fsp.rm(this.getTaskFilePath(task), { force: true }).catch(() => {});
            this.tasks.delete(id);
          }
        }
      }
      this.broadcast();
    }
  }

  private startRunner(task: Task): void {
    task.status = "running";
    task.speed = 0;
    task.error = null;
    this.runningIds.add(task.taskId);

    if (task.isSimulated) {
      this.runSimulatedTask(task);
      return;
    }
    void this.runHttpTask(task);
  }

  private runSimulatedTask(task: Task): void {
    if (task.fileSize <= 0) {
      task.fileSize = 24 * 1024 * 1024;
    }
    const timer = setInterval(() => {
      if (task.status !== "running") {
        clearInterval(timer);
        this.simTimers.delete(task.taskId);
        return;
      }
      const cap = this.settings.isSpeedLimitEnabled
        ? Math.max(1024, Math.floor(this.settings.speedLimitation / Math.max(1, this.runningIds.size)))
        : 4 * 1024 * 1024;
      const tickBytes = Math.min(cap / 3, 1.4 * 1024 * 1024);
      task.receivedBytes = Math.min(task.fileSize, task.receivedBytes + Math.floor(tickBytes));
      task.speed = Math.floor(tickBytes * 3);
      task.progress = task.fileSize > 0 ? Number(((task.receivedBytes / task.fileSize) * 100).toFixed(2)) : 0;

      if (task.receivedBytes >= task.fileSize) {
        clearInterval(timer);
        this.simTimers.delete(task.taskId);
        this.runningIds.delete(task.taskId);
        task.status = "completed";
        task.progress = 100;
        task.speed = 0;
        task.completedAt = Math.floor(Date.now() / 1000);
        this.scheduleQueue();
        this.broadcast();
      }
    }, 330);
    this.simTimers.set(task.taskId, timer);
  }

  // Supports real HTTP streaming + Range resume + multi-chunk stitching for partial-block CDNs!
  private async runHttpTask(task: Task): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(task.taskId, controller);
    const filePath = this.getTaskFilePath(task);

    try {
      const baseHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(task.headers)) {
        if (k && v && k.toLowerCase() !== "accept-encoding") {
          baseHeaders[k] = v;
        }
      }
      try {
        const u = new URL(task.resolvedUrl || task.url);
        if (!baseHeaders.Referer && !baseHeaders.referer) {
          baseHeaders.Referer = `${u.protocol}//${u.host}/`;
        }
      } catch {
        // ignore
      }

      if (task.receivedBytes > 0 && fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        task.receivedBytes = stat.size;
      } else {
        task.receivedBytes = 0;
        await fsp.rm(filePath, { force: true }).catch(() => {});
      }

      let chunkLoop = 0;
      const MAX_RANGE_CHUNKS = 512;

      while (task.status === "running" && !controller.signal.aborted && chunkLoop < MAX_RANGE_CHUNKS) {
        chunkLoop += 1;
        const reqHeaders = { ...baseHeaders };
        const offset = task.receivedBytes;
        if (offset > 0 || task.isPartialBypass) {
          reqHeaders.Range = `bytes=${offset}-`;
        }

        const response = await fetch(task.resolvedUrl || task.url, {
          headers: reqHeaders,
          redirect: "follow",
          signal: controller.signal,
        });

        if (!response.ok && response.status !== 206) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const isPartial = response.status === 206;
        if (!isPartial && offset > 0) {
          task.receivedBytes = 0;
          await fsp.rm(filePath, { force: true }).catch(() => {});
        }

        const contentLen = Number.parseInt(response.headers.get("content-length") || "0", 10) || 0;
        if (isPartial) {
          task.canUseRangeRequests = true;
          const cr = response.headers.get("content-range") || "";
          const m = cr.match(/\/(\d+)$/);
          if (m) {
            task.fileSize = Number.parseInt(m[1], 10) || task.fileSize;
          } else if (contentLen > 0 && task.fileSize === 0) {
            task.fileSize = offset + contentLen;
          }
        } else if (contentLen > 0) {
          task.fileSize = contentLen;
        }

        if (!task.contentType) {
          task.contentType = response.headers.get("content-type") || "";
        }

        const writeStream = fs.createWriteStream(filePath, { flags: isPartial && offset > 0 ? "a" : "w" });
        const reader = response.body?.getReader();
        if (!reader) {
          writeStream.end();
          throw new Error("Empty response body");
        }

        let chunkReceived = 0;
        let windowBytes = 0;
        let windowStart = Date.now();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;

            if (!writeStream.write(value)) {
              await new Promise<void>((resolve) => writeStream.once("drain", resolve));
            }

            task.receivedBytes += value.byteLength;
            chunkReceived += value.byteLength;
            windowBytes += value.byteLength;
            task.isFileAvailable = true;

            const now = Date.now();
            const elapsed = now - windowStart;
            if (elapsed >= 250) {
              task.speed = Math.round((windowBytes * 1000) / Math.max(1, elapsed));
              windowBytes = 0;
              windowStart = now;
            }

            if (task.fileSize > 0) {
              task.progress = Math.min(100, Number(((task.receivedBytes / task.fileSize) * 100).toFixed(2)));
            }

            if (this.settings.isSpeedLimitEnabled && this.settings.speedLimitation > 0) {
              const perTaskLimit = Math.max(1024, this.settings.speedLimitation / Math.max(1, this.runningIds.size));
              const expectedMs = (value.byteLength / perTaskLimit) * 1000;
              if (expectedMs > 15) {
                await new Promise((r) => setTimeout(r, Math.min(expectedMs, 500)));
              }
            }
          }
        } finally {
          await new Promise<void>((resolve) => writeStream.end(resolve));
        }

        // If server returned a partial chunk (206) and we still haven't reached total fileSize, stitch next Range!
        if (isPartial && task.fileSize > 0 && task.receivedBytes < task.fileSize && chunkReceived > 0) {
          task.isPartialBypass = true;
          continue;
        }
        break;
      }

      if (task.status === "running") {
        if (task.fileSize <= 0) {
          task.fileSize = task.receivedBytes;
        }
        task.status = "completed";
        task.progress = 100;
        task.speed = 0;
        task.completedAt = Math.floor(Date.now() / 1000);
        task.isFileAvailable = fs.existsSync(filePath);
      }
    } catch (err) {
      if (controller.signal.aborted || task.status === "paused") {
        task.speed = 0;
      } else {
        task.status = "failed";
        task.speed = 0;
        task.error = err instanceof Error ? err.message : "Download failed";
      }
    } finally {
      this.controllers.delete(task.taskId);
      this.runningIds.delete(task.taskId);
      this.scheduleQueue();
      this.broadcast();
    }
  }

  public async handleAria2Rpc(payload: unknown): Promise<unknown> {
    if (Array.isArray(payload)) {
      return Promise.all(payload.map((req) => this.runSingleRpc(req)));
    }
    return this.runSingleRpc(payload);
  }

  private async runSingleRpc(req: unknown): Promise<Record<string, unknown>> {
    if (!req || typeof req !== "object") {
      return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } };
    }
    const { id = null, method, params = [] } = req as {
      id?: unknown;
      method?: string;
      params?: unknown[];
    };

    if (!this.settings.isAria2RpcEnabled) {
      return { jsonrpc: "2.0", id, error: { code: 1, message: "Aria2 RPC is disabled in settings" } };
    }

    const argList = Array.isArray(params) ? [...params] : [];
    if (this.settings.aria2RpcToken) {
      const first = typeof argList[0] === "string" ? argList[0] : "";
      if (first !== `token:${this.settings.aria2RpcToken}`) {
        return { jsonrpc: "2.0", id, error: { code: 1, message: "Unauthorized" } };
      }
      argList.shift();
    } else if (typeof argList[0] === "string" && argList[0].startsWith("token:")) {
      argList.shift();
    }

    const toAria2Status = (t: Task) => ({
      gid: t.taskId,
      status: t.status === "completed" ? "complete" : t.status === "failed" ? "error" : t.status === "running" ? "active" : t.status,
      totalLength: String(t.fileSize),
      completedLength: String(t.receivedBytes),
      downloadSpeed: String(t.speed),
      files: [{ index: "1", path: t.name, length: String(t.fileSize), completedLength: String(t.receivedBytes), uris: [{ uri: t.url, status: "used" }] }],
    });

    switch (method) {
      case "aria2.getVersion":
        return {
          jsonrpc: "2.0",
          id,
          result: { version: APP_VERSION, enabledFeatures: ["Async DNS", "HTTPS", "BitTorrent", "GhostDownloader"] },
        };
      case "aria2.getGlobalStat": {
        const all = Array.from(this.tasks.values());
        return {
          jsonrpc: "2.0",
          id,
          result: {
            downloadSpeed: String(all.reduce((s, t) => s + (t.status === "running" ? t.speed : 0), 0)),
            numActive: String(all.filter((t) => t.status === "running").length),
            numWaiting: String(all.filter((t) => t.status === "waiting").length),
            numStopped: String(all.filter((t) => t.status === "completed" || t.status === "failed").length),
          },
        };
      }
      case "aria2.addUri": {
        const uris = Array.isArray(argList[0]) ? argList[0] : [];
        const options = (typeof argList[1] === "object" && argList[1] ? argList[1] : {}) as Record<string, unknown>;
        const uri = typeof uris[0] === "string" ? uris[0] : "";
        if (!uri) {
          return { jsonrpc: "2.0", id, error: { code: -32602, message: "Missing URI" } };
        }
        const [probed] = await this.probe([uri]);
        const task = this.addTask({
          url: uri,
          resolvedUrl: probed.resolvedUrl,
          name: typeof options.out === "string" && options.out ? options.out : probed.name,
          packId: probed.packId,
          mediaKind: probed.mediaKind,
          fileSize: probed.fileSize,
          contentType: probed.contentType,
          canUseRangeRequests: probed.canUseRangeRequests,
          category: probed.category,
          isSimulated: probed.isSimulated,
          isPartialBypass: probed.isPartialBypass,
        });
        return { jsonrpc: "2.0", id, result: task.taskId };
      }
      case "aria2.pause":
      case "aria2.forcePause": {
        const gid = String(argList[0] || "");
        const task = this.pauseTask(gid);
        return task
          ? { jsonrpc: "2.0", id, result: gid }
          : { jsonrpc: "2.0", id, error: { code: 1, message: "GID not found" } };
      }
      case "aria2.unpause": {
        const gid = String(argList[0] || "");
        const task = this.startTask(gid);
        return task
          ? { jsonrpc: "2.0", id, result: gid }
          : { jsonrpc: "2.0", id, error: { code: 1, message: "GID not found" } };
      }
      case "aria2.pauseAll":
        this.pauseAll();
        return { jsonrpc: "2.0", id, result: "OK" };
      case "aria2.unpauseAll":
        this.startAll();
        return { jsonrpc: "2.0", id, result: "OK" };
      case "aria2.remove":
      case "aria2.forceRemove": {
        const gid = String(argList[0] || "");
        const ok = await this.deleteTask(gid, true);
        return ok
          ? { jsonrpc: "2.0", id, result: gid }
          : { jsonrpc: "2.0", id, error: { code: 1, message: "GID not found" } };
      }
      case "aria2.tellActive":
        return {
          jsonrpc: "2.0",
          id,
          result: Array.from(this.tasks.values()).filter((t) => t.status === "running").map(toAria2Status),
        };
      case "aria2.tellWaiting":
        return {
          jsonrpc: "2.0",
          id,
          result: Array.from(this.tasks.values()).filter((t) => t.status === "waiting" || t.status === "paused").map(toAria2Status),
        };
      case "aria2.tellStopped":
        return {
          jsonrpc: "2.0",
          id,
          result: Array.from(this.tasks.values()).filter((t) => t.status === "completed" || t.status === "failed").map(toAria2Status),
        };
      default:
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
    }
  }
}

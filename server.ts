import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import express from "express";
import { createServer as createViteServer } from "vite";
import type { MediaKind, PackId } from "./src/shared/types.js";
import { DownloadEngine } from "./server/engine.js";

async function startServer() {
  const app = express();
  const engine = new DownloadEngine();

  app.use(express.json({ limit: "2mb" }));

  // SSE state stream
  app.get("/api/events", (_req, res) => {
    engine.subscribeSse(res);
  });

  // Full snapshot
  app.get("/api/state", (_req, res) => {
    res.json(engine.getSnapshot());
  });

  // Probe URLs
  app.post("/api/probe", async (req, res) => {
    try {
      const urls = Array.isArray(req.body?.urls)
        ? req.body.urls.filter((u: unknown): u is string => typeof u === "string" && u.trim().length > 0)
        : [];
      if (urls.length === 0) {
        res.status(400).json({ error: "No valid URLs provided" });
        return;
      }
      const headers = typeof req.body?.headers === "object" && req.body.headers ? req.body.headers : undefined;
      const results = await engine.probe(urls, headers);
      res.json({ results });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Probe failed" });
    }
  });

  // Add tasks
  app.post("/api/tasks", (req, res) => {
    const items = Array.isArray(req.body?.tasks) ? req.body.tasks : [req.body];
    const created = items
      .filter((item: unknown) => item && typeof (item as { url?: unknown }).url === "string")
      .map((item: Record<string, unknown>) =>
        engine.addTask({
          url: String(item.url),
          resolvedUrl: typeof item.resolvedUrl === "string" ? item.resolvedUrl : undefined,
          name: typeof item.name === "string" ? item.name : undefined,
          packId: typeof item.packId === "string" ? (item.packId as PackId) : undefined,
          mediaKind: typeof item.mediaKind === "string" ? (item.mediaKind as MediaKind) : undefined,
          fileSize: typeof item.fileSize === "number" ? item.fileSize : 0,
          contentType: typeof item.contentType === "string" ? item.contentType : undefined,
          canUseRangeRequests: Boolean(item.canUseRangeRequests),
          lastModified: typeof item.lastModified === "string" ? item.lastModified : undefined,
          category: typeof item.category === "string" ? item.category : undefined,
          subworkerCount: typeof item.subworkerCount === "number" ? item.subworkerCount : undefined,
          headers: typeof item.headers === "object" && item.headers ? (item.headers as Record<string, string>) : undefined,
          isSimulated: Boolean(item.isSimulated),
          isPartialBypass: Boolean(item.isPartialBypass),
          startImmediately: item.startImmediately !== false,
        }),
      );
    res.json({ tasks: created });
  });

  // Task actions
  app.post("/api/tasks/:taskId/start", (req, res) => {
    const task = engine.startTask(req.params.taskId);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({ task });
  });

  app.post("/api/tasks/:taskId/pause", (req, res) => {
    const task = engine.pauseTask(req.params.taskId);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({ task });
  });

  app.post("/api/tasks/:taskId/redownload", async (req, res) => {
    const task = await engine.redownloadTask(req.params.taskId);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({ task });
  });

  app.patch("/api/tasks/:taskId", (req, res) => {
    const task = engine.editTask(req.params.taskId, {
      name: typeof req.body?.name === "string" ? req.body.name : undefined,
      url: typeof req.body?.url === "string" ? req.body.url : undefined,
      category: typeof req.body?.category === "string" ? req.body.category : undefined,
    });
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({ task });
  });

  app.delete("/api/tasks/:taskId", async (req, res) => {
    const deleteFiles = req.query.deleteFiles !== "false";
    const ok = await engine.deleteTask(req.params.taskId, deleteFiles);
    if (!ok) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({ ok: true });
  });

  app.post("/api/tasks/:taskId/checksum", async (req, res) => {
    const algo = req.body?.algorithm;
    if (!["md5", "sha1", "sha256", "sha512"].includes(algo)) {
      res.status(400).json({ error: "Unsupported algorithm" });
      return;
    }
    try {
      const digest = await engine.computeChecksum(req.params.taskId, algo);
      res.json({ algorithm: algo, digest });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Checksum failed" });
    }
  });

  // Real-time progressive streaming while task is downloading (HTTP 206 Range)
  app.get("/api/tasks/:taskId/stream", async (req, res) => {
    await engine.streamTaskFile(req, res, req.params.taskId);
  });

  app.get("/api/tasks/:taskId/file", (req, res) => {
    const task = engine.getTask(req.params.taskId);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const filePath = engine.getTaskFilePath(task);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not available on server disk" });
      return;
    }
    res.download(filePath, task.name);
  });

  // Viewer media proxy for hotlink/Referer-locked direct URLs
  app.get("/api/viewer/proxy", async (req, res) => {
    const targetUrl = typeof req.query.url === "string" ? req.query.url : "";
    const referer = typeof req.query.referer === "string" ? req.query.referer : "";
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }
    try {
      const parsed = new URL(targetUrl);
      const hdrs: Record<string, string> = {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        referer: referer || `${parsed.protocol}//${parsed.host}/`,
      };
      if (req.headers.range) {
        hdrs.range = req.headers.range;
      }
      const upstream = await fetch(targetUrl, { headers: hdrs, redirect: "follow" });
      res.status(upstream.status);
      for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
        const val = upstream.headers.get(h);
        if (val) res.setHeader(h, val);
      }
      if (!upstream.body) {
        res.end();
        return;
      }
      Readable.fromWeb(upstream.body as unknown as import("node:stream/web").ReadableStream).pipe(res);
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : "Proxy stream failed" });
    }
  });

  // Batch task operations
  app.post("/api/tasks/start-all", (_req, res) => {
    engine.startAll();
    res.json({ ok: true });
  });

  app.post("/api/tasks/pause-all", (_req, res) => {
    engine.pauseAll();
    res.json({ ok: true });
  });

  app.post("/api/tasks/batch", async (req, res) => {
    const action = req.body?.action;
    const taskIds: string[] = Array.isArray(req.body?.taskIds) ? req.body.taskIds : [];
    if (action === "move_to_front") {
      engine.moveToFront(taskIds);
    } else if (action === "redownload") {
      for (const id of taskIds) {
        await engine.redownloadTask(id);
      }
    } else if (action === "delete") {
      const deleteFiles = req.body?.deleteFiles !== false;
      for (const id of taskIds) {
        await engine.deleteTask(id, deleteFiles);
      }
    } else if (action === "set_category") {
      const category = typeof req.body?.category === "string" ? req.body.category : "";
      for (const id of taskIds) {
        engine.setCategory(id, category);
      }
    }
    res.json({ ok: true });
  });

  // Link Aggregator endpoints
  app.post("/api/aggregator/crawl", (req, res) => {
    const urls = Array.isArray(req.body?.urls)
      ? req.body.urls.filter((u: unknown): u is string => typeof u === "string" && u.trim().length > 0)
      : [];
    if (urls.length === 0) {
      res.status(400).json({ error: "No URLs provided" });
      return;
    }
    const headers = typeof req.body?.headers === "object" && req.body.headers ? req.body.headers : {};
    void engine.startAggregate(urls, headers);
    res.json({ started: true });
  });

  app.post("/api/aggregator/stop", (_req, res) => {
    engine.stopAggregator();
    res.json({ ok: true });
  });

  app.patch("/api/aggregator/filter", (req, res) => {
    const aggregator = engine.updateAggregatorFilter(req.body || {});
    res.json({ aggregator });
  });

  app.post("/api/aggregator/queue", (req, res) => {
    const itemIds = Array.isArray(req.body?.itemIds) ? req.body.itemIds : undefined;
    const tasks = engine.queueAggregatedItems(itemIds);
    res.json({ tasks });
  });

  app.post("/api/aggregator/clear", (_req, res) => {
    engine.clearAggregatorItems();
    res.json({ ok: true });
  });

  app.post("/api/aggregator/dismiss-overlay", (_req, res) => {
    engine.dismissAggregatorOverlay();
    res.json({ ok: true });
  });

  // Settings, Categories, Feature Packs, Scheduled Plan, Browser Pairing
  app.patch("/api/settings", (req, res) => {
    const settings = engine.updateSettings(req.body || {});
    res.json({ settings });
  });

  app.post("/api/browser/regenerate-token", (_req, res) => {
    const token = engine.regeneratePairToken();
    res.json({ token });
  });

  app.put("/api/categories", (req, res) => {
    const categories = Array.isArray(req.body?.categories) ? engine.setCategories(req.body.categories) : [];
    res.json({ categories });
  });

  app.post("/api/categories/reset", (_req, res) => {
    res.json({ categories: engine.resetCategories() });
  });

  app.patch("/api/packs/:packId", (req, res) => {
    const packs = engine.togglePack(req.params.packId as PackId, Boolean(req.body?.enabled));
    res.json({ packs });
  });

  app.post("/api/plan", (req, res) => {
    const action = req.body?.action ?? null;
    res.json({ plan: engine.setPlan(action) });
  });

  // Aria2 JSON-RPC 2.0 compatible endpoint
  app.post("/jsonrpc", async (req, res) => {
    const result = await engine.handleAria2Rpc(req.body);
    res.json(result);
  });

  // Vite dev middleware or static dist
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  const port = Number.parseInt(process.env.PORT || "3000", 10);
  app.listen(port, "0.0.0.0", () => {
    console.log(`Ghost Downloader 3 listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start Ghost Downloader 3 server:", err);
  process.exit(1);
});

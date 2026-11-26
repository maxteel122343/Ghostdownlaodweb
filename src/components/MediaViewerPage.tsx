import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Card,
  Input,
  ProgressBar,
  Select,
  Subtitle1,
  Subtitle2,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowLeftRegular,
  ArrowRightRegular,
  ArrowRotateClockwiseRegular,
  DocumentRegular,
  FolderOpenRegular,
  GlobeRegular,
  ImageRegular,
  MusicNote2Regular,
  PauseRegular,
  PlayRegular,
  RadioButtonRegular,
  RewindRegular,
  FastForwardRegular,
  VideoRegular,
  ZoomInRegular,
  ZoomOutRegular,
} from "@fluentui/react-icons";
import { t } from "../i18n";
import { toReadableSize, toReadableTime } from "../shared/format";
import type { LanguagePreference, MediaKind, Task } from "../shared/types";

interface LocalMediaItem {
  id: string;
  name: string;
  url: string;
  mediaKind: MediaKind;
  size: number;
}

const useStyles = makeStyles({
  root: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  topBar: {
    padding: "12px 20px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "10px",
  },
  content: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
  },
  stage: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  stageHeader: {
    padding: "10px 18px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  viewport: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "auto",
    padding: "16px",
    backgroundColor: tokens.colorNeutralBackground3,
    position: "relative",
  },
  videoEl: {
    maxWidth: "100%",
    maxHeight: "100%",
    width: "100%",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: "#000000",
  },
  pdfFrame: {
    width: "100%",
    height: "100%",
    border: "none",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: "#ffffff",
  },
  controlsBar: {
    padding: "10px 18px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  playlist: {
    width: "270px",
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    overflowY: "auto",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    "@media (max-width: 900px)": {
      display: "none",
    },
  },
  playlistCard: {
    padding: "10px",
    cursor: "pointer",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  playlistCardActive: {
    border: `1px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  liveBanner: {
    padding: "6px 18px",
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
});

function inferLocalMediaKind(file: File): MediaKind {
  const name = file.name.toLowerCase();
  if (name.endsWith(".gif") || file.type === "image/gif") return "gif";
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("video/") || /\.(mp4|webm|mkv|mov|avi|m4v|ogv)$/.test(name)) return "video";
  if (file.type.startsWith("audio/") || /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/.test(name)) return "audio";
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|avif|svg|bmp|ico)$/.test(name)) return "image";
  return "other";
}

function inferKindFromUrl(urlStr: string): MediaKind {
  const lower = urlStr.toLowerCase().split("?")[0];
  if (lower.endsWith(".gif")) return "gif";
  if (lower.endsWith(".pdf")) return "pdf";
  if (/\.(mp4|webm|mkv|mov|avi|m4v|ogv)$/.test(lower)) return "video";
  if (/\.(mp3|wav|ogg|flac|m4a|aac|opus)$/.test(lower)) return "audio";
  if (/\.(png|jpe?g|webp|avif|svg|bmp|ico)$/.test(lower)) return "image";
  return "video";
}

function kindIcon(kind: MediaKind) {
  if (kind === "video") return <VideoRegular />;
  if (kind === "audio") return <MusicNote2Regular />;
  if (kind === "pdf") return <DocumentRegular />;
  return <ImageRegular />;
}

export function MediaViewerPage({
  tasks,
  selectedTaskId,
  lang,
  onSelectTask,
}: {
  tasks: Task[];
  selectedTaskId: string | null;
  lang: LanguagePreference;
  onSelectTask: (taskId: string) => void;
}) {
  const styles = useStyles();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [localItem, setLocalItem] = useState<LocalMediaItem | null>(null);
  const [directUrlInput, setDirectUrlInput] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState("1");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const viewableTasks = useMemo(
    () =>
      tasks.filter(
        (tk) =>
          !tk.isSimulated &&
          (tk.isFileAvailable || tk.status === "running" || tk.status === "completed") &&
          ["video", "pdf", "image", "gif", "audio"].includes(tk.mediaKind),
      ),
    [tasks],
  );

  const activeTask = useMemo(
    () => (selectedTaskId ? tasks.find((tk) => tk.taskId === selectedTaskId) ?? null : null),
    [tasks, selectedTaskId],
  );

  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  }, [selectedTaskId, localItem?.id]);

  const activeMedia = useMemo(() => {
    if (localItem) {
      return {
        mode: "local" as const,
        id: localItem.id,
        name: localItem.name,
        src: localItem.url,
        mediaKind: localItem.mediaKind,
        isLiveDownloading: false,
        progress: 100,
        task: null as Task | null,
      };
    }
    if (activeTask) {
      return {
        mode: "task" as const,
        id: activeTask.taskId,
        name: activeTask.name,
        src: activeTask.isSimulated
          ? activeTask.resolvedUrl
          : `/api/tasks/${activeTask.taskId}/stream`,
        mediaKind: activeTask.mediaKind,
        isLiveDownloading: activeTask.status === "running",
        progress: activeTask.progress,
        task: activeTask,
      };
    }
    if (viewableTasks.length > 0) {
      const first = viewableTasks[0];
      return {
        mode: "task" as const,
        id: first.taskId,
        name: first.name,
        src: `/api/tasks/${first.taskId}/stream`,
        mediaKind: first.mediaKind,
        isLiveDownloading: first.status === "running",
        progress: first.progress,
        task: first,
      };
    }
    return null;
  }, [localItem, activeTask, viewableTasks]);

  function getMediaElement(): HTMLMediaElement | null {
    return videoRef.current || audioRef.current;
  }

  function togglePlayPause() {
    const el = getMediaElement();
    if (!el) return;
    if (el.paused) {
      void el.play();
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }

  function skipSeconds(delta: number) {
    const el = getMediaElement();
    if (!el) return;
    el.currentTime = Math.max(0, el.currentTime + delta);
  }

  function stepPlaylist(delta: number) {
    if (viewableTasks.length === 0) return;
    setLocalItem(null);
    const idx = activeMedia?.task
      ? viewableTasks.findIndex((x) => x.taskId === activeMedia.task?.taskId)
      : 0;
    const nextIdx = (idx + delta + viewableTasks.length) % viewableTasks.length;
    onSelectTask(viewableTasks[nextIdx].taskId);
  }

  function handleLocalFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const objUrl = URL.createObjectURL(file);
    setLocalItem({
      id: `local_${Date.now()}`,
      name: file.name,
      url: objUrl,
      mediaKind: inferLocalMediaKind(file),
      size: file.size,
    });
  }

  function handleLoadDirectUrl() {
    const trimmed = directUrlInput.trim();
    if (!trimmed) return;
    const kind = inferKindFromUrl(trimmed);
    setLocalItem({
      id: `url_${Date.now()}`,
      name: trimmed.split("/").pop()?.split("?")[0] || "Stream",
      url: `/api/viewer/proxy?url=${encodeURIComponent(trimmed)}`,
      mediaKind: kind,
      size: 0,
    });
  }

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <div>
          <Subtitle1>{t(lang, "viewerTitle")}</Subtitle1>
          <div>
            <Caption1>{t(lang, "viewerSubtitle")}</Caption1>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto", flexWrap: "wrap" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*,image/*,.pdf,.gif,.mkv,.flac"
            style={{ display: "none" }}
            onChange={(e) => handleLocalFiles(e.target.files)}
          />
          <Button
            size="small"
            appearance="secondary"
            icon={<FolderOpenRegular />}
            onClick={() => fileInputRef.current?.click()}
          >
            {t(lang, "viewerLoadLocal")}
          </Button>

          <Input
            size="small"
            style={{ width: "260px" }}
            placeholder="https://... (.mp4, .pdf, .gif, .png, .mp3)"
            value={directUrlInput}
            onChange={(_, d) => setDirectUrlInput(d.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLoadDirectUrl()}
          />
          <Button
            size="small"
            appearance="primary"
            icon={<GlobeRegular />}
            disabled={!directUrlInput.trim()}
            onClick={handleLoadDirectUrl}
          >
            {t(lang, "viewerLoadUrl")}
          </Button>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.stage}>
          {activeMedia ? (
            <>
              <div className={styles.stageHeader}>
                {kindIcon(activeMedia.mediaKind)}
                <Subtitle2 style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeMedia.name}
                </Subtitle2>
                <Badge appearance="tint" color="informative">
                  {activeMedia.mediaKind.toUpperCase()}
                </Badge>
                {activeMedia.task && (
                  <Badge appearance="outline">
                    {toReadableSize(activeMedia.task.receivedBytes)}
                    {activeMedia.task.fileSize > 0 ? ` / ${toReadableSize(activeMedia.task.fileSize)}` : ""}
                  </Badge>
                )}
                <div style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
                  <Tooltip content={t(lang, "viewerPrev")} relationship="label">
                    <Button size="small" icon={<ArrowLeftRegular />} onClick={() => stepPlaylist(-1)} />
                  </Tooltip>
                  <Tooltip content={t(lang, "viewerNext")} relationship="label">
                    <Button size="small" icon={<ArrowRightRegular />} onClick={() => stepPlaylist(1)} />
                  </Tooltip>
                </div>
              </div>

              {activeMedia.isLiveDownloading && activeMedia.task && (
                <div className={styles.liveBanner}>
                  <RadioButtonRegular />
                  <Caption1 style={{ fontWeight: 600 }}>
                    {t(lang, "viewerLiveBadge")} · {activeMedia.task.progress.toFixed(1)}% ({toReadableSize(activeMedia.task.speed)}/s)
                  </Caption1>
                  <div style={{ flex: 1 }}>
                    <ProgressBar value={Math.max(0, Math.min(1, activeMedia.progress / 100))} />
                  </div>
                </div>
              )}

              <div className={styles.viewport}>
                {activeMedia.mediaKind === "video" && (
                  <video
                    ref={videoRef}
                    key={activeMedia.src}
                    className={styles.videoEl}
                    src={activeMedia.src}
                    controls
                    autoPlay
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
                  />
                )}

                {activeMedia.mediaKind === "audio" && (
                  <Card style={{ padding: "28px", minWidth: "340px", maxWidth: "520px", width: "100%", textAlign: "center" }}>
                    <MusicNote2Regular fontSize={48} />
                    <Subtitle2 style={{ marginTop: "12px", marginBottom: "16px", display: "block" }}>
                      {activeMedia.name}
                    </Subtitle2>
                    <audio
                      ref={audioRef}
                      key={activeMedia.src}
                      src={activeMedia.src}
                      controls
                      autoPlay
                      style={{ width: "100%" }}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                      onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
                    />
                  </Card>
                )}

                {activeMedia.mediaKind === "pdf" && (
                  <iframe
                    key={activeMedia.src}
                    className={styles.pdfFrame}
                    src={activeMedia.src}
                    title={activeMedia.name}
                  />
                )}

                {(activeMedia.mediaKind === "image" || activeMedia.mediaKind === "gif") && (
                  <img
                    key={activeMedia.src}
                    src={activeMedia.src}
                    alt={activeMedia.name}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      transform: `scale(${zoom}) rotate(${rotation}deg)`,
                      transition: "transform 150ms ease",
                    }}
                  />
                )}

                {activeMedia.mediaKind === "other" && (
                  <Body1>Preview not supported for this binary format. Download or open externally.</Body1>
                )}
              </div>

              {(activeMedia.mediaKind === "video" || activeMedia.mediaKind === "audio") && (
                <div className={styles.controlsBar}>
                  <Button
                    size="small"
                    appearance="primary"
                    icon={isPlaying ? <PauseRegular /> : <PlayRegular />}
                    onClick={togglePlayPause}
                  >
                    {isPlaying ? t(lang, "viewerPause") : t(lang, "viewerPlay")}
                  </Button>
                  <Button size="small" icon={<RewindRegular />} onClick={() => skipSeconds(-10)}>
                    {t(lang, "viewerSkipBack")}
                  </Button>
                  <Button size="small" icon={<FastForwardRegular />} onClick={() => skipSeconds(10)}>
                    {t(lang, "viewerSkipFwd")}
                  </Button>
                  <Caption1 style={{ marginLeft: "6px" }}>
                    {toReadableTime(currentTime)} / {duration ? toReadableTime(duration) : "--"}
                  </Caption1>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Select
                      size="small"
                      value={playbackRate}
                      onChange={(_, d) => {
                        setPlaybackRate(d.value);
                        const el = getMediaElement();
                        if (el) el.playbackRate = Number(d.value) || 1;
                      }}
                    >
                      <option value="0.5">0.5x</option>
                      <option value="1">1.0x</option>
                      <option value="1.25">1.25x</option>
                      <option value="1.5">1.5x</option>
                      <option value="2">2.0x</option>
                    </Select>
                  </div>
                </div>
              )}

              {(activeMedia.mediaKind === "image" || activeMedia.mediaKind === "gif") && (
                <div className={styles.controlsBar}>
                  <Button size="small" icon={<ZoomOutRegular />} onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
                    {t(lang, "viewerZoomOut")}
                  </Button>
                  <Button size="small" icon={<ZoomInRegular />} onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
                    {t(lang, "viewerZoomIn")}
                  </Button>
                  <Button size="small" icon={<ArrowRotateClockwiseRegular />} onClick={() => setRotation((r) => (r + 90) % 360)}>
                    {t(lang, "viewerRotate")}
                  </Button>
                  <Caption1 style={{ marginLeft: "8px" }}>{Math.round(zoom * 100)}%</Caption1>
                </div>
              )}
            </>
          ) : (
            <div className={styles.viewport}>
              <Body1>{t(lang, "viewerNoItem")}</Body1>
            </div>
          )}
        </div>

        <aside className={styles.playlist}>
          <Subtitle2>Playlist ({viewableTasks.length})</Subtitle2>
          {viewableTasks.map((tk) => {
            const isSel = !localItem && activeMedia?.task?.taskId === tk.taskId;
            return (
              <Card
                key={tk.taskId}
                appearance="filled-alternative"
                className={`${styles.playlistCard}${isSel ? ` ${styles.playlistCardActive}` : ""}`}
                onClick={() => {
                  setLocalItem(null);
                  onSelectTask(tk.taskId);
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {kindIcon(tk.mediaKind)}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tk.name}
                    </div>
                    <Caption1>
                      {tk.status === "running" ? `${tk.progress.toFixed(0)}% · LIVE` : toReadableSize(tk.fileSize || tk.receivedBytes)}
                    </Caption1>
                  </div>
                </div>
              </Card>
            );
          })}
        </aside>
      </div>
    </div>
  );
}

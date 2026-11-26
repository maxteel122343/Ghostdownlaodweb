import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  FluentProvider,
  SearchBox,
  Subtitle1,
  Subtitle2,
  Toast,
  ToastTitle,
  Toaster,
  Tooltip,
  makeStyles,
  tokens,
  useToastController,
  webDarkTheme,
  webLightTheme,
} from "@fluentui/react-components";
import {
  AddRegular,
  ArrowDownloadFilled,
  ArrowDownloadRegular,
  FolderAddRegular,
  GlobeFilled,
  GlobeRegular,
  LocalLanguageRegular,
  PuzzlePieceFilled,
  PuzzlePieceRegular,
  SettingsFilled,
  SettingsRegular,
  VideoFilled,
  VideoRegular,
  WeatherMoonRegular,
  WeatherSunnyRegular,
  bundleIcon,
} from "@fluentui/react-icons";
import { api } from "./api";
import { AggregatorOverlay } from "./components/AggregatorOverlay";
import { FeaturePacksPage } from "./components/FeaturePacksPage";
import { LinkAggregatorPage } from "./components/LinkAggregatorPage";
import { MediaViewerPage } from "./components/MediaViewerPage";
import { SettingPage } from "./components/SettingPage";
import { TaskDraftDialog } from "./components/TaskDraftDialog";
import { TaskDrawer } from "./components/TaskDrawer";
import { TaskPage } from "./components/TaskPage";
import { t } from "./i18n";
import type { AppStateSnapshot, LanguagePreference } from "./shared/types";

const TasksIcon = bundleIcon(ArrowDownloadFilled, ArrowDownloadRegular);
const ViewerIcon = bundleIcon(VideoFilled, VideoRegular);
const AggregatorIcon = bundleIcon(GlobeFilled, GlobeRegular);
const PacksIcon = bundleIcon(PuzzlePieceFilled, PuzzlePieceRegular);
const SettingsIcon = bundleIcon(SettingsFilled, SettingsRegular);

type NavKey = "tasks" | "viewer" | "aggregator" | "packs" | "settings";

const CLIPBOARD_URL_REGEX = /^(https?:\/\/|magnet:\?|ed2k:\/\/|ftp:\/\/|thunder:\/\/|flashget:\/\/|qqdl:\/\/)/i;

const useStyles = makeStyles({
  shell: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    overflow: "hidden",
  },
  titleBar: {
    height: "52px",
    padding: "0 16px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: "180px",
  },
  logo: {
    width: "26px",
    height: "26px",
    borderRadius: "6px",
    objectFit: "cover",
  },
  searchWrap: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
  },
  searchBox: {
    width: "100%",
    maxWidth: "380px",
  },
  titleActions: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginLeft: "auto",
  },
  body: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
  },
  sidebar: {
    width: "215px",
    padding: "12px 10px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    backgroundColor: tokens.colorNeutralBackground2,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
    "@media (max-width: 720px)": {
      width: "60px",
      padding: "12px 6px",
    },
  },
  navBtn: {
    justifyContent: "flex-start",
    height: "38px",
  },
  navLabel: {
    "@media (max-width: 720px)": {
      display: "none",
    },
  },
  sidebarSpacer: {
    flex: 1,
  },
  main: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  dropOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    backdropFilter: "blur(6px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    color: "#ffffff",
    pointerEvents: "none",
  },
});

export function App() {
  const [snapshot, setSnapshot] = useState<AppStateSnapshot | null>(null);
  const [activeNav, setActiveNav] = useState<NavKey>("tasks");
  const [searchText, setSearchText] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftUrls, setDraftUrls] = useState<string[]>([]);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [viewerTaskId, setViewerTaskId] = useState<string | null>(null);
  const [aggregatorUrlInput, setAggregatorUrlInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [prefersDark, setPrefersDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  const searchRef = useRef<HTMLInputElement>(null);
  const lastClipboardRef = useRef<string>("");
  const toasterId = useId();
  const { dispatchToast } = useToastController(toasterId);

  function notify(message: string) {
    dispatchToast(
      <Toast>
        <ToastTitle>{message}</ToastTitle>
      </Toast>,
      { intent: "info", timeout: 3000 },
    );
  }

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    void api.getState().then(setSnapshot);
    const es = new EventSource("/api/events");
    es.onmessage = (event) => {
      try {
        const next = JSON.parse(event.data) as AppStateSnapshot;
        setSnapshot(next);
      } catch {
        // ignore parse errors
      }
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setActiveNav("tasks");
        setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const clipboardEnabled = snapshot?.settings.isClipboardAutoPasteEnabled ?? false;

  useEffect(() => {
    if (!clipboardEnabled) return;

    async function tryReadClipboard() {
      if (!navigator.clipboard?.readText) return;
      try {
        const clip = await navigator.clipboard.readText();
        const lines = clip
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => CLIPBOARD_URL_REGEX.test(l));
        if (lines.length === 0) return;

        const joined = lines.join("\n");
        if (joined === lastClipboardRef.current) return;
        lastClipboardRef.current = joined;

        if (activeNav === "aggregator") {
          setAggregatorUrlInput((prev) => {
            const existing = prev
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean);
            const merged = Array.from(new Set([...existing, ...lines]));
            return merged.join("\n");
          });
        } else if (draftOpen) {
          setDraftUrls(lines);
        }
      } catch {
        // Clipboard access may require explicit user interaction in some browsers
      }
    }

    const onFocus = () => {
      void tryReadClipboard();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [clipboardEnabled, activeNav, draftOpen]);

  const theme = useMemo(() => {
    const mode = snapshot?.settings.themeMode || "auto";
    if (mode === "dark") return webDarkTheme;
    if (mode === "light") return webLightTheme;
    return prefersDark ? webDarkTheme : webLightTheme;
  }, [snapshot?.settings.themeMode, prefersDark]);

  const lang: LanguagePreference = snapshot?.settings.language || "pt";

  return (
    <FluentProvider className="gd3-provider" theme={theme}>
      <AppShell
        snapshot={snapshot}
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        searchText={searchText}
        setSearchText={setSearchText}
        searchRef={searchRef}
        draftOpen={draftOpen}
        setDraftOpen={setDraftOpen}
        draftUrls={draftUrls}
        setDraftUrls={setDraftUrls}
        drawerTaskId={drawerTaskId}
        setDrawerTaskId={setDrawerTaskId}
        viewerTaskId={viewerTaskId}
        setViewerTaskId={setViewerTaskId}
        aggregatorUrlInput={aggregatorUrlInput}
        setAggregatorUrlInput={setAggregatorUrlInput}
        isDragging={isDragging}
        setIsDragging={setIsDragging}
        prefersDark={prefersDark}
        toasterId={toasterId}
        notify={notify}
        lang={lang}
      />
    </FluentProvider>
  );
}

function AppShell({
  snapshot,
  activeNav,
  setActiveNav,
  searchText,
  setSearchText,
  searchRef,
  draftOpen,
  setDraftOpen,
  draftUrls,
  setDraftUrls,
  drawerTaskId,
  setDrawerTaskId,
  viewerTaskId,
  setViewerTaskId,
  aggregatorUrlInput,
  setAggregatorUrlInput,
  isDragging,
  setIsDragging,
  prefersDark,
  toasterId,
  notify,
  lang,
}: {
  snapshot: AppStateSnapshot | null;
  activeNav: NavKey;
  setActiveNav: (k: NavKey) => void;
  searchText: string;
  setSearchText: (s: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  draftOpen: boolean;
  setDraftOpen: (b: boolean) => void;
  draftUrls: string[];
  setDraftUrls: (u: string[]) => void;
  drawerTaskId: string | null;
  setDrawerTaskId: (id: string | null) => void;
  viewerTaskId: string | null;
  setViewerTaskId: (id: string | null) => void;
  aggregatorUrlInput: string;
  setAggregatorUrlInput: (s: string) => void;
  isDragging: boolean;
  setIsDragging: (b: boolean) => void;
  prefersDark: boolean;
  toasterId: string;
  notify: (msg: string) => void;
  lang: LanguagePreference;
}) {
  const styles = useStyles();

  if (!snapshot) {
    return (
      <div className={styles.shell} style={{ alignItems: "center", justifyContent: "center" }}>
        <Subtitle1>Ghost Downloader 3</Subtitle1>
      </div>
    );
  }

  const activeCount = snapshot.tasks.filter((x) => x.status === "running" || x.status === "waiting").length;
  const drawerTask = drawerTaskId ? snapshot.tasks.find((x) => x.taskId === drawerTaskId) ?? null : null;
  const isDarkEffective =
    snapshot.settings.themeMode === "dark" ||
    (snapshot.settings.themeMode === "auto" && prefersDark);

  function openNewTask(urls: string[] = []) {
    setDraftUrls(urls);
    setDraftOpen(true);
  }

  function cycleLanguage() {
    const next: LanguagePreference = lang === "pt" ? "en" : lang === "en" ? "zh" : "pt";
    void api.updateSettings({ language: next });
  }

  return (
    <div
      className={styles.shell}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes("text/plain") || e.dataTransfer.types.includes("text/uri-list")) {
          e.preventDefault();
          setIsDragging(true);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/plain") || e.dataTransfer.types.includes("text/uri-list")) {
          e.preventDefault();
        }
      }}
      onDragLeave={(e) => {
        if (e.relatedTarget === null) {
          setIsDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const raw = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain") || "";
        const urls = raw
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#"));
        if (urls.length > 0) {
          if (activeNav === "aggregator") {
            setAggregatorUrlInput(urls.join("\n"));
          } else {
            openNewTask(urls);
          }
        }
      }}
    >
      <header className={styles.titleBar}>
        <div className={styles.brand}>
          <img className={styles.logo} src="/logo.png" alt="Ghost Downloader" />
          <Subtitle2>{t(lang, "appName")}</Subtitle2>
        </div>

        <div className={styles.searchWrap}>
          {activeNav === "tasks" && (
            <SearchBox
              ref={searchRef}
              className={styles.searchBox}
              size="small"
              placeholder={t(lang, "searchTasks")}
              value={searchText}
              onChange={(_, d) => setSearchText(d.value)}
            />
          )}
        </div>

        <div className={styles.titleActions}>
          <Tooltip content={t(lang, "language")} relationship="label">
            <Button
              size="small"
              appearance="subtle"
              icon={<LocalLanguageRegular />}
              onClick={cycleLanguage}
            >
              {lang === "pt" ? "PT" : lang === "en" ? "EN" : "中文"}
            </Button>
          </Tooltip>

          <Tooltip content={t(lang, "themeMode")} relationship="label">
            <Button
              size="small"
              appearance="subtle"
              icon={isDarkEffective ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
              onClick={() =>
                void api.updateSettings({ themeMode: isDarkEffective ? "light" : "dark" })
              }
            />
          </Tooltip>
        </div>
      </header>

      <div className={styles.body}>
        <nav className={styles.sidebar}>
          <Button
            className={styles.navBtn}
            appearance={activeNav === "tasks" ? "subtle" : "transparent"}
            icon={<TasksIcon />}
            onClick={() => setActiveNav("tasks")}
            style={
              activeNav === "tasks"
                ? { backgroundColor: tokens.colorNeutralBackground1Selected, fontWeight: 600 }
                : undefined
            }
          >
            <span className={styles.navLabel}>{t(lang, "navTasks")}</span>
            {activeCount > 0 && (
              <Badge appearance="filled" color="brand" size="small" style={{ marginLeft: "auto" }}>
                {activeCount}
              </Badge>
            )}
          </Button>

          <Button
            className={styles.navBtn}
            appearance="transparent"
            icon={<AddRegular />}
            onClick={() => openNewTask([])}
          >
            <span className={styles.navLabel}>{t(lang, "navNewTask")}</span>
          </Button>

          <Button
            className={styles.navBtn}
            appearance={activeNav === "viewer" ? "subtle" : "transparent"}
            icon={<ViewerIcon />}
            onClick={() => setActiveNav("viewer")}
            style={
              activeNav === "viewer"
                ? { backgroundColor: tokens.colorNeutralBackground1Selected, fontWeight: 600 }
                : undefined
            }
          >
            <span className={styles.navLabel}>{t(lang, "navViewer")}</span>
          </Button>

          <Button
            className={styles.navBtn}
            appearance={activeNav === "aggregator" ? "subtle" : "transparent"}
            icon={<AggregatorIcon />}
            onClick={() => setActiveNav("aggregator")}
            style={
              activeNav === "aggregator"
                ? { backgroundColor: tokens.colorNeutralBackground1Selected, fontWeight: 600 }
                : undefined
            }
          >
            <span className={styles.navLabel}>{t(lang, "navAggregator")}</span>
            {snapshot.aggregator.capturedCount > 0 && (
              <Badge
                appearance="filled"
                color={snapshot.aggregator.isRunning ? "success" : "informative"}
                size="small"
                style={{ marginLeft: "auto" }}
              >
                {snapshot.aggregator.capturedCount}
              </Badge>
            )}
          </Button>

          <Button
            className={styles.navBtn}
            appearance={activeNav === "packs" ? "subtle" : "transparent"}
            icon={<PacksIcon />}
            onClick={() => setActiveNav("packs")}
            style={
              activeNav === "packs"
                ? { backgroundColor: tokens.colorNeutralBackground1Selected, fontWeight: 600 }
                : undefined
            }
          >
            <span className={styles.navLabel}>{t(lang, "navPacks")}</span>
          </Button>

          <div className={styles.sidebarSpacer} />

          <Button
            className={styles.navBtn}
            appearance={activeNav === "settings" ? "subtle" : "transparent"}
            icon={<SettingsIcon />}
            onClick={() => setActiveNav("settings")}
            style={
              activeNav === "settings"
                ? { backgroundColor: tokens.colorNeutralBackground1Selected, fontWeight: 600 }
                : undefined
            }
          >
            <span className={styles.navLabel}>{t(lang, "navSettings")}</span>
          </Button>
        </nav>

        <main className={styles.main}>
          {activeNav === "tasks" && (
            <TaskPage
              tasks={snapshot.tasks}
              waitingOrder={snapshot.waitingOrder}
              globalSpeed={snapshot.globalSpeed}
              settings={snapshot.settings}
              categories={snapshot.categories}
              plan={snapshot.plan}
              searchText={searchText}
              onNewTask={() => openNewTask([])}
              onOpenDetails={(id) => setDrawerTaskId(id)}
              onOpenViewer={(id) => {
                setViewerTaskId(id);
                setActiveNav("viewer");
              }}
              onNotify={notify}
            />
          )}

          {activeNav === "viewer" && (
            <MediaViewerPage
              tasks={snapshot.tasks}
              selectedTaskId={viewerTaskId}
              lang={lang}
              onSelectTask={(id) => setViewerTaskId(id)}
            />
          )}

          {activeNav === "aggregator" && (
            <LinkAggregatorPage
              aggregator={snapshot.aggregator}
              urlInput={aggregatorUrlInput}
              onUrlInputChange={setAggregatorUrlInput}
              lang={lang}
              onOpenTaskInViewer={(id) => {
                setViewerTaskId(id);
                setActiveNav("viewer");
              }}
              onNotify={notify}
            />
          )}

          {activeNav === "packs" && (
            <FeaturePacksPage packs={snapshot.packs} lang={lang} />
          )}

          {activeNav === "settings" && (
            <SettingPage
              settings={snapshot.settings}
              categories={snapshot.categories}
              version={snapshot.version}
              onNotify={notify}
            />
          )}
        </main>
      </div>

      <TaskDraftDialog
        open={draftOpen}
        initialUrls={draftUrls}
        lang={lang}
        categories={snapshot.categories}
        defaultThreads={snapshot.settings.preBlockNum}
        clipboardAutoPaste={snapshot.settings.isClipboardAutoPasteEnabled}
        onClose={() => setDraftOpen(false)}
        onCreated={(count) => {
          setActiveNav("tasks");
          notify(`+${count}`);
        }}
      />

      <TaskDrawer
        task={drawerTask}
        lang={lang}
        categories={snapshot.categories}
        onClose={() => setDrawerTaskId(null)}
        onNotify={notify}
      />

      <AggregatorOverlay
        aggregator={snapshot.aggregator}
        lang={lang}
        onOpenAggregator={() => setActiveNav("aggregator")}
      />

      {isDragging && (
        <div className={styles.dropOverlay}>
          <FolderAddRegular fontSize={48} />
          <Subtitle1>{t(lang, "dropHere")}</Subtitle1>
        </div>
      )}

      <Toaster toasterId={toasterId} position="bottom-end" />
    </div>
  );
}

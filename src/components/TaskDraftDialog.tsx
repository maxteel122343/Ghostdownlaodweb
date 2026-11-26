import { useEffect, useState } from "react";
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Label,
  Select,
  Spinner,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, KeyRegular, SearchRegular } from "@fluentui/react-icons";
import { api } from "../api";
import { t } from "../i18n";
import { toReadableSize } from "../shared/format";
import type { Category, LanguagePreference, ProbeResult } from "../shared/types";

const useStyles = makeStyles({
  surface: {
    maxWidth: "740px",
    width: "95vw",
  },
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  samples: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px",
  },
  probeList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxHeight: "260px",
    overflowY: "auto",
    paddingRight: "4px",
  },
  probeCard: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "10px 12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  probeRow: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    flexWrap: "wrap",
  },
});

const SAMPLE_URLS = [
  {
    label: "Video MP4 (Sample)",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  },
  {
    label: "PDF (arXiv Paper)",
    url: "https://arxiv.org/abs/1706.03762",
  },
  {
    label: "GitHub README",
    url: "https://raw.githubusercontent.com/XiaoYouChR/Ghost-Downloader-3/main/README.md",
  },
  {
    label: "Magnet Link",
    url: "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=ubuntu-24.04-desktop-amd64.iso",
  },
];

const URL_LINE_REGEX = /^(https?:\/\/|magnet:\?|ed2k:\/\/|ftp:\/\/|thunder:\/\/|flashget:\/\/|qqdl:\/\/)/i;

export function TaskDraftDialog({
  open,
  initialUrls,
  lang,
  categories,
  defaultThreads,
  clipboardAutoPaste,
  onClose,
  onCreated,
}: {
  open: boolean;
  initialUrls: string[];
  lang: LanguagePreference;
  categories: Category[];
  defaultThreads: number;
  clipboardAutoPaste: boolean;
  onClose: () => void;
  onCreated: (count: number) => void;
}) {
  const styles = useStyles();
  const [urlText, setUrlText] = useState("");
  const [probing, setProbing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [threads, setThreads] = useState(defaultThreads);
  const [showCustomHeaders, setShowCustomHeaders] = useState(false);
  const [cookie, setCookie] = useState("");
  const [referer, setReferer] = useState("");
  const [error, setError] = useState<string | null>(null);

  function getCustomHeaders(): Record<string, string> | undefined {
    const h: Record<string, string> = {};
    if (cookie.trim()) h.Cookie = cookie.trim();
    if (referer.trim()) h.Referer = referer.trim();
    return Object.keys(h).length > 0 ? h : undefined;
  }

  useEffect(() => {
    if (!open) return;
    setThreads(defaultThreads);
    setError(null);
    if (initialUrls.length > 0) {
      const joined = initialUrls.join("\n");
      setUrlText(joined);
      void runProbe(initialUrls);
    } else {
      setUrlText("");
      setResults([]);
      if (clipboardAutoPaste && navigator.clipboard?.readText) {
        void navigator.clipboard
          .readText()
          .then((clip) => {
            const lines = clip
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter((l) => URL_LINE_REGEX.test(l));
            if (lines.length > 0) {
              setUrlText(lines.join("\n"));
            }
          })
          .catch(() => {
            // Clipboard permission may not be granted silently
          });
      }
    }
  }, [open, initialUrls, defaultThreads, clipboardAutoPaste]);

  async function runProbe(explicitUrls?: string[]) {
    const urls = (explicitUrls ?? urlText.split(/\r?\n/))
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) return;

    setProbing(true);
    setError(null);
    try {
      const res = await api.probeUrls(urls, getCustomHeaders());
      setResults(res.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Probe failed");
    } finally {
      setProbing(false);
    }
  }

  async function handleSubmit(startImmediately: boolean) {
    setSubmitting(true);
    setError(null);
    try {
      const customHeaders = getCustomHeaders();
      let items = results;
      if (items.length === 0) {
        const urls = urlText.split(/\r?\n/).map((u) => u.trim()).filter(Boolean);
        if (urls.length === 0) return;
        const probed = await api.probeUrls(urls, customHeaders);
        items = probed.results;
      }

      const payload = items.map((item) => ({
        url: item.url,
        resolvedUrl: item.resolvedUrl,
        name: item.name,
        packId: item.packId,
        mediaKind: item.mediaKind,
        fileSize: item.fileSize,
        contentType: item.contentType,
        canUseRangeRequests: item.canUseRangeRequests,
        lastModified: item.lastModified,
        category: item.category,
        subworkerCount: threads,
        headers: customHeaders,
        isSimulated: item.isSimulated,
        isPartialBypass: item.isPartialBypass,
        startImmediately,
      }));

      const res = await api.addTasks(payload);
      onCreated(res.tasks.length);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  }

  const hasUrls = urlText.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>{t(lang, "newTaskTitle")}</DialogTitle>
          <DialogContent>
            <div className={styles.stack}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                <Label weight="semibold">{t(lang, "urlsLabel")}</Label>
                {clipboardAutoPaste && <Caption1>{t(lang, "clipboardAutoHint")}</Caption1>}
              </div>

              <Textarea
                rows={4}
                placeholder={t(lang, "urlsPlaceholder")}
                value={urlText}
                onChange={(_, d) => setUrlText(d.value)}
              />

              <div className={styles.samples}>
                <Caption1>{t(lang, "quickSamples")}</Caption1>
                {SAMPLE_URLS.map((sample) => (
                  <Button
                    key={sample.label}
                    size="small"
                    appearance="subtle"
                    onClick={() => {
                      const next = urlText.trim() ? `${urlText.trim()}\n${sample.url}` : sample.url;
                      setUrlText(next);
                    }}
                  >
                    + {sample.label}
                  </Button>
                ))}
              </div>

              <div className={styles.probeRow}>
                <Button
                  appearance="secondary"
                  icon={probing ? <Spinner size="tiny" /> : <SearchRegular />}
                  disabled={!hasUrls || probing}
                  onClick={() => void runProbe()}
                >
                  {probing ? t(lang, "probing") : t(lang, "probeUrls")}
                </Button>

                <Button
                  appearance="subtle"
                  size="small"
                  icon={<KeyRegular />}
                  onClick={() => setShowCustomHeaders((s) => !s)}
                >
                  {t(lang, "customHeadersToggle")}
                </Button>

                <Label style={{ marginLeft: "auto" }}>{t(lang, "threads")}:</Label>
                <Input
                  type="number"
                  min={1}
                  max={64}
                  style={{ width: "80px" }}
                  value={String(threads)}
                  onChange={(_, d) => setThreads(Math.max(1, Math.min(64, Number(d.value) || 8)))}
                />
              </div>

              {showCustomHeaders && (
                <div className={styles.probeRow}>
                  <Input
                    size="small"
                    style={{ flex: 1, minWidth: "200px" }}
                    placeholder={t(lang, "cookiePlaceholder")}
                    value={cookie}
                    onChange={(_, d) => setCookie(d.value)}
                  />
                  <Input
                    size="small"
                    style={{ flex: 1, minWidth: "200px" }}
                    placeholder={t(lang, "refererPlaceholder")}
                    value={referer}
                    onChange={(_, d) => setReferer(d.value)}
                  />
                </div>
              )}

              {error && (
                <Body1 style={{ color: tokens.colorPaletteRedForeground1 }}>{error}</Body1>
              )}

              {results.length > 0 && (
                <div className={styles.probeList}>
                  {results.map((item, idx) => (
                    <div key={`${item.url}-${idx}`} className={styles.probeCard}>
                      <div className={styles.probeRow}>
                        <Badge appearance="tint" color="informative">{item.packId}</Badge>
                        <Badge appearance="outline">{item.mediaKind.toUpperCase()}</Badge>
                        {item.fileSize > 0 && <Badge appearance="outline">{toReadableSize(item.fileSize)}</Badge>}
                        {item.canUseRangeRequests && (
                          <Badge appearance="tint" color="success">{t(lang, "resumableBadge")}</Badge>
                        )}
                        {item.isPartialBypass && (
                          <Badge appearance="tint" color="warning">{t(lang, "partialBypassBadge")}</Badge>
                        )}
                        {item.isSimulated && (
                          <Badge appearance="tint" color="warning">{t(lang, "simulatedBadge")}</Badge>
                        )}
                      </div>

                      <div className={styles.probeRow}>
                        <Input
                          style={{ flex: 2, minWidth: "180px" }}
                          value={item.name}
                          onChange={(_, d) => {
                            const next = [...results];
                            next[idx] = { ...item, name: d.value };
                            setResults(next);
                          }}
                        />
                        <Select
                          style={{ flex: 1, minWidth: "130px" }}
                          value={item.category}
                          onChange={(_, d) => {
                            const next = [...results];
                            next[idx] = { ...item, category: d.value };
                            setResults(next);
                          }}
                        >
                          <option value="">{t(lang, "uncategorized")}</option>
                          {categories.map((c) => (
                            <option key={c.categoryId} value={c.categoryId}>
                              {lang === "zh" ? c.nameZh : lang === "pt" ? c.namePt || c.name : c.name}
                            </option>
                          ))}
                        </Select>
                      </div>

                      {item.note && <Caption1>{item.note}</Caption1>}
                      {item.error && (
                        <Caption1 style={{ color: tokens.colorPaletteRedForeground1 }}>
                          {item.error}
                        </Caption1>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>

          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              {t(lang, "cancelSelection")}
            </Button>
            <Button
              appearance="secondary"
              disabled={!hasUrls || submitting}
              onClick={() => void handleSubmit(false)}
            >
              {t(lang, "addPaused")}
            </Button>
            <Button
              appearance="primary"
              icon={<ArrowDownloadRegular />}
              disabled={!hasUrls || submitting}
              onClick={() => void handleSubmit(true)}
            >
              {t(lang, "addAndStart")}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

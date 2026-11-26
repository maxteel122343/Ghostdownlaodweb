import { useState } from "react";
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Card,
  Checkbox,
  Divider,
  Input,
  Label,
  ProgressBar,
  Select,
  Spinner,
  Subtitle1,
  Subtitle2,
  Switch,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  DeleteRegular,
  GlobeRegular,
  PlayRegular,
  StopRegular,
} from "@fluentui/react-icons";
import { api } from "../api";
import { t } from "../i18n";
import { toReadableSize } from "../shared/format";
import type {
  AggregatorState,
  LanguagePreference,
  MediaKind,
  QualityTag,
} from "../shared/types";

const useStyles = makeStyles({
  root: {
    height: "100%",
    overflowY: "auto",
    padding: "20px 24px 90px 24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  card: {
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "12px",
  },
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
    gap: "12px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  itemRow: {
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

const MEDIA_TYPE_OPTIONS: Array<{ value: MediaKind; label: string }> = [
  { value: "video", label: "Video" },
  { value: "pdf", label: "PDF" },
  { value: "image", label: "Images" },
  { value: "gif", label: "GIF" },
  { value: "audio", label: "Audio" },
  { value: "archive", label: "Archives" },
];

export function LinkAggregatorPage({
  aggregator,
  urlInput,
  onUrlInputChange,
  lang,
  onOpenTaskInViewer,
  onNotify,
}: {
  aggregator: AggregatorState;
  urlInput: string;
  onUrlInputChange: (val: string) => void;
  lang: LanguagePreference;
  onOpenTaskInViewer: (taskId: string) => void;
  onNotify: (msg: string) => void;
}) {
  const styles = useStyles();
  const [cookie, setCookie] = useState("");
  const [referer, setReferer] = useState("");
  const [formatsText, setFormatsText] = useState(aggregator.filter.formats.join(", "));

  const { filter } = aggregator;

  function toggleMediaType(kind: MediaKind) {
    const exists = filter.mediaTypes.includes(kind);
    const next = exists
      ? filter.mediaTypes.filter((m) => m !== kind)
      : [...filter.mediaTypes, kind];
    void api.updateAggregatorFilter({ mediaTypes: next });
  }

  async function handleStartCrawl() {
    const urls = urlInput
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) return;

    const customHeaders: Record<string, string> = {};
    if (cookie.trim()) customHeaders.Cookie = cookie.trim();
    if (referer.trim()) customHeaders.Referer = referer.trim();

    try {
      await api.aggregatorCrawl(urls, customHeaders);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to start aggregator");
    }
  }

  const maxTotalBytes = filter.maxTotalSizeMb > 0 ? filter.maxTotalSizeMb * 1024 * 1024 : 0;
  const quotaRatio = maxTotalBytes > 0 ? Math.min(1, aggregator.totalQueuedBytes / maxTotalBytes) : 0;

  return (
    <div className={styles.root}>
      <div>
        <Subtitle1>{t(lang, "aggregatorTitle")}</Subtitle1>
        <div>
          <Caption1>{t(lang, "aggregatorSubtitle")}</Caption1>
        </div>
      </div>

      <Card appearance="filled-alternative" className={styles.card}>
        <div className={styles.row} style={{ justifyContent: "space-between" }}>
          <Switch
            checked={filter.autoDownload}
            label={<Subtitle2>{t(lang, "aggregatorAutoToggle")}</Subtitle2>}
            onChange={(_, d) => void api.updateAggregatorFilter({ autoDownload: Boolean(d.checked) })}
          />
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <Badge appearance="tint" color="brand">
              {aggregator.capturedCount} {t(lang, "aggregatorCaptured")}
            </Badge>
            <Badge appearance="tint" color="success">
              {aggregator.queuedCount}
              {filter.maxItems > 0 ? ` / ${filter.maxItems}` : ""} {t(lang, "aggregatorQueued")}
            </Badge>
            <Badge appearance="outline">
              {toReadableSize(aggregator.totalQueuedBytes)}
              {filter.maxTotalSizeMb > 0 ? ` / ${filter.maxTotalSizeMb} MB` : ""}
            </Badge>
          </div>
        </div>

        {maxTotalBytes > 0 && <ProgressBar value={quotaRatio} thickness="medium" />}

        <Textarea
          rows={3}
          placeholder={t(lang, "aggregatorUrlPlaceholder")}
          value={urlInput}
          onChange={(_, d) => onUrlInputChange(d.value)}
        />

        <div className={styles.row}>
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

        <div className={styles.row}>
          {aggregator.isRunning ? (
            <Button appearance="primary" icon={<StopRegular />} onClick={() => void api.aggregatorStop()}>
              {t(lang, "aggregatorStop")}
            </Button>
          ) : (
            <Button
              appearance="primary"
              icon={<GlobeRegular />}
              disabled={!urlInput.trim()}
              onClick={() => void handleStartCrawl()}
            >
              {t(lang, "aggregatorStart")}
            </Button>
          )}

          <Button
            appearance="secondary"
            icon={<ArrowDownloadRegular />}
            disabled={!aggregator.items.some((i) => i.status === "discovered")}
            onClick={() => void api.queueAggregatedItems()}
          >
            {t(lang, "aggregatorQueueSelected")}
          </Button>

          <Button
            appearance="subtle"
            icon={<DeleteRegular />}
            disabled={aggregator.items.length === 0}
            onClick={() => void api.clearAggregatorItems()}
          >
            {t(lang, "aggregatorClear")}
          </Button>

          {aggregator.isRunning && <Spinner size="tiny" />}
        </div>
      </Card>

      <Card appearance="filled-alternative" className={styles.card}>
        <Label weight="semibold">{t(lang, "aggregatorMediaTypes")}</Label>
        <div className={styles.row}>
          {MEDIA_TYPE_OPTIONS.map((opt) => (
            <Checkbox
              key={opt.value}
              label={opt.label}
              checked={filter.mediaTypes.includes(opt.value)}
              onChange={() => toggleMediaType(opt.value)}
            />
          ))}
        </div>

        <Divider />

        <div className={styles.filterGrid}>
          <div className={styles.field}>
            <Label>{t(lang, "aggregatorFormats")}</Label>
            <Input
              size="small"
              placeholder="mp4, pdf, gif, png, mp3"
              value={formatsText}
              onChange={(_, d) => {
                setFormatsText(d.value);
                const list = d.value
                  .split(",")
                  .map((s) => s.trim().replace(/^\./, "").toLowerCase())
                  .filter(Boolean);
                void api.updateAggregatorFilter({ formats: list });
              }}
            />
          </div>

          <div className={styles.field}>
            <Label>{t(lang, "aggregatorQuality")}</Label>
            <Select
              size="small"
              value={filter.minQuality}
              onChange={(_, d) =>
                void api.updateAggregatorFilter({ minQuality: d.value as QualityTag })
              }
            >
              <option value="all">All / Todas</option>
              <option value="480p">480p+</option>
              <option value="720p">720p+ (HD)</option>
              <option value="1080p">1080p+ (FHD)</option>
              <option value="4k">4K / 2160p</option>
              <option value="original">Original</option>
            </Select>
          </div>

          <div className={styles.field}>
            <Label>{t(lang, "aggregatorMaxItems")}</Label>
            <Input
              size="small"
              type="number"
              min={0}
              value={String(filter.maxItems)}
              onChange={(_, d) =>
                void api.updateAggregatorFilter({ maxItems: Math.max(0, Number(d.value) || 0) })
              }
            />
          </div>

          <div className={styles.field}>
            <Label>{t(lang, "aggregatorMaxFileMb")}</Label>
            <Input
              size="small"
              type="number"
              min={0}
              value={String(filter.maxFileSizeMb)}
              onChange={(_, d) =>
                void api.updateAggregatorFilter({ maxFileSizeMb: Math.max(0, Number(d.value) || 0) })
              }
            />
          </div>

          <div className={styles.field}>
            <Label>{t(lang, "aggregatorMaxTotalMb")}</Label>
            <Input
              size="small"
              type="number"
              min={0}
              value={String(filter.maxTotalSizeMb)}
              onChange={(_, d) =>
                void api.updateAggregatorFilter({ maxTotalSizeMb: Math.max(0, Number(d.value) || 0) })
              }
            />
          </div>
        </div>
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {aggregator.items.map((item) => (
          <Card key={item.id} appearance="filled-alternative" className={styles.itemRow}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <Body1 style={{ fontWeight: 600 }}>{item.name}</Body1>
                <Badge appearance="tint" color="informative" size="small">
                  {item.mediaKind.toUpperCase()} · {item.format}
                </Badge>
                {item.quality !== "standard" && (
                  <Badge appearance="outline" size="small">{item.quality}</Badge>
                )}
                {item.fileSize > 0 && (
                  <Badge appearance="outline" size="small">{toReadableSize(item.fileSize)}</Badge>
                )}
                {item.isBlockedOrPartial && (
                  <Badge appearance="tint" color="warning" size="small">
                    {item.blockReason || t(lang, "partialBypassBadge")}
                  </Badge>
                )}
                <Badge
                  appearance="tint"
                  size="small"
                  color={
                    item.status === "queued"
                      ? "success"
                      : item.status === "discovered"
                        ? "brand"
                        : "warning"
                  }
                >
                  {item.status}
                </Badge>
              </div>
              <Caption1 style={{ wordBreak: "break-all" }}>{item.url}</Caption1>
            </div>

            <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
              {item.taskId ? (
                <Button
                  size="small"
                  appearance="subtle"
                  icon={<PlayRegular />}
                  onClick={() => onOpenTaskInViewer(item.taskId!)}
                >
                  {t(lang, "watchLive")}
                </Button>
              ) : (
                <Button
                  size="small"
                  appearance="primary"
                  icon={<ArrowDownloadRegular />}
                  onClick={() => void api.queueAggregatedItems([item.id])}
                >
                  {t(lang, "addAndStart")}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

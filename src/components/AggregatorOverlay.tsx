import {
  Badge,
  Button,
  Caption1,
  Card,
  ProgressBar,
  Spinner,
  Subtitle2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, DismissRegular, OpenRegular, StopRegular } from "@fluentui/react-icons";
import { api } from "../api";
import { t } from "../i18n";
import { toReadableSize } from "../shared/format";
import type { AggregatorState, LanguagePreference } from "../shared/types";

const useStyles = makeStyles({
  overlay: {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    zIndex: 9000,
    width: "330px",
    maxWidth: "calc(100vw - 32px)",
    padding: "14px 16px",
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorBrandStroke1}`,
    boxShadow: tokens.shadow28,
    borderRadius: tokens.borderRadiusLarge,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  counterRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "12px",
  },
  bigCount: {
    fontSize: "28px",
    fontWeight: 700,
    lineHeight: "32px",
    color: tokens.colorBrandForeground1,
    fontVariantNumeric: "tabular-nums",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
});

export function AggregatorOverlay({
  aggregator,
  lang,
  onOpenAggregator,
}: {
  aggregator: AggregatorState;
  lang: LanguagePreference;
  onOpenAggregator: () => void;
}) {
  const styles = useStyles();

  if (!aggregator.overlayVisible) {
    return null;
  }

  const maxTotalBytes =
    aggregator.filter.maxTotalSizeMb > 0 ? aggregator.filter.maxTotalSizeMb * 1024 * 1024 : 0;
  const ratio = maxTotalBytes > 0 ? Math.min(1, aggregator.totalQueuedBytes / maxTotalBytes) : 0;

  return (
    <Card className={styles.overlay}>
      <div className={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {aggregator.isRunning ? <Spinner size="tiny" /> : <ArrowDownloadRegular />}
          <Subtitle2>
            {aggregator.isRunning ? t(lang, "overlayCapturing") : t(lang, "overlayIdle")}
          </Subtitle2>
        </div>
        <Button
          size="small"
          appearance="subtle"
          icon={<DismissRegular />}
          onClick={() => void api.dismissAggregatorOverlay()}
        />
      </div>

      <div className={styles.counterRow}>
        <div>
          <span className={styles.bigCount}>{aggregator.capturedCount}</span>{" "}
          <Caption1>{t(lang, "aggregatorCaptured")}</Caption1>
        </div>
        <div style={{ textAlign: "right" }}>
          <Badge appearance="tint" color="success">
            {aggregator.queuedCount} {t(lang, "aggregatorQueued")}
          </Badge>
          <div>
            <Caption1>
              {toReadableSize(aggregator.totalQueuedBytes)}
              {aggregator.filter.maxTotalSizeMb > 0 ? ` / ${aggregator.filter.maxTotalSizeMb} MB` : ""}
            </Caption1>
          </div>
        </div>
      </div>

      {maxTotalBytes > 0 && <ProgressBar value={ratio} thickness="medium" />}

      <div className={styles.actions}>
        <Button
          size="small"
          appearance="primary"
          icon={<OpenRegular />}
          onClick={onOpenAggregator}
        >
          {t(lang, "overlayOpen")}
        </Button>
        {aggregator.isRunning && (
          <Button
            size="small"
            appearance="secondary"
            icon={<StopRegular />}
            onClick={() => void api.aggregatorStop()}
          >
            {t(lang, "aggregatorStop")}
          </Button>
        )}
      </div>
    </Card>
  );
}

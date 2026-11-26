import {
  Avatar,
  Badge,
  Button,
  Caption1,
  Card,
  Checkbox,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  ProgressBar,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  ArrowDownloadRegular,
  CopyRegular,
  DeleteRegular,
  DocumentRegular,
  EyeRegular,
  FingerprintRegular,
  FolderZipRegular,
  GlobeRegular,
  ImageRegular,
  MoreHorizontalRegular,
  MusicNote2Regular,
  PauseRegular,
  PlayRegular,
  VideoRegular,
} from "@fluentui/react-icons";
import { t } from "../i18n";
import { toEtaText, toReadableSize } from "../shared/format";
import type { Category, LanguagePreference, Task } from "../shared/types";

const useStyles = makeStyles({
  card: {
    position: "relative",
    padding: "12px 14px",
    overflow: "hidden",
    transitionProperty: "background-color, border-color",
    transitionDuration: "120ms",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  cardSelected: {
    border: `1px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  body: {
    minWidth: 0,
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minWidth: 0,
    flexWrap: "wrap",
  },
  title: {
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    fontWeight: 600,
    fontSize: "14px",
    lineHeight: "20px",
    cursor: "pointer",
    "&:hover": {
      color: tokens.colorBrandForeground1,
    },
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "10px",
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    gap: "4px",
  },
  progress: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 0,
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
  },
});

function pickTaskIcon(task: Task) {
  if (task.mediaKind === "video") return <VideoRegular />;
  if (task.mediaKind === "audio") return <MusicNote2Regular />;
  if (task.mediaKind === "image" || task.mediaKind === "gif") return <ImageRegular />;
  if (task.mediaKind === "archive" || task.packId === "zip_pack") return <FolderZipRegular />;
  if (task.mediaKind === "pdf" || task.packId === "arxiv_pack") return <DocumentRegular />;
  if (task.packId === "bittorrent_pack" || task.packId === "ed2k_pack") return <GlobeRegular />;
  return <ArrowDownloadRegular />;
}

function packLabel(packId: string): string {
  return packId.replace(/_pack$/, "").toUpperCase();
}

export function TaskCard({
  task,
  lang,
  categories,
  selectionMode,
  selected,
  onSelectToggle,
  onStart,
  onPause,
  onRedownload,
  onDelete,
  onOpenDetails,
  onOpenViewer,
  onCopyUrl,
}: {
  task: Task;
  lang: LanguagePreference;
  categories: Category[];
  selectionMode: boolean;
  selected: boolean;
  onSelectToggle: (extend: boolean) => void;
  onStart: () => void;
  onPause: () => void;
  onRedownload: () => void;
  onDelete: () => void;
  onOpenDetails: () => void;
  onOpenViewer: () => void;
  onCopyUrl: () => void;
}) {
  const styles = useStyles();
  const category = categories.find((c) => c.categoryId === task.category);
  const categoryName = category
    ? lang === "zh"
      ? category.nameZh
      : lang === "pt"
        ? category.namePt || category.name
        : category.name
    : "";

  const isRunning = task.status === "running";
  const isWaiting = task.status === "waiting";
  const isPaused = task.status === "paused";
  const isCompleted = task.status === "completed";
  const isFailed = task.status === "failed";
  const canViewInApp =
    !task.isSimulated &&
    (task.isFileAvailable || isRunning || isCompleted) &&
    ["video", "pdf", "image", "gif", "audio"].includes(task.mediaKind);

  const statusText = (() => {
    switch (task.status) {
      case "running":
        return `${toReadableSize(task.speed)}/s · ETA ${toEtaText(task.fileSize, task.receivedBytes, task.speed)}`;
      case "waiting":
        return t(lang, "statusWaiting");
      case "paused":
        return t(lang, "statusPaused");
      case "completed":
        return t(lang, "statusCompleted");
      case "failed":
        return `${t(lang, "statusFailed")}${task.error ? `: ${task.error}` : ""}`;
    }
  })();

  const sizeText =
    task.fileSize > 0
      ? isCompleted
        ? toReadableSize(task.fileSize)
        : `${toReadableSize(task.receivedBytes)} / ${toReadableSize(task.fileSize)} (${task.progress.toFixed(1)}%)`
      : task.receivedBytes > 0
        ? toReadableSize(task.receivedBytes)
        : "--";

  const progressValue = isWaiting
    ? undefined
    : task.fileSize > 0
      ? Math.max(0, Math.min(1, task.progress / 100))
      : isRunning
        ? undefined
        : 0;

  const progressColor = isPaused ? "warning" : isFailed ? "error" : "brand";

  return (
    <Card
      appearance="filled-alternative"
      className={`${styles.card}${selected ? ` ${styles.cardSelected}` : ""}`}
    >
      <div className={styles.row}>
        {selectionMode && (
          <Checkbox
            checked={selected}
            onClick={(e) => {
              e.stopPropagation();
              onSelectToggle(e.shiftKey);
            }}
          />
        )}

        <Avatar
          color="colorful"
          idForColor={task.taskId}
          shape="square"
          size={36}
          icon={pickTaskIcon(task)}
        />

        <div className={styles.body}>
          <div className={styles.titleRow}>
            <span className={styles.title} onClick={onOpenDetails} title={task.name}>
              {task.name}
            </span>
            <Badge appearance="tint" color="informative" size="small">
              {packLabel(task.packId)}
            </Badge>
            {categoryName && (
              <Badge appearance="outline" size="small">
                {categoryName}
              </Badge>
            )}
            {task.isPartialBypass && (
              <Badge appearance="tint" color="success" size="small">
                {t(lang, "partialBypassBadge")}
              </Badge>
            )}
            {task.isSimulated && (
              <Badge appearance="tint" color="warning" size="small">
                {t(lang, "simulatedBadge")}
              </Badge>
            )}
          </div>

          <div className={styles.metaRow}>
            <Caption1 className={isFailed ? styles.errorText : undefined}>{statusText}</Caption1>
            <Caption1>•</Caption1>
            <Caption1>{sizeText}</Caption1>
            {task.canUseRangeRequests && !isCompleted && (
              <>
                <Caption1>•</Caption1>
                <Caption1>{t(lang, "resumableBadge")}</Caption1>
              </>
            )}
          </div>
        </div>

        <div className={styles.actions}>
          {canViewInApp && (
            <Tooltip content={t(lang, "watchLive")} relationship="label">
              <Button appearance="secondary" icon={<EyeRegular />} size="small" onClick={onOpenViewer}>
                {isRunning && task.mediaKind === "video" ? "LIVE" : undefined}
              </Button>
            </Tooltip>
          )}

          {isRunning ? (
            <Tooltip content={t(lang, "pause")} relationship="label">
              <Button appearance="primary" icon={<PauseRegular />} size="small" onClick={onPause} />
            </Tooltip>
          ) : !isCompleted ? (
            <Tooltip content={t(lang, "resume")} relationship="label">
              <Button appearance="primary" icon={<PlayRegular />} size="small" onClick={onStart} />
            </Tooltip>
          ) : null}

          {isCompleted && !task.isSimulated && (
            <Tooltip content={t(lang, "saveFile")} relationship="label">
              <Button
                as="a"
                href={`/api/tasks/${task.taskId}/file`}
                download={task.name}
                appearance="subtle"
                icon={<ArrowDownloadRegular />}
                size="small"
              />
            </Tooltip>
          )}

          <Tooltip content={t(lang, "details")} relationship="label">
            <Button appearance="subtle" icon={<FingerprintRegular />} size="small" onClick={onOpenDetails} />
          </Tooltip>

          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button appearance="subtle" icon={<MoreHorizontalRegular />} size="small" />
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem icon={<CopyRegular />} onClick={onCopyUrl}>
                  {t(lang, "copyUrl")}
                </MenuItem>
                <MenuItem icon={<ArrowClockwiseRegular />} onClick={onRedownload}>
                  {t(lang, "redownload")}
                </MenuItem>
                <MenuItem icon={<DeleteRegular />} onClick={onDelete}>
                  {t(lang, "delete")}
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        </div>
      </div>

      {!isCompleted && (
        <ProgressBar
          className={styles.progress}
          color={progressColor}
          thickness="medium"
          value={progressValue}
        />
      )}
    </Card>
  );
}

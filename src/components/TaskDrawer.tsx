import { useState } from "react";
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Divider,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Input,
  Label,
  OverlayDrawer,
  Select,
  Subtitle2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  CheckmarkCircleRegular,
  DismissRegular,
  ErrorCircleRegular,
  FingerprintRegular,
  SaveRegular,
} from "@fluentui/react-icons";
import { api } from "../api";
import { t } from "../i18n";
import { toReadableSize } from "../shared/format";
import type { Category, LanguagePreference, Task } from "../shared/types";

const useStyles = makeStyles({
  body: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    paddingTop: "12px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  row: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  codeBox: {
    fontFamily: "monospace",
    fontSize: "12px",
    wordBreak: "break-all",
    padding: "8px 10px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  verifyOk: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: tokens.colorPaletteGreenForeground1,
  },
  verifyBad: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: tokens.colorPaletteRedForeground1,
  },
});

const ALGORITHMS: Array<"md5" | "sha1" | "sha256" | "sha512"> = ["md5", "sha1", "sha256", "sha512"];

export function TaskDrawer({
  task,
  lang,
  categories,
  onClose,
  onNotify,
}: {
  task: Task | null;
  lang: LanguagePreference;
  categories: Category[];
  onClose: () => void;
  onNotify: (msg: string) => void;
}) {
  const styles = useStyles();
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  const [selectedAlgo, setSelectedAlgo] = useState<"md5" | "sha1" | "sha256" | "sha512">("sha256");
  const [expectedHash, setExpectedHash] = useState("");
  const [computing, setComputing] = useState(false);

  if (task && initializedFor !== task.taskId) {
    setInitializedFor(task.taskId);
    setEditName(task.name);
    setEditCategory(task.category);
    setExpectedHash("");
  }

  if (!task) {
    return null;
  }

  const currentDigest = task.checksums[selectedAlgo] || "";
  const normalizedExpected = expectedHash.trim().toLowerCase();
  const matches = Boolean(currentDigest && normalizedExpected && currentDigest.toLowerCase() === normalizedExpected);
  const mismatches = Boolean(currentDigest && normalizedExpected && currentDigest.toLowerCase() !== normalizedExpected);

  async function handleSaveMeta() {
    if (!task) return;
    try {
      await api.editTask(task.taskId, { name: editName, category: editCategory });
      onNotify(t(lang, "save"));
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function handleCompute() {
    if (!task) return;
    setComputing(true);
    try {
      await api.computeChecksum(task.taskId, selectedAlgo);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to compute checksum");
    } finally {
      setComputing(false);
    }
  }

  return (
    <OverlayDrawer open={Boolean(task)} position="end" size="medium" onOpenChange={(_, data) => !data.open && onClose()}>
      <DrawerHeader>
        <DrawerHeaderTitle
          action={
            <Button appearance="subtle" aria-label={t(lang, "close")} icon={<DismissRegular />} onClick={onClose} />
          }
        >
          {t(lang, "taskDetails")}
        </DrawerHeaderTitle>
      </DrawerHeader>

      <DrawerBody>
        <div className={styles.body}>
          <div className={styles.field}>
            <Label weight="semibold">{t(lang, "fileName")}</Label>
            <div className={styles.row}>
              <Input
                style={{ flex: 1 }}
                value={editName}
                onChange={(_, d) => setEditName(d.value)}
              />
              <Button appearance="primary" icon={<SaveRegular />} onClick={handleSaveMeta}>
                {t(lang, "save")}
              </Button>
            </div>
          </div>

          <div className={styles.field}>
            <Label weight="semibold">{t(lang, "category")}</Label>
            <Select
              value={editCategory}
              onChange={(_, d) => {
                setEditCategory(d.value);
                void api.editTask(task.taskId, { category: d.value });
              }}
            >
              <option value="">{t(lang, "uncategorized")}</option>
              {categories.map((cat) => (
                <option key={cat.categoryId} value={cat.categoryId}>
                  {lang === "zh" ? cat.nameZh : lang === "pt" ? cat.namePt || cat.name : cat.name}
                </option>
              ))}
            </Select>
          </div>

          <div className={styles.row}>
            <Badge appearance="tint" color="informative">{task.packId}</Badge>
            <Badge appearance="outline">{toReadableSize(task.fileSize || task.receivedBytes)}</Badge>
            <Badge appearance="outline">{task.status.toUpperCase()}</Badge>
          </div>

          <div className={styles.field}>
            <Label weight="semibold">URL</Label>
            <div className={styles.codeBox}>{task.url}</div>
            {task.resolvedUrl && task.resolvedUrl !== task.url && (
              <>
                <Caption1>Resolved URL</Caption1>
                <div className={styles.codeBox}>{task.resolvedUrl}</div>
              </>
            )}
          </div>

          {task.status === "completed" && !task.isSimulated && (
            <Button
              as="a"
              href={`/api/tasks/${task.taskId}/file`}
              download={task.name}
              appearance="primary"
              icon={<ArrowDownloadRegular />}
            >
              {t(lang, "saveFile")} ({task.name})
            </Button>
          )}

          <Divider />

          <div className={styles.field}>
            <Subtitle2>{t(lang, "checksumTitle")}</Subtitle2>
            <div className={styles.row}>
              <Select
                value={selectedAlgo}
                onChange={(_, d) => setSelectedAlgo(d.value as typeof selectedAlgo)}
              >
                {ALGORITHMS.map((algo) => (
                  <option key={algo} value={algo}>{algo.toUpperCase()}</option>
                ))}
              </Select>
              <Button
                appearance="secondary"
                icon={<FingerprintRegular />}
                disabled={computing || task.status !== "completed"}
                onClick={handleCompute}
              >
                {t(lang, "computeChecksum")}
              </Button>
            </div>

            {currentDigest && (
              <div className={styles.codeBox}>{currentDigest}</div>
            )}

            <Input
              placeholder={t(lang, "verifyPlaceholder")}
              value={expectedHash}
              onChange={(_, d) => setExpectedHash(d.value)}
            />

            {matches && (
              <div className={styles.verifyOk}>
                <CheckmarkCircleRegular />
                <Body1>{t(lang, "checksumMatch")}</Body1>
              </div>
            )}
            {mismatches && (
              <div className={styles.verifyBad}>
                <ErrorCircleRegular />
                <Body1>{t(lang, "checksumMismatch")}</Body1>
              </div>
            )}
          </div>
        </div>
      </DrawerBody>
    </OverlayDrawer>
  );
}

import { useMemo, useState } from "react";
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Divider,
  Input,
  Menu,
  MenuDivider,
  MenuItem,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Subtitle2,
  Tab,
  TabList,
  ToggleButton,
  Toolbar,
  ToolbarButton,
  ToolbarDivider,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  AddRegular,
  ArrowClockwiseRegular,
  ArrowDownloadRegular,
  ArrowSortDownRegular,
  ArrowSortUpRegular,
  ArrowUpRegular,
  CheckmarkSquareRegular,
  ClockRegular,
  CopyRegular,
  DeleteRegular,
  DismissRegular,
  FilterRegular,
  GaugeRegular,
  PauseRegular,
  PlayRegular,
  SelectAllOnRegular,
  TagRegular,
} from "@fluentui/react-icons";
import { api } from "../api";
import { t } from "../i18n";
import { toReadableSize } from "../shared/format";
import type {
  AppSettings,
  Category,
  LanguagePreference,
  PlanAction,
  PlanState,
  Task,
} from "../shared/types";
import { TaskCard } from "./TaskCard";

type FilterMode = "all" | "active" | "completed";
type SortField = "createdAt" | "completedAt" | "name" | "size" | "queue";

const useStyles = makeStyles({
  root: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  toolBar: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "8px",
    padding: "10px 20px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  speedBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 10px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    fontSize: "12px",
    fontWeight: 600,
  },
  spacer: {
    flex: 1,
  },
  listScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 20px 80px 20px",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  emptyBox: {
    margin: "48px auto",
    maxWidth: "420px",
    padding: "32px 24px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: "10px",
  },
  emptyIcon: {
    fontSize: "44px",
    color: tokens.colorBrandForeground1,
  },
  commandBar: {
    position: "absolute",
    bottom: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 20,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow16,
    padding: "6px 10px",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    maxWidth: "95%",
    overflowX: "auto",
  },
});

export function TaskPage({
  tasks,
  waitingOrder,
  globalSpeed,
  settings,
  categories,
  plan,
  searchText,
  onNewTask,
  onOpenDetails,
  onOpenViewer,
  onNotify,
}: {
  tasks: Task[];
  waitingOrder: string[];
  globalSpeed: number;
  settings: AppSettings;
  categories: Category[];
  plan: PlanState;
  searchText: string;
  onNewTask: () => void;
  onOpenDetails: (taskId: string) => void;
  onOpenViewer: (taskId: string) => void;
  onNotify: (msg: string) => void;
}) {
  const styles = useStyles();
  const lang: LanguagePreference = settings.language;

  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const [speedInputKb, setSpeedInputKb] = useState(String(Math.round(settings.speedLimitation / 1024)));

  const visibleTasks = useMemo(() => {
    let list = [...tasks];

    if (filterMode === "active") {
      list = list.filter((tItem) => ["running", "waiting", "paused"].includes(tItem.status));
    } else if (filterMode === "completed") {
      list = list.filter((tItem) => ["completed", "failed"].includes(tItem.status));
    }

    if (categoryFilter) {
      list = list.filter((tItem) => tItem.category === categoryFilter);
    }

    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(
        (tItem) => tItem.name.toLowerCase().includes(q) || tItem.url.toLowerCase().includes(q),
      );
    }

    const dir = sortAsc ? 1 : -1;
    list.sort((a, b) => {
      if (sortField === "name") {
        return a.name.localeCompare(b.name) * dir;
      }
      if (sortField === "size") {
        return (a.fileSize - b.fileSize) * dir;
      }
      if (sortField === "completedAt") {
        return ((a.completedAt || 0) - (b.completedAt || 0)) * dir;
      }
      if (sortField === "queue") {
        const idxA = a.status === "running" ? -2 : waitingOrder.indexOf(a.taskId);
        const idxB = b.status === "running" ? -2 : waitingOrder.indexOf(b.taskId);
        const normA = idxA === -1 ? 999999 : idxA;
        const normB = idxB === -1 ? 999999 : idxB;
        return (normA - normB) * (sortAsc ? -1 : 1);
      }
      return (a.createdAt - b.createdAt) * dir;
    });

    return list;
  }, [tasks, waitingOrder, filterMode, categoryFilter, searchText, sortField, sortAsc]);

  function toggleSelection(taskId: string, extend: boolean) {
    if (!selectionMode) setSelectionMode(true);
    const next = new Set(selectedIds);

    if (extend && selectionAnchor) {
      const ids = visibleTasks.map((x) => x.taskId);
      const a = ids.indexOf(selectionAnchor);
      const b = ids.indexOf(taskId);
      if (a >= 0 && b >= 0) {
        next.clear();
        for (let i = Math.min(a, b); i <= Math.max(a, b); i += 1) {
          next.add(ids[i]);
        }
        setSelectedIds(next);
        return;
      }
    }

    if (next.has(taskId)) {
      next.delete(taskId);
    } else {
      next.add(taskId);
      setSelectionAnchor(taskId);
    }
    setSelectedIds(next);
    if (next.size === 0) {
      setSelectionMode(false);
    }
  }

  function handleSelectAll() {
    setSelectedIds(new Set(visibleTasks.map((x) => x.taskId)));
  }

  function handleInvertSelection() {
    const next = new Set<string>();
    for (const item of visibleTasks) {
      if (!selectedIds.has(item.taskId)) next.add(item.taskId);
    }
    setSelectedIds(next);
  }

  function handleSelectMissing() {
    const next = new Set<string>();
    for (const item of visibleTasks) {
      if (item.status === "completed" && !item.isFileAvailable && !item.isSimulated) {
        next.add(item.taskId);
      }
    }
    setSelectedIds(next);
  }

  async function handleCopyUrls(urls: string[]) {
    try {
      await navigator.clipboard.writeText(urls.join("\n"));
      onNotify(t(lang, "copied"));
    } catch {
      onNotify("Clipboard unavailable");
    }
  }

  const speedText = settings.isSpeedLimitEnabled
    ? `${toReadableSize(globalSpeed)}/s / ${toReadableSize(settings.speedLimitation)}/s`
    : `${toReadableSize(globalSpeed)}/s`;

  const sortLabelMap: Record<SortField, string> = {
    createdAt: t(lang, "sortByCreated"),
    completedAt: t(lang, "sortByCompleted"),
    name: t(lang, "sortByName"),
    size: t(lang, "sortBySize"),
    queue: t(lang, "sortByQueue"),
  };

  return (
    <div className={styles.root}>
      <div className={styles.toolBar}>
        <TabList
          size="small"
          selectedValue={filterMode}
          onTabSelect={(_, d) => setFilterMode(d.value as FilterMode)}
        >
          <Tab value="all">{t(lang, "filterAll")}</Tab>
          <Tab value="active">{t(lang, "filterActive")}</Tab>
          <Tab value="completed">{t(lang, "filterCompleted")}</Tab>
        </TabList>

        <Button appearance="primary" size="small" icon={<AddRegular />} onClick={onNewTask}>
          {t(lang, "navNewTask")}
        </Button>
        <Button appearance="subtle" size="small" icon={<PlayRegular />} onClick={() => void api.startAll()}>
          {t(lang, "startAll")}
        </Button>
        <Button appearance="subtle" size="small" icon={<PauseRegular />} onClick={() => void api.pauseAll()}>
          {t(lang, "pauseAll")}
        </Button>

        <Tooltip content={t(lang, "selectTasks")} relationship="label">
          <ToggleButton
            size="small"
            icon={<CheckmarkSquareRegular />}
            checked={selectionMode}
            onClick={() => {
              const next = !selectionMode;
              setSelectionMode(next);
              if (!next) setSelectedIds(new Set());
            }}
          />
        </Tooltip>

        <Menu
          checkedValues={{ plan: [plan.action ?? "none"] }}
          onCheckedValueChange={(_, d) => {
            const val = d.checkedItems[0];
            void api.setPlan(val === "none" ? null : (val as PlanAction));
          }}
        >
          <MenuTrigger disableButtonEnhancement>
            <Tooltip content={t(lang, "planTask")} relationship="label">
              <ToggleButton
                size="small"
                icon={<ClockRegular />}
                checked={plan.action !== null}
              />
            </Tooltip>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItemRadio name="plan" value="none">{t(lang, "planNone")}</MenuItemRadio>
              <MenuItemRadio name="plan" value="notify">{t(lang, "planNotify")}</MenuItemRadio>
              <MenuItemRadio name="plan" value="clear_completed">{t(lang, "planClearCompleted")}</MenuItemRadio>
            </MenuList>
          </MenuPopover>
        </Menu>

        <Popover>
          <PopoverTrigger disableButtonEnhancement>
            <Tooltip content={t(lang, "speedLimit")} relationship="label">
              <ToggleButton
                size="small"
                icon={<GaugeRegular />}
                checked={settings.isSpeedLimitEnabled}
                onClick={() => {
                  setSpeedInputKb(String(Math.round(settings.speedLimitation / 1024)));
                }}
              />
            </Tooltip>
          </PopoverTrigger>
          <PopoverSurface>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "220px" }}>
              <Subtitle2>{t(lang, "speedLimit")}</Subtitle2>
              <Caption1>{t(lang, "speedLimitDesc")}</Caption1>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <Input
                  type="number"
                  min={1}
                  max={102400}
                  value={speedInputKb}
                  onChange={(_, d) => setSpeedInputKb(d.value)}
                  contentAfter="KB/s"
                  style={{ width: "140px" }}
                />
                <Button
                  appearance="primary"
                  size="small"
                  onClick={() => {
                    const kb = Math.max(1, Number(speedInputKb) || 512);
                    void api.updateSettings({
                      isSpeedLimitEnabled: true,
                      speedLimitation: kb * 1024,
                    });
                  }}
                >
                  {t(lang, "save")}
                </Button>
              </div>
              <Button
                size="small"
                appearance="subtle"
                onClick={() =>
                  void api.updateSettings({ isSpeedLimitEnabled: !settings.isSpeedLimitEnabled })
                }
              >
                {settings.isSpeedLimitEnabled ? "Disable Speed Limit" : "Enable Speed Limit"}
              </Button>
            </div>
          </PopoverSurface>
        </Popover>

        <div className={styles.speedBadge}>
          <GaugeRegular />
          <span>{speedText}</span>
        </div>

        <div className={styles.spacer} />

        <Menu
          checkedValues={{
            field: [sortField],
            dir: [sortAsc ? "asc" : "desc"],
          }}
          onCheckedValueChange={(_, d) => {
            if (d.name === "field") setSortField(d.checkedItems[0] as SortField);
            if (d.name === "dir") setSortAsc(d.checkedItems[0] === "asc");
          }}
        >
          <MenuTrigger disableButtonEnhancement>
            <Button
              size="small"
              appearance="subtle"
              icon={sortAsc ? <ArrowSortUpRegular /> : <ArrowSortDownRegular />}
            >
              {sortLabelMap[sortField]}
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItemRadio name="field" value="createdAt">{t(lang, "sortByCreated")}</MenuItemRadio>
              <MenuItemRadio name="field" value="completedAt">{t(lang, "sortByCompleted")}</MenuItemRadio>
              <MenuItemRadio name="field" value="name">{t(lang, "sortByName")}</MenuItemRadio>
              <MenuItemRadio name="field" value="size">{t(lang, "sortBySize")}</MenuItemRadio>
              <MenuItemRadio name="field" value="queue">{t(lang, "sortByQueue")}</MenuItemRadio>
              <MenuDivider />
              <MenuItemRadio name="dir" value="asc">{t(lang, "sortAsc")}</MenuItemRadio>
              <MenuItemRadio name="dir" value="desc">{t(lang, "sortDesc")}</MenuItemRadio>
            </MenuList>
          </MenuPopover>
        </Menu>

        {settings.isCategoryEnabled && (
          <Menu
            checkedValues={{ cat: [categoryFilter] }}
            onCheckedValueChange={(_, d) => setCategoryFilter(d.checkedItems[0] ?? "")}
          >
            <MenuTrigger disableButtonEnhancement>
              <Button size="small" appearance="subtle" icon={<FilterRegular />}>
                {categoryFilter
                  ? (() => {
                      const found = categories.find((c) => c.categoryId === categoryFilter);
                      return found
                        ? lang === "zh"
                          ? found.nameZh
                          : lang === "pt"
                            ? found.namePt || found.name
                            : found.name
                        : t(lang, "allCategories");
                    })()
                  : t(lang, "allCategories")}
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItemRadio name="cat" value="">{t(lang, "allCategories")}</MenuItemRadio>
                <MenuDivider />
                {categories.map((cat) => (
                  <MenuItemRadio key={cat.categoryId} name="cat" value={cat.categoryId}>
                    {lang === "zh" ? cat.nameZh : lang === "pt" ? cat.namePt || cat.name : cat.name}
                  </MenuItemRadio>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
        )}
      </div>

      <div className={styles.listScroll}>
        {visibleTasks.length === 0 ? (
          <div className={styles.emptyBox}>
            <ArrowDownloadRegular className={styles.emptyIcon} />
            <Subtitle2>
              {tasks.length === 0 ? t(lang, "emptyTasksTitle") : t(lang, "emptyFilteredTitle")}
            </Subtitle2>
            <Body1>
              {tasks.length === 0 ? t(lang, "emptyTasksDesc") : t(lang, "emptyFilteredDesc")}
            </Body1>
            {tasks.length === 0 && (
              <Button appearance="primary" icon={<AddRegular />} onClick={onNewTask}>
                {t(lang, "navNewTask")}
              </Button>
            )}
          </div>
        ) : (
          <div className={styles.list}>
            {visibleTasks.map((task) => (
              <TaskCard
                key={task.taskId}
                task={task}
                lang={lang}
                categories={categories}
                selectionMode={selectionMode}
                selected={selectedIds.has(task.taskId)}
                onSelectToggle={(extend) => toggleSelection(task.taskId, extend)}
                onStart={() => void api.startTask(task.taskId)}
                onPause={() => void api.pauseTask(task.taskId)}
                onRedownload={() => void api.redownloadTask(task.taskId)}
                onDelete={() => void api.deleteTask(task.taskId, true)}
                onOpenDetails={() => onOpenDetails(task.taskId)}
                onOpenViewer={() => onOpenViewer(task.taskId)}
                onCopyUrl={() => void handleCopyUrls([task.url])}
              />
            ))}
          </div>
        )}
      </div>

      {selectionMode && (
        <Toolbar className={styles.commandBar} size="small">
          <Badge appearance="tint" color="brand" style={{ marginRight: "4px" }}>
            {selectedIds.size} {t(lang, "selectedCount")}
          </Badge>
          <ToolbarButton
            icon={<ArrowUpRegular />}
            disabled={selectedIds.size === 0}
            onClick={() => {
              void api.batchAction({ action: "move_to_front", taskIds: Array.from(selectedIds) });
              setSelectionMode(false);
              setSelectedIds(new Set());
            }}
          >
            {t(lang, "moveToFront")}
          </ToolbarButton>
          <ToolbarButton
            icon={<ArrowClockwiseRegular />}
            disabled={selectedIds.size === 0}
            onClick={() => {
              void api.batchAction({ action: "redownload", taskIds: Array.from(selectedIds) });
              setSelectionMode(false);
              setSelectedIds(new Set());
            }}
          >
            {t(lang, "redownload")}
          </ToolbarButton>
          <ToolbarButton
            icon={<DeleteRegular />}
            disabled={selectedIds.size === 0}
            onClick={() => {
              void api.batchAction({ action: "delete", taskIds: Array.from(selectedIds), deleteFiles: true });
              setSelectionMode(false);
              setSelectedIds(new Set());
            }}
          >
            {t(lang, "delete")}
          </ToolbarButton>
          <ToolbarButton
            icon={<CopyRegular />}
            disabled={selectedIds.size === 0}
            onClick={() => {
              const urls = visibleTasks.filter((x) => selectedIds.has(x.taskId)).map((x) => x.url);
              void handleCopyUrls(urls);
            }}
          >
            {t(lang, "copyUrl")}
          </ToolbarButton>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <ToolbarButton icon={<TagRegular />} disabled={selectedIds.size === 0}>
                {t(lang, "moveCategory")}
              </ToolbarButton>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem
                  onClick={() => {
                    void api.batchAction({
                      action: "set_category",
                      taskIds: Array.from(selectedIds),
                      category: "",
                    });
                    setSelectionMode(false);
                    setSelectedIds(new Set());
                  }}
                >
                  {t(lang, "uncategorized")}
                </MenuItem>
                <Divider />
                {categories.map((cat) => (
                  <MenuItem
                    key={cat.categoryId}
                    onClick={() => {
                      void api.batchAction({
                        action: "set_category",
                        taskIds: Array.from(selectedIds),
                        category: cat.categoryId,
                      });
                      setSelectionMode(false);
                      setSelectedIds(new Set());
                    }}
                  >
                    {lang === "zh" ? cat.nameZh : lang === "pt" ? cat.namePt || cat.name : cat.name}
                  </MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
          <ToolbarDivider />
          <ToolbarButton icon={<SelectAllOnRegular />} onClick={handleSelectAll}>
            {t(lang, "selectAll")}
          </ToolbarButton>
          <ToolbarButton onClick={handleSelectMissing}>{t(lang, "selectMissing")}</ToolbarButton>
          <ToolbarButton onClick={handleInvertSelection}>{t(lang, "invertSelection")}</ToolbarButton>
          <ToolbarButton
            icon={<DismissRegular />}
            onClick={() => {
              setSelectionMode(false);
              setSelectedIds(new Set());
            }}
          >
            {t(lang, "cancelSelection")}
          </ToolbarButton>
        </Toolbar>
      )}
    </div>
  );
}

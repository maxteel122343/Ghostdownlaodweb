import { useRef } from "react";
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Card,
  Input,
  Select,
  Slider,
  Subtitle1,
  Subtitle2,
  Switch,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  CopyRegular,
  GlobeRegular,
  InfoRegular,
  LinkRegular,
  PaintBrushRegular,
  SettingsRegular,
  ShieldCheckmarkRegular,
} from "@fluentui/react-icons";
import { api } from "../api";
import { t } from "../i18n";
import type { AppSettings, Category, LanguagePreference, NameConflictMode, ThemePreference } from "../shared/types";

const useStyles = makeStyles({
  layout: {
    display: "flex",
    height: "100%",
    overflow: "hidden",
  },
  scroll: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 24px 48px 24px",
  },
  inner: {
    maxWidth: "820px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  group: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "4px",
  },
  card: {
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  cardInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  cardControl: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
  },
  navRail: {
    width: "180px",
    padding: "20px 12px",
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    flexShrink: 0,
    "@media (max-width: 860px)": {
      display: "none",
    },
  },
  catRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "6px",
  },
});

export function SettingPage({
  settings,
  categories,
  version,
  onNotify,
}: {
  settings: AppSettings;
  categories: Category[];
  version: string;
  onNotify: (msg: string) => void;
}) {
  const styles = useStyles();
  const lang: LanguagePreference = settings.language;

  const generalRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<HTMLDivElement>(null);
  const browserRef = useRef<HTMLDivElement>(null);
  const aria2Ref = useRef<HTMLDivElement>(null);
  const personalRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { key: "general", label: t(lang, "settingsGeneral"), ref: generalRef },
    { key: "network", label: t(lang, "settingsNetwork"), ref: networkRef },
    { key: "browser", label: t(lang, "settingsBrowser"), ref: browserRef },
    { key: "aria2", label: t(lang, "settingsAria2"), ref: aria2Ref },
    { key: "personal", label: t(lang, "settingsPersonal"), ref: personalRef },
    { key: "about", label: t(lang, "settingsAbout"), ref: aboutRef },
  ];

  async function copyText(val: string) {
    try {
      await navigator.clipboard.writeText(val);
      onNotify(t(lang, "copied"));
    } catch {
      onNotify("Clipboard unavailable");
    }
  }

  return (
    <div className={styles.layout}>
      <div className={styles.scroll}>
        <div className={styles.inner}>
          <section ref={generalRef} className={styles.group}>
            <div className={styles.groupHeader}>
              <SettingsRegular fontSize={20} />
              <Subtitle1>{t(lang, "settingsGeneral")}</Subtitle1>
            </div>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>{t(lang, "maxTaskNum")}</Subtitle2>
                <Caption1>{t(lang, "maxTaskNumDesc")}</Caption1>
              </div>
              <div className={styles.cardControl}>
                <Slider
                  min={1}
                  max={10}
                  value={settings.maxTaskNum}
                  onChange={(_, d) => void api.updateSettings({ maxTaskNum: d.value })}
                />
                <Badge appearance="tint" color="brand">{settings.maxTaskNum}</Badge>
              </div>
            </Card>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>{t(lang, "preBlockNum")}</Subtitle2>
                <Caption1>{t(lang, "preBlockNumDesc")}</Caption1>
              </div>
              <div className={styles.cardControl}>
                <Slider
                  min={1}
                  max={64}
                  value={settings.preBlockNum}
                  onChange={(_, d) => void api.updateSettings({ preBlockNum: d.value })}
                />
                <Badge appearance="tint" color="brand">{settings.preBlockNum}</Badge>
              </div>
            </Card>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>{t(lang, "autoSpeedUp")}</Subtitle2>
                <Caption1>{t(lang, "autoSpeedUpDesc")}</Caption1>
              </div>
              <Switch
                checked={settings.autoSpeedUp}
                onChange={(_, d) => void api.updateSettings({ autoSpeedUp: Boolean(d.checked) })}
              />
            </Card>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>{t(lang, "enableSpeedLimit")}</Subtitle2>
                <Caption1>{t(lang, "speedLimitValue")}</Caption1>
              </div>
              <div className={styles.cardControl}>
                <Input
                  type="number"
                  style={{ width: "110px" }}
                  value={String(Math.round(settings.speedLimitation / 1024))}
                  onChange={(_, d) => {
                    const kb = Math.max(1, Number(d.value) || 512);
                    void api.updateSettings({ speedLimitation: kb * 1024 });
                  }}
                />
                <Switch
                  checked={settings.isSpeedLimitEnabled}
                  onChange={(_, d) => void api.updateSettings({ isSpeedLimitEnabled: Boolean(d.checked) })}
                />
              </div>
            </Card>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>{t(lang, "nameConflict")}</Subtitle2>
              </div>
              <Select
                value={settings.nameConflict}
                onChange={(_, d) =>
                  void api.updateSettings({ nameConflict: d.value as NameConflictMode })
                }
              >
                <option value="keepBoth">{t(lang, "keepBoth")}</option>
                <option value="overwrite">{t(lang, "overwrite")}</option>
                <option value="ask">{t(lang, "ask")}</option>
              </Select>
            </Card>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>{t(lang, "autoCategorize")}</Subtitle2>
                <Caption1>{t(lang, "autoCategorizeDesc")}</Caption1>
                <div className={styles.catRow}>
                  {categories.map((c) => (
                    <Badge key={c.categoryId} appearance="outline" size="small">
                      {lang === "zh" ? c.nameZh : lang === "pt" ? c.namePt || c.name : c.name} ({c.extensions.length})
                    </Badge>
                  ))}
                </div>
              </div>
              <div className={styles.cardControl}>
                <Button size="small" onClick={() => void api.resetCategories()}>
                  {t(lang, "resetCategories")}
                </Button>
                <Switch
                  checked={settings.isCategoryEnabled}
                  onChange={(_, d) => void api.updateSettings({ isCategoryEnabled: Boolean(d.checked) })}
                />
              </div>
            </Card>
          </section>

          <section ref={networkRef} className={styles.group}>
            <div className={styles.groupHeader}>
              <GlobeRegular fontSize={20} />
              <Subtitle1>{t(lang, "settingsNetwork")}</Subtitle1>
            </div>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>{t(lang, "proxyServer")}</Subtitle2>
                <Caption1>Auto / Off / http://host:port</Caption1>
              </div>
              <Input
                style={{ width: "220px" }}
                value={settings.proxyServer}
                onChange={(_, d) => void api.updateSettings({ proxyServer: d.value })}
              />
            </Card>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>{t(lang, "verifySsl")}</Subtitle2>
              </div>
              <Switch
                checked={settings.shouldVerifySsl}
                onChange={(_, d) => void api.updateSettings({ shouldVerifySsl: Boolean(d.checked) })}
              />
            </Card>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>{t(lang, "clientProfile")}</Subtitle2>
              </div>
              <Select
                value={settings.clientProfile}
                onChange={(_, d) => void api.updateSettings({ clientProfile: d.value })}
              >
                <option value="auto">Auto (Browser TLS)</option>
                <option value="chrome">Chrome 135</option>
                <option value="firefox">Firefox 136</option>
                <option value="safari">Safari 18</option>
                <option value="raw">Raw</option>
              </Select>
            </Card>
          </section>

          <section ref={browserRef} className={styles.group}>
            <div className={styles.groupHeader}>
              <LinkRegular fontSize={20} />
              <Subtitle1>{t(lang, "settingsBrowser")}</Subtitle1>
            </div>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>{t(lang, "enableBrowserExt")}</Subtitle2>
              </div>
              <Switch
                checked={settings.isBrowserExtensionEnabled}
                onChange={(_, d) =>
                  void api.updateSettings({ isBrowserExtensionEnabled: Boolean(d.checked) })
                }
              />
            </Card>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>{t(lang, "clipboardAutoPaste")}</Subtitle2>
                <Caption1>{t(lang, "clipboardAutoPasteDesc")}</Caption1>
              </div>
              <Switch
                checked={settings.isClipboardAutoPasteEnabled}
                onChange={(_, d) =>
                  void api.updateSettings({ isClipboardAutoPasteEnabled: Boolean(d.checked) })
                }
              />
            </Card>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>{t(lang, "pairToken")}</Subtitle2>
                <Caption1 style={{ fontFamily: "monospace" }}>
                  {settings.browserExtensionPairToken}
                </Caption1>
              </div>
              <div className={styles.cardControl}>
                <Button
                  size="small"
                  icon={<CopyRegular />}
                  onClick={() => void copyText(settings.browserExtensionPairToken)}
                >
                  {t(lang, "copyToken")}
                </Button>
                <Button
                  size="small"
                  icon={<ArrowClockwiseRegular />}
                  onClick={() => void api.regeneratePairToken()}
                >
                  {t(lang, "regenerateToken")}
                </Button>
              </div>
            </Card>
          </section>

          <section ref={aria2Ref} className={styles.group}>
            <div className={styles.groupHeader}>
              <ShieldCheckmarkRegular fontSize={20} />
              <Subtitle1>{t(lang, "settingsAria2")}</Subtitle1>
            </div>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>{t(lang, "enableAria2")}</Subtitle2>
                <Caption1>Endpoint: POST /jsonrpc</Caption1>
              </div>
              <Switch
                checked={settings.isAria2RpcEnabled}
                onChange={(_, d) => void api.updateSettings({ isAria2RpcEnabled: Boolean(d.checked) })}
              />
            </Card>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>{t(lang, "aria2Token")}</Subtitle2>
              </div>
              <Input
                type="password"
                style={{ width: "220px" }}
                placeholder="Optional"
                value={settings.aria2RpcToken}
                onChange={(_, d) => void api.updateSettings({ aria2RpcToken: d.value })}
              />
            </Card>
          </section>

          <section ref={personalRef} className={styles.group}>
            <div className={styles.groupHeader}>
              <PaintBrushRegular fontSize={20} />
              <Subtitle1>{t(lang, "settingsPersonal")}</Subtitle1>
            </div>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>{t(lang, "themeMode")}</Subtitle2>
              </div>
              <Select
                value={settings.themeMode}
                onChange={(_, d) =>
                  void api.updateSettings({ themeMode: d.value as ThemePreference })
                }
              >
                <option value="auto">{t(lang, "themeAuto")}</option>
                <option value="light">{t(lang, "themeLight")}</option>
                <option value="dark">{t(lang, "themeDark")}</option>
              </Select>
            </Card>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>{t(lang, "language")}</Subtitle2>
              </div>
              <Select
                value={settings.language}
                onChange={(_, d) =>
                  void api.updateSettings({ language: d.value as LanguagePreference })
                }
              >
                <option value="pt">Português</option>
                <option value="en">English</option>
                <option value="zh">简体中文</option>
              </Select>
            </Card>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>{t(lang, "noticeSound")}</Subtitle2>
              </div>
              <Switch
                checked={settings.isNoticeSoundEnabled}
                onChange={(_, d) =>
                  void api.updateSettings({ isNoticeSoundEnabled: Boolean(d.checked) })
                }
              />
            </Card>
          </section>

          <section ref={aboutRef} className={styles.group}>
            <div className={styles.groupHeader}>
              <InfoRegular fontSize={20} />
              <Subtitle1>{t(lang, "settingsAbout")}</Subtitle1>
            </div>

            <Card appearance="filled-alternative" className={styles.card}>
              <div className={styles.cardInfo}>
                <Subtitle2>Ghost Downloader 3</Subtitle2>
                <Body1>Version {version} · Copyright © 2023-2026 XiaoYouChR · GPL v3.0</Body1>
              </div>
              <Badge appearance="tint" color="brand">v{version}</Badge>
            </Card>
          </section>
        </div>
      </div>

      <aside className={styles.navRail}>
        {navItems.map((item) => (
          <Button
            key={item.key}
            appearance="subtle"
            style={{ justifyContent: "flex-start" }}
            onClick={() => item.ref.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            {item.label}
          </Button>
        ))}
      </aside>
    </div>
  );
}

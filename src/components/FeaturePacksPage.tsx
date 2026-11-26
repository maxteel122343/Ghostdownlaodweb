import { useState } from "react";
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Card,
  Divider,
  Subtitle1,
  Subtitle2,
  Switch,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { PlayRegular, PuzzlePieceRegular, CodeRegular } from "@fluentui/react-icons";
import { api } from "../api";
import { t } from "../i18n";
import type { FeaturePack, LanguagePreference } from "../shared/types";

const useStyles = makeStyles({
  root: {
    height: "100%",
    overflowY: "auto",
    padding: "20px 24px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "12px",
  },
  packCard: {
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  packTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  badges: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  consoleCard: {
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  codeOutput: {
    fontFamily: "monospace",
    fontSize: "12px",
    whiteSpace: "pre-wrap",
    padding: "12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    maxHeight: "220px",
    overflowY: "auto",
  },
});

const RPC_PRESETS = [
  { label: "aria2.getVersion", body: { jsonrpc: "2.0", id: "1", method: "aria2.getVersion", params: [] } },
  { label: "aria2.getGlobalStat", body: { jsonrpc: "2.0", id: "2", method: "aria2.getGlobalStat", params: [] } },
  { label: "aria2.tellActive", body: { jsonrpc: "2.0", id: "3", method: "aria2.tellActive", params: [] } },
  {
    label: "aria2.addUri (README)",
    body: {
      jsonrpc: "2.0",
      id: "4",
      method: "aria2.addUri",
      params: [["https://raw.githubusercontent.com/XiaoYouChR/Ghost-Downloader-3/main/README.md"]],
    },
  },
];

export function FeaturePacksPage({
  packs,
  lang,
}: {
  packs: FeaturePack[];
  lang: LanguagePreference;
}) {
  const styles = useStyles();
  const [rpcInput, setRpcInput] = useState(JSON.stringify(RPC_PRESETS[0].body, null, 2));
  const [rpcOutput, setRpcOutput] = useState<string>("");
  const [sending, setSending] = useState(false);

  async function handleSendRpc() {
    setSending(true);
    try {
      const parsed = JSON.parse(rpcInput);
      const result = await api.sendAria2Rpc(parsed);
      setRpcOutput(JSON.stringify(result, null, 2));
    } catch (err) {
      setRpcOutput(err instanceof Error ? err.message : "RPC Error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <PuzzlePieceRegular fontSize={24} />
          <Subtitle1>{t(lang, "packsTitle")}</Subtitle1>
        </div>
        <Caption1>{t(lang, "packsSubtitle")}</Caption1>
      </div>

      <div className={styles.grid}>
        {packs.map((pack) => (
          <Card key={pack.packId} appearance="filled-alternative" className={styles.packCard}>
            <div className={styles.packTop}>
              <div>
                <Subtitle2>{lang === "zh" ? pack.nameZh : lang === "pt" ? pack.namePt || pack.name : pack.name}</Subtitle2>
                <div>
                  <Caption1>
                    {pack.packId} · v{pack.version}
                  </Caption1>
                </div>
              </div>
              <Switch
                checked={pack.enabled}
                onChange={(_, d) => void api.togglePack(pack.packId, Boolean(d.checked))}
              />
            </div>

            <Body1>
              {lang === "zh"
                ? pack.descriptionZh
                : lang === "pt"
                  ? pack.descriptionPt || pack.description
                  : pack.description}
            </Body1>

            <div className={styles.badges}>
              {pack.protocols.map((proto) => (
                <Badge key={proto} appearance="outline" size="small">
                  {proto}
                </Badge>
              ))}
              <Badge
                appearance="tint"
                size="small"
                color={pack.canRealDownload ? "success" : "warning"}
              >
                {pack.canRealDownload ? "Live HTTP Stream" : t(lang, "simulatedBadge")}
              </Badge>
            </div>
          </Card>
        ))}
      </div>

      <Divider />

      <Card appearance="filled-alternative" className={styles.consoleCard}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <CodeRegular fontSize={20} />
          <div>
            <Subtitle2>{t(lang, "aria2ConsoleTitle")}</Subtitle2>
            <div>
              <Caption1>{t(lang, "aria2ConsoleSubtitle")}</Caption1>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {RPC_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              size="small"
              appearance="subtle"
              onClick={() => setRpcInput(JSON.stringify(preset.body, null, 2))}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <Textarea
          rows={5}
          style={{ fontFamily: "monospace" }}
          value={rpcInput}
          onChange={(_, d) => setRpcInput(d.value)}
        />

        <div>
          <Button
            appearance="primary"
            icon={<PlayRegular />}
            disabled={sending}
            onClick={() => void handleSendRpc()}
          >
            {t(lang, "sendRpc")}
          </Button>
        </div>

        {rpcOutput && <pre className={styles.codeOutput}>{rpcOutput}</pre>}
      </Card>
    </div>
  );
}

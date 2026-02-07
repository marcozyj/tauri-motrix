import { Box, Divider, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { version as appVersion } from "@root/package.json";
import { useBoolean } from "ahooks";
import { Ref, useImperativeHandle } from "react";
import { useTranslation } from "react-i18next";

import Copyright from "@/business/about/Copyright";
import { BaseDialog, DialogRef } from "@/components/BaseDialog";
import { useAria2 } from "@/hooks/aria2";

const FALLBACK_FEATURES = [
  "BitTorrent",
  "Firefox3 Cookie",
  "GZip",
  "HTTPS",
  "Message Digest",
  "Metalink",
  "XML-RPC",
  "SFTP",
];

function AboutDialog(props: { ref: Ref<DialogRef> }) {
  const { t } = useTranslation();
  const [open, { setFalse, setTrue }] = useBoolean();
  const theme = useTheme();

  const { version, enabledFeatures } = useAria2();

  const isDark = theme.palette.mode === "dark";
  const panelBg = isDark ? "#121826" : "#f6f7fb";
  const panelBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const textPrimary = isDark ? "#f5f7ff" : "#1a1e2b";
  const textMuted = isDark ? "rgba(245,247,255,0.7)" : "rgba(26,30,43,0.7)";

  const aria2VersionText = `v${version ?? "1.37.0"}`;
  const features = enabledFeatures?.length ? enabledFeatures : FALLBACK_FEATURES;

  useImperativeHandle(props.ref, () => ({
    open: setTrue,
    close: setFalse,
  }));

  return (
    <BaseDialog
      disableCancel
      title={t("about.Title")}
      open={open}
      onClose={setFalse}
      onOk={setFalse}
      okBtn={t("common.Ok")}
    >
      <Box sx={{ display: "grid", gap: 2 }}>
        <Box
          sx={{
            borderRadius: 2,
            border: `1px solid ${panelBorder}`,
            backgroundColor: panelBg,
            padding: 1.5,
          }}
        >
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            }}
          >
            <Box>
              <Typography
                variant="caption"
                sx={{
                  color: textMuted,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                motrix version
              </Typography>
              <Typography variant="h6" sx={{ color: textPrimary, fontWeight: 700 }}>
                v{appVersion}
              </Typography>
            </Box>
            <Box>
              <Typography
                variant="caption"
                sx={{
                  color: textMuted,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                aria2 version
              </Typography>
              <Typography variant="h6" sx={{ color: textPrimary, fontWeight: 700 }}>
                {aria2VersionText}
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: "grid", gap: 1 }}>
          <Typography variant="subtitle2" sx={{ color: textPrimary, fontWeight: 700 }}>
            Enabled Features
          </Typography>
          <Box
            sx={{
              display: "grid",
              gap: 1,
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            }}
          >
            {features.map((feature) => (
              <Box
                key={feature}
                sx={{
                  borderRadius: 1.5,
                  border: `1px solid ${panelBorder}`,
                  backgroundColor: isDark ? "#0f1420" : "#ffffff",
                  color: textPrimary,
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  letterSpacing: "0.01em",
                  paddingX: 1.25,
                  paddingY: 0.75,
                }}
              >
                {feature}
              </Box>
            ))}
          </Box>
        </Box>

        <Divider sx={{ borderColor: panelBorder }} />
        <Copyright />
      </Box>
    </BaseDialog>
  );
}

export default AboutDialog;

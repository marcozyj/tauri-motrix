import { GitHub } from "@mui/icons-material";
import {
  Box,
  boxClasses,
  Button,
  Grid,
  gridClasses,
  IconButton,
} from "@mui/material";
import { version as appVersion } from "@root/package.json";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useLockFn } from "ahooks";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import AboutDialog from "@/business/about/AboutDialog";
import Aria2Setting from "@/business/setting/Aria2Setting";
import AppearanceSetting from "@/business/setting/DisplaySetting";
import MotrixSetting from "@/business/setting/MotrixSetting";
import { DialogRef } from "@/components/BaseDialog";
import BasePage from "@/components/BasePage";
import { useIsDark } from "@/hooks/theme";

function SettingsPage() {
  const { t } = useTranslation();

  const isDark = useIsDark();

  const repoUrl = "https://github.com/marcozyj/tauri-motrix";
  const toGithubRepo = useLockFn(() => openUrl(repoUrl));

  const aboutRef = useRef<DialogRef>(null);

  return (
    <BasePage
      title={t("Settings")}
      header={
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <AboutDialog ref={aboutRef} />

          <Button
            size="small"
            color="inherit"
            variant="outlined"
            title={t("Manual")}
            onClick={() => aboutRef.current?.open()}
            sx={{
              fontWeight: 700,
              letterSpacing: "0.02em",
              textTransform: "none",
            }}
          >
            v{appVersion}
          </Button>
          <IconButton
            size="medium"
            color="inherit"
            title={repoUrl}
            onClick={toGithubRepo}
          >
            <GitHub fontSize="inherit" />
          </IconButton>
        </Box>
      }
    >
      <Grid
        container
        spacing={1.5}
        sx={{
          [`.${gridClasses.root} > .${boxClasses.root}`]: {
            borderRadius: 2,
            marginBottom: 1.5,
            backgroundColor: isDark ? "#282a36" : "#ffffff",
          },
        }}
        columns={{ xs: 6, sm: 6, md: 12 }}
      >
        <Grid size={6}>
          <Box>
            <AppearanceSetting />
          </Box>
          <Box>
            <Aria2Setting />
          </Box>
        </Grid>

        <Grid size={6}>
          <Box>
            <MotrixSetting />
          </Box>
        </Grid>
      </Grid>
    </BasePage>
  );
}

export default SettingsPage;

import { Box, Link, Typography } from "@mui/material";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";

function Copyright() {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 2,
      }}
    >
      <Typography sx={{ fontWeight: 600 }}>©2025 Tauri Motrix</Typography>

      <Link
        component="button"
        onClick={() =>
          openUrl(
            "https://raw.githubusercontent.com/Taoister39/tauri-motrix/refs/heads/main/LICENSE",
          )
        }
        sx={{ fontWeight: 600 }}
      >
        {t("about.License")}
      </Link>
    </Box>
  );
}

export default Copyright;

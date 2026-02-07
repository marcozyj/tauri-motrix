import { InboxRounded } from "@mui/icons-material";
import { alpha, Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

interface Props {
  text?: string;
  extra?: React.ReactNode;
}

// code from clash verge
export function BaseEmpty({ text, extra }: Props) {
  const { t } = useTranslation();

  return (
    <Box
      sx={({ palette }) => ({
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: alpha(palette.text.secondary, 0.75),
      })}
    >
      <InboxRounded sx={{ fontSize: "4em" }} />
      <Typography sx={{ fontSize: "1.25em" }}>
        {t(text ?? "common.Empty")}
      </Typography>
      {extra}
    </Box>
  );
}

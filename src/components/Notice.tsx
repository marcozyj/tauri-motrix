import {
  CheckCircleRounded,
  CloseRounded,
  ErrorRounded,
} from "@mui/icons-material";
import {
  Box,
  IconButton,
  Slide,
  Snackbar,
  SnackbarProps,
  styled,
  Typography,
} from "@mui/material";
import { ReactNode, useState } from "react";
import { createRoot } from "react-dom/client";

interface InnerProps {
  isDark?: boolean;
  type: keyof NoticeInstance;
  duration?: number;
  message: ReactNode;
  onClose: () => void;
}

const TextInner = styled(Typography)(() => ({
  wordWrap: "break-word",
  width: "calc(100% - 35px)",
}));

const MessageInner = styled(Box)(() => ({
  width: 328,
  display: "flex",
  alignItems: "center",
  gap: 2,
}));

function NoticeInner({ onClose, message, duration, type, isDark }: InnerProps) {
  const [visible, setVisible] = useState(true);

  const onBtnClose = () => {
    setVisible(false);
    onClose();
  };

  const onAutoClose: SnackbarProps["onClose"] = (_, reason) => {
    if (reason !== "clickaway") {
      onBtnClose();
    }
  };

  const msgElement =
    type === "info" ? (
      message
    ) : (
      <MessageInner>
        {type === "error" ? (
          <ErrorRounded color="error" />
        ) : (
          <CheckCircleRounded color="success" />
        )}

        <TextInner>{message}</TextInner>
      </MessageInner>
    );

  return (
    <Snackbar
      open={visible}
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
      autoHideDuration={duration === -1 ? null : duration || 1500}
      onClose={onAutoClose}
      message={msgElement}
      sx={{
        maxWidth: 360,
        ".MuiSnackbarContent-root": {
          bgcolor: isDark ? "#50515C" : "#ffffff",
          color: isDark ? "#ffffff" : "#000000",
        },
      }}
      transitionDuration={200}
      action={
        <IconButton size="small" color="inherit" onClick={onBtnClose}>
          <CloseRounded fontSize="inherit" />
        </IconButton>
      }
      slots={{
        transition: (p) => <Slide {...p} direction="left" />,
      }}
    />
  );
}

interface NoticeInstance {
  (props: Omit<InnerProps, "onClose">): void;

  info(message: ReactNode, duration?: number, isDark?: boolean): void;
  error(message: ReactNode, duration?: number, isDark?: boolean): void;
  success(message: ReactNode, duration?: number, isDark?: boolean): void;
}

let parent: HTMLDivElement = null!;

// code from clash verge
export const Notice: NoticeInstance = (props) => {
  const { type, message, duration } = props;

  if (!message) {
    return;
  }

  if (!parent) {
    parent = document.createElement("div");
    parent.setAttribute("id", "notice-container");
    document.body.appendChild(parent);
  }

  const container = document.createElement("div");
  parent.appendChild(container);

  const root = createRoot(container);

  const onUnmount = () => {
    root.unmount();
    if (parent && container.parentNode === parent) {
      setTimeout(() => {
        parent.removeChild(container);
      }, 500);
    }
  };

  root.render(
    <NoticeInner
      type={type}
      message={message}
      duration={duration || 1500}
      onClose={onUnmount}
    />,
  );
};

const createNoticeTypeFactory =
  (type: keyof NoticeInstance) => (message: ReactNode, duration?: number) => {
    if (!message) {
      return;
    }

    Notice({
      type,
      message,
      duration: type === "error" ? 8000 : duration || 1500,
    });
  };

Notice.info = createNoticeTypeFactory("info");
Notice.error = createNoticeTypeFactory("error");
Notice.success = createNoticeTypeFactory("success");

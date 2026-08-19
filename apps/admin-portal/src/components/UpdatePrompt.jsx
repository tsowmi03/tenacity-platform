import { useEffect } from "react";
import { applyUpdate, onNeedRefresh } from "../pwa";
import { useToast } from "./ToastProvider";

/**
 * Surfaces a waiting service worker as a toast the user chooses to act on,
 * so a deploy can never discard a half-filled form.
 */
export default function UpdatePrompt() {
  const toast = useToast();

  useEffect(
    () =>
      onNeedRefresh(() => {
        toast.persistent("info", "New version available", "Reload to get the latest portal.", {
          label: "Reload",
          onClick: applyUpdate,
        });
      }),
    [toast]
  );

  return null;
}

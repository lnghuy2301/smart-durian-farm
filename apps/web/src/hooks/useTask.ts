import { useEffect, useRef, useState } from "react";

// Mutation chỉ chạy do người dùng submit; không retry ngầm. Huỷ khi rời trang/đổi phiên.
export function useTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      pending.current?.abort();
      pending.current = null;
    },
    [],
  );
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      await action(controller.signal);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Không thực hiện được yêu cầu.",
        );
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  return { busy, error, setError, run };
}

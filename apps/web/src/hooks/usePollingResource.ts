import { useCallback, useEffect, useRef, useState } from "react";
import type { Resource } from "./useResource";

export function usePollingResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): Resource<T> & {
  refreshing: boolean;
  checkedAt?: string;
  invalidate: (error: Error) => void;
} {
  const [state, setState] = useState<{
    key: string;
    data?: T;
    error?: Error;
    loading: boolean;
    refreshing: boolean;
    checkedAt?: string;
  }>({ key, loading: true, refreshing: false });
  const refresh = useRef<() => void>(() => {});
  const discard = useRef<(error: Error) => void>(() => {});
  useEffect(() => {
    let alive = true;
    let pending = false;
    let epoch = 0;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function schedule() {
      clearTimeout(timer);
      if (alive && !document.hidden)
        timer = setTimeout(() => void run(), 15000);
    }
    async function run() {
      if (!alive || pending) return;
      clearTimeout(timer);
      pending = true;
      const current = ++epoch;
      controller = new AbortController();
      setState((previous) =>
        previous.key === key && previous.data !== undefined
          ? { ...previous, refreshing: true, error: undefined }
          : { key, loading: true, refreshing: true },
      );
      try {
        const data = await load(controller.signal);
        if (alive && current === epoch)
          setState({
            key,
            data,
            loading: false,
            refreshing: false,
            checkedAt: new Date().toISOString(),
          });
      } catch (error) {
        if (alive && current === epoch)
          setState({
            key,
            error:
              error instanceof Error
                ? error
                : new Error("Không tải được dữ liệu"),
            loading: false,
            refreshing: false,
          });
      } finally {
        if (current === epoch) {
          pending = false;
          schedule();
        }
      }
    }
    const visibility = () => {
      clearTimeout(timer);
      if (!document.hidden) void run();
    };
    refresh.current = () => {
      void run();
    };
    // History có thể phát hiện mất quyền trước snapshot: xóa cả cache và request cũ.
    discard.current = (error) => {
      ++epoch;
      controller?.abort();
      pending = false;
      clearTimeout(timer);
      setState({ key, error, loading: false, refreshing: false });
    };
    document.addEventListener("visibilitychange", visibility);
    void run();
    return () => {
      alive = false;
      controller?.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
      refresh.current = () => {};
      discard.current = () => {};
    };
  }, [key, load]);
  const reload = useCallback(() => refresh.current(), []);
  const invalidate = useCallback((error: Error) => discard.current(error), []);
  return {
    ...(state.key === key ? state : { loading: true, refreshing: false }),
    reload,
    invalidate,
  };
}

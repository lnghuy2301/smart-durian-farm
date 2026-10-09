import { useCallback, useEffect, useState } from "react";

export interface Resource<T> {
  data?: T;
  error?: Error;
  loading: boolean;
  reload: () => void;
}

export function useResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): Resource<T> {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    attempt: number;
    data?: T;
    error?: Error;
    loading: boolean;
  }>({ key, attempt, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setState({ key, attempt, loading: true });
    load(controller.signal)
      .then((data) => {
        if (current) setState({ key, attempt, data, loading: false });
      })
      .catch((error: unknown) => {
        if (current && !controller.signal.aborted)
          setState({
            key,
            attempt,
            error:
              error instanceof Error
                ? error
                : new Error("Không tải được dữ liệu"),
            loading: false,
          });
      });
    return () => {
      current = false;
      controller.abort();
    };
    // key là contract của request (path + query); load được memo hóa bởi caller.
  }, [key, attempt, load]);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  // Không hiện dữ liệu key cũ dù effect cho trang mới chưa chạy.
  return {
    ...(state.key === key && state.attempt === attempt
      ? state
      : { loading: true }),
    reload,
  };
}

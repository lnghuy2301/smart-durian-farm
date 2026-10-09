export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const explanations: Record<number, string> = {
  400: "Thông tin gửi lên chưa hợp lệ.",
  401: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  403: "Bạn chưa được cấp quyền thực hiện thao tác này.",
  404: "Không tìm thấy dữ liệu trong phạm vi truy cập.",
  409: "Dữ liệu hoặc trạng thái đã thay đổi. Hãy tải lại và kiểm tra trước khi thao tác.",
  429: "Đã đạt giới hạn yêu cầu. Vui lòng chờ trước khi thử lại.",
  503: "Dịch vụ tạm thời chưa sẵn sàng. Vui lòng thử lại sau.",
};

export function queryString(
  query: Record<string, string | number | undefined> = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return params.size ? `?${params}` : "";
}

export class ApiClient {
  private readonly requests = new Set<AbortController>();
  private active = true;
  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
    private readonly onUnauthorized?: () => void,
  ) {}

  dispose() {
    // Hủy toàn bộ request khi đổi tài khoản/logout; response đến trễ không thuộc phiên mới.
    this.active = false;
    for (const controller of this.requests) controller.abort();
    this.requests.clear();
  }

  async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PATCH" | "DELETE";
      body?: unknown;
      signal?: AbortSignal;
    } = {},
  ): Promise<T> {
    if (!this.active) throw new DOMException("Phiên đã đóng", "AbortError");
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    this.requests.add(controller);
    const timeout = setTimeout(
      () =>
        controller.abort(
          new DOMException("Hết thời gian kết nối", "TimeoutError"),
        ),
      20000,
    );
    try {
      const response = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`,
        {
          method: options.method ?? "GET",
          signal: controller.signal,
          credentials: "omit",
          headers: {
            Accept: "application/json",
            ...(options.body !== undefined
              ? { "Content-Type": "application/json" }
              : {}),
            ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          },
          body:
            options.body !== undefined
              ? JSON.stringify(options.body)
              : undefined,
        },
      );
      if (!this.active) throw new DOMException("Phiên đã đóng", "AbortError");
      const body: unknown =
        response.status === 204
          ? undefined
          : await response.json().catch(() => undefined);
      if (!this.active || controller.signal.aborted)
        throw new DOMException("Phiên hoặc request đã đóng", "AbortError");
      if (!response.ok) {
        if (response.status === 401 && this.token && this.active)
          this.onUnauthorized?.();
        const message =
          body && typeof body === "object" && "message" in body
            ? body.message
            : undefined;
        const detail =
          typeof message === "string"
            ? message
            : Array.isArray(message)
              ? message.filter((part) => typeof part === "string").join("; ")
              : "";
        throw new ApiError(
          response.status,
          `${explanations[response.status] ?? "Máy chủ không thể xử lý yêu cầu."}${detail ? ` ${detail}` : ""}`,
        );
      }
      if (body === undefined && response.status !== 204)
        throw new ApiError(
          502,
          "Máy chủ trả dữ liệu không hợp lệ. Kiểm tra API base URL và proxy.",
        );
      return body as T;
    } catch (error) {
      if (
        error instanceof ApiError ||
        (error instanceof DOMException && error.name === "AbortError")
      )
        throw error;
      if (!this.active || options.signal?.aborted)
        throw new DOMException("Đã hủy", "AbortError");
      throw new ApiError(
        0,
        "Không kết nối được máy chủ hoặc kết nối quá chậm. Kiểm tra mạng và thử lại.",
      );
    } finally {
      clearTimeout(timeout);
      this.requests.delete(controller);
      options.signal?.removeEventListener("abort", abort);
    }
  }
}

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || "/api";
export const publicApi = new ApiClient(apiBaseUrl);

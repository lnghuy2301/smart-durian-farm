// Chỉ dùng exp để kết thúc UI đúng hạn. Backend vẫn xác minh chữ ký/quyền bằng /auth/me.
export function tokenDeadline(token: string): number | undefined {
  try {
    const segments = token.split(".");
    if (segments.length !== 3) return undefined;
    const payload: unknown = JSON.parse(
      atob(segments[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (
      !payload ||
      typeof payload !== "object" ||
      !("exp" in payload) ||
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.exp)
    )
      return undefined;
    const deadline = payload.exp * 1000;
    return Number.isSafeInteger(deadline) ? deadline : undefined;
  } catch {
    return undefined;
  }
}

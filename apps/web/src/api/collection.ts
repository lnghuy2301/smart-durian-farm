import type { Page } from "../types/api";

// Tổng hợp nhiều trang phải đủ total; không dùng trang đầu làm số liệu toàn HTX.
export async function collectPages<T>(
  fetchPage: (offset: number) => Promise<Page<T>>,
  identity: (item: T) => string,
): Promise<T[]> {
  const result: T[] = [];
  const seen = new Set<string>();
  let total: number | undefined;
  for (let offset = 0; offset <= 100000;) {
    const page = await fetchPage(offset);
    if (
      page.offset !== offset ||
      page.limit < 1 ||
      page.limit > 100 ||
      page.items.length > page.limit ||
      page.total < 0 ||
      !Number.isInteger(page.total)
    )
      throw new Error("Phân trang máy chủ không hợp lệ. Vui lòng tải lại.");
    if (total !== undefined && page.total !== total)
      throw new Error(
        "Dữ liệu đã thay đổi trong lúc tải tổng quan. Vui lòng làm mới.",
      );
    total = page.total;
    for (const item of page.items) {
      const id = identity(item);
      if (!id || seen.has(id))
        throw new Error(
          "Dữ liệu đã thay đổi giữa các trang. Vui lòng làm mới.",
        );
      seen.add(id);
      result.push(item);
    }
    if (result.length === total) return result;
    if (result.length > total || page.items.length !== page.limit)
      throw new Error("Danh sách tải chưa đầy đủ. Vui lòng làm mới.");
    offset += page.limit;
  }
  throw new Error(
    "Danh sách vượt giới hạn phân trang hỗ trợ. Vui lòng dùng trang dữ liệu riêng.",
  );
}

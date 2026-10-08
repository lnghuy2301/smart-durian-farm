import { expect, test } from "vitest";
import { collectPages } from "../src/api/collection";
import {
  managerOverview,
  vietnamDay,
  type ManagerRecords,
} from "../src/pages/managerOverview";

test("collection aggregation traverses all pages and rejects changing or partial totals", async () => {
  const records = Array.from({ length: 23 }, (_, index) => ({
    id: String(index),
  }));
  const read = (offset: number) =>
    Promise.resolve({
      items: records.slice(offset, offset + 20),
      limit: 20,
      offset,
      total: 23,
    });
  expect(await collectPages(read, (x) => x.id)).toHaveLength(23);
  await expect(
    collectPages(
      (offset) =>
        Promise.resolve({
          items: records.slice(offset, offset + 20),
          limit: 20,
          offset,
          total: offset ? 22 : 23,
        }),
      (x) => x.id,
    ),
  ).rejects.toThrow("thay đổi");
  await expect(
    collectPages(
      () =>
        Promise.resolve({
          items: records.slice(0, 5),
          limit: 20,
          offset: 0,
          total: 23,
        }),
      (x) => x.id,
    ),
  ).rejects.toThrow("chưa đầy đủ");
});
test("Manager farm filter and Vietnam calendar window count only confirmed current-farm harvests", () => {
  const now = Date.parse("2026-10-08T18:00:00Z");
  expect(vietnamDay(now)).toBe("2026-10-09");
  const records = {
    farms: [{ id: "farm1" }, { id: "farm2" }],
    zones: [
      { id: "zone1", farm_id: "farm1" },
      { id: "zone2", farm_id: "farm2" },
    ],
    trees: [
      { id: "tree1", zone_id: "zone1" },
      { id: "tree2", zone_id: "zone2" },
    ],
    assignments: [
      { active: false, assignment: { zone_id: "zone1" } },
      { active: true, assignment: { zone_id: "zone2" } },
    ],
    devices: [],
    harvests: [
      {
        id: "current",
        tree_id: "tree1",
        status: "Confirmed",
        harvest_date: "2026-10-09",
        created_at: "",
        fruit_count: 10,
        total_weight_kg: 30,
      },
      {
        id: "other",
        tree_id: "tree2",
        status: "Confirmed",
        harvest_date: "2026-10-09",
        created_at: "",
        fruit_count: 20,
        total_weight_kg: 60,
      },
      {
        id: "draft",
        tree_id: "tree1",
        status: "Draft",
        harvest_date: "2026-10-09",
        created_at: "",
        fruit_count: 99,
        total_weight_kg: 99,
      },
      {
        id: "old",
        tree_id: "tree1",
        status: "Confirmed",
        harvest_date: "2026-10-02",
        created_at: "",
        fruit_count: 5,
        total_weight_kg: 15,
      },
    ],
  } as unknown as ManagerRecords;
  const view = managerOverview(records, "farm1", "7days", now);
  expect(view.farms).toHaveLength(1);
  expect(view.trees).toHaveLength(1);
  expect(view.unassigned).toHaveLength(1);
  expect(view.harvests.map((x) => x.id)).toEqual(["current"]);
  expect(view.weightKg).toBe(30);
  expect(managerOverview(records, "", "all", now).weightKg).toBe(105);
});

import type {
  AssignmentHistory,
  Device,
  Farm,
  Harvest,
  Tree,
  Zone,
} from "../types/api";

export type Period = "today" | "7days" | "30days" | "all";
export interface ManagerRecords {
  farms: Farm[];
  zones: Zone[];
  trees: Tree[];
  assignments: AssignmentHistory[];
  devices: Device[];
  harvests: Harvest[];
}
export function vietnamDay(time: number) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(time);
  const part = (type: string) => parts.find((x) => x.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function managerOverview(
  records: ManagerRecords,
  farmId: string,
  period: Period,
  now: number,
) {
  const farms = records.farms.filter((farm) => !farmId || farm.id === farmId);
  const farmIds = new Set(farms.map((farm) => farm.id));
  const zones = records.zones.filter((zone) => farmIds.has(zone.farm_id));
  const zoneIds = new Set(zones.map((zone) => zone.id));
  const trees = records.trees.filter((tree) => zoneIds.has(tree.zone_id));
  const treeIds = new Set(trees.map((tree) => tree.id));
  const assigned = new Set(
    records.assignments
      .filter((entry) => entry.active)
      .map((entry) => entry.assignment.zone_id),
  );
  const unassigned = zones.filter((zone) => !assigned.has(zone.id));
  const today = vietnamDay(now);
  const windowStart =
    period === "all"
      ? ""
      : vietnamDay(
          Date.parse(`${today}T12:00:00+07:00`) -
            (period === "7days" ? 6 : period === "30days" ? 29 : 0) * 86400000,
        );
  const harvests = records.harvests
    .filter(
      (item) =>
        item.status === "Confirmed" &&
        treeIds.has(item.tree_id) &&
        (period === "all" ||
          (item.harvest_date >= windowStart && item.harvest_date <= today)),
    )
    .sort(
      (a, b) =>
        b.harvest_date.localeCompare(a.harvest_date) ||
        b.created_at.localeCompare(a.created_at),
    );
  return {
    farms,
    zones,
    trees,
    unassigned,
    harvests,
    devices: records.devices.filter((item) => zoneIds.has(item.zone_id)),
    fruitCount: harvests.reduce((sum, item) => sum + item.fruit_count, 0),
    weightKg: harvests.reduce((sum, item) => sum + item.total_weight_kg, 0),
  };
}

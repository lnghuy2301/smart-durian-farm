import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Building2,
  Leaf,
  Map,
  Radio,
  RefreshCw,
  Search,
  Sprout,
  Trees,
  UserRoundX,
} from "lucide-react";
import { useSession } from "../auth/session";
import { queryString } from "../api/client";
import { collectPages } from "../api/collection";
import { useResource } from "../hooks/useResource";
import { usePollingResource } from "../hooks/usePollingResource";
import {
  Badge,
  DataState,
  Field,
  Notice,
  PageHeader,
  Pagination,
  dateTime,
  number,
} from "../components/ui";
import type {
  AssignmentHistory,
  Cooperative,
  Device,
  DevicePresence,
  Farm,
  Harvest,
  Page,
  Tree,
  Zone,
} from "../types/api";
import { managerOverview, type Period } from "./managerOverview";
import { Stat } from "../components/Stat";

const periodLabels: Record<Period, string> = {
  today: "Hôm nay",
  "7days": "7 ngày gần nhất",
  "30days": "30 ngày gần nhất",
  all: "Tất cả thời gian",
};
export function ManagerDashboard() {
  const { api } = useSession();
  const [farmId, setFarmId] = useState("");
  const [period, setPeriod] = useState<Period>("7days");
  const load = useCallback(
    async (signal: AbortSignal) => {
      const read = <T,>(path: string, identity: (item: T) => string) =>
        collectPages<T>(
          (offset) =>
            api.request<Page<T>>(
              `${path}${queryString({ limit: 100, offset })}`,
              { signal },
            ),
          identity,
        );
      const byId = (row: { id: string }) => row.id;
      const [
        cooperatives,
        farms,
        zones,
        trees,
        assignments,
        devices,
        harvests,
      ] = await Promise.all([
        api.request<Page<Cooperative>>("cooperatives?limit=100&offset=0", {
          signal,
        }),
        read<Farm>("farms", byId),
        read<Zone>("zones", byId),
        read<Tree>("trees", byId),
        read<AssignmentHistory>("zone-assignments", (row) => row.assignment.id),
        read<Device>("devices", byId),
        read<Harvest>("tree-harvests", byId),
      ]);
      return {
        cooperative: cooperatives.items[0],
        records: { farms, zones, trees, assignments, devices, harvests },
        checkedAt: new Date().toISOString(),
      };
    },
    [api],
  );
  const resource = useResource("manager-overview", load);
  return (
    <>
      <PageHeader
        title="Tổng quan hoạt động HTX"
        subtitle="Theo dõi vườn thành viên, khu vực, cây trồng và sản lượng thu hoạch."
        actions={
          <button className="button" onClick={resource.reload}>
            <RefreshCw size={16} />
            Làm mới tổng quan
          </button>
        }
      />
      <DataState resource={resource}>
        {(data) =>
          data.cooperative ? (
            <ManagerContent
              key={data.checkedAt}
              cooperative={data.cooperative}
              records={data.records}
              checkedAt={data.checkedAt}
              farmId={farmId}
              onFarm={setFarmId}
              period={period}
              onPeriod={setPeriod}
            />
          ) : (
            <div className="panel">
              <Notice kind="warning">
                Tài khoản chưa được gắn hợp tác xã. Vui lòng liên hệ Admin để
                kiểm tra quyền quản lý.
              </Notice>
            </div>
          )
        }
      </DataState>
    </>
  );
}
function ManagerContent({
  cooperative,
  records,
  checkedAt,
  farmId,
  onFarm,
  period,
  onPeriod,
}: {
  cooperative: Cooperative;
  records: Parameters<typeof managerOverview>[0];
  checkedAt: string;
  farmId: string;
  onFarm: (id: string) => void;
  period: Period;
  onPeriod: (period: Period) => void;
}) {
  const view = managerOverview(records, farmId, period, Date.parse(checkedAt));
  const [q, setQ] = useState("");
  const [farmOffset, setFarmOffset] = useState(0);
  const [zoneOffset, setZoneOffset] = useState(0);
  const [harvestOffset, setHarvestOffset] = useState(0);
  const matchedFarms = view.farms.filter((item) =>
    [item.certificate_number, item.address].some((value) =>
      value.toLocaleLowerCase("vi").includes(q.toLocaleLowerCase("vi")),
    ),
  );
  const assignedZones = new Set(
    records.assignments
      .filter((entry) => entry.active)
      .map((entry) => entry.assignment.zone_id),
  );
  useEffect(() => {
    setFarmOffset(0);
    setZoneOffset(0);
    setHarvestOffset(0);
  }, [farmId, period]);
  const farmName = (id: string) =>
    records.farms.find((item) => item.id === id)?.certificate_number ??
    "Vườn không còn trong danh sách";
  return (
    <>
      <section className="panel manager-controls">
        <div className="panel-heading">
          <div>
            <span className="section-label">HỢP TÁC XÃ TRỰC THUỘC</span>
            <h2>{cooperative.cooperative_name}</h2>
            <p>Số liệu tổng quan tải lúc {dateTime(checkedAt)}.</p>
          </div>
          <Link
            className="button secondary"
            to={`/cooperatives/${cooperative.id}`}
          >
            <Building2 size={16} />
            Thông tin HTX
          </Link>
        </div>
        <div className="toolbar">
          <Field label="Vườn thành viên">
            <select value={farmId} onChange={(e) => onFarm(e.target.value)}>
              <option value="">Tất cả vườn trong HTX</option>
              {records.farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.certificate_number} · {farm.address}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Khoảng thời gian thu hoạch">
            <select
              value={period}
              onChange={(e) => onPeriod(e.target.value as Period)}
            >
              {Object.entries(periodLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="table-note">
          Khoảng thời gian chỉ áp dụng cho sản lượng đã xác nhận. Số vườn, khu
          vực, cây và phân công phản ánh mốc tải tổng quan.
        </p>
        {farmId && !records.farms.some((farm) => farm.id === farmId) && (
          <Notice kind="warning">
            Vườn đã chọn không còn trong phạm vi hiện tại. Hãy chọn lại bộ lọc.
          </Notice>
        )}
      </section>
      <div className="stats-grid manager-stats">
        <Stat
          title="Vườn thuộc HTX"
          value={view.farms.length}
          icon={Leaf}
          to="/farms"
          note="Theo bộ lọc vườn"
        />
        <Stat
          title="Khu vực canh tác"
          value={view.zones.length}
          icon={Map}
          to={farmId ? `/zones?farm_id=${farmId}` : "/zones"}
          note={`${view.zones.length - view.unassigned.length} khu đang có phân công`}
        />
        <Stat
          title="Tổng số cây"
          value={view.trees.length}
          icon={Trees}
          to="/trees"
          note="Tất cả trạng thái cây"
        />
        <Stat
          title="Khu vực chưa phân công"
          value={view.unassigned.length}
          icon={UserRoundX}
          to="/zones"
          note="Chưa có phân công đang hiệu lực"
          accent
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Vườn trong HTX</h2>
            <p>{view.farms.length} vườn trong bộ lọc hiện tại.</p>
          </div>
          <Link to="/farms">Xem danh sách vườn →</Link>
        </div>
        <Field label="Tìm chứng nhận hoặc địa chỉ vườn">
          <span className="search-input">
            <Search size={16} />
            <input
              value={q}
              maxLength={100}
              onChange={(e) => {
                setQ(e.target.value);
                setFarmOffset(0);
              }}
            />
          </span>
        </Field>
        {matchedFarms.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Vườn trồng</th>
                  <th>Khu vực</th>
                  <th>Số cây</th>
                  <th>Chưa phân công</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {matchedFarms.slice(farmOffset, farmOffset + 10).map((farm) => {
                  const zones = records.zones.filter(
                    (zone) => zone.farm_id === farm.id,
                  );
                  const ids = new Set(zones.map((zone) => zone.id));
                  return (
                    <tr key={farm.id}>
                      <td>
                        <Link className="item-name" to={`/farms/${farm.id}`}>
                          {farm.certificate_number}
                        </Link>
                        <small>{farm.address}</small>
                      </td>
                      <td>{zones.length} khu</td>
                      <td>
                        {number(
                          records.trees.filter((tree) => ids.has(tree.zone_id))
                            .length,
                        )}{" "}
                        cây
                      </td>
                      <td>
                        {
                          zones.filter((zone) => !assignedZones.has(zone.id))
                            .length
                        }{" "}
                        khu
                      </td>
                      <td>
                        <Link
                          className="icon-button"
                          aria-label={`Xem vườn ${farm.certificate_number}`}
                          to={`/farms/${farm.id}`}
                        >
                          <ArrowUpRight size={17} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Chưa có vườn phù hợp bộ lọc." />
        )}
        <Pagination
          total={matchedFarms.length}
          offset={farmOffset}
          limit={10}
          onChange={setFarmOffset}
        />
      </section>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Khu vực chưa có phân công</h2>
              <p>{view.unassigned.length} khu cần trao đổi với chủ vườn.</p>
            </div>
            <UserRoundX size={23} />
          </div>
          {view.unassigned.length ? (
            <div className="manager-zone-list">
              {view.unassigned.slice(zoneOffset, zoneOffset + 5).map((zone) => (
                <div className="manager-zone" key={zone.id}>
                  <span className="section-icon">
                    <Map size={20} />
                  </span>
                  <div>
                    <strong>{zone.zone_name}</strong>
                    <small>
                      {farmName(zone.farm_id)} ·{" "}
                      {
                        records.trees.filter((tree) => tree.zone_id === zone.id)
                          .length
                      }{" "}
                      cây
                    </small>
                  </div>
                  <Link className="button secondary" to={`/zones/${zone.id}`}>
                    Xem khu vực
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              text={
                view.zones.length
                  ? "Tất cả khu vực đã có phân công đang hiệu lực."
                  : "Chưa có khu vực canh tác."
              }
            />
          )}
          <Pagination
            total={view.unassigned.length}
            offset={zoneOffset}
            limit={5}
            onChange={setZoneOffset}
          />
          <p className="table-note">
            Manager theo dõi phân công; chủ vườn và Farmer nhận việc xử lý theo
            quy trình được cấp quyền.
          </p>
        </section>
        <ManagerDeviceSummary
          key={`${farmId}/${checkedAt}`}
          devices={view.devices}
          zones={records.zones}
          farms={records.farms}
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Thu hoạch đã xác nhận trong kỳ</h2>
            <p>{periodLabels[period]} · theo ngày thu hoạch tại Việt Nam.</p>
          </div>
          <Link to="/tree-harvests?status=Confirmed">
            Danh sách thu hoạch →
          </Link>
        </div>
        <div className="harvest-stats">
          <div>
            <Sprout size={21} />
            <span>Tổng số quả</span>
            <strong>
              {number(view.fruitCount)} <small>quả</small>
            </strong>
          </div>
          <div>
            <Leaf size={21} />
            <span>Tổng khối lượng</span>
            <strong>
              {number(view.weightKg)} <small>kg</small>
            </strong>
          </div>
          <div>
            <Map size={21} />
            <span>Số hồ sơ thu hoạch</span>
            <strong>{view.harvests.length}</strong>
          </div>
        </div>
        {view.harvests.length ? (
          <div className="activity-list">
            {view.harvests
              .slice(harvestOffset, harvestOffset + 5)
              .map((item) => {
                const tree = records.trees.find(
                  (tree) => tree.id === item.tree_id,
                );
                const zone = records.zones.find(
                  (zone) => zone.id === tree?.zone_id,
                );
                return (
                  <Link
                    key={item.id}
                    to={`/tree-harvests/${item.id}`}
                    className="activity"
                  >
                    <span className="section-icon">
                      <Sprout size={20} />
                    </span>
                    <div>
                      <strong>
                        {item.season_name} · {zone?.zone_name ?? "Khu vực"}
                      </strong>
                      <small>
                        {zone ? farmName(zone.farm_id) : ""} · Mã lô{" "}
                        {item.batch_code} · {item.harvest_date}
                      </small>
                    </div>
                    <div className="activity-right">
                      <strong>{number(item.total_weight_kg)} kg</strong>
                      <small>{number(item.fruit_count)} quả</small>
                    </div>
                  </Link>
                );
              })}
          </div>
        ) : (
          <Empty text="Chưa có thu hoạch đã xác nhận trong khoảng thời gian này." />
        )}
        <Pagination
          total={view.harvests.length}
          offset={harvestOffset}
          limit={5}
          onChange={setHarvestOffset}
        />
        <p className="table-note">
          Một hồ sơ là một cây/ngày; không đồng nhất số hồ sơ với số lô, mã lô
          có thể dùng chung.
        </p>
      </section>
    </>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="data-state">
      <Leaf size={28} />
      <p>{text}</p>
    </div>
  );
}
function ManagerDeviceSummary({
  devices,
  zones,
  farms,
}: {
  devices: Device[];
  zones: Zone[];
  farms: Farm[];
}) {
  const { api } = useSession();
  const [offset, setOffset] = useState(0);
  const page = devices.slice(offset, offset + 20);
  const ids = page.map((item) => item.id).join(",");
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result: DevicePresence[] = [];
      const list = ids ? ids.split(",") : [];
      // Có thể rất nhiều trạm: chỉ đọc presence trang 20 trạm và tối đa 4 request đồng thời.
      for (let index = 0; index < list.length; index += 4)
        result.push(
          ...(await Promise.all(
            list.slice(index, index + 4).map((id) =>
              api.request<DevicePresence>(`mqtt/devices/${id}/status`, {
                signal,
              }),
            ),
          )),
        );
      return result;
    },
    [api, ids],
  );
  const resource = usePollingResource(ids, load);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Tình trạng thiết bị IoT</h2>
          <p>{devices.length} trạm trong bộ lọc vườn hiện tại.</p>
        </div>
        <Link to="/iot">Giám sát IoT →</Link>
      </div>
      <DataState resource={resource}>
        {(presence) => (
          <>
            <div className="presence-counts">
              <div>
                <strong>
                  {
                    presence.filter((item) => item.connectivity === "Online")
                      .length
                  }
                </strong>
                <span>Trực tuyến (trang này)</span>
              </div>
              <div>
                <strong>
                  {
                    presence.filter((item) => item.connectivity === "Offline")
                      .length
                  }
                </strong>
                <span>Mất kết nối (trang này)</span>
              </div>
              <div>
                <strong>
                  {
                    presence.filter((item) => item.connectivity === "Unknown")
                      .length
                  }
                </strong>
                <span>Chưa có tín hiệu</span>
              </div>
            </div>
            <div className="manager-device-list">
              {presence.map((item) => {
                const device = devices.find(
                  (device) => device.id === item.device_id,
                )!;
                const zone = zones.find((zone) => zone.id === device.zone_id);
                const farm = farms.find((farm) => farm.id === zone?.farm_id);
                return (
                  <Link
                    to={`/iot?zone_id=${device.zone_id}`}
                    key={item.device_id}
                  >
                    <Radio size={19} />
                    <div>
                      <strong>{device.station_id}</strong>
                      <small>
                        {farm?.certificate_number} · {zone?.zone_name}
                      </small>
                      <small>
                        Tín hiệu cuối: {dateTime(item.last_seen_at)}
                      </small>
                    </div>
                    <Badge status={item.connectivity} />
                  </Link>
                );
              })}
            </div>
            {!presence.length && (
              <Empty text="Chưa có thiết bị IoT trong phạm vi này." />
            )}
            <p className="table-note">
              Số kết nối tính trên {presence.length} trạm của trang này; tự kiểm
              tra lại sau 15 giây. Lần kiểm tra:{" "}
              {dateTime(resource.checkedAt ?? null)}.
            </p>
          </>
        )}
      </DataState>
      <Pagination
        total={devices.length}
        offset={offset}
        limit={20}
        onChange={setOffset}
      />
    </section>
  );
}

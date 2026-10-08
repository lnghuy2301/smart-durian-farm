import { useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Building2,
  Leaf,
  Map,
  Radio,
  RefreshCw,
  Sprout,
  Trees,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useSession } from "../auth/session";
import { useResource } from "../hooks/useResource";
import {
  Badge,
  DataState,
  PageHeader,
  dateTime,
  number,
} from "../components/ui";
import { ManagerAwaitingPage } from "../components/Shell";
import { IotMonitor } from "./Iot";
import type {
  Page,
  Farm,
  Zone,
  Tree,
  Harvest,
  Cooperative,
  User,
} from "../types/api";

export function Dashboard() {
  const { user } = useSession();
  if (user.role === "Manager") return <ManagerAwaitingPage />;
  return user.role === "Admin" ? <AdminDashboard /> : <FarmerDashboard />;
}
function Stat({
  title,
  value,
  icon: Icon,
  to,
  note,
  accent = false,
}: {
  title: string;
  value: number;
  icon: LucideIcon;
  to: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <Link className={`stat-card ${accent ? "accent" : ""}`} to={to}>
      <div className="stat-top">
        <span>{title}</span>
        <span className="stat-icon">
          <Icon size={22} />
        </span>
      </div>
      <strong>{number(value)}</strong>
      <small>
        {note}
        <ArrowUpRight size={13} />
      </small>
    </Link>
  );
}
function FarmerDashboard() {
  const { api, user } = useSession();
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [zones, trees, harvests, confirmed] = await Promise.all([
        api.request<Page<Zone>>("zones?limit=1&offset=0", { signal }),
        api.request<Page<Tree>>("trees?limit=1&offset=0", { signal }),
        api.request<Page<Harvest>>("tree-harvests?limit=5&offset=0", {
          signal,
        }),
        api.request<Page<Harvest>>(
          "tree-harvests?status=Confirmed&limit=1&offset=0",
          { signal },
        ),
      ]);
      return { zones, trees, harvests, confirmed };
    },
    [api],
  );
  const resource = useResource("farmer-overview", load);
  return (
    <>
      <PageHeader
        title={`Xin chào, ${user.user_name}`}
        subtitle="Tổng quan vườn trồng và công việc trong phạm vi của bạn."
        actions={
          <button className="button secondary" onClick={resource.reload}>
            <RefreshCw size={16} />
            Làm mới
          </button>
        }
      />
      <DataState resource={resource}>
        {(data) => (
          <>
            <div className="stats-grid farmer-stats">
              <Stat
                title="Khu vực canh tác"
                value={data.zones.total}
                icon={Map}
                to="/zones"
                note="Khu vực có quyền truy cập"
              />
              <Stat
                title="Cây trồng"
                value={data.trees.total}
                icon={Trees}
                to="/trees"
                note="Tất cả trạng thái cây"
              />
              <Stat
                title="Thu hoạch xác nhận"
                value={data.confirmed.total}
                icon={Sprout}
                to="/tree-harvests?status=Confirmed"
                note="Hồ sơ đã được xác nhận"
              />
            </div>
            <EnvironmentPreview />
            <div className="dashboard-columns">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Hồ sơ thu hoạch</h2>
                    <p>{data.harvests.total} hồ sơ trong phạm vi truy cập</p>
                  </div>
                  <Link to="/tree-harvests">Xem tất cả →</Link>
                </div>
                {data.harvests.items.length ? (
                  <div className="activity-list">
                    {data.harvests.items.map((item) => (
                      <Link
                        className="activity"
                        key={item.id}
                        to={`/tree-harvests/${item.id}`}
                      >
                        <span className="section-icon">
                          <Sprout size={19} />
                        </span>
                        <div>
                          <strong>{item.season_name}</strong>
                          <small>
                            {item.batch_code} · {item.harvest_date}
                          </small>
                        </div>
                        <div className="activity-right">
                          <Badge status={item.status} />
                          <small>{number(item.total_weight_kg)} kg</small>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="data-state">
                    <Sprout size={30} />
                    <p>Chưa có hồ sơ thu hoạch.</p>
                  </div>
                )}
                <p className="table-note">
                  Hiển thị tối đa 5 hồ sơ theo thứ tự API trả về.
                </p>
              </section>
              <QuickLinks />
            </div>
          </>
        )}
      </DataState>
    </>
  );
}
function EnvironmentPreview() {
  return <IotMonitor compact />;
}
function QuickLinks() {
  return (
    <section className="panel quick-panel">
      <span className="section-label">TRUY CẬP NHANH</span>
      <h2>Công việc tại vườn</h2>
      <p>Tra cứu thông tin và theo dõi dữ liệu canh tác.</p>
      <Link to="/trees">
        <Trees size={21} />
        <span>
          <strong>Hồ sơ cây trồng</strong>
          <small>Giống, ngày trồng và trạng thái cây</small>
        </span>
        <ArrowUpRight size={17} />
      </Link>
      <Link to="/standards">
        <Leaf size={21} />
        <span>
          <strong>Tiêu chuẩn canh tác</strong>
          <small>Tiêu chuẩn và vật tư liên kết</small>
        </span>
        <ArrowUpRight size={17} />
      </Link>
      <Link to="/iot">
        <Radio size={21} />
        <span>
          <strong>Giám sát môi trường</strong>
          <small>Số đo gần nhất và lịch sử cảm biến</small>
        </span>
        <ArrowUpRight size={17} />
      </Link>
    </section>
  );
}
function AdminDashboard() {
  const { api } = useSession();
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [cooperatives, farms, zones, pending] = await Promise.all([
        api.request<Page<Cooperative>>("cooperatives?limit=6&offset=0", {
          signal,
        }),
        api.request<Page<Farm>>("farms?limit=1&offset=0", { signal }),
        api.request<Page<Zone>>("zones?limit=1&offset=0", { signal }),
        api.request<{ users: User[] }>("users/pending-managers", { signal }),
      ]);
      return { cooperatives, farms, zones, pending };
    },
    [api],
  );
  const resource = useResource("admin-overview", load);
  return (
    <>
      <PageHeader
        title="Tổng quan hệ thống"
        subtitle="Quản lý hợp tác xã, tài nguyên và tài khoản Manager chờ duyệt."
        actions={
          <button className="button secondary" onClick={resource.reload}>
            <RefreshCw size={16} />
            Làm mới
          </button>
        }
      />
      <DataState resource={resource}>
        {(data) => (
          <>
            <div className="stats-grid">
              <Stat
                title="Hợp tác xã"
                value={data.cooperatives.total}
                icon={Building2}
                to="/cooperatives"
                note="Tổng HTX trong hệ thống"
              />
              <Stat
                title="Vườn trồng"
                value={data.farms.total}
                icon={Leaf}
                to="/farms"
                note="Vườn đã được duyệt"
              />
              <Stat
                title="Khu vực"
                value={data.zones.total}
                icon={Map}
                to="/zones"
                note="Khu vực đã được tạo"
              />
              <Stat
                title="Manager chờ duyệt"
                value={data.pending.users.length}
                icon={Users}
                to="/pending-managers"
                note="Tài khoản cần xem xét"
                accent
              />
            </div>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Tài khoản Manager chờ duyệt</h2>
                  <p>Duyệt tài khoản và chỉ định hợp tác xã quản lý.</p>
                </div>
                <Link to="/pending-managers">Xem tất cả →</Link>
              </div>
              {data.pending.users.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Người đăng ký</th>
                        <th>Liên hệ</th>
                        <th>Ngày đăng ký</th>
                        <th>Trạng thái</th>
                        <th>Xem xét</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pending.users.slice(0, 5).map((user) => (
                        <tr key={user.id}>
                          <td>
                            <strong>{user.user_name}</strong>
                          </td>
                          <td>
                            {user.phone_number}
                            <small>{user.gmail}</small>
                          </td>
                          <td>{dateTime(user.created_at)}</td>
                          <td>
                            <Badge status={user.status} />
                          </td>
                          <td>
                            <Link
                              className="button secondary"
                              to="/pending-managers"
                            >
                              Xem duyệt
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="data-state">
                  <Users size={28} />
                  <p>Không có tài khoản Manager đang chờ duyệt.</p>
                </div>
              )}
              <p className="table-note">
                Hiển thị tối đa 5 tài khoản đang chờ.
              </p>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Hợp tác xã</h2>
                  <p>Thông tin quản lý và liên hệ HTX.</p>
                </div>
                <Link className="button secondary" to="/cooperatives/new">
                  Thêm hợp tác xã
                </Link>
              </div>
              {data.cooperatives.items.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Tên hợp tác xã</th>
                        <th>Người đại diện</th>
                        <th>Địa chỉ</th>
                        <th>Manager</th>
                        <th>Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.cooperatives.items.map((coop) => (
                        <tr key={coop.id}>
                          <td>
                            <Link
                              className="item-name"
                              to={`/cooperatives/${coop.id}`}
                            >
                              {coop.cooperative_name}
                            </Link>
                            <small>{coop.certificate_number}</small>
                          </td>
                          <td>{coop.director}</td>
                          <td>{coop.address}</td>
                          <td>
                            <Badge
                              status={coop.manager_id ? "Active" : "Pending"}
                            />
                            <small>
                              {coop.manager_id
                                ? "Đã có Manager"
                                : "Chưa có Manager"}
                            </small>
                          </td>
                          <td>
                            <Link
                              className="icon-button"
                              aria-label={`Xem ${coop.cooperative_name}`}
                              to={`/cooperatives/${coop.id}`}
                            >
                              <ArrowUpRight size={17} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="data-state">
                  <Building2 size={28} />
                  <p>Chưa có hợp tác xã.</p>
                </div>
              )}
              <div className="panel-bottom">
                <span>
                  Hiển thị {data.cooperatives.items.length} /{" "}
                  {data.cooperatives.total} HTX
                </span>
                <Link to="/cooperatives">Đến danh sách HTX →</Link>
              </div>
            </section>
            <div className="dashboard-columns">
              <section className="panel">
                <span className="section-label">THIẾT BỊ VÀ MÔI TRƯỜNG</span>
                <h2>Giám sát IoT</h2>
                <p className="muted">
                  Theo dõi kết nối trạm và dữ liệu cảm biến trong hệ thống.
                </p>
                <Link className="button secondary" to="/iot">
                  Mở giám sát IoT
                  <ArrowUpRight size={16} />
                </Link>
              </section>
              <QuickLinks />
            </div>
          </>
        )}
      </DataState>
    </>
  );
}

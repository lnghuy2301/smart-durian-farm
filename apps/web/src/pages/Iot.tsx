import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  Clock,
  Droplets,
  Radio,
  RefreshCw,
  Search,
  Thermometer,
} from "lucide-react";
import { useSession } from "../auth/session";
import { ApiError, queryString } from "../api/client";
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
  Device,
  DevicePresence,
  Page,
  Sensor,
  TelemetryPage,
  TelemetryRecord,
} from "../types/api";

export function IotPage() {
  return (
    <>
      <PageHeader
        title="Giám sát IoT"
        subtitle="Theo dõi trạm, số đo cảm biến và lịch sử trong phạm vi truy cập."
      />
      <IotMonitor />
    </>
  );
}
export function IotMonitor({ compact = false }: { compact?: boolean }) {
  const { api } = useSession();
  const [params] = useSearchParams();
  const zoneId = compact ? undefined : (params.get("zone_id") ?? undefined);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState("");
  const path = `devices${queryString({ q, zone_id: zoneId, limit: 20, offset })}`;
  const load = useCallback(
    (signal: AbortSignal) => api.request<Page<Device>>(path, { signal }),
    [api, path],
  );
  const resource = useResource(path, load);
  const device =
    resource.data?.items.find((item) => item.id === selected) ??
    resource.data?.items[0];
  return (
    <section className="panel iot-panel">
      <div className="panel-heading">
        <div>
          <span className="section-label">DỮ LIỆU THIẾT BỊ</span>
          <h2>{compact ? "Môi trường tại vườn" : "Chọn trạm giám sát"}</h2>
          <p>
            Số đo nhận gần nhất; kiểm tra thời gian và kết nối trước khi sử
            dụng.
          </p>
        </div>
        {compact ? (
          <Link to="/iot">Chi tiết IoT →</Link>
        ) : (
          <button
            className="icon-button"
            aria-label="Làm mới danh sách thiết bị"
            onClick={resource.reload}
          >
            <RefreshCw size={18} />
          </button>
        )}
      </div>
      {!compact && (
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(search.trim());
            setOffset(0);
            setSelected("");
          }}
        >
          <Field label="Tìm mã trạm">
            <input
              maxLength={100}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <button className="button secondary" type="submit">
            <Search size={16} />
            Tìm kiếm
          </button>
          {zoneId && (
            <Link className="button secondary" to="/iot">
              Tất cả khu vực
            </Link>
          )}
        </form>
      )}
      <DataState resource={resource} empty={resource.data?.items.length === 0}>
        {(data) => (
          <>
            <div className="station-toolbar">
              <Field label="Thiết bị / mã trạm">
                <select
                  value={device?.id ?? ""}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {data.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.station_id}
                    </option>
                  ))}
                </select>
              </Field>
              <span className="muted">
                {data.total} thiết bị trong phạm vi truy cập
              </span>
            </div>
            {device && (
              <DeviceMonitor
                key={device.id}
                device={device}
                compact={compact}
              />
            )}
            <Pagination
              {...data}
              onChange={(next) => {
                setOffset(next);
                setSelected("");
              }}
            />
            {compact && data.total > data.items.length && (
              <p className="table-note">
                Chọn trang để xem thêm trạm hoặc mở danh sách IoT.
              </p>
            )}
          </>
        )}
      </DataState>
    </section>
  );
}
function DeviceMonitor({
  device,
  compact,
}: {
  device: Device;
  compact: boolean;
}) {
  const { api } = useSession();
  const [latestOffset, setLatestOffset] = useState(0);
  const [sensorOffset, setSensorOffset] = useState(0);
  const [accessError, setAccessError] = useState<Error>();
  const key = `${device.id}/${latestOffset}/${sensorOffset}`;
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [presence, latest, sensors] = await Promise.all([
        api.request<DevicePresence>(`mqtt/devices/${device.id}/status`, {
          signal,
        }),
        api.request<TelemetryPage>(
          `telemetry/devices/${device.id}/latest${queryString({ limit: 20, offset: latestOffset })}`,
          { signal },
        ),
        api.request<Page<Sensor>>(
          `sensors${queryString({ device_id: device.id, limit: 100, offset: sensorOffset })}`,
          { signal },
        ),
      ]);
      return { presence, latest, sensors };
    },
    [api, device.id, latestOffset, sensorOffset],
  );
  const snapshot = usePollingResource(key, load);
  const denied = useCallback(
    (error: Error) => {
      setAccessError(error);
      snapshot.invalidate(error);
    },
    [snapshot.invalidate],
  );
  function reload() {
    setAccessError(undefined);
    snapshot.reload();
  }
  const resource = accessError
    ? { loading: false, error: accessError, reload }
    : { ...snapshot, reload };
  return (
    <div className="device-monitor">
      <div className="monitor-heading">
        <div className="actions">
          <Radio size={19} />
          <strong>{device.station_id}</strong>
        </div>
        <button
          className="button secondary"
          disabled={snapshot.refreshing}
          onClick={reload}
        >
          <RefreshCw size={15} className={snapshot.refreshing ? "spin" : ""} />
          {snapshot.refreshing ? "Đang cập nhật…" : "Làm mới số đo"}
        </button>
      </div>
      <p className="table-note">
        Tự cập nhật sau mỗi 15 giây khi trang đang hiển thị. Lần kiểm tra thành
        công: {snapshot.checkedAt ? dateTime(snapshot.checkedAt) : "Chưa có"}.
      </p>
      <DataState resource={resource}>
        {(data) => (
          <>
            <div className="presence-strip">
              <div>
                <span className="section-label">KẾT NỐI TRẠM</span>
                <Badge status={data.presence.connectivity} />
              </div>
              <div>
                <span className="section-label">TRẠNG THÁI THIẾT BỊ</span>
                <Badge status={data.presence.status} />
              </div>
              <div>
                <span className="section-label">TÍN HIỆU CUỐI</span>
                <strong>{dateTime(data.presence.last_seen_at)}</strong>
              </div>
            </div>
            {(!data.presence.broker_connected ||
              !data.presence.receiver_ready) && (
              <Notice kind="warning">
                Kênh nhận dữ liệu hiện chưa sẵn sàng. Số đo dưới đây là dữ liệu
                đã nhận trước đó, cần kiểm tra thời gian.
              </Notice>
            )}
            <p className="table-note">
              Trạm bị xem là mất kết nối sau{" "}
              {number(data.presence.offline_after_ms / 60000)} phút không có tín
              hiệu. Trạng thái thiết bị không biểu thị bật/tắt bơm.
            </p>
            <div className="sensor-cards">
              {data.latest.items.map((reading) => (
                <ReadingCard
                  key={reading._id}
                  reading={reading}
                  sensor={data.sensors.items.find(
                    (item) => item.data_stream_id === reading.data_stream_id,
                  )}
                />
              ))}
            </div>
            {data.latest.items.length === 0 && (
              <div className="data-state">
                <Radio size={30} />
                <p>Trạm chưa có số đo trong phạm vi truy cập.</p>
              </div>
            )}
            <Pagination {...data.latest} onChange={setLatestOffset} />
            <p className="table-note">
              Chỉ các giá trị còn trong bộ nhớ hiện tại. Dữ liệu có thể cũ dù
              trạm đang trực tuyến.
            </p>
            {!compact && (
              <>
                <SensorMetadata
                  data={data.sensors}
                  onChange={setSensorOffset}
                />
                <TelemetryHistory deviceId={device.id} onDenied={denied} />
              </>
            )}
          </>
        )}
      </DataState>
    </div>
  );
}
function ReadingCard({
  reading,
  sensor,
}: {
  reading: TelemetryRecord;
  sensor?: Sensor;
}) {
  const Icon =
    sensor?.sensor_type === "air_temperature"
      ? Thermometer
      : sensor
        ? Droplets
        : Radio;
  const mismatch = !!sensor && reading.unit !== sensor.unit;
  const comparable =
    !!sensor &&
    !mismatch &&
    sensor.min_threshold !== null &&
    sensor.max_threshold !== null;
  const outside =
    comparable &&
    sensor &&
    (reading.value < sensor.min_threshold! ||
      reading.value > sensor.max_threshold!);
  return (
    <article className="sensor-card">
      <div className="sensor-card-heading">
        <Icon size={19} />
        <span>{sensor?.name ?? `Stream ${reading.data_stream_id}`}</span>
      </div>
      <strong>
        {number(reading.value)}
        <span>{reading.unit}</span>
      </strong>
      <p>
        <Clock size={12} />
        {dateTime(reading.received_at)}
      </p>
      <small>Nhận packet: {dateTime(reading.measured_at)}</small>
      <small>
        Stream {reading.data_stream_id}
        {sensor?.status === "Inactive" ? " · Cảm biến đã ngừng sử dụng" : ""}
      </small>
      {mismatch && (
        <div className="sensor-warning">
          Đơn vị nhận {reading.unit} khác cấu hình {sensor.unit}; giữ nguyên giá
          trị.
        </div>
      )}
      {comparable && (
        <div className={`sensor-threshold ${outside ? "outside" : ""}`}>
          {outside ? "Ngoài" : "Trong"} ngưỡng cấu hình{" "}
          {number(sensor!.min_threshold!)}–{number(sensor!.max_threshold!)}{" "}
          {sensor!.unit}
        </div>
      )}
      {!sensor && (
        <small>
          Metadata của stream chưa nằm trong trang cảm biến đang tải.
        </small>
      )}
    </article>
  );
}
function SensorMetadata({
  data,
  onChange,
}: {
  data: Page<Sensor>;
  onChange: (offset: number) => void;
}) {
  return (
    <div className="monitor-section">
      <h3>Cấu hình cảm biến</h3>
      {data.items.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Cảm biến</th>
                <th>Stream</th>
                <th>Loại</th>
                <th>Đơn vị cấu hình</th>
                <th>Ngưỡng</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((sensor) => (
                <tr key={sensor.id}>
                  <td>{sensor.name}</td>
                  <td>{sensor.data_stream_id}</td>
                  <td>
                    {
                      {
                        air_temperature: "Nhiệt độ không khí",
                        air_humidity: "Độ ẩm không khí",
                        soil_moisture: "Độ ẩm đất",
                      }[sensor.sensor_type]
                    }
                  </td>
                  <td>{sensor.unit}</td>
                  <td>
                    {sensor.min_threshold !== null &&
                    sensor.max_threshold !== null
                      ? `${number(sensor.min_threshold)}–${number(sensor.max_threshold)}`
                      : "Chưa cấu hình"}
                  </td>
                  <td>
                    <Badge status={sensor.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Chưa có cảm biến được đăng ký.</p>
      )}
      <Pagination {...data} onChange={onChange} />
    </div>
  );
}
function TelemetryHistory({
  deviceId,
  onDenied,
}: {
  deviceId: string;
  onDenied: (error: Error) => void;
}) {
  const { api } = useSession();
  const [stream, setStream] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filter, setFilter] = useState<{
    data_stream_id?: string;
    from?: string;
    to?: string;
  }>({});
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const path = `telemetry/devices/${deviceId}/history${queryString({ ...filter, limit: 20, offset })}`;
  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        return await api.request<TelemetryPage>(path, { signal });
      } catch (failure) {
        if (
          !signal.aborted &&
          failure instanceof ApiError &&
          [403, 404].includes(failure.status)
        )
          onDenied(failure);
        throw failure;
      }
    },
    [api, path, onDenied],
  );
  const resource = useResource(path, load);
  return (
    <div className="monitor-section">
      <div className="panel-heading">
        <div>
          <h3>Lịch sử số đo</h3>
          <p>Theo thời điểm ghi nhận, từ mốc bắt đầu đến trước mốc kết thúc.</p>
        </div>
        <button
          className="icon-button"
          aria-label="Làm mới lịch sử số đo"
          onClick={resource.reload}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          if (
            (from && !Number.isFinite(Date.parse(from))) ||
            (to && !Number.isFinite(Date.parse(to))) ||
            (from && to && Date.parse(from) >= Date.parse(to))
          ) {
            setError("Khoảng thời gian phải hợp lệ và bắt đầu trước kết thúc.");
            return;
          }
          setError("");
          setOffset(0);
          setFilter({
            data_stream_id: stream || undefined,
            from: from ? new Date(from).toISOString() : undefined,
            to: to ? new Date(to).toISOString() : undefined,
          });
        }}
      >
        <Field label="Mã stream (không bắt buộc)">
          <input
            pattern="[A-Za-z0-9_-]+"
            maxLength={50}
            value={stream}
            onChange={(e) => setStream(e.target.value)}
          />
        </Field>
        <Field label="Từ lúc" hint="Giờ theo múi giờ máy đang sử dụng.">
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Đến trước lúc" hint="Giờ theo múi giờ máy đang sử dụng.">
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <button className="button secondary" type="submit">
          <Search size={16} />
          Lọc lịch sử
        </button>
      </form>
      {error && <Notice kind="error">{error}</Notice>}
      <DataState resource={resource} empty={resource.data?.items.length === 0}>
        {(data) => (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ghi nhận vào hệ thống</th>
                    <th>Backend nhận packet</th>
                    <th>Stream</th>
                    <th>Giá trị</th>
                    <th>Đơn vị nhận</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row._id}>
                      <td>{dateTime(row.received_at)}</td>
                      <td>{dateTime(row.measured_at)}</td>
                      <td>{row.data_stream_id}</td>
                      <td>{number(row.value)}</td>
                      <td>{row.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Notice kind="warning">
              Lịch sử tạm thời trong bộ nhớ (
              {number(data.storage.capacity_readings)} số đo dùng chung toàn hệ
              thống). Số đo cũ có thể bị loại bỏ; dữ liệu mất khi server khởi
              động lại.
            </Notice>
          </>
        )}
      </DataState>
      {resource.data && <Pagination {...resource.data} onChange={setOffset} />}
      <Link className="table-note" to="/zones">
        Xem khu vực được quyền truy cập
        <ArrowUpRight size={12} />
      </Link>
    </div>
  );
}

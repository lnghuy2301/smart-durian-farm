# IOT_TELEMETRIES — API, quy trình và tái lập

Nhánh kế thừa2026-10-09 đã có [ACTUATOR_TASKS](ACTUATOR_TASKS_IMPLEMENTATION.md) và [DOCX MQTT v1 ACK](MQTT_CONTRACT_V1_IMPLEMENTATION.md). ACK taskId/status/action chỉ receipt, do task handler xử lý, không ghi Telemetry; telemetry payload/quyền/FIFO10.000 không thay đổi. Backend168 tests đạt. Các giới hạn chưa có control/short ACK phía dưới ghi phạm vi delivery Telemetry ban đầu.

Ngày triển khai: 2026-10-07. Nhánh feat/iot-telemetries từ a656773 (kế thừa e1ad1a0 và MQTT d10ebd2). Module chỉ dùng RAM, chưa ghi MongoDB, chưa tạo collection/index/migration/seed. Không thay firmware, MQTT topics hoặc .env thật.

## Quyết định cuối và dữ liệu

- Hardware hiện gửi mỗi15 giây; backend lưu mọi reading được receiver chấp nhận, không đặt timer/throttle15 giây và không giảm history xuống15 phút.
- Tối đa10.000 readings toàn hệ thống, FIFO theo thứ tự ghi; vượt giới hạn bỏ readings cũ nhất. Một packet3 sensors là3 readings, không phải1.
- measured_at: thời điểm backend nhận/đọc packet MQTT. Đây là proxy thời gian đo, không phải clock thực của ESP32; không suy từ chu kỳ15 giây hoặc payload resultTime chưa có contract.
- received_at: thời điểm domain ghi vào store RAM. Hai mốc cùng UTC ISO8601, có thể bằng nhau theo độ phân giải millisecond. Khi persistence được chốt sau, received_at sẽ là lúc ghi database.
- ObjectId backend sinh, trả _id hex24 ký tự. Mỗi reading đúng shape ERD: _id, device_id UUID, data_stream_id string, measured_at, received_at, value number, unit string.
- Không thêm station_id/sensor_id/zone_id/type hoặc gom ba sensors vào một document. Station từ topic -> DEVICES.station_id -> DEVICES.id; Zone suy từ Device cố định.
- Unit nhận từ hardware giữ nguyên, tối đa16 ký tự như Sensor/parser; không convert, không thay bằng Sensor.unit, không đổi lịch sử khi sửa metadata. ERD telemetry còn varchar(8), người dùng cần cập nhật16; module không sửa/stage ERD riêng.
- Không dedup theo giá trị: hai packet cùng giá trị vẫn tạo readings riêng. Firmware không có message ID, chưa bảo đảm exactly-once.
- Device/Sensor phải Active và stream đã map. Inactive/Maintenance/unmapped không lưu mới, vẫn giữ lịch sử. ACK/retained/malformed/unknown/station mismatch không lưu.
- Bản đầu chỉ latest/history, không cảnh báo threshold, realtime push hoặc task/control.

## Phân quyền

| Actor Active | latest và history |
| --- | --- |
| Chủ Farm | Toàn bộ dữ liệu Device của Farm mình còn trong RAM; không cần assignment |
| Admin | Device tồn tại, bất kỳ Farm |
| Manager | Farm hiện thuộc HTX mình; Farm rời HTX thì mất quyền |
| Farmer nhận việc | Assignment Accepted đang hiệu lực [start,end); chỉ readings received_at thuộc khoảng assignment hiện tại |
| Farmer chưa accept/chưa đến start/đã hết phân công | Không được đọc cả latest lẫn history |
| Pending/Locked/Reject hoặc JWT không hợp lệ | Không truy cập |

Farmer cũ không có quyền lịch sử IoT, dù vẫn đọc lịch sử assignment của mình ở module Assignments. Assignment mới không mở readings trước start mới. Filter quyền chạy trước latest/total/pagination, không lộ tổng records ngoài khoảng được phép. Farmer mới chưa có reading sau start thấy items rỗng.

Dữ liệu không bị xóa chỉ vì assignment kết thúc hoặc metadata Inactive; owner vẫn đọc được. Không sửa/xóa qua HTTP. API xác định quyền từ JWT/store, không nhận user_id/role/assignment_id từ query.

## NestJS và luồng dữ liệu

AppModule dựng một TelemetryModule và truyền đúng instance cho MQTT. Imports cùng Auth/Farms/Zones/Devices/Sensors; store assignment lấy từ ZonesModule đã có. Không gọi forMock lần hai để tạo stores tách biệt.

Luồng: transport message -> mqtt.protocol parse -> MQTT lookup station/map Sensor/Active -> TelemetryService.record -> validate batch -> timestamp store -> ObjectIds -> FIFO. Controller GET đọc cùng store.

MQTT diagnostics vẫn FIFO200 packets và received_at của diagnostics vẫn là lúc nhận packet; telemetry.received_at là lúc ghi store. Không đổi contract diagnostics. Telemetry latest không phải trạng thái Online, không chứng minh relay hoặc task đã thực thi.

Map store giữ insertion order, eviction O(1) mỗi reading; không shift mảng lớn hoặc giữ latest cache ngoài giới hạn. GET quét tối đa10.000 records và trả bản sao, phù hợp demo. Latest chỉ lấy readings còn trong FIFO; nếu reading cuối của một stream bị đẩy ra thì stream biến mất khỏi latest.

## API

JWT Bearer bắt buộc. Base URL http://localhost:3000/api.

| Method/route | Query | Kết quả |
| --- | --- | --- |
| GET /telemetry/devices/:id/latest | data_stream_id?, limit?, offset? | Một reading mới nhất mỗi stream trong quyền và còn trong RAM, mới nhất trước |
| GET /telemetry/devices/:id/history | data_stream_id?, from?, to?, limit?, offset? | Readings mới nhất trước, lọc received_at |

:id là UUIDv4 DEVICES.id, không station_id. data_stream_id string exact case1..50 [A-Za-z0-9_-]; numeric301 từ MQTT tra metadata chuỗi301.

Pagination: limit mặc định20,1..100; offset mặc định0,0..100000. from/to ISO8601 có timezone, query [from,to); from>=to bị400. Nếu dùng +07:00 trong URL encode dấu + thành %2B. from/to chỉ history; field lạ bị400.

Response:

~~~json
{
  "device_id": "11111111-1111-4111-8111-111111111111",
  "items": [{
    "_id": "68e400000000000000000001",
    "device_id": "11111111-1111-4111-8111-111111111111",
    "data_stream_id": "301",
    "measured_at": "2026-10-07T01:00:00.000Z",
    "received_at": "2026-10-07T01:00:00.002Z",
    "value": 26.54,
    "unit": "C"
  }],
  "total": 1,
  "limit": 20,
  "offset": 0,
  "storage": {"mode": "Memory", "capacity_readings": 10000, "eviction": "OldestInserted"}
}
~~~

Ví dụ chỉ minh họa, không seed. total là tổng kết quả sau filter quyền/query đang còn, không phải tổng toàn hệ thống từ khi chạy. Latest total đếm streams sau chọn latest, trước phân trang.

200 hợp lệ (kể cả rỗng),400 UUID/query/date sai,401 thiếu/JWT invalid/tài khoản không còn quyền đăng nhập,403 tài khoản không Active ở service nội bộ,404 thiếu Device/outside scope/assignment hết. Không có POST/PATCH/DELETE/inject; trả404.

Latest/history sort theo thứ tự ghi server, ổn định khi timestamp bằng nhau; không dựa ObjectId để suy thứ tự hoặc so clock hardware. Clock hệ điều hành có thể điều chỉnh, không hứa clock monotonic. Offset có thể dịch khi packet mới/eviction; không phải snapshot/cursor.

## Cấu hình phải điền và Postman demo

Không thêm khóa Telemetry: chu kỳ do firmware, limit10000 cố định TELEMETRY_READING_LIMIT. Các khóa MQTT đã có trong .env/.env.example; người dùng điền broker domain/IP/port/TLS và credentials theo broker thật, station demo trong DEMO_DEVICE_STATION_ID. MQTT_ENABLED=true sau cấu hình; không tự đoán broker hoặc đọc/in secrets. Xem [MQTT_DEMO_AND_API_IDENTIFIERS.md](MQTT_DEMO_AND_API_IDENTIFIERS.md).

Import docs/postman/IOT-Telemetries-Local-Test.postman_collection.json (20 requests). Literal URLs/JSON, copy JWT/UUID bằng tay; không scripts/variables/environment. Credentials login trong collection chỉ mẫu local, phải sửa theo .env/tài khoản đã đăng ký, không export secrets thật.

1. Cấu hình broker trước restart; restart RAM mất metadata/JWT, login lại.
2. Dùng Farm/Zone/Devices/Sensors collections tạo metadata: Farm Accepted, Zone, Device đã lắp/cost, station_id đúng ESP32, Sensor stream đúng bộ hardware. DEMO_DEVICE_STATION_ID không auto-register Device.
3. Latest/history ban đầu items=[],total0. Bật receiver/broker, để ESP32 tự gửi; không gửi control. GET /mqtt/status với Admin đến subscribed=true.
4. Broker test riêng có thể phát topic publish/station/DEMO_STATION, retain=false, packet synthetic bên dưới. Device phải đăng ký DEMO_STATION và Sensor301/C trước.
5. Latest thấy giá trị mới nhất; history thêm readings mỗi lần gửi. Với nhiều sensors phải đăng ký từng stream đúng Device; không suy nghĩa302/303 từ số.
6. Sửa Sensor.unit, phát unit cũ: số/unit vẫn giữ nguyên, mismatch ở MQTT diagnostics. Inactive Sensor hoặc Device Maintenance ngừng lưu mới; history cũ giữ.
7. Farmer Pending invitation404; accept thì200 và chỉ dữ liệu từ start. End assignment thì cả latest/history404; owner history vẫn200. Manager ngoài HTX404.
8. Thử stream/range/pagination, limit0/UUID sai400, thiếu token401, POST history404. Sau FIFO10000 hoặc restart không thể đọc lại dữ liệu đã mất.

~~~json
{"stationId":"DEMO_STATION","sensorRecords":[{"dataStreamId":301,"result":"26.54 C"}]}
~~~

Đừng coi host broker public hoặc station_id là xác thực phần cứng. Live testing cần broker/ESP32 do operator cung cấp; session triển khai chỉ fake và TCP loopback localhost, không gửi tin/control thật.

## Kiểm thử và session tiếp theo

**147/147 tests, lint/typecheck/build đạt.** Có10 tests domain/HTTP/fake MQTT mới và1 MQTT.js TCP broker -> AppModule -> Telemetry -> HTTP mới, ngoài136 hồi quy. Các cases gồm identity/scopes/boundaries, timestamps, FIFO/eviction, raw units, no dedup, atomic validation và no HTTP mutation.

Một lượt chạy full cùng nhiều compiler processes làm loopback test mới quá deadline10s. Test HTTP loopback dùng budget60s để chứa startup/hash fixtures; npm test giới hạn2 test files đồng thời, tránh quá nhiều Nest/scrypt processes. Không nới validation nghiệp vụ.

Máy mới: npm ci ở root, không copy đè .env, sau đó:

~~~powershell
npm run lint
npm run typecheck
npm run build
npm test
~~~

Nếu npm wrapper Windows EPERM, từ apps/api dùng CLI đã cài theo thứ tự, không chạy full suite cùng compiler nặng:

~~~powershell
node ../../node_modules/eslint/bin/eslint.js src test integration
node ../../node_modules/typescript/bin/tsc --noEmit
node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json
node ../../node_modules/typescript/bin/tsc --outDir .test-dist
node --test --test-concurrency=2 --test-reporter=spec .test-dist/test
~~~

Module-only sau compile: node --test --test-concurrency=2 --test-reporter=spec .test-dist/test/telemetry.test.js .test-dist/test/mqtt-loopback.test.js. Không dùng .env thật/SMS/SMTP/database writes/broker live trong tests.

Session mới đọc AGENTS nếu có, status/branch/log, README/handoff/notes/plan/build spec, ERD/protocol và hai guides Telemetry. origin/main c71820d chưa có các nhánh IoT mới ở mốc này; kế thừa feat/iot-telemetries, không triển khai lại MQTT/metadata. Giữ sửa/xóa riêng của người dùng; không stage-all/reset/clean/push/merge ngoài yêu cầu.

Tiếp theo ACTUATOR_TASKS cần chốt confirmation/ACK/timeout và fail-safe bơm/van trước code. Persistence vẫn buổi riêng về MongoDB schema/index/retention và PostgreSQL migration/seed, không coi ObjectId hoặc driver hiện có là đã lưu database.

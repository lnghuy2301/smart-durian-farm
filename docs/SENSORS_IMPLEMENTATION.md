# Sensors — API, kiểm thử và tái lập

Ngày 2026-10-06; branch `feat/sensors-management`, base Devices `09cb1da`. Đây là module metadata NestJS chạy trong RAM của tiến trình backend, không phải localStorage trình duyệt. Restart mất Sensor, index, proposal và history. Không có bảng/migration/seed, MQTT connection, telemetry ghi MongoDB hoặc lệnh phần cứng mới.

## Phụ thuộc và quyền

AppModule tạo Auth/Users/Farms/Zones/Trees/Devices đúng một lần, truyền **cùng instance dynamic module** Devices vào SensorsModule. SensorsService dùng Devices → Zones → Farms và store Users đang chạy. Không gọi lại DevicesModule.forMock để có một store rỗng khác.

| Người dùng Active | Đọc metadata/history | Ghi |
|---|---|---|
| Admin | Toàn bộ | Chỉ gửi đề xuất Create/Update; không duyệt |
| Chủ Farmer | Sensor thuộc Farm mình | Tạo/sửa trực tiếp, duyệt/từ chối đề xuất Admin |
| Farmer nhận việc | Zone có Accepted assignment trong [start,end) | Không |
| Manager | Farm đang thuộc HTX mình | Không |

Scope được xét ở mỗi lần gọi, cả lookup Device/stream và history. HTX rời Farm hoặc assignment hết hiệu lực mất quyền đọc Sensor. Lịch sử phân công riêng và quyền correction Cultivation vẫn theo policy riêng; module này không cấp quyền mới.

## Contract theo ERD

| Field | Validation / hành vi |
|---|---|
| id | UUID v4 backend sinh, bất biến |
| device_id | UUID v4 của Device đã tồn tại, bất biến; không station_id |
| name | Chuỗi trim, 1–80 ký tự, được sửa |
| sensor_type | Air_temperature / Air_humidity / Soil_moisture, bắt buộc khi tạo, không sửa |
| unit | **% / oC**, bắt buộc khi tạo, được sửa giữa hai giá trị enum cho mọi loại |
| data_stream_id | Chuỗi 1–50 ký tự, [A-Za-z0-9_-], exact/case-sensitive; không số JSON/path/wildcard/khoảng trắng, bất biến |
| min_threshold / max_threshold | decimal(7,2), -99999.99..99999.99, tối đa 2 chữ số thập phân; cùng null hoặc cùng có và min < max |
| status | Active / Inactive; tạo bỏ qua mặc định Active, PATCH bỏ qua giữ nguyên |

Chỉ unique **(device_id, data_stream_id)**; không unique toàn hệ thống data_stream_id. Inactive vẫn giữ cặp định danh, không cho tạo lại để lách identity. Không đổi Device/type/stream, không hard-delete. Cho chuẩn bị metadata dưới Device Inactive; không cascade trạng thái Sensor khi Device đổi trạng thái.

**Không còn kiểm tra loại → đơn vị**: người dùng chọn một trong hai unit enum, ngoài enum trả 400. Swagger /api/docs hiển thị enum trên DTO tạo/sửa; frontend tương lai dùng cùng hai lựa chọn cho dropdown. Hiện chưa có frontend. Đổi unit không tự chuyển ngưỡng hay giá trị đo; nếu cần đổi ngưỡng gửi cùng PATCH. Metadata snapshots giữ unit trước/sau, telemetry tương lai phải giữ unit tại thời điểm đo, không diễn giải lại giá trị cũ theo metadata mới.

Ngưỡng bỏ qua khi tạo thành null/null. PATCH ghép với trạng thái hiện tại trước kiểm tra: từ 10/40 sửa min=20 hợp lệ; min=40 hoặc chỉ max=null bị chặn. Để bỏ cấu hình gửi min=null và max=null. Không nhận null cho name/unit/type/status/identity. Field ngoài DTO, immutable field (kể cả gửi giá trị cũ), PATCH rỗng và PATCH không đổi dữ liệu đều trả 400.

Composite unique và nullable thresholds hiện được enforce trong RAM. Khi bàn persistence cần review DDL/constraint/transaction và approval/history storage riêng; chưa tự thay ERD XML/JSON của người dùng.

## API

Base URL `http://localhost:3000/api`, Bearer JWT. Mọi id/path id là UUID v4 trừ mã stream.

| Method | Path | Hành vi |
|---|---|---|
| GET | /sensors | Danh sách đúng scope; limit, offset, q, device_id, sensor_type, status |
| GET | /sensors/by-stream/:deviceId/:dataStreamId | Lookup đúng cặp Device UUID + mã stream, vẫn kiểm tra quyền |
| GET | /sensors/:id | Một Sensor |
| GET | /sensors/:id/history | Snapshot metadata, limit/offset, quyền hiện tại |
| POST | /sensors | Chủ tạo trực tiếp |
| PATCH | /sensors/:id | Chủ sửa name/unit/min_threshold/max_threshold/status |
| POST | /sensors/requests | Admin đề xuất tạo, body giống create |
| POST | /sensors/:id/update-requests | Admin đề xuất sửa, body giống PATCH |
| GET | /sensor-requests | Admin/chủ đọc, limit/offset/status Pending/Accepted/Rejected |
| GET | /sensor-requests/:id | Admin hoặc chủ của đề xuất |
| PATCH | /sensor-requests/:id/approve | Chủ duyệt, body {} |
| PATCH | /sensor-requests/:id/reject | Chủ từ chối, body {} hoặc reason |

Pagination mặc định limit=20, offset=0; limit 1..100, offset 0..100000. q tối đa 100 ký tự, tìm name/data_stream_id không phân biệt hoa/thường; lọc scope trước phân trang. Kết quả {items,total,limit,offset}. Lookup stream vẫn exact, search không thay đổi định danh. POST 201; GET/PATCH 200. Không có DELETE.

Tạo ví dụ (thay Device UUID):
```json
{
  "device_id": "11111111-1111-4111-8111-111111111111",
  "name": "Nhiệt độ không khí",
  "sensor_type": "Air_temperature",
  "unit": "oC",
  "data_stream_id": "2",
  "min_threshold": 10,
  "max_threshold": 40
}
```

Sửa đơn vị và cấu hình ngưỡng, nếu cần:
```json
{ "unit": "%", "min_threshold": 20, "max_threshold": 80 }
```

Bỏ cấu hình ngưỡng:
```json
{ "min_threshold": null, "max_threshold": null }
```

## Approval, audit và tránh xung đột

Create proposal lưu riêng, sensor_id=null, chưa đăng ký Sensor và chưa reserve cặp mã. Khi duyệt recheck unique và capacity: chủ đã tạo cùng stream hoặc hai proposal cạnh tranh thì chỉ một commit, còn lại 409/Pending. Cùng stream của Device khác được phép.

Update proposal giữ sensor_snapshot và version; một Pending Update/Sensor. Chủ vẫn có thể sửa trực tiếp; proposal cũ không ghi đè sửa mới, approve trả 409 và giữ Pending. Chủ từ chối rồi Admin đọc lại/lập proposal mới. Không có merge âm thầm.

Approve kiểm tra reviewer đúng chủ Farmer Active, Admin proposer vẫn Active/role Admin, Farm/chủ hiện tại và version. Kiểm tra ngưỡng/capacity/unique trước ghi đồng bộ; không await giữa kiểm tra và commit. Chỉ đánh Accepted sau thành công. Reject không sửa Sensor và không thêm metadata history. Tài khoản đã bị khóa không được duyệt hoặc được dùng làm người đề xuất.

History gồm id, sensor_id, action Create/Update, actor_id (người thực thi/chủ duyệt), proposed_by/request_id nếu có, version tăng dần, changed_at UTC, before/after. Đây là RAM audit, không immutable hash-chain/Cultivation log. Response là deep copy; sửa object response không làm thay đổi store.

## Lỗi và giới hạn

- 400: DTO/enum/threshold/immutable/unknown field/no-op sai.
- 401: thiếu hoặc sai JWT.
- 403: role ghi/duyệt không được phép hoặc tài khoản không Active.
- 404: không có Sensor/Device/stream/proposal hoặc tài nguyên ngoài scope đọc.
- 409: trùng cặp stream, proposal đã xử lý, một Pending Update, version/proposer/owner xung đột.
- 429: RAM hết dung lượng; mutation bị chặn trước khi sửa Sensor/index/history.

RAM: tối đa 5000 Sensors, 2000 proposal (cả đã xử lý), 10000 history entries toàn store. Đầy history không nhận mutation mới; vẫn đọc/từ chối proposal. Không purge âm thầm. Một tiến trình/local-test; không chạy đa replica như có transaction DB. Threshold hiện chỉ metadata validation, chưa phát cảnh báo/chưa làm rule engine.

## Postman thủ công

Import [Sensors-Local-Test.postman_collection.json](postman/Sensors-Local-Test.postman_collection.json). Collection có 24 request, URL/JSON literal; không scripts, environment hay {{variables}}. Login bằng cấu hình fixture local của mình, không export JWT/password thật.

1. Đọc Devices guide, tạo Farm qua owner → Admin duyệt, Standard Active, Zone owner và Device owner; lấy **DEVICES.id UUID**. Farm cần join/Manager approval chỉ để kiểm thử scope Manager. Farmer nhận việc phải nhận assignment còn hiệu lực.
2. Login owner/Admin, copy access_token vào Authorization của request tương ứng bằng tay. Thay 1111... bằng Device UUID, 2222... bằng Sensor UUID, 3333... bằng Request UUID; không thay Sensor UUID vào device_id.
3. Tạo Sensor stream "2", đọc list/get/by-stream/history; sửa unit giữa oC/% và ngưỡng. Thử đơn vị ngoài enum/type immutable (400).
4. Thử cùng Device/stream (409), Device khác/stream "2" (201); Inactive không giải phóng cặp.
5. Admin POST đề xuất Create stream khác, copy request.id, chủ PATCH approve {}. Đề xuất chưa duyệt không xuất hiện list Sensor.
6. Admin đề xuất sửa; chủ đọc proposal rồi duyệt/từ chối. Kiểm thử stale: gửi proposal, chủ PATCH khác, approve cũ → 409, reject rồi tạo lại.
7. Manager/Farmer đọc bằng JWT thật của tài khoản được approve/nhận việc; PATCH trực tiếp → 403. Hết assignment không đọc metadata/history. Restart API xóa fixtures nghiệp vụ và cần tạo lại.

Các login trong collection là tài khoản mẫu local; thay bằng AUTH_TEST_PHONE/PASSWORD và AUTH_TEST_ADMIN_PHONE/PASSWORD của mình khi gửi, không commit giá trị thật. JWT hết hạn login lại, không cần environment Postman.

## Tái lập và kiểm thử cho session mới

Đọc AGENTS.md nếu có, git status/branch/log, MODULE_HANDOFF, IMPLEMENTATION_NOTES/PLAN, PROJECT_BUILD_SPEC, ERD XML/JSON và guide Devices/Sensors. Nhánh Sensors đã tồn tại và kế thừa Devices; không bắt đầu từ main c71820d làm mất Devices/Sensors. Actuators đợt kế tiếp dùng nhánh riêng kế thừa nhánh này nếu main chưa chứa nó.

Node 20.19+, npm ci từ root nếu dependencies chưa có. Không copy đè .env; module này không thêm biến/dependency. AUTH_MODE=mock, NODE_ENV=development; config DB cần tồn tại như trước nhưng CRUD Sensor không gọi DB. npm run dev:api từ root. Swagger /api/docs và /api/docs-json.

Checks từ root:
```powershell
npm run lint
npm run typecheck
npm run build
npm test
```

Nếu npm wrapper Windows bị EPERM, chạy tương đương từ apps/api:
```powershell
node ../../node_modules/eslint/bin/eslint.js src test integration
node ../../node_modules/typescript/bin/tsc --noEmit
node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json
node ../../node_modules/typescript/bin/tsc --outDir .test-dist
node --test --test-reporter=spec .test-dist/test
```

Kết quả: **107/107 tests** (9 Sensors + 98 hồi quy), lint/typecheck/build đạt. Test dùng fake config/SMTP/SMS và không đọc .env thật, không gửi tin hoặc dùng DB/hardware. Chưa test live MQTT; kết quả này không chứng minh hardware hoạt động. Test database integration là check riêng khi có DB, không nằm trong số tests này.

9 Sensors tests kiểm tra HTTP enum/immutable/validation/Swagger; đổi unit giữ ngưỡng/snapshot; composite unique cả Inactive; scope/owner/Admin approval; concurrent approve; stale version/role/deep copy; HTX và [start,end) assignment; filters/lookup/history; capacity lỗi không ghi nửa chừng. Logic khó được comment tại index, PATCH-null, commit và shared module.

Giữ .env/ERD/MQTT/Twilio/Users Postman riêng ngoài commit, không reset/clean/stage-all. Chỉ commit local đúng file module; chưa push/merge nhánh Devices/Sensors. Không suy quyền publish nhánh cũ thành quyền gửi module mới.

## Tiếp theo

Cập nhật sau Sensors: Actuators metadata đã hoàn tất trên feat/actuators-management từ Sensors c9d0940, enum Watering/Spraying/Shared cho bơm dùng chung. Đọc ACTUATORS_IMPLEMENTATION.md và MODULE_HANDOFF.md; kết quả tích hợp mới nhất 116 tests. Các bước đề xuất Actuators trong bản Sensors là lịch sử; không triển khai lại. MQTT core là bước tiếp theo cần trao đổi correlation/timeout/bơm–van, persistence vẫn bàn riêng.

Actuators metadata là bước tiếp theo trước MQTT core. Khi chưa rõ capability_id immutable/composite uniqueness, purpose và status thì trao đổi trước code. MQTT giữ subscribe/station/{station_id}, publish/station/{station_id}; topic station → Device UUID → stream lookup bằng cặp, không station_id secret/auth_token. ACK/correlation/timeout/retry/presence phải được thảo luận và kiểm thử riêng. Persistence/proposals/history schema và Cultivation/hash-chain vẫn là đợt riêng.

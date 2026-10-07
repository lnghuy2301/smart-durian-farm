# IoT metadata — cập nhật theo tài liệu 2026-10-07

Metadata commit **939c350** (119 tests). Nhánh **feat/mqtt-communication** kế thừa commit này, đã có receiver/diagnostics (134 tests); xem [MQTT_COMMUNICATION_IMPLEMENTATION.md](MQTT_COMMUNICATION_IMPLEMENTATION.md). Các mô tả “đợt tiếp theo” dưới đây ghi phạm vi nhánh metadata, receiver đã có trên nhánh MQTT.

Nhánh `feat/iot-core-metadata-update`, base Actuators `95c15fc`. Nguồn đã đọc đầy đủ: ERD_DIAGRAM.xml, IOT_CORE_TABLES_SPEC.md, MQTT_HARDWARE_PROTOCOL_VERIFIED.md. Tài liệu mới thay thế hướng dẫn Devices/Sensors/Actuators cũ; các file cũ người dùng đã xóa được giữ nguyên trạng thái, không phục hồi/stage.

## Quyết định cuối và thay đổi

- DEVICES.status: Active / Inactive / Maintenance, là trạng thái quản trị. Offline không lưu trong enum. last_seen_at nullable, tạo luôn null, chỉ receiver nội bộ cập nhật bằng giờ server khi nhận bản tin hợp lệ. PATCH của client không sửa last_seen_at.
- Người dùng chốt trực tiếp: **chỉ đăng ký Device đã lắp**, installed_at và cost NOT NULL/bắt buộc như trước. Không áp dụng gợi ý đăng ký trước khi lắp ở spec. installed_at ISO timezone lưu UTC; cost 0..99999999.99, hai chữ số thập phân.
- SENSORS.sensor_type: air_temperature / air_humidity / soil_moisture; loại vẫn bất biến. Unit **varchar(16)**, chuỗi trim 1..16, không còn enum %/oC. C, %, %rH, oC hoặc chuỗi cấu hình khác trong giới hạn đều được phép. Đổi unit chỉ sửa metadata, không đổi ngưỡng/dữ liệu đo.
- ACTUATORS.purpose: watering / spraying / shared; purpose vẫn bất biến. Bơm chung có capability riêng; không gán van 3/4 tưới/phun dựa vào mã số hoặc đoán nghĩa streams 302/303.
- UUID Device/Actuator/Sensor khác station_id/stream/capability. Composite unique giữ nguyên (device_id, data_stream_id) và (device_id, capability_id), kể cả Inactive.
- Không persistence/migration/seed, chuyển Zone/Device, hard-delete/auth_token/current_state. Metadata vẫn RAM, restart mất dữ liệu. Nhánh MQTT kế tiếp chỉ giao tiếp; IOT_TELEMETRIES/ACTUATOR_TASKS cần specification riêng.

## Quyền và API giữ nguyên

Chủ Farmer Active tạo/sửa trực tiếp; Admin đọc tất cả nhưng ghi qua proposal Create/Update cần đúng chủ duyệt. Manager chỉ đọc Farm hiện thuộc HTX; Farmer có Accepted assignment chỉ đọc trong [start,end). Scope/list/history/lookup dùng shared Auth/Farms/Zones/Devices, không tạo store trùng.

| Module | Route |
|---|---|
| Devices | GET/POST /api/devices; GET/PATCH /:id; GET /by-station/:stationId; GET /:id/trees; GET /:id/history |
| Sensors | GET/POST /api/sensors; GET/PATCH /:id; GET /by-stream/:deviceId/:dataStreamId; GET /:id/history |
| Actuators | GET/POST /api/actuators; GET/PATCH /:id; GET /by-capability/:deviceId/:capabilityId; GET /:id/history |
| Admin proposal | POST /api/{devices,sensors,actuators}/requests; POST /:id/update-requests |
| Review | GET /api/{device,sensor,actuator}-requests; GET /:id; PATCH /:id/approve {}; PATCH /:id/reject {reason?} |

List limit 1..100 (default20), offset0..100000 (default0), q≤100. Device filter zone_id/status; Sensor device_id/sensor_type/status; Actuator device_id/purpose/status. Request filter Pending/Accepted/Rejected. POST201, GET/PATCH200. JWT Bearer bắt buộc. 400 validation/no-op/immutable, 401 JWT, 403 role/state, 404 missing/outside read scope, 409 unique/stale/proposal, 429 capacity.

Device immutable id/station_id/zone_id; Sensor immutable id/device_id/data_stream_id/sensor_type; Actuator immutable id/device_id/capability_id/purpose. PATCH Sensor sửa name/unit/ngưỡng/status; Actuator chỉ name/status. Name1..80. Metadata data_stream_id string1..50 [A-Za-z0-9_-], exact; numeric MQTT stream sẽ chuyển thành string ở gateway. capability_id body JSON number nguyên1..Number.MAX_SAFE_INTEGER, không string/rounded bigint. Sensor ngưỡng cùng null hoặc đủ hai decimal(7,2) và min<max; PATCH xét cặp sau ghép.

Proposal không reserve mã; Create recheck unique khi approve. Update giữ version/snapshot, một Pending Update/entity; chủ sửa khiến proposal stale409, reject rồi tạo lại. Reviewer đúng chủ, proposer Admin Active, context hiện tại. Commit RAM đồng bộ/audit trước Accepted, response deep copy. recordSeen không tăng version hoặc ghi audit metadata; dữ liệu hiện tại last_seen_at được giữ khi duyệt, không lấy giá trị cũ của proposal ghi đè. Timestamp chỉ tăng, bản tin xử lý trễ không làm lùi last_seen_at.

RAM limits Devices1000, Sensors5000, Actuators5000; mỗi store proposals2000/history10000. Không tự purge, vẫn đọc/reject khi đầy audit.

## Nhập JSON và Postman

Import từng collection Devices/Sensors/Actuators-Local-Test.postman_collection.json, mỗi collection24 request; literal URL/JSON, không scripts/env. Copy JWT/UUID bằng tay. Đã đổi lowercase enums, unit free string≤16; station demo giả lập, không hardcode mã trạm thật. Mã stream/capability ví dụ không tự đăng ký mapping firmware.

1. Tạo Farm/chủ/Admin duyệt, Standard Active, Zone/chủ, Device đã lắp đủ installed_at/cost.
2. Tạo Sensor với sensor_type chữ thường, data_stream_id metadata string và unit kỳ vọng; không đoán 302/303. Tạo Actuator purpose chữ thường/capability theo lắp đặt thật; shared cho bơm chung, watering/spraying cho van đúng đường.
3. Chủ PATCH hoặc Admin đề xuất/chủ approve/reject. Test same Device/code409, Device khác cùng code201, stale409, Manager/Farmer read scope.
4. last_seen_at lúc tạo null, PATCH không được sửa; receiver MQTT đợt tiếp theo mới cập nhật. Maintenance giữ dữ liệu cũ và không tạo trạng thái relay.
5. Restart tạo lại fixtures nghiệp vụ; JWT hết hạn login lại. Không export secret/JWT thật.

## Tái lập session khác

Đọc AGENTS.md nếu có, git status/branch/log, handoff/notes/plan/spec và ba tài liệu mới. Không thấy AGENTS ở repo/cha đã kiểm tra. Nhánh metadata kế thừa module chain, không từ main c71820d cũ thiếu Devices/Sensors/Actuators. Nhánh MQTT kế thừa commit cập nhật metadata. Không push/merge hoặc stage user deletions/ERD/protocol/spec/Postman riêng/.env.

Node20.19+, npm ci root nếu thiếu deps; không copy đè .env. Không biến/dependency mới cho metadata. npm run dev:api; Swagger /api/docs. Khi npm wrapper Windows EPERM, từ apps/api:
```powershell
node ../../node_modules/eslint/bin/eslint.js src test integration
node ../../node_modules/typescript/bin/tsc --noEmit
node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json
node ../../node_modules/typescript/bin/tsc --outDir .test-dist
node --test --test-reporter=spec .test-dist/test
```
Kết quả nhánh metadata: **119/119 tests**, lint/typecheck/build đạt (3 tests mới + 116 tests hồi quy cập nhật contract). Nhánh này không thêm dependency hoặc kết nối broker.

3 tests mới kiểm tra lowercase/unit varchar, last_seen monotonic/no stale/no client mutation, Maintenance owner/Admin flow. Các tests module cũ được cập nhật theo contract mới. Fake config/providers, không đọc .env thật/tin thật/DB/hardware.

## Điểm tiếp theo

MQTT topic publish/station/{stationId} nhận cả telemetry và ACK; payload stationId phải khớp topic. Numeric stream301/302/303 là quan sát hardware, không hằng số hệ thống. Parse result giữ receivedUnit thật. ACK ngắn không taskId, tuyệt đối không dùng để xác nhận một task hay On/Off suy đoán. DEVICES.status==Active và Sensor.status==Active mới nhận measurement cho xử lý bình thường; Inactive/Maintenance giữ lịch sử, ghi lý do. Unit mismatch giữ measurement/unit thật và ghi nhận; chưa specification/schema/persistence IOT_TELEMETRIES/ACTUATOR_TASKS.

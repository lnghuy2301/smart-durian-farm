# Sensors — thiết kế chuẩn bị và quyết định đang chờ

Ngày 2026-10-06. Branch `feat/sensors-management`, base `feat/devices-management` commit `09cb1da`. **Chưa có Sensors API/store; một quyết định về sửa định danh/loại/đơn vị đang chờ.** Không coi đề xuất dưới đây là đã duyệt.

## Trạng thái đã kiểm tra

- Không tìm thấy AGENTS.md trong repository và các thư mục cha được kiểm tra. Git status/branch/log đã kiểm tra; không triển khai lại Devices hoặc các module trước.
- Devices base đã đạt 98/98 tests, lint/typecheck/build; đây là kết quả của base, không phải kiểm thử Sensors mới. Main local c71820d chỉ chứa module tới Harvests, nên branch Sensors kế thừa Devices để giữ đầy đủ phụ thuộc.
- Đã đọc handoff/notes/plan/spec, guide Devices và ERD XML/JSON. Field SENSORS và IOT_TELEMETRIES khớp giữa hai ERD. Không sửa ERD/MQTT/Postman riêng hoặc .env.

## Quyết định người dùng đã chốt

1. Quyền như Devices: chủ Farmer tạo/sửa trực tiếp; Admin đề xuất Create/Update cần đúng chủ Farm duyệt; Manager đọc trong HTX mình, Farmer nhận việc chỉ đọc Zone có phân công Accepted đang hiệu lực [start,end). Admin đọc toàn bộ. Quyền sửa metadata không cấp quyền điều khiển hardware.
2. UUID Sensor là id nội bộ; device_id tham chiếu UUID Device. data_stream_id là mã luồng firmware, không UUID sensor_id. **Unique theo cặp (device_id, data_stream_id), không unique toàn hệ thống.** Hai ESP32 có thể cùng dùng stream "2"; cùng một Device không có hai Sensor dùng cùng stream. Telemetry vẫn chứa device_id UUID + data_stream_id.
3. Cho phép ngưỡng chưa cấu hình: min_threshold/max_threshold cùng null. Khi cấu hình phải có cả hai và min < max. Air_temperature dùng oC, Air_humidity/Soil_moisture dùng %. Không tự ghi lệnh hardware từ việc sửa ngưỡng.
4. Dùng RAM và shared module/store như Devices; không tạo bảng/migration/seed. MQTT/telemetry/control và Actuators làm đợt riêng tiếp theo, giữ nguyên protocol hiện có.

## Field theo ERD

| Field | Kiểu / ý nghĩa |
|---|---|
| id | UUID backend sinh |
| device_id | UUID tham chiếu DEVICES.id |
| name | varchar(80) |
| sensor_type | Air_temperature / Air_humidity / Soil_moisture |
| unit | oC hoặc %, khớp loại |
| data_stream_id | varchar(50), mã luồng phần cứng |
| min_threshold | decimal(7,2), nullable theo quyết định mới |
| max_threshold | decimal(7,2), nullable theo quyết định mới |
| status | Active / Inactive |

Composite unique và nullability ngưỡng đã được người dùng chốt cho nghiệp vụ; chưa tạo constraint hoặc sửa schema thật. Cần đồng bộ ERD/DDL khi persistence được thảo luận, không suy từ store RAM thành migration.

## Quyết định còn chờ — không code trước trả lời

Telemetry tham chiếu device_id + data_stream_id, không sensor_id. Nếu đổi Device/mã luồng/loại/đơn vị trên Sensor cũ, cách đọc lịch sử có thể sai. Đã hỏi người dùng:

- Đề xuất đợt đầu cố định device_id, data_stream_id, sensor_type, unit sau đăng ký. Chỉ sửa name, ngưỡng, Active/Inactive. Inactive giữ cặp mã, không hard-delete hoặc chuyển Sensor sang Device khác.
- Lựa chọn khác: cho sửa loại/đơn vị để chỉnh nhập nhầm, nhưng device_id/data_stream_id vẫn cố định. Nếu chọn cách này phải lưu snapshot trước/sau và chốt cách diễn giải telemetry lịch sử ở module IoT; không tự chuyển đổi giá trị lịch sử.

Lựa chọn mặc định/thời gian chờ không phải chấp thuận. Không hỏi lại quyền, composite uniqueness hoặc ngưỡng đã chốt. Các route/DTO/store runtime chỉ viết sau khi có câu trả lời.

## Cách triển khai sau khi chốt

- SensorsModule nhận chính Auth/Farms/Zones/Devices dynamic module đã tạo ở AppModule; không gọi lại factory tạo store trùng. Phạm vi Sensor suy Device -> Zone -> Farm và dùng cùng quyền đọc Zone/phân công hiện tại.
- Index composite bằng cấu trúc tách theo device_id/stream, không map toàn hệ thống theo data_stream_id. Lookup nội bộ MQTT sau này phải nhận đủ UUID Device và mã stream. Public HTTP lookup vẫn kiểm tra JWT/scope, không coi mã stream là authentication.
- Create proposal chưa đăng ký Sensor/chưa giữ chỗ cặp mã, recheck unique lúc chủ duyệt. Update proposal dùng version/snapshot như Devices; chỉ Accepted sau commit Sensor/index/history thành công. Check capacity, quyền và dữ liệu trước khi ghi, không await giữa validate/commit RAM.
- Ngưỡng xác thực trên toàn bộ trạng thái sau PATCH, không chỉ từng field; gửi một field có thể hợp lệ nếu giá trị hiện tại của field còn lại tồn tại và cặp vẫn đúng. Để bỏ cấu hình gửi cả hai null; không cho chỉ một ngưỡng null. Unit phải khớp sensor_type, không tin unit tùy ý từ client.
- Comment tiếng Việt ở composite lookup/unique, ngưỡng null/PATCH, recheck/version/commit và phân biệt UUID/mã luồng. DTO validate enum/decimal/UUID/timestamp audit theo conventions hiện tại.
- Tạo SENSORS_IMPLEMENTATION.md, Postman literal URL/JSON và tests tập trung scope, cùng stream khác Device được phép/cùng Device bị chặn, nullable pair, unit/type, version/đồng thời, deep-copy và capacity. Chạy lint/typecheck/build/toàn bộ tests; không ghi số tests mới trước khi chạy.

## Tái lập session khác

1. Đọc AGENTS.md nếu có, git status/branch/log, MODULE_HANDOFF/notes/plan/spec, ERD XML/JSON, guide Devices và tài liệu này.
2. Tiếp tục feat/sensors-management đã tạo từ 09cb1da; không tạo lại module/branch. Kiểm tra câu trả lời còn chờ trước code.
3. Giữ .env/ERD/MQTT/Postman riêng ngoài commit; không reset/clean hoặc stage toàn bộ workspace. Không push branch mới theo quyền xuất bản các nhánh cũ.
4. Sau khi chốt, hoàn thành code/tests/guide/Postman, cập nhật README/handoff/notes/plan/spec và commit local đúng danh sách file. Persistence, MQTT và Actuators cần quy trình riêng.

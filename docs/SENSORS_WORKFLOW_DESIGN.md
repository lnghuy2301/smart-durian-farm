# Sensors — quy trình đã chốt

Ngày 2026-10-06. Nhánh `feat/sensors-management` kế thừa Devices `09cb1da`; API/store/kiểm thử đã triển khai. Đọc [hướng dẫn API và tái lập](SENSORS_IMPLEMENTATION.md). Những câu hỏi ở bản chuẩn bị đã được trả lời, không tiếp tục dùng quy tắc loại → đơn vị cũ.

## Quyết định cuối

1. Quyền giống Devices: chủ Farmer tạo/sửa trực tiếp; Admin đọc và đề xuất Create/Update, cần đúng chủ Farm duyệt. Manager chỉ đọc HTX mình; Farmer nhận việc chỉ đọc trong Zone có phân công Accepted đang hiệu lực [start,end). Mọi tài khoản phải Active. Không cấp quyền điều khiển hardware.
2. `id` là UUID Sensor do backend sinh; `device_id` là UUID DEVICES.id. `data_stream_id` giữ đúng mã phần cứng. Unique theo **(device_id, data_stream_id)**, không unique stream toàn hệ thống. ESP32 khác có thể cùng stream "2". Inactive vẫn giữ cặp mã.
3. `id/device_id/data_stream_id/sensor_type` bất biến, không chuyển Device/hard-delete. Loại: Air_temperature, Air_humidity, Soil_moisture.
4. **Unit là dropdown enum gồm đúng `%` và `oC`**, được đổi giữa hai giá trị cho mọi sensor_type. Không nhận đơn vị ngoài enum, không ép loại nào chỉ dùng một đơn vị. Quyết định cuối này thay thế mapping Air_temperature → oC, độ ẩm → % trong bản thảo.
5. Ngưỡng cùng null khi chưa cấu hình; khi có phải đủ hai số và min < max. PATCH xét cặp sau khi ghép với dữ liệu hiện tại. Muốn bỏ cấu hình gửi cả hai null. Đổi unit chỉ sửa metadata, không tự đổi giá trị ngưỡng hay dữ liệu đo; người cấu hình chỉnh ngưỡng tương ứng khi cần.
6. Active/Inactive là trạng thái metadata; không online/offline. Cho cấu hình Sensor thuộc Device Inactive để chuẩn bị lắp đặt; không tự đổi Sensor.status khi Device.status đổi.
7. Dùng RAM/shared modules, không tạo schema/migration/seed. MQTT, telemetry, threshold alerts và Actuators làm riêng; giữ protocol/topic hiện có. Telemetry tương lai dùng Device UUID + stream và giữ unit ở thời điểm đo.

## Luồng ghi và duyệt

- Chủ tạo Sensor hoặc PATCH tên/unit/ngưỡng/status: áp dụng ngay, tăng version và thêm snapshot before/after.
- Admin gửi Create proposal: chưa tạo Sensor và chưa giữ chỗ cặp mã. Chủ duyệt: kiểm tra lại chủ/proposer Active và vai trò, Device → Zone → Farm, capacity và unique trước commit. Hai đề xuất trùng chỉ một được chấp nhận.
- Admin gửi Update proposal: lưu snapshot/version/nội dung riêng, Sensor chính chưa thay đổi. Một Pending Update/Sensor. Chủ sửa trực tiếp trong lúc chờ khiến đề xuất cũ lỗi thời; duyệt trả 409, phải từ chối rồi tạo lại.
- Commit RAM không có await giữa kiểm tra và ghi; chỉ đánh Accepted sau Sensor/index/audit thành công. Từ chối không sửa Sensor. History đọc theo quyền hiện tại; hết phân công chỉ giữ lịch sử phân công riêng, không quyền xem metadata Sensor.
- Trả deep copy cho dữ liệu/proposal/audit. Index hai tầng Device → stream tránh unique toàn hệ thống hoặc key ghép bị nhập nhằng.

## Tiếp tục ở session khác

1. Đọc AGENTS.md nếu có, git status/branch/log và handoff/notes/plan/spec, hai ERD, guide Devices/Sensors. Module Sensors đã xong, không tạo lại.
2. Tiếp tục trên nhánh này hoặc nhánh kế thừa nếu main chưa chứa Devices/Sensors. Nhánh Sensors đã tạo trước code; không tạo branch trùng.
3. Test theo SENSORS_IMPLEMENTATION.md và import collection Sensors JSON trực tiếp. 107/107 tests (9 mới + 98 hồi quy), lint/typecheck/build đạt, fake providers không .env thật/tin thật/DB/hardware.
4. Giữ thay đổi riêng ERD/MQTT/Postman và .env; chỉ stage file đúng module, không reset/clean/stage toàn bộ. Nhánh mới chưa push/merge; quyền publish các nhánh cũ không áp dụng tự động.
5. Actuators là metadata tiếp theo, rồi MQTT core. Dừng trao đổi khi chưa rõ nghiệp vụ, nhất là capability_id/status/purpose, command correlation/timeouts/ACK. Persistence bàn riêng.

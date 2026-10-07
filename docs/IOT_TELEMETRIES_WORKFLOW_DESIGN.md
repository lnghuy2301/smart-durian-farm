# IOT_TELEMETRIES — quyết định cuối và thiết kế

Chốt/triển khai 2026-10-07 trên feat/iot-telemetries, từ a656773, kế thừa e1ad1a0/MQTT d10ebd2. Guide API, Postman, cấu hình, limits và tái lập ở [IOT_TELEMETRIES_IMPLEMENTATION.md](IOT_TELEMETRIES_IMPLEMENTATION.md). Đã đạt147/147 tests, lint/typecheck/build. Không còn câu hỏi Telemetry chờ trả lời.

## Quyết định người dùng

1. Lưu mọi reading hợp lệ nhận mỗi15 giây theo chu kỳ hardware hiện tại; không throttle hoặc lưu15 phút.
2. RAM tối đa10.000 readings toàn hệ thống; FIFO bỏ readings được ghi cũ nhất. Không dedup theo giá trị.
3. Farmer chỉ đọc khi assignment Accepted đang hiệu lực; Farmer cũ không được xem lịch sử IoT. Trong lúc còn hiệu lực chỉ xem readings thuộc khoảng assignment hiện tại [start,end), không mở dữ liệu trước khi nhận việc.
4. Chủ Farm/Admin và Manager đúng HTX đọc đúng scope qua shared stores hiện tại.
5. measured_at là giờ backend nhận/đọc MQTT vì payload không có timestamp; received_at là giờ ghi store RAM. Không thay/intervene firmware hoặc dùng chu kỳ gửi để suy clock đo.
6. Unit raw tối đa16, giữ nguyên số/unit, không convert hoặc overwrite từ metadata. ERD telemetry còn8 cần người dùng đồng bộ; agent không sửa/stage ERD.
7. Bản đầu latest/history; không automatic thresholds/control/realtime push/persistence.

## Invariants khó

- Mỗi document là một reading: _id ObjectId hex, device_id UUID, data_stream_id string, measured_at, received_at, value, unit. Không sensor_id/zone_id/station_id; Zone suy từ Device cố định.
- Station topic lookup -> Device UUID -> Sensor composite (device_id,stream). MQTT chỉ chuyển readings accepted; domain recheck metadata/batch trước khi ghi.
- Không lưu ACK/unknown/retained/malformed/identity mismatch; Inactive/Maintenance không lưu mới. Không xóa history cũ chỉ vì metadata/status/assignment thay đổi.
- Lọc quyền trước latest/total/pagination. Pending invitation không cấp quyền; đúng end_date mất cả hai API; assignment mới không kéo dài quyền trên readings cũ.
- Same TelemetryModule instance cho AppModule/MqttModule/controller, không store trùng hoặc dependency cycle.
- MQTT diagnostics received_at vẫn nghĩa arrival cũ, khác telemetry received_at nghĩa store-write. Hai clock server có thể bằng nhau tới millisecond.
- FIFO Map insertion order, O(1) eviction; clock hệ thống điều chỉnh không đổi FIFO. Không latest cache giữ dữ liệu đã evict. Snapshot trả ra không cho client sửa store.
- Restart mất RAM; API phản ánh history đang còn, không hứa archive/database. Offset pagination có thể dịch khi nhận packet mới.

## Những việc đã làm

- TelemetryModule/service/store/controller/DTO/types; GET /api/telemetry/devices/:id/latest và /history.
- Filter stream exact, from/to trên received_at [from,to), pagination20 mặc định/max100, timestamp có timezone, query lạ400.
- MQTT receiver nối domain, shared metadata/assignment stores; ObjectId từ driver đã có, không dependency/env key mới.
- 10 domain/HTTP/fake tests và1 TCP MQTT.js -> App -> Telemetry -> HTTP test bổ sung; 136 hồi quy.
- Full147 đạt với test-concurrency2. Giới hạn test files đồng thời và budget60s cho loopback có App startup tránh resource contention; không nới nghiệp vụ.
- Postman20 requests literal JSON/URL, không scripts/env; guide hướng dẫn tạo metadata/copyJWT/UUID rồi gửi synthetic packet qua broker test.
- .env/file ERD/MQTT/Postman riêng được giữ nguyên. Không push/merge.

## Tiếp theo

ACTUATOR_TASKS cần hỏi confirmation/ACK không taskId, timeout, safety và trình tự bơm/van trước code. Persistence PostgreSQL/MongoDB phải thảo luận riêng. Không lấy mô tả tasks/control cũ trong build spec làm quyết định đã duyệt.

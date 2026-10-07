# IOT_TELEMETRIES — thiết kế module, chờ chốt nghiệp vụ

Ngày chuẩn bị: 2026-10-07. Nhánh feat/iot-telemetries từ fix/registration-proof-atomicity e1ad1a0. Chưa viết code Telemetry; đây là bản thiết kế để xác nhận, không phải guide API đã triển khai.

## Căn cứ hiện hành

- ERD_DIAGRAM.xml: mỗi reading một document gồm _id, device_id, data_stream_id, measured_at, received_at, value, unit.
- IOT_CORE_TABLES_SPEC.md: chỉ nhận khi Device/Sensor Active, giữ incoming unit; unit mismatch không làm mất giá trị hoặc tự convert.
- MQTT_HARDWARE_PROTOCOL_VERIFIED.md và MQTT_COMMUNICATION_IMPLEMENTATION.md: nhận sensorRecords trên publish/station/{stationId}; topic station tra DEVICES.station_id -> DEVICES.id UUID. stream hardware numeric đổi sang chuỗi.
- Không thêm sensor_id/zone_id/type hay ba giá trị cảm biến cố định vào document. Zone suy từ Device; chưa cho di chuyển Device.
- Store nghiệp vụ hiện RAM; MQTT diagnostics FIFO200 không phải lịch sử. Chưa mở MongoDB persistence, không sửa firmware/topics hoặc file ERD riêng. Ngoại lệ cấu hình demo theo yêu cầu bổ sung: append khóa MQTT còn thiếu vào .env, giữ nguyên giá trị cũ; DEMO_DEVICE_STATION_ID chỉ tham chiếu operator, xem MQTT_DEMO_AND_API_IDENTIFIERS.md.

## Ba câu hỏi đã gửi, cần chờ trả lời

Trao đổi bổ sung: người dùng cho biết hardware hiện gửi mỗi15 giây, muốn giới hạn demo10.000 readings và có thể giảm tần suất ghi lịch sử xuống15 phút. Latest là giá trị mới nhất theo từng Device/stream; history là các bản ghi đã lưu. Với một Device/3 sensors, lưu mỗi15 giây và FIFO10.000 giữ khoảng14 giờ; nhiều Device giảm thời lượng này. Chưa chốt ghi mọi lần gửi hay history15 phút trong khi latest vẫn cập nhật mỗi lần nhận. Không thay firmware hoặc dùng chu kỳ15 giây làm bằng chứng timestamp đo.

1. Đề xuất measured_at = received_at theo thời gian server trong giai đoạn firmware không gửi timestamp đã kiểm chứng. Unit giữ nguyên tối đa16 ký tự, thống nhất Sensor/parser; ERD telemetry hiện8 cần người dùng cập nhật. Nếu người dùng giữ8 phải chốt hành vi packet chứa unit9..16, không cắt chuỗi.
2. Đề xuất latest Farmer cần assignment Accepted đang hiệu lực; history gồm các readings có received_at thuộc khoảng assignment của mình [start_date,end_date), kể cả sau khi hết assignment. Chủ Farm/Admin đọc toàn bộ đúng Device; Manager đọc Farm hiện thuộc HTX mình. Assignment mới không mở dữ liệu ngoài các khoảng được cấp. Không áp dụng quyền correction15 ngày cho telemetry.
3. Theo ý kiến mới, store RAM demo tối đa10.000 readings toàn hệ thống, FIFO bỏ bản ghi cũ nhất. Cần chốt lưu mỗi lần gửi15 giây hay chỉ history15 phút/từng sensor với latest cập nhật mỗi lần nhận. Không dedup theo giá trị vì không có message ID. Bản đầu latest/history, chưa cảnh báo tự động/control.

Những câu trên là đề xuất, chưa được coi là đồng ý chỉ vì người dùng yêu cầu làm module. Chưa code chính sách phụ thuộc vào câu trả lời.

## Thiết kế kỹ thuật có thể triển khai sau khi chốt

- Module Telemetry có domain service/store, read-only controller, DTO filter/pagination và types rõ ràng. _id dùng ObjectId do backend sinh kể cả RAM để phù hợp MongoDB shape sau này; không ghi database.
- MqttModule nhận cùng instance TelemetryModule đã được AppModule dựng, không tự tạo lại Devices/Sensors/Auth/Assignments hay store. Receiver chỉ chuyển các readings đã map/accepted; ACK/unknown/rejected không vào store.
- Receiver lấy một mốc received_at cho packet; các readings trong packet dùng cùng mốc. Không đọc timestamp client chưa có contract.
- Store có giới hạn, copy dữ liệu ra ngoài; dùng cấu trúc FIFO phù hợp, không tăng bộ nhớ vô hạn.
- API dự kiến GET /api/telemetry/devices/:id/latest và GET /api/telemetry/devices/:id/history; latest theo stream, history lọc stream/from/to với limit/offset. Không có POST nhập/sửa/xóa telemetry.
- Từ/to ISO8601, khoảng query [from,to), ngày sai/đảo khoảng bị400. UUID/stream/pagination phải được validate. Chốt response và filter cụ thể khi triển khai, chưa khẳng định endpoint đã tồn tại.
- JWT Active, scope kiểm tra ở service; ngoài quyền trả404 không lộ tồn tại Device. Không trả total/latest của bản ghi ngoài khoảng Farmer được phép.
- Historical read không dùng guard Devices.get hiện tại nếu chính sách cho phép Farmer hết assignment; cần kiểm tra actor/farm/HTX/assignment bằng shared stores tin cậy.
- Latest không được biến bản ghi cũ trước assignment thành dữ liệu Farmer được xem nếu chọn chính sách theo khoảng. Active/Inactive/Maintenance không xóa lịch sử.
- Unit historical giữ nguyên dù metadata Sensor sửa sau đó; không tạo cảnh báo từ threshold mới cho dữ liệu cũ.
- Restart mất RAM; FIFO eviction không bảo đảm lịch sử còn đầy đủ. Guide/API phải ghi rõ dung lượng và phạm vi dữ liệu đang còn, không hứa lưu dài hạn.

## Kiểm thử cần có

- MQTT callback thật qua fake transport lưu readings accepted, không lưu ACK/retained/malformed/station mismatch/unmapped/Inactive/Maintenance.
- Cùng stream ở hai Device không lẫn; đúng UUID thay station_id làm FK; snapshot raw unit giữ nguyên sau metadata update.
- Hai readings bằng giá trị ở hai packet vẫn giữ hai bản ghi; store FIFO, latest khi eviction, defensive copy và phân trang ổn định.
- Owner/Admin/Manager scope; Farmer chưa accept, start-inclusive/end-exclusive, hết assignment/history, assignment mới và token/account Locked.
- Query sai, filter/to boundary, nhiều stream, latest per-stream, response không rò dữ liệu ngoài quyền.
- Toàn bộ hồi quy136 tests trước module, lint/typecheck/build; cập nhật TCP loopback kiểm tra MQTT->Telemetry nếu phù hợp.

## Tài liệu và quy trình kết thúc

Sau câu trả lời: cập nhật thiết kế này thành quyết định cuối; code/comment các invariant khó; viết IOT_TELEMETRIES_IMPLEMENTATION.md và Postman literal JSON (JWT/UUID copy tay, không scripts/env). Cập nhật README/handoff/notes/plan/build spec và mốc review. Stage từng file của module, không stage-all/restore file riêng. Commit local sau checks; không push/merge khi chưa có yêu cầu.

Persistence/MongoDB indices/retention/transactions là phase phải thảo luận riêng. Bản đầu không thêm điều khiển phần cứng hoặc task/AI/Cultivation.

# Devices — chuẩn bị module và điểm cần chốt

Ngày 2026-10-05. Branch `feat/devices-management`, base GitHub main `c71820d` sau PR #5. **Chưa triển khai Devices API/store; đang chờ trả lời nghiệp vụ.** Không coi đề xuất trong tài liệu này là quyết định đã được duyệt.

## Trạng thái đã kiểm chứng

- Origin/main chứa toàn bộ module đến Tree Harvests và branch foundation. Ancestry của mọi branch local đã kiểm tra; tree bằng bản integration đã đạt 89/89 tests, lint/typecheck/build. Không có thay đổi code do remote merge.
- Không tìm thấy AGENTS.md trong repository hoặc các thư mục cha D:/ và D:/PROJECT khi chuẩn bị module.
- Đã đọc MODULE_HANDOFF, IMPLEMENTATION_NOTES, IMPLEMENTATION_PLAN, PROJECT_BUILD_SPEC và ERD XML/JSON. Field của DEVICES, SENSORS và ACTUATORS khớp giữa hai file ERD hiện có tại workspace.
- MQTT_CONFIGURATION.md và MQTT_CONFIGURATION_v1.md là tài liệu riêng của người dùng, chưa commit. Chúng nhắc code prototype/firmware chưa có ở NestJS này; không khẳng định broker, telemetry hoặc điều khiển đã chạy trong dự án hiện tại.

## Phạm vi đợt đề xuất

Chỉ DEVICES: metadata trạm gắn Zone, danh sách/chi tiết theo phạm vi, tạo/sửa theo quyền sẽ chốt. Dùng RAM như các module hiện tại. Một Device thuộc một Zone; một Zone có nhiều Device. Sensors/Actuators sẽ có branch riêng; MQTT, telemetry, command/ACK và Cultivation bàn ở các đợt sau. Không tạo bảng/migration/seed hoặc sửa ERD.

Field ERD giữ nguyên:

| Field | Kiểu / ý nghĩa |
|---|---|
| id | UUID nội bộ backend |
| zone_id | UUID tham chiếu Zone |
| auth_token | varchar(255), thông tin cấp cho phần cứng; cần chốt cách cấp |
| station_id | varchar(50), mã trạm dùng trong MQTT topic, khác id nội bộ |
| installed_at | timestamp ngày lắp, chuẩn hóa UTC |
| cost | decimal(10,2), chi phí |
| status | Active / Offline / Maintenance |

## Ba quyết định đang chờ

1. **Quyền quản lý:** đề xuất chủ Farm tạo/sửa trực tiếp, Admin gửi đề xuất cần đúng chủ duyệt, Manager và Farmer đang được phân công chỉ đọc trong phạm vi. Chưa có quy tắc Devices được duyệt; không tự suy quyền từ Trees. Nếu chọn chỉ Admin quản lý phải điều chỉnh thiết kế tương ứng.
2. **Vị trí và trạng thái:** đề xuất đợt đầu không chuyển Zone/xóa trạm. Người có quyền quản lý cập nhật status thủ công, default Offline khi tạo; tự phát hiện online/offline chờ MQTT. Chuyển Zone có thể làm telemetry cũ bị hiểu thành thuộc Zone mới vì document chỉ chứa device_id, nên phải chốt lịch sử trước nếu người dùng cần chuyển ngay.
3. **Mã/token phần cứng:** đề xuất nhập station_id thật từ ESP32, duy nhất toàn hệ thống và bất biến; backend sinh auth_token, chỉ chủ nhận một lần khi tạo trực tiếp hoặc duyệt Create. Không đưa token vào danh sách/chi tiết/history/proposal. Cần xác nhận firmware có chấp nhận token backend sinh hoặc đã có cơ chế riêng. Định dạng/chuẩn hóa station_id cần khớp firmware; không tự áp mã MAC-only từ ghi chú chưa kiểm chứng. Unique ở đây là đề xuất kiểm tra trong RAM, chưa phải constraint DB đã tạo.

Các câu hỏi trên đã gửi bằng công cụ hỏi người dùng. Phải có câu trả lời trước khi viết logic tương ứng. Nếu token cần cấp lại/luân chuyển hoặc xem lại sau khi mất, chốt quyền và quy trình trước khi thêm route; không ngầm mở API trả token. Không thêm auth_token vào MQTT payload hay đổi protocol trong đợt metadata.

## Cách triển khai sau khi chốt

- Cập nhật phần quyết định được duyệt trong tài liệu này và handoff trước khi code; lựa chọn bị bác bỏ ghi rõ để session sau không áp nhầm.
- Theo cấu trúc controller/DTO/service/types/module đang dùng. Module nhận đúng các tham chiếu Auth/Farms/Zones tạo một lần tại AppModule; không gọi lại factory gây duplicate store. Tái sử dụng quyền đọc Zone và shared assignment store.
- DTO theo field ERD, validate UUID/timestamp/decimal/enum; backend không nhận id hoặc field lạ. Không expose thông tin bí mật trong response/audit, dùng response bản sao.
- Nếu có Admin proposals: recheck chủ/actor Active và Zone/Farm khi duyệt; xử lý version lỗi thời, không ghi một phần hoặc chèn await giữa kiểm tra và commit RAM. Comment tiếng Việt ở logic duyệt, uniqueness, version và token redaction.
- Tạo DEVICES_IMPLEMENTATION.md mô tả API thực tế, workflow, giới hạn RAM, lỗi, fixture và cách tái lập. Chỉ tạo collection Devices sau khi contract được chốt; literal URL/JSON, JWT/UUID/token copy bằng tay, không scripts/environment.
- Kiểm thử tập trung quyền từng vai trò, hết phân công, uniqueness, race/stale proposal nếu có, không lộ token và dùng cùng store. Chạy lint/typecheck/build và bộ tests tích hợp sau khi code; ghi số tests thực tế, không dùng kết quả 89 tests cũ để khẳng định Devices đã pass.

## Tái lập session tiếp theo

1. Đọc AGENTS.md nếu xuất hiện; git status/branch/log, MODULE_HANDOFF, notes/plan/spec, ERD XML/JSON, tài liệu này và tài liệu module liên quan.
2. Fetch origin, kiểm tra main đã chứa PR #5 và branch hiện tại. Nếu branch Devices đã tồn tại thì tiếp tục branch đó; không tạo branch trùng hoặc bắt đầu lại module cũ.
3. Kiểm tra câu trả lời ba quyết định; nếu chưa có, tiếp tục trao đổi và không code nghiệp vụ cần câu trả lời. Base chuẩn bị c71820d; tài liệu chuẩn bị không có Devices API chạy được.
4. Giữ .env và sửa đổi riêng ERD/MQTT/Postman (kể cả file bị xóa) ngoài stage/commit. Không reset/clean, không stage toàn bộ workspace. Không push branch mới hoặc merge remote theo quyền xuất bản đợt cũ.
5. Sau khi có câu trả lời, hoàn thành module, docs/README/handoff/notes/plan, Postman và kiểm thử; stage danh sách file cụ thể rồi commit local. Persistence vẫn cần buổi chốt riêng.

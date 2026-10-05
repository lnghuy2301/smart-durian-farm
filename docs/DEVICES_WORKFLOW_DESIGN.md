# Devices — chuẩn bị module và điểm cần chốt

Ngày 2026-10-05. Branch `feat/devices-management`, base GitHub main `c71820d` sau PR #5. **Chưa triển khai Devices API/store; quyền và định danh đã chốt, trạng thái/số cây bao quát còn cần trả lời.** Không coi đề xuất còn chờ trong tài liệu này là quyết định đã được duyệt.

## Trạng thái đã kiểm chứng

- Origin/main chứa toàn bộ module đến Tree Harvests và branch foundation. Ancestry của mọi branch local đã kiểm tra; tree bằng bản integration đã đạt 89/89 tests, lint/typecheck/build. Không có thay đổi code do remote merge.
- Không tìm thấy AGENTS.md trong repository hoặc các thư mục cha D:/ và D:/PROJECT khi chuẩn bị module.
- Đã đọc MODULE_HANDOFF, IMPLEMENTATION_NOTES, IMPLEMENTATION_PLAN, PROJECT_BUILD_SPEC và ERD XML/JSON. Field của DEVICES, SENSORS và ACTUATORS khớp giữa hai file ERD hiện có tại workspace.
- MQTT_CONFIGURATION.md và MQTT_CONFIGURATION_v1.md là tài liệu riêng của người dùng, chưa commit. Chúng nhắc code prototype/firmware chưa có ở NestJS này; không khẳng định broker, telemetry hoặc điều khiển đã chạy trong dự án hiện tại.

## Phạm vi đợt đề xuất

DEVICES: metadata trạm gắn Zone, danh sách/chi tiết theo phạm vi, chủ tạo/sửa trực tiếp và Admin đề xuất cần chủ duyệt. Dùng RAM như các module hiện tại. Một Device thuộc một Zone; một Zone có nhiều Device. Sensors/Actuators sẽ có branch riêng. Cần chốt theo dõi kết nối MQTT có thuộc đợt Devices hay module kế tiếp; không tự triển khai telemetry/control/command ACK hoặc Cultivation. Không tạo bảng/migration/seed hoặc sửa ERD.

Field ERD giữ nguyên:

| Field | Kiểu / ý nghĩa |
|---|---|
| id | UUID nội bộ backend |
| zone_id | UUID tham chiếu Zone |
| station_id | varchar(50), mã thật của ESP32, bắt buộc/duy nhất/bất biến, khác id nội bộ |
| installed_at | timestamp ngày lắp, chuẩn hóa UTC |
| cost | decimal(10,2), chi phí |
| status | ERD còn Active / Offline / Maintenance; người dùng yêu cầu Online, cần chốt biểu diễn |

ERD XML và JSON mới tại workspace đã bỏ auth_token, vẫn chưa có field số cây hoặc liên kết Device–Tree. Không phục hồi auth_token từ phiên bản tài liệu trước.

## Quyết định người dùng đã chốt

1. Chủ Farm tạo/sửa trực tiếp; Admin gửi đề xuất cần đúng chủ duyệt; Manager đọc trong HTX mình, Farmer có phân công Accepted đang hiệu lực chỉ đọc trong phạm vi.
2. Không cho chuyển Zone. Số cây mỗi trạm bao quát cố định, nhưng chưa rõ đây là hạn mức hay danh sách cây; chưa chốt số/cách gắn cây. Không tự thêm field/quan hệ.
3. DEVICES.id là UUID backend/database sinh, dùng PK nội bộ. DEVICES.station_id là mã ESP32, ví dụ E08CFE41DCAC, UNIQUE NOT NULL và không cho thay đổi sau đăng ký. Giai đoạn RAM phải kiểm tra tương đương, chưa tạo constraint DB.
4. Firmware dùng cùng station_id trong subscribe/station/{station_id} và publish/station/{station_id}. Khi nhận MQTT backend lấy station_id từ topic, lookup Device, lấy Device.id cho xử lý nội bộ. SENSORS/ACTUATORS/IOT_TELEMETRIES/ACTUATOR_TASKS tham chiếu device_id là UUID; không dùng station_id làm FK hoặc gộp hai identifier.
5. Firmware hiện không có MQTT authentication, mqtt_user/mqtt_password rỗng. Không triển khai auth_token, sinh/cấp lại token, token DTO/API hoặc kiểm tra token MQTT trong đợt này. station_id chỉ là mã phần cứng, không phải secret/chứng minh xác thực. Giữ nguyên topic/protocol đang chạy.
6. Trạng thái Online phải phản ánh kết nối MQTT với phần cứng; không dùng PATCH metadata để giả lập việc thiết bị đang kết nối. Tên enum và tiêu chí xác định mất kết nối còn cần chốt.

Đề xuất cũ backend sinh auth_token và cập nhật Online/Offline hoàn toàn thủ công đã được yêu cầu mới thay thế, không được triển khai lại ở session sau.

## Ba điểm còn chờ trả lời

1. **Tên trạng thái:** ERD mới vẫn Active/Offline/Maintenance; người dùng nói Online. Đề xuất đổi biểu diễn thành Online/Offline/Maintenance sau khi chốt, hoặc giữ Active trong dữ liệu và dùng nhãn Online. Không tự sửa ERD của người dùng.
2. **Số cây bao quát:** hạn mức N hay tập tree_id cụ thể? N áp dụng toàn bộ thiết bị hay nhập riêng một lần khi đăng ký? Có cần liên kết từng cây ngay không? ERD chưa có field/quan hệ cho yêu cầu này. Chỉ giới hạn số lượng không xác định được cây nào do trạm phụ trách khi một Zone có nhiều trạm.
3. **MQTT presence và phạm vi đợt:** đề xuất Online sau gói MQTT từ station đã đăng ký; Offline sau 30 phút không có gói hoặc backend mất broker; Maintenance không bị tự ghi đè. Đây chỉ là đề xuất, chưa được duyệt. Chỉ backend kết nối broker thành công không chứng minh ESP32 của từng trạm đang kết nối. Nếu người dùng chọn theo dõi ở đợt sau, module metadata chưa được mô tả là đã phát hiện online/offline thực tế.

Các câu hỏi mới đã gửi bằng công cụ hỏi người dùng. Phải có câu trả lời trước khi viết logic tương ứng; thời gian chờ/lựa chọn mặc định không phải chấp thuận. Không thêm heartbeat/topic/payload mới vào firmware để đáp ứng presence nếu chưa được cho phép.

## Cách triển khai sau khi chốt

- Cập nhật phần quyết định được duyệt trong tài liệu này và handoff trước khi code; lựa chọn bị bác bỏ ghi rõ để session sau không áp nhầm.
- Theo cấu trúc controller/DTO/service/types/module đang dùng. Module nhận đúng các tham chiếu Auth/Farms/Zones tạo một lần tại AppModule; không gọi lại factory gây duplicate store. Tái sử dụng quyền đọc Zone và shared assignment store.
- DTO theo field ERD và các quyết định đã chốt, validate UUID/timestamp/decimal/enum; backend không nhận id hoặc field lạ. Không nhận auth_token. id/zone_id/station_id bất biến sau đăng ký; response bản sao.
- Admin proposals: recheck chủ/actor Active và Zone/Farm khi duyệt; xử lý version lỗi thời, không ghi một phần hoặc chèn await giữa kiểm tra và commit RAM. Comment tiếng Việt ở logic duyệt, uniqueness/version, phân biệt ID phần cứng/nội bộ và presence nếu thuộc đợt này.
- Tạo DEVICES_IMPLEMENTATION.md mô tả API thực tế, workflow, giới hạn RAM, lỗi, fixture và cách tái lập. Chỉ tạo collection Devices sau khi contract được chốt; literal URL/JSON, JWT/UUID/station_id copy bằng tay, không scripts/environment.
- Kiểm thử tập trung quyền từng vai trò, hết phân công, station_id duy nhất/bất biến, UUID khác mã ESP32, race/stale proposal, không có auth_token và dùng cùng store; thêm kiểm thử coverage/presence theo quyết định cuối. Chạy lint/typecheck/build và bộ tests tích hợp sau khi code; ghi số tests thực tế, không dùng kết quả 89 tests cũ để khẳng định Devices đã pass.

## Tái lập session tiếp theo

1. Đọc AGENTS.md nếu xuất hiện; git status/branch/log, MODULE_HANDOFF, notes/plan/spec, ERD XML/JSON, tài liệu này và tài liệu module liên quan.
2. Fetch origin, kiểm tra main đã chứa PR #5 và branch hiện tại. Nếu branch Devices đã tồn tại thì tiếp tục branch đó; không tạo branch trùng hoặc bắt đầu lại module cũ.
3. Giữ các quyết định đã chốt, không hỏi lại quyền/ID/token. Kiểm tra câu trả lời ba điểm còn chờ (status/coverage/phạm vi MQTT); nếu chưa có, tiếp tục trao đổi và không code nghiệp vụ cần câu trả lời. Base chuẩn bị c71820d; tài liệu chuẩn bị không có Devices API chạy được.
4. Giữ .env và sửa đổi riêng ERD/MQTT/Postman (kể cả file bị xóa) ngoài stage/commit. Không reset/clean, không stage toàn bộ workspace. Không push branch mới hoặc merge remote theo quyền xuất bản đợt cũ.
5. Sau khi có câu trả lời, hoàn thành module, docs/README/handoff/notes/plan, Postman và kiểm thử; stage danh sách file cụ thể rồi commit local. Persistence vẫn cần buổi chốt riêng.

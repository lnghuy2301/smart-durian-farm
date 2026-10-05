# Devices — chuẩn bị module và điểm cần chốt

Ngày 2026-10-05. Branch `feat/devices-management`, base GitHub main `c71820d` sau PR #5. **Chưa triển khai Devices API/store; quyền/định danh và liên kết qua TREES.device_id đã chốt, enum cuối/quy tắc giữ liên kết còn cần trả lời.** Không coi đề xuất còn chờ trong tài liệu này là quyết định đã được duyệt.

## Trạng thái đã kiểm chứng

- Origin/main chứa toàn bộ module đến Tree Harvests và branch foundation. Ancestry của mọi branch local đã kiểm tra; tree bằng bản integration đã đạt 89/89 tests, lint/typecheck/build. Không có thay đổi code do remote merge.
- Không tìm thấy AGENTS.md trong repository hoặc các thư mục cha D:/ và D:/PROJECT khi chuẩn bị module.
- Đã đọc MODULE_HANDOFF, IMPLEMENTATION_NOTES, IMPLEMENTATION_PLAN, PROJECT_BUILD_SPEC và ERD XML/JSON. Field của DEVICES, SENSORS và ACTUATORS khớp giữa hai file ERD hiện có tại workspace.
- MQTT_CONFIGURATION.md và MQTT_CONFIGURATION_v1.md là tài liệu riêng của người dùng, chưa commit. Chúng nhắc code prototype/firmware chưa có ở NestJS này; không khẳng định broker, telemetry hoặc điều khiển đã chạy trong dự án hiện tại.

## Phạm vi đợt đề xuất

DEVICES: metadata trạm gắn Zone, danh sách/chi tiết theo phạm vi, chủ tạo/sửa trực tiếp và Admin đề xuất cần chủ duyệt; gắn cây qua TREES.device_id theo yêu cầu mới. Dùng RAM như các module hiện tại. Một Device thuộc một Zone; một Zone có nhiều Device. Sensors/Actuators sẽ có branch riêng. Người dùng giao quyền chọn thời điểm MQTT; quyết định triển khai MQTT/presence/control ở module kế tiếp để kiểm thử hardware riêng. Không tự triển khai telemetry/control/command ACK hoặc Cultivation trong đợt Devices. Không tạo bảng/migration/seed hoặc tự sửa ERD.

Field ERD giữ nguyên:

| Field | Kiểu / ý nghĩa |
|---|---|
| id | UUID nội bộ backend |
| zone_id | UUID tham chiếu Zone |
| station_id | varchar(50), mã thật của ESP32, bắt buộc/duy nhất/bất biến, khác id nội bộ |
| installed_at | timestamp ngày lắp, chuẩn hóa UTC |
| cost | decimal(10,2), chi phí |
| status | Active là đã lắp/đang sử dụng; Inactive là rút điện/tháo chưa kết nối lại; cần chốt có giữ Offline/Maintenance không |

ERD XML và JSON tại workspace đã bỏ auth_token nhưng vẫn chưa có TREES.device_id; status DEVICES vẫn Active/Offline/Maintenance. Người dùng đã yêu cầu dùng TREES.device_id làm liên kết; quyết định này mới hơn ERD và là căn cứ thiết kế RAM sau khi chốt nullability/quy tắc liên kết. Không phục hồi auth_token, không tự sửa hai file ERD riêng hoặc tạo migration/constraint DB.

## Quyết định người dùng đã chốt

1. Chủ Farm tạo/sửa trực tiếp; Admin gửi đề xuất cần đúng chủ duyệt; Manager đọc trong HTX mình, Farmer có phân công Accepted đang hiệu lực chỉ đọc trong phạm vi.
2. Không cho chuyển Zone. Khi lắp chọn các cây thực tế phụ trách qua TREES.device_id; ví dụ cây 01–04 cùng tham chiếu UUID của Device 01. Đây là danh sách liên kết, không tự tạo thêm bảng bridge hoặc field hạn mức số cây riêng. Số cây nhập/gắn khi lắp; quy tắc thay đổi danh sách sau lắp còn cần chốt.
3. DEVICES.id là UUID backend/database sinh, dùng PK nội bộ. DEVICES.station_id là mã ESP32, ví dụ E08CFE41DCAC, UNIQUE NOT NULL và không cho thay đổi sau đăng ký. Giai đoạn RAM phải kiểm tra tương đương, chưa tạo constraint DB.
4. Firmware dùng cùng station_id trong subscribe/station/{station_id} và publish/station/{station_id}. Khi nhận MQTT backend lấy station_id từ topic, lookup Device, lấy Device.id cho xử lý nội bộ. SENSORS/ACTUATORS/IOT_TELEMETRIES/ACTUATOR_TASKS tham chiếu device_id là UUID; không dùng station_id làm FK hoặc gộp hai identifier.
5. Firmware hiện không có MQTT authentication, mqtt_user/mqtt_password rỗng. Không triển khai auth_token, sinh/cấp lại token, token DTO/API hoặc kiểm tra token MQTT trong đợt này. station_id chỉ là mã phần cứng, không phải secret/chứng minh xác thực. Giữ nguyên topic/protocol đang chạy.
6. Người dùng làm rõ Active nghĩa là đã lắp đặt/đang sử dụng; Inactive nghĩa là rút điện/tháo mang đi chưa kết nối lại. Không đổi Active thành Online như đề xuất trước. Trạng thái lắp đặt và kết nối MQTT là hai khái niệm; không tự suy mất broker nghĩa là tháo thiết bị.
7. Thời điểm làm MQTT do bên triển khai quyết định. Chọn module MQTT kế tiếp sau metadata/liên kết và Sensors/Actuators, với kiểm thử riêng cho routing, correlation, timeout, duplicate/late ACK và broker disconnect. MQTT là phần core phải kiểm thử cẩn thận, dễ chẩn đoán; không đổi protocol hiện có và không tự tạo command giả để chứng minh online.

Đề xuất cũ backend sinh auth_token, dùng Online thay Active, hoặc số cây chỉ là hạn mức N không có tree_id đã được trao đổi mới thay thế. Không triển khai lại ở session sau.

## Hai điểm còn chờ trả lời

1. **Enum cuối:** chỉ Active/Inactive hay Active/Inactive/Offline/Maintenance? Đề xuất chỉ Active/Inactive cho vòng đời lắp đặt, MQTT presence theo dõi riêng ở đợt sau. Không thêm Inactive vào ERD hoặc loại Offline/Maintenance khi chưa có trả lời.
2. **Liên kết cây:** đề xuất TREES.device_id nullable (cây chưa gắn), tối đa một Device/cây, Device và cây cùng Zone; chọn danh sách khi lắp, số cây suy từ danh sách. Inactive giữ liên kết; đợt đầu danh sách cố định và chưa có thao tác gỡ/gắn lại/thay Device. Nếu người dùng cần thay Device ngay, phải cập nhật quy tắc danh sách và audit trước khi code. Không coi danh sách cố định là tự động xóa cây khi trạm ngừng hoạt động.

Hai câu hỏi mới đã gửi bằng công cụ hỏi người dùng. Phải có câu trả lời trước khi viết logic tương ứng; thời gian chờ/lựa chọn mặc định không phải chấp thuận. Phạm vi MQTT đã được lựa chọn theo quyền người dùng giao, không hỏi lại việc có làm trong đợt Devices. Các đề xuất MQTT presence timeout trước đây chưa được chốt, sẽ đánh giá cùng firmware khi bắt đầu module MQTT; không tự thêm heartbeat/topic/payload mới.

## Cách triển khai sau khi chốt

- Cập nhật phần quyết định được duyệt trong tài liệu này và handoff trước khi code; lựa chọn bị bác bỏ ghi rõ để session sau không áp nhầm.
- Theo cấu trúc controller/DTO/service/types/module đang dùng. Module nhận đúng các tham chiếu Auth/Farms/Zones tạo một lần tại AppModule; không gọi lại factory gây duplicate store. Tái sử dụng quyền đọc Zone và shared assignment store.
- DTO theo field ERD và các quyết định đã chốt, validate UUID/timestamp/decimal/enum; backend không nhận id hoặc field lạ. Không nhận auth_token. id/zone_id/station_id bất biến sau đăng ký; response bản sao. TREES.device_id dùng UUID, không mã ESP32; chỉ ghi qua workflow liên kết có kiểm tra quyền, không mở PATCH cây để Farmer phụ trách gắn lại thiết bị.
- Cây và Device dùng cùng TreesService/store. Kiểm tra mọi cây, Zone, quyền và dung lượng history trước khi ghi liên kết hàng loạt; không ghi được nửa danh sách. Metadata cây/history/version phải giữ device_id qua các lần sửa khác, không vô tình mất liên kết. Đề xuất Admin duyệt lại cần kiểm tra dữ liệu liên kết hiện tại để tránh đè thay đổi mới.
- Admin proposals: recheck chủ/actor Active và Zone/Farm khi duyệt; xử lý version lỗi thời, không ghi một phần hoặc chèn await giữa kiểm tra và commit RAM. Comment tiếng Việt ở logic duyệt, uniqueness/version, phân biệt ID phần cứng/nội bộ và liên kết nhiều cây.
- Tạo DEVICES_IMPLEMENTATION.md mô tả API thực tế, workflow, giới hạn RAM, lỗi, fixture và cách tái lập. Chỉ tạo collection Devices sau khi contract được chốt; literal URL/JSON, JWT/UUID/station_id copy bằng tay, không scripts/environment.
- Kiểm thử tập trung quyền từng vai trò, hết phân công, station_id duy nhất/bất biến, UUID khác mã ESP32, race/stale proposal, không có auth_token và dùng cùng store; thêm kiểm thử liên kết sai Zone/trùng cây/cây đã gắn, ghi nguyên tử, giữ device_id/history qua sửa cây theo quyết định cuối. Chạy lint/typecheck/build và bộ tests tích hợp sau khi code; ghi số tests thực tế, không dùng kết quả 89 tests cũ để khẳng định Devices đã pass.

## Tái lập session tiếp theo

1. Đọc AGENTS.md nếu xuất hiện; git status/branch/log, MODULE_HANDOFF, notes/plan/spec, ERD XML/JSON, tài liệu này và tài liệu module liên quan.
2. Fetch origin, kiểm tra main đã chứa PR #5 và branch hiện tại. Nếu branch Devices đã tồn tại thì tiếp tục branch đó; không tạo branch trùng hoặc bắt đầu lại module cũ.
3. Giữ các quyết định đã chốt, không hỏi lại quyền/ID/token, ý nghĩa Active/Inactive, liên kết qua TREES.device_id hoặc phạm vi MQTT đã lựa chọn. Kiểm tra câu trả lời hai điểm còn chờ (enum cuối/nullability và cố định liên kết); nếu chưa có, tiếp tục trao đổi và không code nghiệp vụ cần câu trả lời. Base chuẩn bị c71820d; tài liệu chuẩn bị không có Devices API chạy được.
4. Giữ .env và sửa đổi riêng ERD/MQTT/Postman (kể cả file bị xóa) ngoài stage/commit. Không reset/clean, không stage toàn bộ workspace. Không push branch mới hoặc merge remote theo quyền xuất bản đợt cũ.
5. Sau khi có câu trả lời, hoàn thành module, docs/README/handoff/notes/plan, Postman và kiểm thử; stage danh sách file cụ thể rồi commit local. Persistence vẫn cần buổi chốt riêng.

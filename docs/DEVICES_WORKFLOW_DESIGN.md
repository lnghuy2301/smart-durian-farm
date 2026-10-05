# Devices — thiết kế cuối đã triển khai

Ngày 2026-10-06. Branch `feat/devices-management`, base GitHub main `c71820d` sau PR #5. API/store Devices đã triển khai. Đọc [DEVICES_IMPLEMENTATION.md](DEVICES_IMPLEMENTATION.md) cho contract, Postman và tái lập.

## Quyết định cuối

1. Chủ Farmer tạo/sửa trực tiếp; Admin chỉ gửi đề xuất Create/Update cần đúng chủ duyệt. Manager đọc trong HTX mình; Farmer nhận việc chỉ đọc Zone có phân công Accepted đang hiệu lực [start,end). Admin đọc toàn bộ. Quyền quản lý metadata không cấp quyền điều khiển hardware.
2. Device thuộc một Zone, không chuyển Zone/hard-delete. Nhiều Device được phép cùng Zone; cây chịu ảnh hưởng qua Zone chung. Người dùng đã rút yêu cầu TREES.device_id vào 2026-10-06: không thêm FK này, danh sách cây riêng, field hạn mức, cây gắn cố định hoặc bảng bridge. API cây theo Device đọc trực tiếp TreesService theo zone_id, cập nhật theo dữ liệu cây hiện tại.
3. DEVICES.id là UUID nội bộ backend sinh. station_id là mã ESP32 thật, bắt buộc/duy nhất toàn hệ thống/bất biến sau đăng ký. Không gộp hai ID hoặc dùng station_id làm FK nội bộ. Inactive giữ bản ghi và mã, nên không đăng ký lại cùng trạm để lách Zone cố định.
4. Chỉ Active/Inactive, mặc định Active. Active nghĩa đã lắp/đang sử dụng; Inactive nghĩa rút điện/tháo chưa kết nối lại. Chủ cập nhật metadata trực tiếp, Admin đề xuất cần duyệt. Đây không phải chứng minh thiết bị online/offline trên MQTT; không đặt status thành Online/Offline/Maintenance.
5. Firmware không MQTT authentication; không auth_token, route cấp/đổi token hoặc biến .env/dependency mới. station_id là identifier công khai theo quyền đọc, không secret/authentication.
6. Giữ subscribe/station/{station_id} và publish/station/{station_id}. MQTT sau này lookup mã từ topic -> DevicesService.getRecordByStationId -> UUID Device.id; SENSORS/ACTUATORS/IOT_TELEMETRIES/ACTUATOR_TASKS dùng device_id UUID. Không tự đổi firmware/topic/payload.
7. Người dùng giao quyền chọn thời điểm MQTT. Metadata làm trước; Sensors/Actuators ở branch riêng tiếp theo, rồi module MQTT/presence/telemetry/control với kiểm thử hardware riêng. Chưa có kết nối broker hoặc hành động phần cứng từ Devices API.

## Luồng duyệt và tính nhất quán

Create trực tiếp ghi Device, index station_id, version và audit cùng một lần. Create proposal chưa tạo Device/chưa giữ chỗ mã; chỉ khi chủ duyệt mới đăng ký. Hai proposal có thể cùng station_id, nhưng chỉ lượt được duyệt đầu tiên đăng ký được; các lượt sau 409 và vẫn Pending để chủ từ chối. Chủ đăng ký trực tiếp trong khi proposal chờ cũng làm proposal trùng mã không được áp dụng.

Một Pending Update mỗi Device. Khi chủ sửa trực tiếp, version tăng và proposal cũ trở nên lỗi thời; duyệt trả 409, dữ liệu chính/audit không đổi. Duyệt kiểm tra lại actor/owner Active, role, Farm/Zone và version. UUID proposal khác UUID Device; không dùng nhầm vào URL duyệt.

Không await giữa kiểm tra và commit RAM. Capacity/unique được kiểm tra trước khi ghi; proposal Accepted chỉ sau khi Device/index/audit đã thành công. Response deep-copy. Giới hạn/lifecycle RAM không thay thế constraint/transaction DB, không dùng nhiều process.

## ERD và giới hạn

Hai file ERD riêng đã bỏ auth_token và không có TREES.device_id, phù hợp thiết kế cuối. Enum DEVICES tại workspace vẫn ghi Active/Offline/Maintenance lúc kiểm tra; quyết định rõ ngày 2026-10-06 chỉ Active/Inactive được ưu tiên trong code. Chưa sửa ERD XML/JSON của người dùng; cần đồng bộ enum trước persistence.

Không tạo bảng/migration/seed. Toàn bộ Devices/requests/version/history/index nằm trong RAM backend, mất sau restart; không phải localStorage trình duyệt. Không có câu hỏi Devices còn chờ từ cuộc thảo luận này. MQTT timeout/ACK/correlation/presence và Cultivation details/hash-chain phải bàn ở module tương ứng.

## Session tiếp theo

Đọc AGENTS.md nếu có, git status/branch/log, MODULE_HANDOFF/notes/plan/spec, ERD XML/JSON và guide Devices. Tiếp tục branch Devices hiện có, không triển khai lại module hoặc các phương án cũ. Kiểm tra git base/remote trước module mới. Giữ .env và sửa đổi riêng ERD/MQTT/Postman ngoài commit, stage file cụ thể; branch Devices chỉ commit local, chưa push.

Kết quả: 98/98 tests (9 Devices + 89 hồi quy), lint/typecheck/build; fake providers, không đọc .env thật/gửi SMS/email/ghi DB/kết nối MQTT. Collection Devices có 24 request literal URL/JSON, không scripts/environment; người dùng copy JWT/UUID/station_id thủ công.

# MQTT demo và UUID trong API — 2026-10-07

## Cấu hình demo trong .env

Theo yêu cầu người dùng, đã bổ sung riêng các khóa MQTT còn thiếu vào .env local, không thay giá trị hoặc byte nội dung đã có. .env được gitignore, không in/commit credentials. MQTT_ENABLED mặc định false; không tự kết nối broker thật hoặc gửi lệnh.

| Khóa | Người trình diễn điền |
| --- | --- |
| MQTT_BROKER_HOST | Domain/IP cùng broker mà ESP32 sử dụng; không scheme/path |
| MQTT_BROKER_PORT | Port broker thực tế |
| MQTT_USE_TLS | true/false tương ứng listener broker |
| MQTT_USERNAME, MQTT_PASSWORD | Cả hai hoặc cùng trống theo broker |
| MQTT_ENABLED | true sau khi đã cấu hình broker, AUTH_MODE=mock, NODE_ENV development/test |
| DEMO_DEVICE_STATION_ID | Mã ESP32 để ghi nhớ/copy vào body đăng ký Device |

DEMO_DEVICE_STATION_ID chỉ là tham chiếu cho operator, không phải khóa mà readMqttConfig dùng để định tuyến. Điền biến này không tự tạo Device, không giới hạn subscription một station, không cung cấp auth token. Mọi station nhận từ publish/station/{stationId} vẫn tra DEVICES.station_id -> DEVICES.id UUID. Có thể trình diễn một Device, nhưng backend hỗ trợ nhiều Device có station_id khác nhau.

Đăng ký bằng JWT chủ Farm: POST /api/devices với zone_id UUID thật, station_id copy từ DEMO_DEVICE_STATION_ID, installed_at và cost bắt buộc. Admin tạo qua proposal cần chủ duyệt. Sau đó khai báo Sensors với device_id UUID trả về và stream đúng bộ ESP32. Không đổi station_id sau đăng ký.

Restart mất RAM và JWT cũ, cần login/tạo lại metadata; cấu hình .env tồn tại nhưng không phải business persistence. MQTT không có HTTP bật/tắt phần cứng trong bản communication hiện tại. Xem [MQTT_COMMUNICATION_IMPLEMENTATION.md](MQTT_COMMUNICATION_IMPLEMENTATION.md).

## Những request Manager dùng UUID trong Postman

- Users-Local-Test: 07 Approve Manager và 11 Approve Manager with existing cooperative dùng PATCH /api/users/{manager_uuid}/approve. 10 Reject Manager dùng PATCH /api/users/{manager_uuid}/reject. Đây là thao tác của Admin, không phải Manager tự duyệt.
- Cooperatives-Local-Test: 10 Cooperative detail - Manager dùng GET /api/cooperatives/{cooperative_uuid}.
- 11 Request Manager update and send email dùng POST /api/cooperatives/{cooperative_uuid}/update-requests.
- Các bước email/SMS dùng /api/cooperative-update-requests/{request_uuid}/...; UUID này là yêu cầu sửa, khác UUID HTX/user.
- UUID mẫu trong collection phải thay bằng id thật trả về API. Không chỉnh/stage các file Postman riêng của người dùng.

## Biết UUID có gây mất quyền kiểm soát không?

UUID chỉ định danh tài nguyên. Biết UUID không được coi là bằng chứng đăng nhập hoặc cấp quyền. Chuyển UUID sang body, mã hóa/ẩn URL hoặc làm UUID khó đoán không thay thế authorization. Khi có giao diện, client sẽ chọn/lấy ID từ API và tạo request tự động, người dùng không cần nhớ hoặc nhập tay; họ vẫn có thể thấy ID qua network inspector.

Theo [OWASP API1: Broken Object Level Authorization](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/), mỗi endpoint nhận object ID phải kiểm tra quyền thực hiện thao tác trên chính tài nguyên đó, bất kể ID là UUID, số hay chuỗi.

Code đã đối chiếu:
- UsersController dùng AuthGuard + AdminGuard; UsersService requireAdmin kiểm tra lại Admin Active trước approve/reject. manager_uuid chỉ chọn tài khoản Pending cần xử lý, actor lấy từ JWT.
- CooperativesService get chặn Manager xem HTX không do mình quản lý bằng404; manager(actorId,id) kiểm tra role và cooperative.manager_id trước tạo đề xuất.
- OTP/update request kiểm tra request.manager_id; người khác không xác minh thay dù biết UUID. Xác minh email rồi SMS, account/HTX version recheck trước áp dụng. Admin có quyền đọc request nhưng không xác minh thay Manager.
- Farmer có quyền đọc metadata HTX theo thiết kế hiện tại; đừng coi mọi response cho Farmer là rò dữ liệu, phải so với phạm vi được phép của endpoint.

Đã chạy lại 22/22 tests Users + Cooperatives; bao gồm JWT thiếu401, Farmer duyệt Manager403, Manager đọc HTX khác404 và quyền update/OTP. Đây là bằng chứng của các luồng được kiểm tra, không phải đảm bảo toàn hệ thống không còn lỗ hổng.

## Trình diễn phân quyền trước hội đồng

| Thao tác | Kỳ vọng |
| --- | --- |
| Không gửi JWT, gọi endpoint Users/HTX được bảo vệ | 401 |
| Dùng JWT Farmer gọi PATCH /api/users/{manager_uuid}/approve với body hợp lệ | 403 |
| JWT Admin Active duyệt Manager Pending đã verify email với HTX hợp lệ | Thành công |
| JWT Manager A đọc HTX của Manager B | 404 |
| JWT Manager A gửi update request cho HTX của Manager B | 403 |
| JWT khác xác minh OTP của request Manager A | Bị chặn theo scope/role |

Copy JWT vào Authorization: Bearer, OTP trong JSON body; không đưa JWT/password/OTP vào URL hoặc file export lên Git. Deployment thật phải dùng HTTPS; bản hiện tại vẫn Auth/store RAM development, chưa có production persistence.

Tái lập các tests từ apps/api, không dùng .env/SMS/SMTP thật:

~~~powershell
node ../../node_modules/typescript/bin/tsc --outDir .test-dist
node --test --test-reporter=spec .test-dist/test/users.test.js .test-dist/test/cooperatives.test.js
~~~

Telemetry đã được chốt và triển khai trên feat/iot-telemetries: lưu mọi reading hardware gửi15 giây, RAM FIFO10.000; Farmer hết assignment không xem history; measured_at lúc backend nhận/đọc, received_at lúc ghi store, không sửa firmware.147 tests đạt; xem IOT_TELEMETRIES_IMPLEMENTATION.md. Cấu hình demo vẫn không tự tạo metadata/persistence.

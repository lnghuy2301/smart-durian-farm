# Auth — đăng nhập và OTP ở chế độ test

Cập nhật 2026-10-02: provider SMS được chọn là **Twilio Verify**, sau khi người dùng nhận SMS từ Try out Verify. Hướng dẫn credentials và demo: [TWILIO_VERIFY_INTEGRATION.md](TWILIO_VERIFY_INTEGRATION.md). Mock SMS vẫn dùng để test tự động; SpeedSMS giữ tương thích, không phải hướng demo hiện tại.

## Phạm vi

Đăng nhập bằng phone_number/password, quên mật khẩu qua OTP 6 chữ số. Nhiều tài khoản ở bộ nhớ: Farmer fixture từ .env, Admin fixture nếu cấu hình, và Farmer/Manager đăng ký qua API. AUTH_MODE=mock chỉ chạy development/test và bind 127.0.0.1. Restart xóa tài khoản đăng ký/HTX, khôi phục fixture password, xóa state/challenge và làm token cũ mất hiệu lực. SMS có thể thật khi SMS_PROVIDER=twilio nhưng **tài khoản vẫn mock**.

Đăng ký, xác minh email thật qua SMTP, Manager Pending và Admin duyệt kèm HTX đã triển khai: xem [USERS_IMPLEMENTATION.md](USERS_IMPLEMENTATION.md). Phân quyền Farm và luồng duyệt được triển khai trong [FARMS_IMPLEMENTATION.md](FARMS_IMPLEMENTATION.md), dùng đúng Auth/user store chung. Không tạo bảng, migration/seed, ghi PostgreSQL/MongoDB hoặc thay ERD. Chưa refresh token, Auth production hoặc phân quyền Zone. Reset không mở khóa Locked và không kích hoạt Pending/Reject; email dự phòng reset sẽ làm sau.

Nhánh Auth ban đầu: feat/auth từ main; SpeedSMS kế thừa Auth; Twilio kế thừa SpeedSMS; USERS kế thừa Twilio. Nhánh tích hợp hiện tại là feat/farm-approval-workflow, gồm cả catalogs và Farm. Đọc [MODULE_HANDOFF.md](MODULE_HANDOFF.md) để biết thứ tự nhánh và trạng thái mới nhất; không giả định các nhánh đã merge nếu chưa kiểm tra remote.

## Cấu hình

.env.example có placeholder. .env local cần NODE_ENV=development, AUTH_MODE=mock, AUTH_TEST_PHONE, AUTH_TEST_PASSWORD và JWT_SECRET ít nhất 32 byte. Phone 9–13 chữ số, dấu + tùy chọn, tổng tối đa 13 ký tự; password 8–128 ký tự, không trim.

SMS_PROVIDER=mock: hộp thư local, không tốn SMS. SMS_PROVIDER=twilio: thêm TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID; SMS_ALLOWED_PHONE cùng số AUTH_TEST_PHONE; LIVE_SMS_ENABLED=true; SMS_TIMEOUT_MS 100–30000 (mặc định 10000). Verify Service phải có Code length=6. SpeedSMS chỉ là lựa chọn cũ.

Chạy `npm run dev:api` tại root sau khi restart. Không thêm dependency cho Twilio; chỉ npm install nếu chưa có node_modules. DATABASE_URL/MONGODB_URI vẫn cần để validate cấu hình chung, Auth không kết nối DB. AUTH_MODE=disabled không đăng ký endpoints.

## Contract

| Endpoint | Input | Kết quả |
|---|---|---|
| POST /api/auth/login | phone_number, password | 200: access_token/token_type/expires_in/user; sai hoặc Locked: 401 |
| GET /api/auth/me | Bearer token | 200: public user; token lỗi/hết hạn/thu hồi: 401 |
| POST /api/auth/forgot-password | phone_number | 202 thông báo chung, không trả OTP/SID; provider lỗi: 503, giới hạn: 429 |
| GET /api/auth/test/sms | query phone_number | 200 hộp thư chỉ khi SMS_PROVIDER=mock; provider thật: 404 |
| POST /api/auth/reset-password | phone_number, otp, new_password | 200 đổi password; mã sai/hết hạn/dùng rồi: 400; Verify lỗi: 503/429 |

DTO từ chối field ngoài contract. Login/forgot/reset dùng đúng chuỗi phone_number đã đăng ký; fixture dùng AUTH_TEST_PHONE. Không tự đổi +84/0 để tra tài khoản; alias 0/84/+84 chỉ dùng ngăn đăng ký trùng. Twilio adapter chuyển số nhận sang E.164 khi gửi ra provider. Allowlist SMS thật vẫn chỉ cho AUTH_TEST_PHONE/SMS_ALLOWED_PHONE; mock hỗ trợ nhiều users. OTP là string đúng 6 chữ số để giữ số 0 đầu.

## Logic và cấu trúc

- password.ts: scrypt bất đồng bộ với salt, so sánh constant-time; không log password/hash/token/OTP.
- auth.guard.ts: JWT HS256, issuer/audience cố định, TTL 15 phút; kiểm tra Active và version trong bộ nhớ.
- sms/otp.provider.ts: contract issue/verify; LocalOtpProvider sinh OTP bằng crypto, giữ digest có salt và chuyển SMS sang mock/SpeedSMS gateway.
- sms/twilio-verify.gateway.ts: Twilio tự sinh/verify OTP; backend chỉ giữ SID và số nhận trong proof. Đọc Service để kiểm tra 6 số trước gửi; xác minh đúng SID/Account/Service/phone/channel và status approved.
- auth.service.ts: deadline 5 phút/lần gửi, 5 lần thử/challenge, cooldown 60 giây; khóa cả gửi/check/hash riêng từng user để chặn race. Provider check lỗi không rõ kết quả sẽ hủy challenge. Reset tăng version chỉ thu hồi JWT của user đó. Pending/Reject không nhận JWT, mọi request có JWT vẫn kiểm tra Active. Không thêm field schema.
- Giới hạn toàn instance: 20 login/phút và 5 forgot/phút. Số không tồn tại hoặc request đang cooldown/busy nhận thông báo forgot chung nhưng không gửi SMS. Giữ cooldown cả sau gửi lỗi; không tự retry provider.

Twilio có thời hạn và quy tắc resend riêng; có thể gửi lại cùng mã. Xem [giới hạn Twilio](https://www.twilio.com/docs/verify/api/rate-limits-and-timeouts) và phần Luồng trong TWILIO_VERIFY_INTEGRATION.md; không áp dụng giả định resend đổi mã của mock cho Verify.

## Postman

SMS thật: import duy nhất **Twilio-Verify-Demo.postman_collection.json** trong docs/postman, mở collection **Smart Durian Farm - Twilio Verify - Nhap JSON**. Không cần Environment hoặc Scripts. Nhập trực tiếp Body → raw → JSON: 01 login → 02 gửi OTP → 03 nhập mã SMS và mật khẩu mới → 04 login mật khẩu mới. Thay số ví dụ bằng AUTH_TEST_PHONE. Không đưa Twilio credentials vào Postman. Kiểm tra token cũ/OTP dùng lại và các lỗi bảo mật nằm trong tests backend, không bắt buộc người dùng chạy thủ công.

Mock: SMS_PROVIDER=mock rồi restart, import Auth-Local-Test.postman_collection.json + Local.postman_environment.json; đồng bộ test_phone/test_password với .env. Luồng 01→11 tự đọc OTP mock. Restart trước mỗi lượt chạy toàn bộ để phục hồi password gốc.

## Kiểm tra và tiếp tục session

Lệnh: npm run lint, npm run typecheck, npm run build, npm test. Module USERS hiện đạt 29/29 tests; chi tiết trong USERS_IMPLEMENTATION.md. Tests dùng DB không tồn tại và SMTP/HTTP provider giả; không đọc .env, không gửi thư/SMS thật. Người dùng đã xác nhận Postman backend nhận SMS và reset thành công. Email SMTP mới cần điền credentials local để test thủ công; không coi mock tests là bằng chứng giao thư.

1. Đọc spec, ERD, IMPLEMENTATION_NOTES.md, USERS_IMPLEMENTATION.md và tài liệu Twilio; kiểm tra branch/status.
2. Không stage thay đổi MQTT/ERD của người dùng vào commit backend.
3. Người dùng đã chọn Twilio; không hỏi lại provider cho demo. Hỏi trước thay đổi lớn về schema/production, migration/seed, phone UNIQUE/NOT NULL, lifecycle tài khoản, lưu challenge/session/rate limit bền vững.
4. Review/merge các nhánh phụ thuộc trước module tiếp theo; module mới tạo nhánh từ main cập nhật. Không deploy Auth mock lên production.

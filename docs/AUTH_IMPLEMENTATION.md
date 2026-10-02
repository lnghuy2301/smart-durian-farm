# Auth — đăng nhập và OTP ở chế độ test

Update: feat/speedsms-integration adds optional SMS_PROVIDER=speedsms while keeping the account in memory. Read SPEEDSMS_INTEGRATION.md for real SMS setup; the mock-only descriptions below apply to SMS_PROVIDER=mock.

## Phạm vi

Nhánh feat/auth tạo từ main sau hai PR foundation/database. Người dùng chốt phone_number/password và quên mật khẩu bằng OTP 6 chữ số; chỉ test, chưa tạo bảng/dữ liệu thật.

Không migration/seed, không ghi PostgreSQL/MongoDB, không SMS thật. Một Farmer giả lập trong bộ nhớ từ cấu hình local. Restart API khôi phục password và xóa OTP/state. Không đăng ký, refresh token hoặc phân quyền Zone/Farm trong batch này.

## Cấu hình và chạy

Thêm vào .env local:

```dotenv
NODE_ENV=development
AUTH_MODE=mock
AUTH_TEST_PHONE=0900000000
AUTH_TEST_PASSWORD=LocalTestOnly123!
JWT_SECRET=local-test-only-secret-change-this-32-bytes-minimum
```

Chạy npm install khi checkout nhánh rồi npm run dev:api ở root. DATABASE_URL/MONGODB_URI vẫn cần cho cấu hình chung, nhưng Auth không dùng DB; không cần Compose để test Auth. AUTH_MODE=disabled không đăng ký endpoints. Mock chỉ chạy development/test; main.ts bind 127.0.0.1 để hộp thư OTP không mở ra LAN. Không deploy mock lên production.

## Contract

| Endpoint | Input | Kết quả |
|---|---|---|
| POST /api/auth/login | phone_number, password | 200: access_token, token_type, expires_in, user; sai/Locked: 401 |
| GET /api/auth/me | Bearer token | 200: user không hash; token lỗi/hết hạn/thu hồi: 401 |
| POST /api/auth/forgot-password | phone_number | 202: thông báo chung; không trả OTP |
| GET /api/auth/test/sms | query phone_number | 200: hộp thư SMS giả lập local |
| POST /api/auth/reset-password | phone_number, otp, new_password | 200: đổi password; OTP sai/hết hạn/dùng rồi: 400 |

DTO từ chối field ngoài contract. Phone 9–13 chữ số, dấu + tùy chọn, tổng tối đa 13 ký tự theo ERD; không tự chuyển +84 thành 0. Password 8–128 ký tự, không trim. OTP string đúng 6 chữ số để giữ số 0 đầu.

## Logic

- scrypt bất đồng bộ, salt ngẫu nhiên, so sánh constant-time. Không log password/hash/token/OTP.
- JWT HS256, issuer/audience cố định, TTL 15 phút. Guard kiểm tra Active và version hiện tại.
- OTP crypto.randomInt, TTL 5 phút, tối đa 5 lần sai, resend cooldown 60 giây. Trong cooldown trả thông báo chung nhưng không thay OTP. Số điện thoại không tồn tại cũng nhận thông báo chung.
- Rate limit mock toàn instance: 20 login/phút và 5 forgot/phút, chưa phải cơ chế phân tán cho hệ thống thật.
- Đánh dấu OTP consumed trước await hash để chặn reset đồng thời; reset tăng version để vô hiệu JWT cũ. Version và OTP là metadata runtime, không thêm field ERD.
- Reset password không mở khóa tài khoản Locked; hai nghiệp vụ này khác nhau.

## Postman

Import docs/postman/Auth-Local-Test.postman_collection.json và Local.postman_environment.json, chọn Local. Restart API trước mỗi lượt chạy toàn collection.

Chạy 01→11: login → me → sai password → forgot → đọc SMS mock (tự lưu OTP) → reset → token cũ bị từ chối → OTP dùng lại bị từ chối → password cũ bị từ chối → login password mới → me.

Collection tự điền access_token/otp. Password mặc định là ví dụ giả. Nếu thay cấu hình local, sửa test_phone/test_password tương ứng trong Postman. Sau reset, restart để quay lại password ban đầu. Không export credentials/token thật vào Git.

## Kiểm tra

Đã đạt lint, typecheck, build và 9 tests. Auth HTTP tests dùng DB không tồn tại để kiểm chứng không phụ thuộc DB. Test bao phủ JWT lỗi/hết hạn, DTO whitelist, OTP hết hạn/cooldown/5 lần sai, reset đồng thời, OTP dùng một lần, thu hồi token và tài khoản Locked. npm audit --omit=dev: 0 vulnerabilities.

Chạy chính collection bằng Newman: 11 requests và 14 assertions đạt, không lỗi. Lệnh: `npx --yes newman@6 run docs/postman/Auth-Local-Test.postman_collection.json -e docs/postman/Local.postman_environment.json --reporters cli --reporter-cli-no-console`. Newman chỉ dùng tạm thời, không thêm vào dependencies của API. API kiểm thử đã được dừng; chạy lại npm run dev:api trước khi tự test.

## Tiếp tục session khác

1. Đọc spec, ERD XML, IMPLEMENTATION_NOTES.md và file này; kiểm tra branch/status.
2. Không stage các thay đổi ERD XML/JSON hoặc tài liệu MQTT của người dùng vào commit Auth.
3. Trước Auth thật, hỏi/chốt phone UNIQUE/NOT NULL, migration/seed, lifecycle user, phân quyền và SMS provider. Không coi Auth mock là production.
4. SMS thật cần provider credentials, sandbox recipient và xác nhận chi phí/contract. Chưa tự thêm bảng OTP hoặc field user token version vào ERD.
5. Production cần thiết kế lưu OTP/thu hồi token/rate limit bền vững, không mang fixture/outbox này sang production.

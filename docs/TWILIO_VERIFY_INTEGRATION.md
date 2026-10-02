# Twilio Verify — OTP SMS cho demo

## Trạng thái và phạm vi

Ngày 2026-10-02: người dùng xác nhận nhận SMS từ **Try out Verify** và chọn Twilio. Nhánh feat/twilio-verify tạo từ feat/speedsms-integration, kế thừa Auth; chưa tự merge vào main. SpeedSMS được giữ cho tương thích, không phải hướng demo hiện tại.

Tài khoản vẫn là một Farmer trong bộ nhớ (AUTH_MODE=mock). Không migration, seed, ghi database hoặc sửa ERD. Restart API khôi phục mật khẩu cấu hình, xóa challenge và thu hồi session cũ. Chưa triển khai Auth production.

## Các chỗ cần điền

Sửa **.env tại root dự án**, không phải trong apps/api. Các khóa Twilio đã được thêm; điền credentials local rồi bật gửi thật:

```dotenv
NODE_ENV=development
AUTH_MODE=mock
AUTH_TEST_PHONE=0900000000
AUTH_TEST_PASSWORD=LocalTestOnly123!
JWT_SECRET=local-test-only-secret-change-this-32-bytes-minimum
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_VERIFY_SERVICE_SID=
SMS_ALLOWED_PHONE=0900000000
LIVE_SMS_ENABLED=true
SMS_TIMEOUT_MS=10000
```

Số trên là ví dụ. Giữ số thật của bạn trong AUTH_TEST_PHONE và SMS_ALLOWED_PHONE local; hai số phải cùng số nhận. Đăng nhập/forgot/reset phải dùng **đúng chuỗi AUTH_TEST_PHONE**. Adapter tự chuyển dạng 0/84/+84 sang E.164 khi gọi Twilio; không thay quy tắc nhận diện tài khoản.

| Khóa | Lấy/điền ở đâu |
|---|---|
| TWILIO_ACCOUNT_SID | Twilio Console → Account Info, dạng AC + 32 ký tự hex |
| TWILIO_AUTH_TOKEN | Auth Token của cùng tài khoản; không dùng token SpeedSMS hoặc JWT của API |
| TWILIO_VERIFY_SERVICE_SID | Identity → Verify → Services → service đã gửi thành công, dạng VA + 32 ký tự hex |
| SMS_ALLOWED_PHONE | Số nhận được phép dùng trong demo, cùng số AUTH_TEST_PHONE |
| LIVE_SMS_ENABLED | true để gọi Verify; .env.example mặc định false |

Trong Verify Service, đặt **Code length = 6**. Backend đọc Service trước mỗi lần gửi và từ chối gửi nếu cấu hình khác 6. Không cần Twilio From number, Messaging Service SID, brandname hay SpeedSMS App ID cho adapter này. Giữ kênh SMS/quyền gửi đến Việt Nam đã test thành công trong Console. Với trial, số nhận phải được xác minh trong tài khoản. [Verification API](https://www.twilio.com/docs/verify/api/verification), [cấu hình Service](https://www.twilio.com/docs/verify/api/service).

Không đưa Auth Token vào chat, Postman hoặc Git. API credentials chỉ nằm ở backend.

Sau khi sửa .env, dừng API bằng Ctrl+C rồi chạy tại root:

```powershell
npm run dev:api
```

Không cần thêm thư viện/npm install cho thay đổi này: adapter dùng HTTPS fetch có sẵn trong Node 20. Nếu mới clone chưa có node_modules, chạy npm install theo README. DATABASE_URL/MONGODB_URI vẫn cần cho cấu hình chung; Auth không kết nối DB và không cần Docker để test.

## Cách test Postman

1. Import docs/postman/**Twilio-Verify-Demo.postman_collection.json** và **Twilio-Verify-Demo.postman_environment.json**.
2. Chọn environment **Smart Durian Farm - Twilio Verify Demo**. Điền test_phone bằng AUTH_TEST_PHONE, test_password bằng AUTH_TEST_PASSWORD, reset_password là mật khẩu mới. base_url mặc định http://localhost:3000. Login tự lưu access_token.
3. Gửi **01 Login**, mong đợi 200. Chưa login được thì chưa gửi OTP; kiểm tra phone/password và restart API.
4. Gửi **02 Send real OTP**, mong đợi 202. Có thể dùng quota trial hoặc phát sinh phí. Chạy từng request bằng Send; không dùng Runner để tự động gửi SMS.
5. **03 Mock SMS unavailable** phải trả 404. Nhận OTP từ điện thoại, điền 6 chữ số vào biến otp trong environment; giữ số 0 đầu.
6. Gửi **04 Reset**, mong đợi 200. Chỉ dùng mã gửi bởi request 02 của API này; mã từ Try out Verify trước đó không tự tạo challenge trong backend.
7. Chạy 05→09: JWT cũ bị từ chối → OTP dùng lại bị từ chối → password cũ bị từ chối → login password mới → me.

phone_number nằm ở **Body → raw → JSON**, dùng {{test_phone}}; không điền ở Params của POST. Sau reset muốn chạy lại từ đầu: restart API và xóa biến otp trước khi gửi mới.

Để test không tốn SMS: đổi SMS_PROVIDER=mock, restart API, dùng Auth-Local-Test collection + Local environment (đồng bộ phone/password). Không chạy collection mock khi backend dùng Twilio.

## Luồng và giới hạn

Auth → OtpProvider: local provider tự tạo/hash OTP cho mock/SpeedSMS; Twilio provider gọi Verify để tạo/check mã. Backend chỉ giữ Verification SID, phone E.164, deadline, attempts/consumed khi dùng Twilio; không lưu plaintext OTP và không trả SID/OTP trong response.

Gửi: GET Service kiểm tra cấu hình → POST Verifications với To/Channel=sms. Reset: POST VerificationCheck với **VerificationSid + Code**. Chỉ status approved đúng SID, Service, Account, số nhận và kênh SMS mới được đổi password. [Verification Check API](https://www.twilio.com/docs/verify/api/verification-check).

Backend nhận reset trong 5 phút tính từ lúc bắt đầu lần gửi được chấp nhận; tối đa 5 lần thử/challenge; cooldown resend 60 giây. Twilio mặc định giữ mã 10 phút và có thể gửi lại **cùng mã** khi còn hiệu lực. Resend không đảm bảo mã cũ bị thay thế; deadline backend được tính lại theo lần gửi được chấp nhận và Twilio vẫn có thể hết hạn trước deadline này. [Thời hạn Twilio](https://www.twilio.com/docs/verify/api/rate-limits-and-timeouts).

Khóa xử lý OTP trong suốt gửi/check/hash: không gửi hai SMS đồng thời hoặc reset hai mật khẩu cùng challenge. Timeout/lỗi không rõ kết quả khi check làm challenge mất hiệu lực; đợi cooldown và gửi lại. Không tự retry request provider. JWT TTL 15 phút; reset tăng version để JWT cũ bị từ chối. Giới hạn/state chỉ áp dụng một process demo, chưa dùng production/nhiều replica.

## Chẩn đoán

| Hiện tượng | Kiểm tra |
|---|---|
| Startup báo TWILIO_* | Điền đủ AC SID, Auth Token và VA SID; không còn placeholder |
| 400 phone_number | Body JSON; biến test_phone có giá trị, không để nguyên placeholder |
| 202 nhưng không SMS | Thông báo chung: số phải khớp fixture, tài khoản Active, ngoài cooldown; xem Verify Logs, quota/quyền gửi và SMS trên máy |
| 503 Code length | Đúng service và Code length = 6 |
| 503 provider | Terminal chỉ log HTTP/numeric code; xem Verify Logs cùng service; kiểm tra Account/Auth Token/Service/quyền kênh và vùng |
| 429 | Chạm giới hạn backend hoặc Twilio; đợi rồi thử lại |
| 400 reset | Sai mã, hết deadline, quá số lần thử, đã dùng, restart API hoặc chưa gửi bằng request 02 |

pending/202 không chứng minh điện thoại đã nhận SMS. Terminal không log token, OTP, số nhận hoặc body lỗi gốc.

## Kiểm tra và bàn giao

Kết quả 2026-10-02: lint, typecheck và build đạt; npm test đạt **20/20 tests**. Cả 7 file JSON Postman đọc được và 33 script qua kiểm tra cú pháp. Backend chưa gửi thử bằng credentials thật; .env local có placeholder TWILIO_* và LIVE_SMS_ENABLED=false, cần điền đủ rồi bật true/restart để test thủ công.

Tests tự động dùng fetch provider giả, không đọc credentials .env và không gửi Verify/SMS thật. Bao phủ cấu hình, E.164, form/Basic auth, Code length, SID/identity binding, mã sai/hết hạn/dùng lại, timeout/HTTP errors, giới hạn thử, race gửi/reset và thu hồi JWT. User xác nhận gửi từ Console thành công; luồng backend thật cần test thủ công bằng Postman.

Session sau: đọc AUTH_IMPLEMENTATION.md, file này và IMPLEMENTATION_NOTES.md; kiểm tra git status. Giữ thay đổi MQTT/ERD của người dùng ngoài commit. Review/merge chuỗi Auth → SpeedSMS → Twilio hoặc chọn base phù hợp trên GitHub; không tự merge. Trước Auth DB, hỏi lại schema/persistence/rate limit/session và quy trình tài khoản; không tự thêm field/bảng ERD.

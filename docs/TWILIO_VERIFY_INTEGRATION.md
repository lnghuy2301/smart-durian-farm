# Twilio Verify — OTP SMS cho demo

## Trạng thái và phạm vi

Ngày 2026-10-02: người dùng xác nhận nhận SMS từ **Try out Verify** và chọn Twilio. Nhánh feat/twilio-verify tạo từ feat/speedsms-integration, kế thừa Auth; chưa tự merge vào main. SpeedSMS được giữ cho tương thích, không phải hướng demo hiện tại.

Module USERS kế tiếp trên feat/users-registration-approval hỗ trợ nhiều tài khoản trong bộ nhớ (AUTH_MODE=mock), đăng ký và duyệt Manager với email/HTX: xem [USERS_IMPLEMENTATION.md](USERS_IMPLEMENTATION.md). Không migration, seed, ghi database hoặc sửa ERD. Restart xóa tài khoản đăng ký/HTX, khôi phục fixture mật khẩu cấu hình, xóa challenge và thu hồi session cũ. Chưa triển khai Auth production.

Nhánh tích hợp mới nhất là feat/farm-approval-workflow, gồm USERS/catalogs/Farm; đọc [MODULE_HANDOFF.md](MODULE_HANDOFF.md). Farm có duyệt đối ứng, gia nhập thêm Manager chấp thuận và rời thông báo Manager qua API. Restart cũng xóa Farm/yêu cầu/thông báo trong bộ nhớ. Tích hợp này không thay đổi cấu hình hoặc bốn request Twilio.

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
| TWILIO_VERIFY_SERVICE_SID | Trial: Identity → Verify → Overview → Try out Verify → khung REQUEST/API, copy VA trong URL `/Services/VA.../Verifications`. Có quyền quản lý: Verify → Services → service đã gửi thành công |
| SMS_ALLOWED_PHONE | Số nhận được phép dùng trong demo, cùng số AUTH_TEST_PHONE |
| LIVE_SMS_ENABLED | true để gọi Verify; .env.example mặc định false |

Service phải có **Code length = 6**; backend kiểm tra trước gửi. Trial Try out Verify dùng mã 6 số và có API gửi/check; trang Services có thể chỉ hiện Upgrade nên không bắt buộc lấy VA tại đó. Khi có quyền quản lý Service, đặt Code length=6. Không cần Twilio From number hoặc Messaging Service SID cho adapter Verify. Giữ kênh SMS/quyền gửi đã test thành công; trial giới hạn số nhận/quota theo tài khoản. [Try out Verify](https://www.twilio.com/docs/usage/trials/try-out-verify), [cấu hình Service](https://www.twilio.com/docs/verify/api/service).

Không đưa Auth Token vào chat, Postman hoặc Git. API credentials chỉ nằm ở backend.

Sau khi sửa .env, dừng API bằng Ctrl+C rồi chạy tại root:

```powershell
npm run dev:api
```

Không cần thêm thư viện/npm install cho thay đổi này: adapter dùng HTTPS fetch có sẵn trong Node 20. Nếu mới clone chưa có node_modules, chạy npm install theo README. DATABASE_URL/MONGODB_URI vẫn cần cho cấu hình chung; Auth không kết nối DB và không cần Docker để test.

## Cách test Postman

Import duy nhất **docs/postman/Twilio-Verify-Demo.postman_collection.json**. Mở collection tên **Smart Durian Farm - Twilio Verify - Nhap JSON** để tránh nhầm bản cũ. Không cần import/chọn Environment. Collection có URL localhost trực tiếp, không Scripts, biến hoặc tự động lưu token.

Mỗi request: chọn **Body → raw → JSON**, nhập dữ liệu rồi Send. Thay số ví dụ 0900000000 bằng đúng AUTH_TEST_PHONE trong .env.

1. **01 Login**: nhập phone_number và password hiện tại (AUTH_TEST_PASSWORD khi vừa restart); mong đợi 200.
2. **02 Forgot password**: nhập phone_number rồi Send; mong đợi 202. Chỉ gửi khi cần mã, không chạy Runner; request này dùng quota/chi phí SMS.
3. **03 Reset password**: nhập phone_number, otp nhận trên điện thoại và new_password; mong đợi 200. OTP để trong dấu ngoặc kép, đủ 6 chữ số; thay mã mẫu 000000. Không dùng mã từ Try out Verify trước đó.
4. **04 Login with new password**: nhập phone_number và password vừa đặt ở bước 03; mong đợi 200. Giá trị mẫu của mật khẩu mới ở hai request giống nhau; nếu đổi, tự nhập lại ở bước 04.

Sau khi reset thành công, password cũ không còn dùng được; restart API sẽ khôi phục AUTH_TEST_PASSWORD. OTP có deadline 5 phút, gửi lại cách nhau ít nhất 60 giây. Không restart API giữa gửi mã và reset vì challenge ở bộ nhớ.

Nếu bản đã import còn báo lỗi pre-request, đó là collection cũ. Import file mới và dùng collection **Nhap JSON**; thay đổi file trong dự án không tự cập nhật bản đã import.

File Twilio-Verify-Demo.postman_environment.json cũ không cần cho luồng này. Auth-Local-Test + Local environment là bộ kiểm thử mock tự động riêng; chỉ dùng khi SMS_PROVIDER=mock.


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

Tích hợp Twilio ban đầu đạt lint/typecheck/build và 20/20 tests. Sau đó người dùng xác nhận **nhận OTP và đổi mật khẩu thành công qua backend/Postman**. Collection đã rút còn đúng 4 request nhập JSON trực tiếp. Module USERS giữ nguyên file Twilio này; tổng hiện tại 29/29 tests, xem USERS_IMPLEMENTATION.md.

Tests tự động dùng fetch provider giả, không đọc credentials .env và không gửi Verify/SMS thật. Bao phủ cấu hình, E.164, form/Basic auth, Code length, SID/identity binding, mã sai/hết hạn/dùng lại, timeout/HTTP errors, giới hạn thử, race gửi/reset và thu hồi JWT. Sau mở rộng USERS, JWT/OTP riêng từng user; allowlist SMS thật vẫn giữ số fixture, không mở gửi cho số mới đăng ký.

Session sau: đọc AUTH_IMPLEMENTATION.md, USERS_IMPLEMENTATION.md, file này và IMPLEMENTATION_NOTES.md; kiểm tra git status. Giữ thay đổi MQTT/ERD của người dùng ngoài commit. Review/merge chuỗi Auth → SpeedSMS → Twilio → USERS hoặc chọn base phù hợp trên GitHub; không tự merge. Chỉ sau khi USERS hoàn tất mới bàn bảng/schema/persistence/rate limit/session; không tự thêm field/bảng ERD.

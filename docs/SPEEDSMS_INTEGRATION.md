# SpeedSMS — SMS thật cho demo local

> Tài liệu lịch sử. Từ 2026-10-02 người dùng chọn **Twilio Verify**, xem [TWILIO_VERIFY_INTEGRATION.md](TWILIO_VERIFY_INTEGRATION.md). SpeedSMS vẫn báo sender not found cả trên Console; tạo 2FA App không giải quyết quyền sender. Không dùng hướng dẫn dưới đây để cấu hình demo hiện tại; giữ để tra cứu adapter cũ.

## Phạm vi và nhánh

feat/speedsms-integration từ feat/auth. Auth chưa được xác nhận merge: PR so sánh với feat/auth trước, đổi base về main sau khi Auth merge.

Dùng mẫu NodeJS người dùng cung cấp: HTTPS POST /index.php/sms/send, Basic base64(access_token:x). Backend tự sinh/verify OTP 6 số, TTL 5 phút, 5 lần sai, cooldown 60 giây; tài khoản vẫn trong bộ nhớ. Không tạo bảng/seed hoặc ghi DB.

Ảnh hiển thị ứng dụng SpeedSMS 2FA, nhưng /sms/send là API khác. Không dùng App ID hay {pin_code}; backend tự chèn OTP. Cần xác nhận tài khoản có quyền /sms/send, type 4 và sender Verify; bật 2FA không chứng minh quyền này.

## Điền .env tại root

```dotenv
NODE_ENV=development
AUTH_MODE=mock
AUTH_TEST_PHONE=YOUR_DEMO_PHONE
AUTH_TEST_PASSWORD=LocalTestOnly123!
JWT_SECRET=YOUR_EXISTING_LOCAL_SECRET
SMS_PROVIDER=speedsms
SPEEDSMS_ACCESS_TOKEN=PASTE_TOKEN_HERE
SPEEDSMS_SMS_TYPE=4
SPEEDSMS_SENDER=Verify
SMS_ALLOWED_PHONE=YOUR_DEMO_PHONE
LIVE_SMS_ENABLED=true
SMS_TIMEOUT_MS=10000
```

Giữ JWT_SECRET có sẵn, ít nhất 32 bytes. AUTH_TEST_PHONE/SMS_ALLOWED_PHONE phải cùng số nhận Việt Nam. Số thật/token chỉ điền local, không commit/chat. Adapter đổi 0…/+84… thành 84… khi gửi.

AUTH_MODE=mock là tài khoản trong bộ nhớ; SMS_PROVIDER=speedsms mới gửi thật. LIVE_SMS_ENABLED=false chặn gửi thật; SMS_PROVIDER=mock quay lại hộp thư giả. Không cần cài dependency mới; dùng fetch Node 20. File .env không được Git theo dõi.

Type 4/Verify cần được nhà cung cấp cho phép. Nếu họ yêu cầu type 2, đặt SPEEDSMS_SMS_TYPE=2 và SPEEDSMS_SENDER= (rỗng). Không tự fallback vì có thể gây chi phí.

## Postman demo

1. Điền .env, chạy npm run dev:api. Restart khi đổi cấu hình.
2. Import docs/postman/SpeedSMS-Demo.postman_collection.json và SpeedSMS-Demo.postman_environment.json; chọn environment SpeedSMS Demo.
3. Điền test_phone bằng số của bạn, test_password khớp .env.
4. Gửi 01 Login rồi 02 Send real OTP một lần. Request 02 có thể trừ tiền thật.
5. Đọc SMS trên điện thoại, điền 6 số vào biến otp. Request 03 hộp thư giả phải trả 404.
6. Chạy 04 reset, 05 token cũ bị từ chối, 06 login password mới, 07 me.
7. Restart API khôi phục password ban đầu. Không chạy collection runner/lặp khi gửi thật bật.

## Xử lý lỗi

HTTP 200 chưa đủ: cần status=success, code=00, totalSMS>0, invalidPhone=[]; chỉ chứng minh provider nhận yêu cầu, không chứng minh điện thoại đã nhận SMS.

Lỗi HTTP/provider, JSON hỏng, timeout trả 503 sạch; không log token/OTP/raw body. Chỉ kích hoạt OTP sau khi gửi được chấp nhận. Gửi lỗi vẫn giữ cooldown 60 giây và không tự retry: timeout có thể đã bị tính phí. Xem dashboard trước khi gửi lại.

Request đồng thời chỉ gửi một lần; chỉ số allowlist nhận được; API bind loopback. Provider thật không lưu OTP dạng rõ vào outbox và /auth/test/sms trả 404. Nội dung không dấu nhằm hạn chế phân đoạn Unicode; cần xác nhận mẫu tin với SpeedSMS.

## Kiểm thử và tiếp tục

Lint, typecheck, build và 13 tests đạt với provider giả lập. Bao phủ Basic auth/payload/chuẩn hóa số, giới hạn số nhận, live switch, provider/HTTP/JSON/timeout lỗi, OTP không active sau gửi lỗi, chặn gửi song song, thành công sau cooldown và reset/login. Không gọi SpeedSMS thật, chưa kiểm chứng quyền tài khoản hay delivery trên điện thoại. Đọc tài liệu này, AUTH_IMPLEMENTATION.md và IMPLEMENTATION_NOTES.md khi tiếp tục. Không stage ERD/MQTT của người dùng. Persistence/production hoặc chuyển sang API 2FA là thay đổi khác cần hỏi trước.

Tài liệu API: https://speedsms.vn/sms-api-service/ và mẫu NodeJS do người dùng cung cấp.

### Chẩn đoán 503 khi demo
Gateway ghi HTTP status và provider code đã lọc vào terminal khi phản hồi không được chấp nhận. Không ghi raw body, token, OTP hay số nhận. Dùng mã này đối chiếu tài liệu SpeedSMS và báo cáo gửi; không tự đổi sender hoặc chuyển sang API 2FA. Nếu lỗi mạng/timeout/JSON không hợp lệ, client vẫn nhận 503 chung. Không gửi lại tự động.

Nếu provider code unknown: chưa thể kết luận token/quyền/số dư sai. Log response shape chỉ chứa kiểu dữ liệu, status success/error và các cờ kiểm tra, không chứa giá trị message hay danh sách số nhận. Đối chiếu cấu trúc trước khi thay đổi điều kiện chấp nhận; không tự coi HTTP 200 là gửi thành công.

Một số phản hồi lỗi chỉ có status=error và message, thiếu code. Gateway bổ sung provider message giới hạn 300 ký tự, che access token, Basic credentials, OTP, số nhận và chuỗi số dài; không log toàn bộ response. Chỉ dùng để chẩn đoán local. Cần đọc thông báo thực tế trước khi đổi cấu hình sender hoặc API.

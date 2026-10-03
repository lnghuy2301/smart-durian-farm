# USERS — đăng ký và duyệt Manager trong bộ nhớ

Nhánh: feat/users-registration-approval, kế thừa feat/twilio-verify. Ngày 2026-10-02 người dùng đã chốt: email hợp lệ bất kỳ, một email/một tài khoản; gmail_verify là xác minh quyền sở hữu do backend đặt; Farmer Active ngay; Manager xác minh email trước khi tạo Pending; Admin không đăng ký công khai và duyệt kèm tạo/gắn HTX. Profile Farmer và OTP email dự phòng làm sau.

Không tạo bảng, migration/seed DB hoặc sửa ERD. ERD XML/JSON đều đã được đọc: USERS có gmail varchar(255), gmail_verify boolean, status Active/Locked/Pending/Reject. Giữ đúng tên field và enum. Người dùng xác nhận các đường nối lệch dòng chỉ biểu diễn quan hệ giữa bảng; backend hiểu COOPERATIVES.manager_id trỏ USERS.id với role Manager.

## Các phần đã triển khai

1. Mở rộng store test thành nhiều tài khoản, phiên bản token riêng từng user; bảo toàn fixture Farmer và 4 request Twilio.
2. SMTP Nodemailer cho email thật, cấu hình riêng; tests thay transport, không gửi email/SMS thật.
3. OTP xác minh email gắn với phone/email, hạn dùng/số lần thử/cooldown; trả bằng chứng xác minh dùng một lần, không nhận gmail_verify từ frontend.
4. Đăng ký Farmer/Manager; chống trùng phone/email và đăng ký đồng thời. Pending/Reject không nhận JWT đăng nhập.
5. Admin fixture từ cấu hình local; API danh sách Pending, approve/reject. Approve đồng thời tạo/gắn HTX trong bộ nhớ, không ghi nửa chừng hoặc ghi đè Manager khác.
6. Collection USERS riêng: URL và JSON trực tiếp, không Scripts/Environment. Cập nhật toàn bộ hướng dẫn liên quan, chạy lint/typecheck/build/tests và push nhánh.

## Quy tắc tài khoản

- `gmail` nhận mọi domain hợp lệ, trim và chuyển về chữ thường để kiểm tra duy nhất. Một email chỉ thuộc một tài khoản, kể cả email chưa xác minh. `gmail_verify` do backend đặt, không nhận boolean từ frontend.
- Farmer không bắt buộc email/SMS xác minh ở bước đăng ký và Active ngay. Email nhập nhưng chưa xác minh có `gmail_verify=false`; có thể dùng bằng chứng xác minh để lưu true.
- Manager phải xác minh email trước khi tạo; khi đăng ký là Pending, gmail_verify=true. Pending/Reject không được cấp JWT hoặc truy cập API yêu cầu đăng nhập. Admin không đăng ký công khai.
- Admin approve phải tạo/gắn HTX ngay; chỉ duyệt Manager Pending đã xác minh email. Reject giữ email/phone trong store; chưa có luồng nộp lại hoặc chuyển Manager giữa HTX.
- Restart xóa tài khoản đăng ký, HTX, challenge/proof; khôi phục Farmer/Admin fixture và mật khẩu từ .env. UUID mới làm JWT trước restart hết hiệu lực.
- Profile Farmer, tùy chọn nhận OTP email và email dự phòng reset làm sau. Email OTP hiện chỉ xác minh email đăng ký; quên mật khẩu vẫn dùng Twilio/mock SMS. Phạm vi Manager đọc Farm trong HTX mình và xét gia nhập đã được áp dụng trong module Farm; xem FARMS_IMPLEMENTATION.md. is_owner chỉ thành true khi Farm được chấp nhận, không do client đặt.

## Cấu hình email thật

Nodemailer gửi qua SMTP của hộp thư bạn cấu hình. Không cần dịch vụ SMS hoặc API OTP email riêng, nhưng vẫn cần tài khoản SMTP gửi thư. Cổng 465 dùng TLS ngay; cổng 587 dùng STARTTLS bắt buộc. [Tài liệu SMTP](https://nodemailer.com/smtp).

Đã cài `nodemailer@10.0.13` và typings; máy hiện tại không cần chạy lại npm install. Máy mới clone chạy `npm ci` tại root. Không ghi đè .env đang có Twilio credentials.

Các khóa mới đã được thêm vào .env root. Điền SMTP_USER/PASSWORD/FROM rồi bật provider:

```dotenv
AUTH_TEST_ADMIN_PHONE=0900000001
AUTH_TEST_ADMIN_PASSWORD=LocalAdminOnly123!
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-sending-account@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=your-sending-account@gmail.com
SMTP_TIMEOUT_MS=10000
```

SMTP_USER là hộp thư gửi; SMTP_FROM nên cùng địa chỉ; SMTP_PASSWORD là mật khẩu ứng dụng. Với Google: bật xác minh hai bước, mở [Mật khẩu ứng dụng](https://myaccount.google.com/apppasswords), tạo mật khẩu cho backend rồi điền vào .env local. Không dùng mật khẩu Google thông thường. Một số tài khoản tổ chức/chính sách bảo mật không có mục này; xem [hướng dẫn Google](https://support.google.com/accounts/answer/185833) hoặc dùng SMTP hộp thư khác.

Email nhận trong JSON `gmail` có thể là Gmail, Outlook hoặc domain khác. Không điền SMTP credentials vào Postman/Git. Chưa điền thì giữ EMAIL_PROVIDER=disabled: Farmer/Login/SMS vẫn hoạt động, yêu cầu gửi email trả 503, không giả vờ đã xác minh.

Dừng API bằng Ctrl+C và chạy tại root:

```powershell
npm run dev:api
```

AUTH_MODE=mock, NODE_ENV=development, bind localhost. DATABASE_URL/MONGODB_URI vẫn cần cho cấu hình chung nhưng USERS không truy cập DB; không cần Docker để test USERS. AUTH_TEST_ADMIN_PHONE/PASSWORD phải được cấu hình cùng nhau, số khác Farmer test kể cả dạng 0/84/+84. Không cấu hình Admin thì không có tài khoản duyệt.

## API và dữ liệu nhập

| API | Quyền | Kết quả |
|---|---|---|
| POST `/api/auth/register` | Công khai | 201: Farmer Active hoặc Manager Pending |
| POST `/api/auth/registration/email/request` | Công khai | 202: gửi email, trả verification_id, expires_in |
| POST `/api/auth/registration/email/verify` | Công khai | 200: kiểm tra OTP, trả email_verification_token |
| POST `/api/auth/login` | Công khai | 200 nếu Active; Pending/Reject đúng password: 403 |
| GET `/api/users/pending-managers` | Admin Active | Danh sách Manager Pending, không password/hash |
| GET `/api/users/cooperatives` | Admin Active | HTX trong bộ nhớ |
| PATCH `/api/users/:id/approve` | Admin Active | 200: gắn HTX và Manager Active |
| PATCH `/api/users/:id/reject` | Admin Active | 200: Manager Reject, không tạo HTX |

Farmer không email:

```json
{
  "user_name": "Farmer demo",
  "phone_number": "0900000002",
  "password": "FarmerDemo123!",
  "role": "Farmer"
}
```

Manager: gửi email → nhập OTP → đăng ký. Giữ cùng phone/email trong ba bước. Body yêu cầu gửi:

```json
{
  "phone_number": "0900000003",
  "gmail": "manager@example.com"
}
```

Thay email bằng địa chỉ nhận thật. Copy verification_id từ response gửi; nhập OTP 6 số nhận trong inbox/spam:

```json
{
  "phone_number": "0900000003",
  "gmail": "manager@example.com",
  "verification_id": "11111111-1111-4111-8111-111111111111",
  "otp": "000000"
}
```

Copy email_verification_token từ response xác minh vào body đăng ký:

```json
{
  "user_name": "Manager demo",
  "phone_number": "0900000003",
  "password": "ManagerDemo123!",
  "role": "Manager",
  "gmail": "manager@example.com",
  "email_verification_token": "11111111-1111-4111-8111-111111111111"
}
```

UUID trên là ví dụ, phải thay bằng response thực tế. Không copy cả response có message/expires_in vào request. Thành công: copy user.id để Admin duyệt.

Admin login bằng AUTH_TEST_ADMIN_PHONE/PASSWORD qua /auth/login. Copy access_token vào Headers của request Admin: `Authorization: Bearer <access_token>`. URL duyệt chứa **user.id Manager**, không phải Admin id. Body tạo HTX lúc duyệt:

```json
{
  "cooperative": {
    "cooperative_name": "HTX Sau Rieng Demo",
    "director": "Nguoi dai dien HTX",
    "certificate_number": "DEMO-HTX-001",
    "address": "Dia chi HTX",
    "contact_number": "0900000003"
  }
}
```

Hoặc gắn HTX chưa có Manager bằng `{"cooperative_id":"<UUID HTX>"}`, không truyền cùng cooperative. Hiện chưa có API tạo HTX độc lập: demo thông thường dùng tạo HTX khi duyệt. Store hỗ trợ gắn HTX chưa có Manager cho module HTX tiếp theo và đã có test riêng. HTX tạo qua approve đã có Manager nên không gắn cho tài khoản khác. Reject dùng body `{}`.

## Logic và cấu trúc code

- auth/mock-user.store.ts: nhiều users, unique email theo chữ thường và unique phone kể cả alias VN 0/84/+84. Login vẫn dùng đúng chuỗi phone đã đăng ký. Không thay constraints ERD/DB.
- auth/auth.service.ts: kiểm tra Active khi xác thực JWT; OTP reset và phiên bản JWT riêng từng user. Reset không thu hồi JWT/xóa OTP của tài khoản khác.
- users/email/email.sender.ts: SMTP/TLS, timeout, làm gọn lỗi và không log credentials/OTP/recipient. SMTP accepted chỉ nghĩa là server gửi chấp nhận, chưa bảo đảm inbox nhận; nhập đúng OTP mới chứng minh sở hữu email.
- users/email/email-verification.service.ts: OTP crypto 6 số, chỉ lưu hash có salt; gắn phone/email/verification_id, hạn 10 phút từ lúc yêu cầu gửi, tối đa 5 lần nhập sai, cooldown 60 giây. Token xác minh ngẫu nhiên, lưu hash, dùng một lần trong thời hạn còn lại. Gửi lại thay challenge/token trước đó.
- users/users.service.ts: kiểm tra lại uniqueness/proof sau await hash; ghi account và consume proof đồng bộ, tránh đăng ký đồng thời. Approve tạo/gắn HTX trước khi đổi status; cả khối không có await nên lỗi giữ Pending. Chưa phải transaction DB.
- users/mock-cooperative.store.ts: không ghi đè Manager hiện tại, một Manager chỉ quản lý một HTX; không trùng số chứng nhận để tránh tạo lại cùng HTX trong demo. Store trả bản sao để không sửa manager_id từ object trả về. Đây là quy tắc store, chưa thêm UNIQUE database. Tên/giám đốc tối đa 40, chứng nhận 24, địa chỉ 255; yêu cầu đủ thông tin khi Admin tạo HTX. USERS và Farms dùng cùng store HTX.
- users/admin.guard.ts và service kiểm tra Admin Active. DTO/ValidationPipe từ chối field ngoài contract, Admin role công khai, email/OTP/UUID sai hoặc HTX thiếu thông tin. Swagger ở /api/docs.

Giới hạn mỗi process: 20 login/phút, 5 forgot/phút, 5 register/phút, 5 gửi email/phút, 20 verify email/phút; tối đa 100 users, 100 HTX, 100 email challenges chưa hết hạn. Đây là giới hạn test để chặn gửi lặp và giữ bộ nhớ hữu hạn. HTTP 429: đợi cửa sổ tiếp theo. Không tự retry SMTP/SMS.

## Postman

Import **docs/postman/Users-Local-Test.postman_collection.json**, mở **Smart Durian Farm - Users - Nhap JSON**. Không Environment/Scripts. URL/JSON literal; sửa Body → raw → JSON trực tiếp.

1. 01 Register Farmer: tạo Farmer test nếu cần.
2. 02 Request email verification: email thật, phone Manager mới; copy verification_id.
3. 03 Verify email: nhập OTP email và verification_id; copy email_verification_token.
4. 04 Register Manager: token từ 03, cùng email/phone; nhận Pending.
5. 05 Login Admin: dùng cấu hình Admin, copy JWT.
6. 06 Pending managers: paste JWT ở Headers, copy id Manager.
7. 07 Approve Manager: sửa id trên URL, điền HTX/JWT; nhận Active + HTX.
8. 08 Login Manager: sau duyệt nhận JWT; trước duyệt là 403.

09 xem HTX; 10 từ chối Manager khác còn Pending; 11 gắn HTX chưa có Manager là tùy chọn. Không chạy Runner để tránh đăng ký/gửi thư lặp. Import lại khi file dự án thay đổi, Postman không tự đồng bộ.

**Giữ nguyên 4 request Twilio-Verify-Demo.postman_collection.json.** Collection đó vẫn test SMS/reset Farmer fixture. Allowlist SMS thật vẫn chỉ cho AUTH_TEST_PHONE/SMS_ALLOWED_PHONE; chưa mở SMS thật cho số vừa đăng ký. Reset nhiều users được kiểm thử với SMS_PROVIDER=mock.

## Kiểm tra và session tiếp theo

Đạt npm run lint, npm run typecheck, npm run build, npm test: **29/29 tests**, gồm 9 test mới USERS/SMTP và 20 hồi quy. Tests dùng transport giả, không đọc .env hoặc gửi thư/SMS thật. Bao phủ quyền/DTO, email mọi domain, unique/race, proof identity/hạn dùng/số lần thử, Pending/Reject, Admin approve/reject, HTX không ghi nửa chừng, JWT/OTP từng user và SMTP TLS/lỗi không lộ dữ liệu.

Người dùng đã xác nhận **Twilio SMS qua backend và đổi mật khẩu thành công**, sau đó **email SMTP thật, đăng ký Manager và Admin duyệt HTX đều thành công**. .env không commit. Các nhánh Zones/USERS_ZONES kế thừa dùng cùng store; đọc MODULE_HANDOFF.md để lấy nhánh tích hợp và kết quả kiểm thử mới nhất. Không cần gửi SMS cho số Farmer mẫu khi test phân công.

Session sau đọc file này, AUTH_IMPLEMENTATION.md, IMPLEMENTATION_NOTES.md, spec và ERD mới. Kiểm tra branch/status và phụ thuộc trước PR/merge; không stage thay đổi MQTT/ERD hoặc file SpeedSMS người dùng xóa vào commit backend. Không tự merge.

Tiếp tục USERS còn lại (profile, email dự phòng/opt-in) theo quyết định người dùng. **Chỉ khi USERS hoàn tất mới bàn bảng/migrations**: xác nhận nullability/cardinality/xóa/unique, repository và transaction approve, OTP/session/rate limit bền vững. Không tự sửa ERD hoặc đưa Auth mock vào production.

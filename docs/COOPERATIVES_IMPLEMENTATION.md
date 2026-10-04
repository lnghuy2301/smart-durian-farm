# COOPERATIVES — HTX độc lập và xác minh thay đổi của Manager

Nhánh `feat/cooperatives-management`, base `feat/zone-assignments` (c9dbe67). Kế thừa toàn bộ modules đã hoàn tất. Không triển khai Trees/Cultivation/IoT trong đợt này. Đọc MODULE_HANDOFF.md đầu session.

## Quy tắc đã chốt

- Admin tạo HTX chưa có Manager và sửa trực tiếp cả năm trường thông tin. Không nhận manager_id từ JSON tạo/sửa.
- Gắn Manager chỉ qua USERS: Manager xác minh email, đăng ký Pending, Admin approve với cooperative_id hoặc tạo HTX mới trong approve. Một Manager một HTX; không ghi đè Manager hiện tại. Chưa có tháo/chuyển Manager.
- Manager chỉ đọc HTX mình và đề xuất sửa `cooperative_name`, `director`, `address`, `contact_number`. Không sửa `certificate_number` hoặc manager_id. Farmer đọc danh bạ/chi tiết HTX, không sửa.
- Mọi thay đổi của Manager phải xác minh **email tài khoản trước, SMS tới điện thoại tài khoản sau**. Không gửi OTP tới contact_number mới của HTX. Chỉ ghi thay đổi khi cả hai bước thành công, Manager còn Active/đúng HTX, địa chỉ email/phone/phiên tài khoản và phiên bản HTX vẫn khớp.
- Nội dung yêu cầu là cố định. Muốn đổi nội dung: hủy yêu cầu cũ và tạo mới, xác minh lại từ đầu. Admin sửa HTX trong lúc Manager xác minh làm yêu cầu Manager lỗi thời, trả 409 ở bước tiếp theo; không ghi đè thay đổi của Admin.

Thông tin theo ERD: id, manager_id, director, cooperative_name, certificate_number, address, contact_number. Tên/đại diện tối đa 40, chứng nhận 24, địa chỉ 255; số liên hệ chuỗi 9–13 chữ số, optional `+`, tổng tối đa 14. DTO trim các trường văn bản; không nhận null, field lạ hoặc PATCH rỗng/không thay đổi. Chứng nhận duy nhất trong store demo đã có từ USERS, chưa tạo UNIQUE DB mới. Response là bản sao.

## Cảnh báo và xóa HTX chưa có Manager

- Từ **7 × 24 giờ** sau lúc tạo: ghi một thông báo `ManagerMissing` cho Admin.
- Từ **30 × 24 giờ** sau lúc tạo: tự động xóa HTX nếu vẫn không có Manager **và** không có Farm, yêu cầu Farm (kể cả đã xử lý/snapshot), thông báo Farm hoặc yêu cầu sửa HTX tham chiếu.
- Có tham chiếu: giữ HTX, ghi `DeletionBlocked` một lần. Không tự cho Farm rời HTX, không xóa lịch sử hoặc cascade.
- Xóa thành công giữ `CooperativeDeleted` với UUID/tên HTX và deadline để Admin biết việc đã xảy ra. Thông báo cảnh báo cũ vẫn là lịch sử; không đồng nghĩa HTX hiện vẫn thiếu Manager.
- Gắn Manager thành công dừng lịch xóa. Manager bị Locked vẫn là Manager đã gắn, không bị xem như HTX bỏ trống.

Worker chạy khi API khởi động và mỗi 60 giây, đồng thời kiểm tra khi truy cập API quản lý HTX. Vì vậy xử lý nền có thể trễ tối đa khoảng một chu kỳ; Manager gắn trước lần kiểm tra sẽ chặn xóa. Không gửi email/SMS/push cho cảnh báo này. Endpoint thông báo dành riêng Admin.

ERD chưa có created_at/status xóa HTX. Thời gian tạo, version, yêu cầu xác minh và thông báo đều là metadata **trong bộ nhớ**, không phải schema mới. Xóa ở đây là xóa bản ghi khỏi store sau kiểm tra tham chiếu; không có DELETE API thủ công. Restart mất HTX, thời gian, yêu cầu và thông báo, nên worker 30 ngày chỉ có ý nghĩa khi process/dữ liệu tồn tại liên tục. Persistence phải bàn riêng.

## Quy trình email → SMS

1. Manager gửi bốn trường muốn sửa (có thể chỉ một trường), backend lưu request và gửi email tới gmail tài khoản đã xác minh. `EmailPending`, OTP 6 số có hạn 10 phút từ lúc bắt đầu gửi.
2. Nhập OTP email đúng: `EmailVerified`. Backend cấp cửa sổ mới 10 phút để **bắt đầu gửi SMS**, không buộc SMS hoàn tất trong thời gian còn lại của OTP email ban đầu.
3. Gửi SMS: `SmsPending`, hạn riêng 5 phút từ lúc bắt đầu gửi. OTP SMS tới phone_number tài khoản Manager; sau khi đã gửi trong cửa sổ email, việc nhập SMS chỉ xét deadline SMS riêng.
4. SMS đúng: kiểm tra lại quyền/version sau await Verify, commit đồng bộ và trả `Accepted` + HTX chính thức. Sai/mất quyền/lỗi thời/hết hạn giữ HTX cũ.

Mỗi bước tối đa 5 lần nhập sai. Gửi lại OTP cùng bước đợi ít nhất 60 giây; thay bằng chứng lần gửi trước. Chỉ gửi lại email khi EmailPending và SMS khi SmsPending, còn thời hạn tương ứng. EmailVerified quá 10 phút chưa gửi SMS hoặc SmsPending quá 5 phút → Expired; lập yêu cầu mới. Lỗi provider/timeout không retry tự động, request Failed và chứng cứ bị loại bỏ. Khi check SMS có kết quả không chắc chắn, không cho dùng lại request.

Trong lúc provider gửi/check, không cho gửi/check/hủy đồng thời hoặc tạo request mới của Manager đó. Worker có thể đánh dấu hết hạn khi đang chờ; khóa thao tác vẫn giữ tới khi provider trả về. Không cấp quyền hay commit bằng kết quả đến trễ. Tối đa một request đang xử lý cho mỗi Manager.

OTP/bằng chứng sửa HTX tách khỏi OTP đăng ký và reset mật khẩu. Nội dung, user, HTX và phiên bản được giữ trên server; client chỉ gửi OTP, không gửi cờ email_verified/phone_verified hoặc tự thay field trong request.

JWT có hạn 15 phút như Auth hiện tại. Nếu nhập tuần tự lâu hơn thì login lại, paste JWT mới và tiếp tục request còn hạn; login không thay version tài khoản. Reset mật khẩu/thu hồi phiên làm request cũ không còn hợp lệ. Không kéo dài JWT trong module này.

## API

Tất cả cần JWT Active. POST trả 201; PATCH/GET trả 200. Lỗi DTO/OTP 400; thiếu/sai JWT 401; sai vai trò 403; đọc ngoài phạm vi/UUID không tồn tại 404; xung đột/trạng thái/hết hạn/lỗi thời 409; cooldown/giới hạn 429; chưa cấu hình hoặc provider lỗi 503.

| Method / endpoint | Quyền / body / kết quả |
|---|---|
| GET `/api/cooperatives` | Admin/Farmer: danh bạ; Manager: chỉ HTX mình. q, limit/offset |
| GET `/api/cooperatives/:id` | Chi tiết trong phạm vi, thêm lifecycle.created_at/warning_at/deletion_due_at |
| POST `/api/cooperatives` | Admin: đủ năm trường thông tin → HTX manager_id=null |
| PATCH `/api/cooperatives/:id` | Admin: ít nhất một trường thay đổi, gồm certificate_number |
| POST `/api/cooperatives/:id/update-requests` | Manager của HTX: bốn trường cho phép → gửi email, request EmailPending |
| GET `/api/cooperative-update-requests` | Admin: tất cả; Manager: của mình; limit/offset |
| GET `/api/cooperative-update-requests/:id` | Admin/Manager gửi yêu cầu: thông tin/trạng thái, không digest/proof/OTP |
| POST `/api/cooperative-update-requests/:id/email/resend` | Manager gửi yêu cầu: `{}` |
| POST `/api/cooperative-update-requests/:id/email/verify` | Manager gửi yêu cầu: `{"otp":"123456"}` |
| POST `/api/cooperative-update-requests/:id/sms/send` | Manager gửi yêu cầu: `{}`; sau email thành công |
| POST `/api/cooperative-update-requests/:id/sms/verify` | Manager gửi yêu cầu: `{"otp":"123456"}` → request + cooperative |
| PATCH `/api/cooperative-update-requests/:id/cancel` | Manager gửi yêu cầu: `{}`; trước Accepted, không đang gửi/check |
| GET `/api/cooperative-update-requests/:id/test-sms` | Chỉ mock SMS, đúng Manager/yêu cầu SmsPending; SMS thật 404 |
| GET `/api/cooperative-notifications` | Chỉ Admin: cảnh báo/chặn xóa/đã xóa, limit/offset |

Danh sách `{items,total,limit,offset}`; limit mặc định 20, 1–100; offset 0–100000; q tối đa 100. URL/DTO kiểm tra UUID v4. GET `/api/users/cooperatives` cũ vẫn dành Admin. GET `/api/cooperatives` đã chuyển controller sang module HTX, giữ pagination và quyền cũ để Farm Postman tiếp tục hoạt động.

Ví dụ Admin tạo:

```json
{
  "cooperative_name": "HTX Sầu Riêng Demo",
  "director": "Người đại diện",
  "certificate_number": "HTX-DEMO-001",
  "address": "Địa chỉ HTX",
  "contact_number": "0900000009"
}
```

Manager đề xuất chỉ cần các field muốn đổi:

```json
{
  "address": "Địa chỉ mới",
  "contact_number": "0900000008"
}
```

## Cấu hình SMS thật và bảo toàn demo Farmer

Không ghi đè `.env`. Giữ nguyên TWILIO_VERIFY_SERVICE_SID/SMS_ALLOWED_PHONE đang dùng cho Farmer reset. Chỉ người dùng tự bổ sung hai khóa từ `.env.example` nếu muốn test Manager SMS thật:

```dotenv
TWILIO_HTX_VERIFY_SERVICE_SID=
HTX_SMS_ALLOWED_PHONES=
```

TWILIO_HTX_VERIFY_SERVICE_SID là **Verify Service riêng** với Code length 6, cùng Twilio account credentials hiện có. Không dùng lại Service SID reset: Twilio có thể dùng lại mã cho cùng số trong một cửa sổ, và hai luồng cùng service có thể tác động challenge của nhau. HTX_SMS_ALLOWED_PHONES là danh sách số tài khoản Manager được phép gửi, phân cách dấu phẩy, tối đa 20 mục, số di động VN dạng 0/84/+84. Backend chuẩn hóa và loại trùng. Ví dụ giá trị mẫu: `0900000003,0900000004`; thay bằng số thực sự được phép.

Khi SMS_PROVIDER=twilio và chưa điền cả hai khóa: Auth Farmer vẫn chạy như cũ, bước SMS sửa HTX trả 503. Nếu điền thì cả hai phải hợp lệ và HTX SID khác reset SID; không tự sửa cấu hình hoặc nới allowlist Farmer. Dùng LIVE_SMS_ENABLED=true hiện có khi chủ động test thật; số không thuộc HTX allowlist bị chặn trước khi gọi provider. Chính sách tài khoản Twilio có thể giới hạn số nhận; kiểm tra cấu hình Console nếu provider từ chối.

SMS_PROVIDER=mock: SMS HTX có outbox riêng, đọc qua test-sms sau email thành công. Email vẫn dùng SMTP thật trong test tay; không có endpoint đọc email OTP. SMTP đang có được dùng chung với USERS, nội dung thư ghi rõ xác nhận sửa HTX. SpeedSMS legacy không hỗ trợ SMS HTX thật trong đợt này; bước gửi trả 503.

## Postman và tái lập

Import `docs/postman/Cooperatives-Local-Test.postman_collection.json`: **20 request**, không scripts/variables/environment. Chạy `npm run dev:api`, Swagger `/api/docs`. AUTH_MODE=mock, NODE_ENV=development; giữ DATABASE_URL/MONGODB_URI cho config, không cần DB chạy để test HTX nghiệp vụ.

1. 01 login Admin, copy JWT. 02 tạo HTX trống, copy response.id. 03/04 đọc danh bạ/chi tiết, 05 Admin sửa trực tiếp.
2. Dùng USERS collection gửi email/xác minh/đăng ký Manager Pending; phải dùng email tài khoản thật. 06 lấy UUID Manager; 07 approve bằng JWT Admin, URL UUID Manager, body cooperative_id là UUID HTX bước 02.
3. 08 login Manager, copy JWT riêng. 09/10 đọc HTX mình. 11 đề xuất sửa → email thật, copy response.id **yêu cầu sửa**. 12 xem trạng thái.
4. 13 nhập OTP email và UUID yêu cầu. 14 gửi SMS sau EmailVerified. SMS mock: dùng 15 lấy OTP; SMS thật: đọc điện thoại. 16 nhập OTP SMS; chỉ lúc này thông tin chính thức đổi. 10 đọc lại.
5. 17 gửi lại email/18 hủy là tùy chọn trước Accepted, không chạy cả collection bằng Runner. 19 Admin đọc cảnh báo, 20 xem lịch sử yêu cầu. Muốn gửi lại SMS dùng lại 14 sau 60 giây khi request còn hạn.

JWT ở Headers: Key `Authorization`, Value `Bearer <access_token>`; giữ riêng Admin/Manager. UUID Manager, HTX và request là ba loại khác nhau. OTP là chuỗi sáu số, giữ cả số 0 đầu. Nếu JWT hết hạn, login lại và paste JWT mới. Restart sẽ cần tạo/đăng ký/duyệt lại toàn bộ dữ liệu.

Không có API sửa đồng hồ/created_at để test ngày 7/30. Automated tests dùng fake clock và provider; test tay chỉ quan sát lifecycle và notifications thật.

## Code, giới hạn và kiểm thử

- `src/cooperatives`: DTO, controllers, service, request types, module, OTP provider token. `MockCooperativeStore` vẫn được USERS cung cấp/export **một lần**; HTX/Farms/USERS dùng cùng instance. EmailSender cũng dùng chung instance USERS. AppModule truyền đúng các dynamic module đã tạo, không gọi factory để tạo store thứ hai.
- Metadata tạo/version nằm riêng trong MockCooperativeStore; gắn Manager hoặc update đều tăng version. FarmsService cung cấp kiểm tra tham chiếu, không đưa deletion vào controller.
- OTP provider HTX có instance riêng theo mục đích, không chứa user/store riêng. Twilio HTX service/allowlist riêng; mock outbox riêng. Không ảnh hưởng OTP reset đang chờ.
- Tối đa 100 HTX cùng tồn tại (giới hạn store USERS cũ), 500 request kể cả lịch sử, 2000 thông báo. Request đầy trả 429. Gửi email/SMS tối đa 5 lần/phút cho mỗi loại trên process; verify tối đa 20 lần/phút cho mỗi loại, cộng giới hạn 5 lần sai/request và cooldown 60 giây. Không ghi/log OTP, token, email/phone hoặc credential trong lỗi provider.
- Khi hết dung lượng thông báo, không xóa HTX nếu không lưu được thông báo xóa. Thông báo deduplicate theo HTX/type. Chưa đánh dấu đã đọc, push hay external delivery.
- Validate/recheck/commit đồng bộ sau await, phù hợp một process demo; chưa phải transaction/locking phân tán. Worker dừng khi app shutdown. DB sẽ cần storage và transaction được chốt riêng, không suy metadata Map thành bảng mới.

Các kiểm thử HTX bao phủ shared stores, approve Manager hiện có, HTTP/quyền/DTO, bốn trường Manager, phiên/version, email → SMS, deadline riêng, exact boundaries, cooldown/attempt limit, cancel/replay, concurrency, provider lỗi/timeout, OTP tách reset, mốc ngày 7/30 và chặn xóa khi có tham chiếu. Tests dùng SMTP/SMS giả, không đọc .env thật/gửi tin/ghi DB. Kết quả tích hợp cập nhật MODULE_HANDOFF.md.

Validation: **69/69 tests** (14 HTX + 55 hồi quy), lint/typecheck/build đạt. Collection 20 request đã kiểm tra JSON literal/no scripts/variables. Twilio/Users Postman, ERD và MQTT của người dùng được giữ nguyên ngoài commit module.

Kiểm tra thường: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`. Nếu wrapper npm Windows lỗi EPERM đường dẫn cài đặt, từ `apps/api` chạy công cụ local tương đương:

```powershell
node ../../node_modules/eslint/bin/eslint.js src test integration
node ../../node_modules/typescript/bin/tsc --noEmit
node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json
node ../../node_modules/typescript/bin/tsc --outDir .test-dist
node --test .test-dist/test
```

Không in .env hoặc thay quyền/cấu hình global chỉ để chạy checks. Stage đúng file module; giữ ERD/MQTT/Postman riêng của người dùng. Commit local, không push/merge khi chưa được phép gửi branch lên origin. Session sau đọc guide này, handoff/notes/plan/spec, kiểm tra Git trước khi làm module tiếp theo.

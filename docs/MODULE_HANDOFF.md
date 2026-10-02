# Bàn giao các module — đọc đầu session

## Trạng thái và nguyên tắc

Cập nhật Farm ngày 2026-10-02: đã triển khai tạo/sửa duyệt chéo Admin–chủ Farmer, gia nhập thêm Manager HTX duyệt, rời duyệt đối ứng và thông báo Manager qua API. Farm có thể độc lập; một Manager một HTX; is_owner chỉ thành true khi Farm được chấp nhận. Nhánh `feat/farm-approval-workflow` từ `feat/standard-materials`; đọc FARMS_IMPLEMENTATION.md và FARMS_WORKFLOW_DESIGN.md. **44/44 tests + lint/typecheck/build** đã đạt, fake transports, không gửi tin thật/ghi DB. Postman Farm có 18 request URL/JSON trực tiếp; Twilio giữ đúng 4.

Đã fetch origin/main ngày 2026-10-02: 7594c9d đã merge Auth ban đầu; Twilio/USERS chưa có trong main. Các nhánh mới kế thừa nhau để không bỏ code đã hoàn thành; không tự merge. Khi phụ thuộc được merge, module tiếp theo bắt đầu từ main cập nhật. Người dùng muốn module đơn giản trước, mỗi module một branch và tài liệu/Postman; gặp nghiệp vụ khó/chưa rõ phải dừng hỏi.

Tất cả nghiệp vụ hiện lưu trong bộ nhớ. Chưa tạo bảng/seed/collection hoặc sửa ERD; chỉ sau khi USERS hoàn tất mới bàn persistence. Farmer email profile/opt-in và reset email dự phòng chưa làm. Twilio collection giữ đúng 4 request. .env chứa secret local, không commit. ERD XML/JSON, MQTT và các file SpeedSMS bị người dùng xóa phải giữ ngoài commit backend.

## Các nhánh

| Module | Branch/base | Tài liệu | Postman |
|---|---|---|---|
| USERS | feat/users-registration-approval ← feat/twilio-verify | USERS_IMPLEMENTATION.md | Users-Local-Test |
| Vật tư | feat/agricultural-materials ← USERS | MATERIALS_IMPLEMENTATION.md | Materials-Local-Test |
| Tiêu chuẩn | feat/farming-standards ← Vật tư | STANDARDS_IMPLEMENTATION.md | Standards-Local-Test |
| Liên kết tiêu chuẩn–vật tư | feat/standard-materials ← Tiêu chuẩn | STANDARD_MATERIALS_IMPLEMENTATION.md | Standard-Materials-Local-Test |
| Farm / duyệt thay đổi và membership | feat/farm-approval-workflow ← Bridge | FARMS_IMPLEMENTATION.md | Farms-Local-Test |

Vật tư/Tiêu chuẩn có Admin tạo/sửa/Inactive và user Active đọc/search/pagination. Bridge có Admin gắn/bỏ gắn, user Active đọc theo tiêu chuẩn; kiểm tra FK/cặp duy nhất và dùng đúng cùng store catalogs. Không kho/tồn hàng. Tiêu chuẩn gắn Zone sau, không gắn Farm. Hai catalog không hard-delete, không tự tạo UNIQUE tên/code ngoài ERD. Farm dùng đúng cùng Auth/USERS/HTX store; membership không sửa trực tiếp qua update, không áp dụng dữ liệu khi còn Pending.

Checkout feat/farm-approval-workflow để test toàn bộ chuỗi hiện tại. PR phụ thuộc theo thứ tự USERS → Vật tư → Tiêu chuẩn → Bridge → Farm; so sánh mỗi branch với parent để review chỉ module đó. Khi parent merge main, cập nhật base PR phù hợp; không tự merge hoặc rebase làm mất thay đổi người dùng.

## Tái lập ở session khác

1. Đọc file này, IMPLEMENTATION_NOTES.md, tài liệu module và ERD mới; git status/branch, fetch remote.
2. Checkout nhánh cuối chuỗi để có code tích hợp; không checkout làm mất sửa dở của người dùng. Kiểm tra migration/seed vẫn chưa được tạo.
3. Node 20.19+, npm ci ở root nếu chưa có dependencies. Không Copy-Item ghi đè .env hiện có; thêm khóa thiếu từ .env.example.
4. AUTH_MODE=mock, NODE_ENV=development, AUTH_TEST_ADMIN_PHONE/PASSWORD đầy đủ; DATABASE_URL/MONGODB_URI cần config nhưng danh mục không gọi DB. Email/SMS thật chỉ cần khi chủ động test luồng tương ứng.
5. npm run dev:api; Swagger /api/docs. Import collection module, nhập JSON trực tiếp; copy JWT vào Authorization và UUID vào URL bằng tay. Restart xóa dữ liệu danh mục/đăng ký/Farm/yêu cầu/thông báo. Test Farm tạo/sửa cần Farmer/Admin, không cần SMTP. Gia nhập cần Manager đã xác minh email và được Admin approve qua USERS.
6. npm run lint, npm run typecheck, npm run build, npm test. Tests dùng fake transports, không đọc .env. Stage đúng code/test/docs module, commit/push nhánh; không tự merge.

## Quyết định cần hỏi trước module phụ thuộc

- Farm hiện đã triển khai theo quy tắc chốt; quản lý HTX độc lập, xóa/chuyển chủ Farm và hủy yêu cầu chưa có. Schema lưu yêu cầu/duyệt/thông báo lâu dài vẫn cần chốt với người dùng trước persistence, không tự thêm bảng từ metadata Map.
- Zones/USERS_ZONES: chốt ai tạo/sửa Zone, ai phân công và có cần duyệt đối ứng như Farm hay không. Chưa tự mở rộng quyền Farmer từ chủ Farm sang tất cả người được phân công; quyền đọc qua assignment cần xử lý riêng.
- Assignments/Cultivation: quyền sửa lịch sử sau phân công, di chuyển Tree/Device/Standard, details lựa chọn chưa cung cấp.
- IoT: command_id, timeout và ACK thiếu correlation cần thống nhất firmware.
- Database: cardinality/nullability/unique/deletion rules còn cần chốt, không suy từ store demo thành schema mới.

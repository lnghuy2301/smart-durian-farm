# Bàn giao các module — đọc đầu session

## Trạng thái và nguyên tắc

Đã fetch origin/main ngày 2026-10-02: 7594c9d đã merge Auth ban đầu; Twilio/USERS chưa có trong main. Các nhánh mới kế thừa nhau để không bỏ code đã hoàn thành; không tự merge. Khi phụ thuộc được merge, module tiếp theo bắt đầu từ main cập nhật. Người dùng muốn module đơn giản trước, mỗi module một branch và tài liệu/Postman; gặp nghiệp vụ khó/chưa rõ phải dừng hỏi.

Tất cả nghiệp vụ hiện lưu trong bộ nhớ. Chưa tạo bảng/seed/collection hoặc sửa ERD; chỉ sau khi USERS hoàn tất mới bàn persistence. Farmer email profile/opt-in và reset email dự phòng chưa làm. Twilio collection giữ đúng 4 request. .env chứa secret local, không commit. ERD XML/JSON, MQTT và các file SpeedSMS bị người dùng xóa phải giữ ngoài commit backend.

## Các nhánh

| Module | Branch/base | Tài liệu | Postman |
|---|---|---|---|
| USERS | feat/users-registration-approval ← feat/twilio-verify | USERS_IMPLEMENTATION.md | Users-Local-Test |
| Vật tư | feat/agricultural-materials ← USERS | MATERIALS_IMPLEMENTATION.md | Materials-Local-Test |
| Tiêu chuẩn | feat/farming-standards ← Vật tư | STANDARDS_IMPLEMENTATION.md | Standards-Local-Test |
| Liên kết tiêu chuẩn–vật tư | feat/standard-materials ← Tiêu chuẩn | STANDARD_MATERIALS_IMPLEMENTATION.md | Standard-Materials-Local-Test |

Vật tư/Tiêu chuẩn có Admin tạo/sửa/Inactive và user Active đọc/search/pagination. Bridge có Admin gắn/bỏ gắn, user Active đọc theo tiêu chuẩn; kiểm tra FK/cặp duy nhất và dùng đúng cùng store catalogs. Không kho/tồn hàng. Tiêu chuẩn gắn Zone sau, không gắn Farm. **36/36 tests + lint/typecheck/build**. Hai catalog không hard-delete, không tự tạo UNIQUE tên/code ngoài ERD. Module Standard Materials hoàn tất; dừng trước Farms/Cooperatives mới để hỏi quyền/quy trình HTX chưa rõ.

Checkout feat/standard-materials để test toàn bộ chuỗi hiện tại. PR phụ thuộc theo thứ tự USERS → Vật tư → Tiêu chuẩn → Bridge; so sánh mỗi branch với parent để review chỉ module đó. Khi parent merge main, cập nhật base PR phù hợp; không tự merge hoặc rebase làm mất thay đổi người dùng.

## Tái lập ở session khác

1. Đọc file này, IMPLEMENTATION_NOTES.md, tài liệu module và ERD mới; git status/branch, fetch remote.
2. Checkout nhánh cuối chuỗi để có code tích hợp; không checkout làm mất sửa dở của người dùng. Kiểm tra migration/seed vẫn chưa được tạo.
3. Node 20.19+, npm ci ở root nếu chưa có dependencies. Không Copy-Item ghi đè .env hiện có; thêm khóa thiếu từ .env.example.
4. AUTH_MODE=mock, NODE_ENV=development, AUTH_TEST_ADMIN_PHONE/PASSWORD đầy đủ; DATABASE_URL/MONGODB_URI cần config nhưng danh mục không gọi DB. Email/SMS thật chỉ cần khi chủ động test luồng tương ứng.
5. npm run dev:api; Swagger /api/docs. Import collection module, nhập JSON trực tiếp; copy JWT vào Authorization và UUID vào URL bằng tay. Restart xóa dữ liệu danh mục/đăng ký.
6. npm run lint, npm run typecheck, npm run build, npm test. Tests dùng fake transports, không đọc .env. Stage đúng code/test/docs module, commit/push nhánh; không tự merge.

## Quyết định cần hỏi trước module phụ thuộc

- Farms/Cooperatives: quyền tạo/sửa/gắn farm, owner là Farmer nào, is_owner và thủ tục vào/rời HTX; chưa tự chọn thay user.
- Assignments/Cultivation: quyền sửa lịch sử sau phân công, di chuyển Tree/Device/Standard, details lựa chọn chưa cung cấp.
- IoT: command_id, timeout và ACK thiếu correlation cần thống nhất firmware.
- Database: cardinality/nullability/unique/deletion rules còn cần chốt, không suy từ store demo thành schema mới.

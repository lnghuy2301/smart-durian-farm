# Tiêu chuẩn canh tác — bàn giao module

Nhánh `feat/farming-standards` kế thừa `feat/agricultural-materials`. Đã đọc ERD XML/JSON: FARMING_STANDARDS có id UUID, code varchar(40), name varchar(100), description text, certifying_body varchar(120), status Active/Inactive. Không tự thêm field/bảng hoặc gắn tiêu chuẩn ở cấp Farm; tiêu chuẩn sẽ gắn Zone ở module Zone sau.

Phạm vi của nhánh này: danh mục tiêu chuẩn bộ nhớ, Admin tạo/sửa/Inactive, mọi user Active đọc. Bridge STANDARD_MATERIALS và Farm đã được triển khai ở các nhánh kế tiếp. Đọc MODULE_HANDOFF.md để lấy nhánh tích hợp mới nhất; hiện là feat/farm-approval-workflow, đạt 44/44 tests. Kết quả kiểm thử bên dưới là của riêng đợt Standards.

## API

| API | Quyền | Body/query |
|---|---|---|
| POST /api/standards | Admin Active | code, name, description, certifying_body, status tùy chọn |
| GET /api/standards | User Active | limit/offset, q tìm code hoặc tên, status tùy chọn |
| GET /api/standards/:id | User Active | UUID tiêu chuẩn |
| PATCH /api/standards/:id | Admin Active | Ít nhất một field cần sửa |

Trim text, các giới hạn varchar đúng ERD. description có thể rỗng nhưng không null; API giới hạn 10000 ký tự để giữ request/store test hữu hạn, không đổi TEXT ở ERD. status mặc định Active khi tạo; PATCH field bỏ qua giữ nguyên. Không thêm UNIQUE code/name khi ERD chưa khai báo; liên kết dùng UUID, không đoán identity bằng tên/code. Quy tắc UNIQUE cho database phải chốt khi migrations.

Không hard-delete; PATCH status=Inactive giữ identity và liên kết về sau. Store tối đa 1000 records/process, restart xóa. Query dùng catalog/catalog.dto.ts chung với Materials: limit mặc định 20, tối đa 100; offset mặc định 0, q tối đa 100; không filter thì gồm Inactive. Response {items,total,limit,offset}. UUID sai/DTO sai/field thừa/null: 400; không tồn tại: 404; chưa login: 401; không Admin khi ghi: 403. Không thêm created_at ngoài ERD.

## Code, Postman và tái lập

standards.dto.ts kiểm tra field, service Map trong bộ nhớ và trả bản sao, controller AuthGuard + AdminGuard cho ghi; module export StandardsService để bridge dùng sau. Auth dynamic module cùng instance với USERS/Materials. Không dependency mới, không schema/migration hoặc dữ liệu canh tác thực.

Root: npm ci nếu máy mới; giữ .env hiện có, AUTH_MODE=mock/NODE_ENV=development và Admin fixture cấu hình để ghi. DATABASE_URL/MONGODB_URI cần config nhưng không cần Docker cho danh mục. npm run dev:api. Không bắt buộc SMTP/SMS thật; test danh mục không gửi OTP.

Import docs/postman/Standards-Local-Test.postman_collection.json. 01 Login Admin → copy JWT vào Headers Authorization: Bearer <token> ở 02..06. 02 Create → copy id vào URL 04..06. 03 List → 04 Details → 05 Update → 06 Inactive. Nhập Body raw JSON, không Scripts/Environment; ví dụ là dữ liệu demo, không tự tạo tiêu chuẩn thật. Farmer/Manager dùng JWT của mình chỉ đọc.

## Kiểm tra và session sau

Lint/typecheck/build đạt; npm test **34/34**, thêm 2 test Standards trên 32 test trước. Bao phủ phân quyền, status/PATCH giữ field, ERD lengths/enums, TEXT limit, null/field thừa, filter/search code+tên/pagination, UUID không tồn tại, không lộ reference store. Tests không đọc .env/gửi SMS/email/ghi DB.

Đọc MODULE_HANDOFF.md/IMPLEMENTATION_NOTES.md trước session sau. Nhánh bridge kế tiếp dựa trên nhánh này và dùng cùng store; không tạo bản copy Materials/Standards. Gắn tiêu chuẩn với Zone và xử lý lịch sử khi đổi tiêu chuẩn làm ở module Zone/Cultivation sau khi xác nhận nghiệp vụ. Chưa tạo bảng trước khi USERS hoàn tất.

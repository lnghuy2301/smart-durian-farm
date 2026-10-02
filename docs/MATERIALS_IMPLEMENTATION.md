# Vật tư nông nghiệp — bàn giao module

Nhánh `feat/agricultural-materials` kế thừa `feat/users-registration-approval` chưa merge. Đã fetch: origin/main hiện ở 7594c9d, mới có Auth ban đầu; không bỏ code USERS/Twilio khi tạo nhánh. Không tự merge. ERD XML/JSON đã đọc và khớp field AGRICULTURAL_MATERIALS.

Phạm vi: danh mục vật tư trong bộ nhớ, Admin tạo/sửa/ngừng dùng, mọi user Active đọc; không kho/tồn hàng, không tự đưa ra liều dùng hoặc dữ liệu canh tác thật. Chưa tạo bảng hoặc sửa ERD. Mỗi module tiếp theo có nhánh riêng kế thừa module trước.

## API và validation

| API | Quyền | Dữ liệu |
|---|---|---|
| POST /api/materials | Admin Active | name, material_type, default_dosage, unit, quarantine_days, status tùy chọn |
| GET /api/materials | User Active | limit/offset, q tìm tên, status/material_type tùy chọn |
| GET /api/materials/:id | User Active | UUID vật tư |
| PATCH /api/materials/:id | Admin Active | Ít nhất một field cần sửa |

Giữ đúng ERD: name tối đa 255, default_dosage 100, unit 10; material_type Fertilizer/Pesticide/Biological; quarantine_days số nguyên 0..2147483647; status Active/Inactive, mặc định Active khi tạo. Trim text; từ chối null, chuỗi rỗng, field ngoài DTO, UUID sai. PATCH không làm đổi field bị bỏ qua. Tên vật tư có thể trùng; chưa thêm UNIQUE ngoài ERD.

Không hard-delete; dùng PATCH status=Inactive để giữ identity/liên kết về sau. Tìm kiếm không phân biệt hoa/thường, có dấu; pagination mặc định limit=20/offset=0, limit tối đa 100. Response {items,total,limit,offset}. Không filter status thì đọc cả Inactive. Store tối đa 1000 records/process, restart xóa; không thêm field created_at vào ERD.

## Cấu trúc và tái lập

materials.dto.ts kiểm tra dữ liệu; materials.service.ts lưu trong Map, trả bản sao để caller không sửa store; controller dùng AuthGuard toàn bộ và AdminGuard cho ghi. CatalogListDto được dùng chung cho danh mục sau. AppModule tạo Auth dynamic module một lần và truyền cùng reference sang Users/Materials: Nest 11 nhận diện module theo reference, tạo lại sẽ tách users/session thành nhiều store. Có test tài khoản đăng ký mới đọc được Materials.

Tại root: npm ci nếu máy mới; dùng .env.example nhưng không ghi đè .env có sẵn, AUTH_MODE=mock và AUTH_TEST_ADMIN_PHONE/PASSWORD để có Admin. Không cần bật SMTP/Twilio hoặc Docker để test danh mục; DATABASE_URL/MONGODB_URI vẫn cần cho config. Chạy npm run dev:api. Chưa thêm dependency trong module này.

Import docs/postman/Materials-Local-Test.postman_collection.json, chọn collection Materials - Nhap JSON. 01 login Admin → copy access_token vào Headers Authorization: Bearer <token> ở 02..06. 02 tạo → copy id vào URL 04..06; 03 danh sách → 04 chi tiết → 05 sửa → 06 Inactive. Body raw JSON; không Scripts/Environment, không tự lưu token. Mật khẩu Admin sample khớp cấu hình test, không phải credentials production. Farmer/Manager dùng JWT của mình để đọc, ghi trả 403.

## Kiểm tra và tiếp tục

Lint/typecheck/build đạt, npm test **32/32** (29 hồi quy + 3 Materials). Tests không gửi SMS/email hoặc ghi DB; bao phủ Admin/Manager/Farmer, Pending/Locked, Auth dùng chung, ERD length/enums/int, null/field thừa/PATCH rỗng, search/pagination/bản sao. Quy tắc về vật tư Inactive khi ghi nhật ký sẽ chốt trước module Cultivation, chưa suy luận từ danh mục này.

Session sau: đọc MODULE_HANDOFF.md và IMPLEMENTATION_NOTES.md, kiểm tra branch/status, giữ ERD/MQTT của người dùng ngoài commit. Tiêu chuẩn canh tác và bridge STANDARD_MATERIALS là các module kế tiếp, mỗi module nhánh riêng; chỉ bàn bảng/migration sau khi USERS hoàn tất.

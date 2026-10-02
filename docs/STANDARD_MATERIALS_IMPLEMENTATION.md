# Liên kết tiêu chuẩn–vật tư — bàn giao module

Nhánh `feat/standard-materials` kế thừa `feat/farming-standards`. Đã đọc STANDARD_MATERIALS trong cả ERD XML/JSON: chỉ standard_id UUID và material_id UUID, bridge N:N. Không thêm id, liều lượng, ngày hoặc status vào bảng bridge.

Phạm vi: cấu hình danh mục trong bộ nhớ. Admin thêm/bỏ liên kết; user Active xem vật tư của một tiêu chuẩn. Chỉ dùng identity tồn tại; mỗi cặp một liên kết. Không quyết định quyền ghi canh tác hay liều thực tế từ bridge này.

## API và quy tắc

| API | Quyền | Body/kết quả |
|---|---|---|
| POST /api/standards/:standard_id/materials | Admin Active | {material_id: UUID}, 201 trả đúng hai field bridge |
| GET /api/standards/:standard_id/materials | User Active | {standard_id,items,total,limit,offset}; items là vật tư hiện tại |
| DELETE /api/standards/:standard_id/materials/:material_id | Admin Active | 204, không body |

UUID v4 ở path/body; cả tiêu chuẩn và vật tư phải tồn tại. Cùng cặp gắn lại trả 409; đồng thời hai request một cặp chỉ một request thành công. N:N: một vật tư có thể thuộc nhiều tiêu chuẩn. Sai UUID/field thừa: 400; thiếu JWT: 401; không Admin khi ghi: 403; identity/link không có: 404. DELETE chỉ bỏ bridge, không xóa tiêu chuẩn/vật tư; không sửa lịch sử canh tác.

GET dùng MaterialListDto: q tìm tên vật tư, material_type, status **của vật tư**, limit mặc định 20/tối đa 100 và offset mặc định 0. Không filter thì bao gồm Inactive. Tiêu chuẩn/vật tư đổi Inactive không tự xóa bridge. Admin được cấu hình bridge khi danh mục Inactive; đây là lưu cấu hình, không khẳng định vật tư đó được phép ghi canh tác hiện tại. Quy tắc dùng vật tư/tiêu chuẩn Inactive phải hỏi trước module Cultivation/Zone.

Store Map<standard_id,Set<material_id>>, tối đa 10000 cặp/process để giữ bộ nhớ hữu hạn. Không persistence/seed; restart xóa cả catalogs/bridge. Ghi đồng bộ, không có await giữa check duplicate và thêm. Service list join dữ liệu hiện tại; sửa tên/status vật tư được phản ánh ngay, không lưu bản copy catalog trong bridge.

## Code và cách tái lập

standard-materials module imports **cùng reference** Auth/Materials/Standards dynamic modules đã tạo ở AppModule; không tạo store mới. Catalog services export cho bridge; MaterialsService.list nhận scope ReadonlySet nội bộ, controller không nhận scope từ client. Có test tạo catalog qua HTTP rồi gắn/query bridge để phát hiện lỗi duplicate provider/store. Controllers AuthGuard + AdminGuard khi ghi; DTO chỉ nhận material_id.

Root: npm ci nếu máy mới, không ghi đè .env có sẵn; AUTH_MODE=mock, NODE_ENV=development, AUTH_TEST_ADMIN_PHONE/PASSWORD đầy đủ. DATABASE_URL/MONGODB_URI cần config nhưng không cần Docker/SMTP/SMS để test danh mục. npm run dev:api. Không thêm dependency mới.

Import docs/postman/Standard-Materials-Local-Test.postman_collection.json. 01 login Admin, copy JWT vào Authorization 02..06. 02 tạo tiêu chuẩn → copy id thay UUID 111...; 03 tạo vật tư → copy id thay UUID 222...; 04 gắn → 05 xem → 06 bỏ gắn. URL/Body raw JSON literal, không Scripts/Environment. Không restart API giữa các bước; id cũ không còn sau restart. Có thể dùng các catalog đã tạo trong hai collection trước thay 02/03.

## Kiểm tra và bàn giao

Lint/typecheck/build đạt; npm test **36/36**, thêm 2 bridge tests trên 34 trước. Bao phủ Admin/Active-reader, FK/UUID/field thừa, concurrent duplicate, N:N/cách ly danh sách theo tiêu chuẩn, status/filter dữ liệu mới nhất, bỏ bridge không xóa catalog. Các tests không đọc .env, gửi email/SMS hoặc ghi database. File Twilio giữ nguyên 4 request.

Session sau đọc MODULE_HANDOFF.md/IMPLEMENTATION_NOTES.md, ERD và tài liệu module. Checkout nhánh cuối để có đầy đủ bộ nhớ dùng chung; mỗi module kế tiếp nhánh riêng, không tự merge các dependency. Người dùng yêu cầu dừng trước phần khó: **chưa code Farms/Cooperatives CRUD mới**, cần chốt quyền tạo/sửa Farm, Farm có bắt buộc thuộc HTX và quy trình gắn/rời HTX, số HTX mỗi Manager. Những module Zone/Assignments/Tree phải dùng scope đã chốt. Chưa tạo bảng trước khi USERS hoàn tất.

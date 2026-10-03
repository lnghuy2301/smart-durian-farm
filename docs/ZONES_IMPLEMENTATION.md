# ZONES — quản lý khu trồng

Nhánh `feat/zones-management`, kế thừa `feat/farm-approval-workflow`. Đối chiếu ERD XML/JSON: `id`, `farm_id`, `standard_id`, `zone_name`, `area_size`, `longitude`, `latitude`. Không sửa ERD, không tạo bảng. Store và đề xuất đều trong bộ nhớ; restart xóa dữ liệu. Đọc MODULE_HANDOFF.md đầu session.

## Nghiệp vụ

Chủ Farmer Active tạo/sửa trực tiếp Zone trong Farm đã được duyệt của mình. Admin chỉ gửi đề xuất tạo/sửa; đúng chủ Farmer chấp nhận hoặc từ chối. Manager chỉ đọc Zone trong Farm hiện thuộc HTX của mình. Farmer khác chưa được phân công không đọc/ghi. Tên Zone không tự thêm UNIQUE; chưa có xóa Zone hoặc chuyển Farm. Phân công nằm ở module USERS_ZONES riêng.

Diện tích Zone dương, decimal(7,3), tổng diện tích các Zone không vượt Farm. `FarmAreaBudget` dùng số nguyên theo đơn vị 0.001 để tính chính xác và được chia sẻ giữa FarmsService/ZonesService. Duyệt giảm diện tích Farm cũng kiểm tra bất biến này; đề xuất giảm chưa duyệt không hạn chế Zone ngay nhưng phải kiểm tra lại lúc commit.

Tiêu chuẩn phải tồn tại và Active khi tạo Zone hoặc đổi standard_id. Khi tiêu chuẩn cũ chuyển Inactive, liên kết vẫn giữ để bảo toàn lịch sử; có thể sửa thông tin khác của Zone. Đề xuất Admin phải kiểm tra lại tiêu chuẩn/diện tích lúc chấp nhận. Quyền dùng vật tư trong nhật ký sẽ làm ở module Cultivation, không suy chỉ từ liên kết tiêu chuẩn.

Một Zone có tối đa một đề xuất sửa Pending. Chủ Farmer vẫn được sửa trực tiếp trong lúc chờ; phiên bản đổi sẽ khiến đề xuất cũ trả 409 khi duyệt, cần từ chối và lập lại. Pending không giữ chỗ diện tích; nhiều đề xuất tạo được kiểm tra lại ở bước cuối. Chỉ lưu quyết định Accepted sau khi ghi Zone thành công; lỗi giữ dữ liệu và đề xuất nguyên trạng. Chưa có hủy đề xuất bởi Admin.

## API

Tất cả cần JWT Active. Admin ghi trực tiếp bị 403; chủ Farmer gửi endpoint đề xuất dành cho Admin bị 403. Đọc ngoài phạm vi trả 404, lỗi dữ liệu 400, FK không có 404, xung đột nghiệp vụ 409.

| Method / endpoint | Body / công dụng |
|---|---|
| GET `/api/zones` | Theo quyền, optional farm_id UUID, q tên Zone, limit 1–100, offset |
| GET `/api/zones/:id` | Chi tiết Zone theo quyền |
| POST `/api/zones` | Chủ Farmer: JSON tạo bên dưới; 201 Zone chính thức |
| PATCH `/api/zones/:id` | Chủ Farmer: ít nhất một field thay đổi; 200 Zone |
| POST `/api/zones/requests` | Admin: JSON tạo; 201 đề xuất Pending |
| POST `/api/zones/:id/update-requests` | Admin: các field muốn sửa; 201 Pending |
| GET `/api/zone-requests` | Admin/chủ: pagination, optional status=Pending/Accepted/Rejected |
| GET `/api/zone-requests/:id` | Chi tiết và snapshot trước sửa |
| PATCH `/api/zone-requests/:id/approve` | Chủ Farmer: `{}`; 200 Accepted, zone_id chính thức |
| PATCH `/api/zone-requests/:id/reject` | Chủ Farmer: `{}` hoặc reason tối đa 500 ký tự |

```json
{
  "farm_id": "22222222-2222-4222-8222-222222222222",
  "standard_id": "33333333-3333-4333-8333-333333333333",
  "zone_name": "Khu A",
  "area_size": 0.3,
  "longitude": 106.1234567,
  "latitude": 10.7654321
}
```

Thay UUID bằng response thật. PATCH không nhận farm_id/id/status. zone_name trim, 1–255 ký tự; area_size 0.001–9999.999, tối đa 3 số lẻ; longitude ±180 và latitude ±90, tối đa 7 số lẻ. Null, chuỗi số thay number, field lạ bị từ chối. Danh sách trả `{items,total,limit,offset}`; q tối đa 100 ký tự.

## Test Postman và tái lập

Giữ .env hiện có. AUTH_MODE=mock, NODE_ENV=development, cấu hình Admin/Farmer như trước; không có biến môi trường mới, không cần SMTP/SMS/Docker để test Zones. `npm run dev:api`, Swagger `/api/docs`.

Import `docs/postman/Zones-Local-Test.postman_collection.json`. Không Environment/Scripts. 01/02 login Farmer/Admin, copy access_token. Chuẩn bị Farm đã Accepted bằng Farms collection, tiêu chuẩn Active bằng Standards collection. Copy farm_id/standard_id vào JSON 03.

04/05 đọc Zone, 06 sửa trực tiếp bằng JWT chủ. 07 Admin đề xuất tạo; 08 xem Pending bằng JWT chủ; 09 chủ duyệt, thay UUID URL bằng id đề xuất và lấy zone_id. 10 Admin đề xuất sửa, 09 hoặc 11 chủ quyết định. 12 login Manager đã duyệt HTX, 13 đọc Zone thuộc HTX; Farm phải gia nhập hoàn tất, nếu độc lập/HTX khác thì danh sách rỗng. Authorization dùng đúng Key `Authorization`, Value `Bearer <access_token>`; placeholder phải thay. Không paste token vào Key.

Code chính: src/zones/{dto,types,service,controller,module}; chính sách diện tích src/farms/farm-area-budget.ts. AppModule truyền cùng tham chiếu farmsModule/standardsModule, không tạo store thứ hai. Tối đa 1000 Zone, 2000 đề xuất kể cả lịch sử, đầy trả 429. Mọi response là bản sao; validate/commit đồng bộ cho demo một process. Persistence cần transaction và nơi lưu request/version theo ERD được duyệt trước.

Kiểm thử tập trung quyền, HTTP/DTO, duyệt đồng thời, đề xuất lỗi thời, tiêu chuẩn Inactive, diện tích chính xác và Farm shrink. Kết quả kiểm tra cập nhật trong MODULE_HANDOFF.md. Các checks không đọc .env thật, không gửi mail/SMS hay ghi DB.

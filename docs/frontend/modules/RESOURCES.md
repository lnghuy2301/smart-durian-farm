# Các trang dữ liệu đọc

Branch `feat/web-resources` kế thừa xác thực. Không thêm API hay mutation các tài nguyên trong module này. Các trang phụ áp dụng sidebar, panel, table và spacing của mẫu Farmer/Admin.

| Trang | GET list/detail | q | Bộ lọc thực |
|---|---|---|---|
| Vật tư | materials, materials/:id | name | material_type, status |
| Tiêu chuẩn | standards, standards/:id | code/name | status |
| Vườn | farms, farms/:id | address/certificate_number | Không |
| Khu vực | zones, zones/:id | zone_name | farm_id qua liên kết |
| Cây | trees, trees/:id | variety/tree_code | status, zone_id qua liên kết |
| Thu hoạch | tree-harvests, tree-harvests/:id | season_name/batch_code | status, zone_id/tree_id qua liên kết |

List gửi limit=20, offset phân trang server, q tối đa 100 ký tự; search submit mới gọi API. Đổi lọc/search reset offset. URL giữ search/lọc/phân trang để reload và deep link tái lập. Chỉ gửi bộ lọc hợp lệ theo DTO; bỏ offset sai hoặc vượt 100000. Response total là server total trong phạm vi quyền, không đếm items trên trang. Tất cả có loading, empty, lỗi + retry thủ công. Đổi key request xóa dữ liệu trang cũ ngay; abort khi rời trang.

Tiêu chuẩn có list vật tư liên kết GET `standards/:id/materials`; query UI con có prefix linked_ nhưng request vẫn dùng q/material_type/status/limit/offset. Chi tiết vật tư liên kết mở `materials/:id`. Hồ sơ cây có GET `trees/:id/history` phân trang, action/version/changed_at/after; không gọi đó là nhật ký canh tác. Thu hoạch chỉ đọc, không có fake blockchain hash hay nút AI.

Backend không có farm_name: tên hiển thị là số chứng nhận kèm địa chỉ. Không đoán đơn vị area_size (DTO chưa xác nhận đơn vị). Ngày thu hoạch YYYY-MM-DD hiển thị nguyên ngày lịch; các timestamp khác theo Asia/Ho_Chi_Minh. UUID chỉ làm khóa/route, không nhập UUID thủ công trong các filter thông thường. Mã tree_code chứa UUID là mã cây chính thức, hiển thị đầy đủ và ngắt dòng.

Quyền: Admin đọc tất cả; Manager theo HTX; Farmer farm theo sở hữu, zone/tree theo sở hữu hoặc assignment Accepted đang hiệu lực. Farmer được phân công có thể xem zone nhưng không có quyền farm cha: liên kết ghi rõ cần quyền vườn, lỗi 404/403 do server quyết định. Không mở rộng scope bằng parent lookup. Menu không khẳng định mọi tài khoản đều có dữ liệu.

Kiểm tra: lint/typecheck/build; kiểm thử browser list/detail/search/empty/pagination bằng Nest thật được tổng hợp trong WEB_FOUNDATION_IMPLEMENTATION.md.

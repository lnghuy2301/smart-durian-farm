# Dashboard Farmer và Admin

Branch `feat/web-dashboards` kế thừa duyệt Manager. Hai layout lấy bố cục/sidebar/topbar/stat/table/panel từ interface_farmer và interface_admin, dùng brand kit toàn dự án. Không sao chép demo scripts, ảnh ngoài, đổi role giả lập, hardcoded số đo, tỉ lệ tăng trưởng hoặc biểu đồ fake.

Farmer: GET zones limit=1 lấy total, GET trees limit=1 lấy total, GET tree-harvests status=Confirmed limit=1 lấy số hồ sơ xác nhận, GET tree-harvests limit=5 preview hồ sơ. Không gọi thu hoạch là nhật ký canh tác; không ghi "mới nhất" vì API list không cam kết thứ tự mới nhất. Link chi tiết, standards, trees, IoT đều mở trang thật. Counts thuộc quyền user, không suy ra sở hữu tất cả zone. Không hiển thị lịch canh tác/AI/blockchain chưa có API.

Admin: GET cooperatives limit=6 (total và preview), farms limit=1, zones limit=1, users/pending-managers toàn bộ. Bốn stat là HTX, vườn được duyệt, khu vực và Manager Pending. Thay số tài khoản Active trong mẫu bằng khu vực vì không có endpoint đếm/đọc toàn bộ users. Pending preview tối đa 5 ghi rõ, mở trang duyệt; preview HTX hiển thị số lượng/total và link danh sách, không áp dụng pagination giả. Gắn Manager căn cứ manager_id, không đồng nhất người đại diện với Manager.

Reload thủ công cả overview, loading/error thay dữ liệu cũ, không tự mutation hoặc mở rộng quyền. Không có tổng canh tác toàn hệ thống. IoT môi trường được tích hợp ở branch giám sát riêng sau khi foundation kiểm tra xong.

Manager: chỉ hiện thông báo chờ mẫu riêng và menu dữ liệu đã có. Theo trả lời người dùng, không xây dashboard Manager từ bản sao Admin. Auth/role và scope dữ liệu Manager vẫn dùng API thật; không có nút duyệt hay editor HTX Admin.

Lint/typecheck/build chạy ở module; screenshots desktop/mobile và browser coverage được ghi trong tài liệu tổng.

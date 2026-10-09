# Dashboard Manager theo mẫu riêng

Branch `feat/web-manager-dashboard`, kế thừa `feat/web-iot-monitoring` 177369f. Người dùng thay bản trùng Admin bằng HTML/ảnh mới tại interface_manager và chốt sử dụng ngày 2026-10-08. Đây là dashboard Manager đọc dữ liệu HTX; không thay đổi backend hoặc quyền mutation.

## Mapping mẫu và dữ liệu

| Mục mẫu | Triển khai thực |
|---|---|
| Hợp tác xã trực thuộc | GET cooperatives theo role Manager, tên/chứng nhận thật, link detail |
| Bộ lọc trang trại | Các Farm được backend cho đọc; label certificate_number + address vì không có farm_name |
| Thống kê 4 ô | Số Farm/Zone/Tree và Zone không có assignment.active=true tại mốc tải |
| Bảng Farm, số khu/cây/chưa phân công | Join farms→zones→trees bằng UUID nội bộ; client search chứng nhận/địa chỉ và page10 trên danh sách đã tải đủ |
| Khu cần phân công | Zone chưa có assignment đang hiệu lực, page5, tên/mã Farm + số cây, nút xem Zone |
| Nút Phân công | Không render: Manager chưa có quyền tạo/duyệt assignment. Chủ vườn/Admin theo quy trình hiện có; không thêm endpoint/nhập UUID Farmer giả |
| Thành viên/chủ vườn tên | Không có directory endpoint; bỏ cột tên và menu thành viên, không lấy ID/email giả |
| IoT tổng online/offline | Tổng số trạm trong bộ lọc từ danh sách đủ; presence cho trang20 từ API MQTT, đếm trạng thái **trang này**, không gọi đó là tổng toàn HTX |
| Thu hoạch hôm nay/7/30/vụ | Chỉ hồ sơ Confirmed, harvest_date theo lịch Việt Nam; hôm nay/7/30 hoặc tất cả thời gian; không giả khái niệm vụ hiện tại |
| Nhật ký canh tác/lock/hash/QR | Chưa có API; bỏ panel/action fake, không gọi Harvest là Cultivation |

Palette theo kit Smart Durian. Dùng chung sidebar/topbar thay vì nhân bản navigation; các stat/table/filter/IoT/thu hoạch giữ hierarchy của mẫu Manager. Không có Demo State Switcher, danh tính sample, Gateway LoRaWAN hay cột điện thoại chủ vườn không được API cung cấp.

## Tổng hợp đúng phạm vi và phân trang

GET cooperatives limit100; GET farms/zones/trees/zone-assignments/devices/tree-harvests limit100 và lặp offset để lấy đủ total. `collectPages` kiểm tra total không đổi, offset/limit hợp lệ, không trùng identity, không thiếu trang. Dữ liệu thay đổi trong lúc phân trang thì fail và yêu cầu reload, không đếm trang đầu thành tổng. Giới hạn offset theo backend100000. Abort signal xuyên suốt từng trang; logout/rời dashboard hủy request đang chạy và chặn các request tiếp theo của client bị dispose.

Parent join và filter dựa trên các danh sách đã được server scope. Tree theo zone, device theo zone, harvest theo tree; Manager không gọi /users hay endpoint Admin. AssignmentHistory dùng flag `active` do server trả, không suy từ có bản ghi hoặc tạo pending invitation. Counts chỉ là snapshot tại checkedAt: sau khi assignment hết hạn hoặc Farm chuyển HTX, cần reload để lấy scope/mốc mới. Presence riêng poll15s; các totals snapshot không tự nhận là realtime.

Các resource API chưa có transaction snapshot/version chung: kiểm tra pagination không bảo đảm một snapshot nguyên tử giữa nhiều loại tài nguyên khi người khác chỉnh sửa đồng thời. Dashboard ghi mốc tải và có reload; quyền từng request luôn do backend kiểm tra. Backend business capacity hiện nhỏ; collect đủ danh sách phục vụ thống kê phía client. Nếu persistence/scale lớn, nên bổ sung aggregate endpoint sau khi thiết kế backend được duyệt, không tự thêm trong đợt này.

Farm filter áp dụng farm→zone→tree/device/harvest và unassigned list. Khoảng thời gian chỉ áp dụng thu hoạch. Ngày tính Asia/Ho_Chi_Minh, 7 ngày gồm hôm nay và 6 ngày trước; 30 ngày gồm hôm nay và29 ngày trước. So sánh YYYY-MM-DD, không lấy created_at thay ngày cắt. Chỉ Confirmed cộng fruit_count/total_weight_kg. Số hồ sơ không phải số batch/lô: nhiều cây có thể cùng batch_code. Detail/link mở đúng hồ sơ.

## IoT có giới hạn request

Trong mỗi trang20 trạm, GET mqtt/devices/:id/status tối đa4 request song song một nhóm; không bắn hàng nghìn presence request để lấy số online toàn HTX. Counts trang này ghi rõ trong UI; kết nối Unknown có ô riêng, không gộp Offline hoặc Active metadata. Last_seen và connectivity lấy server. Poll dùng hook chống chồng cycle/visibility/unmount/response trễ như module IoT. Phân trang khác xóa cache trang trước. Endpoint thiếu/quyền đổi/lỗi mạng khiến panel hiện error/retry, không giữ list cũ như đang live.

## Kiểm chứng

Unit kiểm tra collector vượt trang đầu23 records, total thay đổi/trang thiếu và thống kê chỉ Farm/Confirmed đúng ngày Việt Nam (UTC18:00 đã là ngày hôm sau tại VN). Browser tạo hai Farm vào cùng HTX qua owner request→Admin approve→Manager approve; Farmer accept assignment một Zone; owner tạo/submit2 harvest auto-confirm. Manager nhìn đúng2 farms/2zones/2trees/1unassigned, sản lượng90kg; lọc một Farm còn30kg. Farm ngoài HTX bị404, dashboard không lộ record. Có desktop1440/mobile390, check overflow, network error xóa totals và retry. Bộ kiểm tra cuối đạt **22 browser scenarios + 8 unit tests**, lint/typecheck/build/format check. Backend147 regression tests đã đạt trước module này; backend không đổi nên không cần chạy lại chỉ vì thêm UI Manager.

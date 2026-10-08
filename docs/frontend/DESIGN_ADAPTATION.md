# Đối chiếu thiết kế Stitch với backend — 2026-10-08

## Nguồn và quyết định triển khai

HTML/ảnh do người dùng cung cấp tại `references/stitch_smart_durian_farmer_dashboard/`; manifest giải thích bản trùng đã bỏ. Logo, màu, pattern theo assets/brand; font Be Vietnam Pro tự phục vụ từ package Fontsource. Không dùng Tailwind CDN, Google Fonts, ảnh/avatar bên ngoài hoặc script điều khiển demo của HTML trong app.

Giữ sidebar desktop, topbar có tài khoản, bố cục thẻ thống kê, bảng bo góc, form và dialog của mẫu; chuyển thành React components và responsive navigation. Màu mẫu #003629/#1b4d3e và nền xanh nhạt được thay bằng brand #166534/action #15803D/background #F8FAFC đã được chọn trước đó. Không khẳng định đạt WCAG AAA chỉ từ DESIGN.md; kiểm keyboard, focus, overflow và kích thước chạm trong browser.

**Manager:** người dùng chọn **chờ mẫu riêng** khi được hỏi ngày 2026-10-08. Không dựng dashboard Manager từ bản Admin trùng. Auth vẫn hỗ trợ tài khoản Manager; các trang dữ liệu chung chỉ dùng quyền backend hiện tại. Dashboard Manager giữ thông báo chờ thiết kế, không số liệu Admin hoặc tác vụ duyệt/tạo HTX Admin.

## Bảng khác biệt và cách xử lý

| Trong mẫu | Thực tế backend | Điều chỉnh frontend |
| --- | --- | --- |
| Role Nông dân/Chủ trang trại/Manager | Farmer/Manager/Admin; chủ là Farmer sở hữu Farm cụ thể | Đăng ký Farmer hoặc Manager; không role Owner/is_owner do client tự đặt. |
| Farmer chọn trang trại/khu tham gia khi register | Register không nhận farm_id/zone_id; assignment phải owner/Admin đề xuất và Farmer accept | Không dropdown giả hoặc tự gắn assignment. |
| Chủ đăng ký kèm farm_name/address | Farm có workflow Create request cần duyệt đối ứng, không farm_name | Đăng ký Farmer trước; hướng dẫn tạo Farm qua luồng hiện có, không nhét field Farm vào register. |
| Manager đăng ký theo ba bước | Request email → verify OTP → proof → register Pending | Cùng flow thực; không OTP điện thoại, không auto-send khi mở trang, không kích hoạt trước Admin. |
| Đăng nhập Pending và Reject có hai thông báo riêng | Backend login403 trả thông báo chung, không endpoint public tra trạng thái tài khoản | Hiển thị thông báo chung từ backend, không đoán Pending hay Reject từ phone. |
| Ghi nhớ đăng nhập dài hạn | JWT15 phút, chưa refresh/logout server | Lưu token trong sessionStorage cho cùng tab; bỏ promise đăng nhập dài hạn, hết hạn login lại. |
| Admin duyệt có lý do/email thông báo | Reject body `{}`; approve không gửi email xác nhận | Dialog xác nhận quyết định, không textarea reason hoặc claim gửi email. |
| Tên/email/phone Manager trên chi tiết HTX | API HTX trả manager_id, không directory Manager Active | Hiện đã/chưa gắn Manager; không coi director là tên tài khoản Manager. |
| HTX search tên/đại diện/chứng nhận | GET cooperatives q tìm cooperative_name/certificate_number/address | Placeholder đúng contract, pagination phía server. |
| Số Farms/Zones/Trees trong mỗi HTX | HTX response không chứa các tổng | Không thêm field giả; dashboard có tổng theo API list đúng scope, không thống kê HTX từ page20 đầu tiên. |
| Tổng tài khoản Active142 | Chưa API danh bạ/count tài khoản | Bỏ thẻ này; Admin có count Pending từ endpoint trả toàn bộ danh sách Pending. |
| Realtime Live / Gateway100% | REST snapshot và MQTT connectivity có contract riêng | Hiện mốc cập nhật và nút làm mới; không suy trạng thái kết nối từ login hoặc Device.status. |
| Nhiệt độ đất/độ sâu/pin/sim | Sensor types chỉ air_temperature/air_humidity/soil_moisture; reading raw | Render stream thực có metadata, không tự thêm sensor/depth/battery hay quy đổi unit. |
| Stale sau2 chu kỳ / thời gian đo hardware | Ngưỡng presence server; measured_at là backend arrival | Connectivity theo MQTT API; hiện timestamp/received_at, không tự tạo rule stale mới. |
| Nhật ký Cultivation/lock/hash/AI/QR/control | Chưa module hoặc API đã xác nhận | Bỏ nav/tác vụ giả; chỉ ghi phạm vi chưa triển khai trong docs, không hiện log mẫu. |
| Nhật ký gần đây | Harvest đã có, Cultivation chưa có | Dùng khu vực dữ liệu hiện có, ghi rõ là thu hoạch nếu hiện Harvest; không đổi tên thành nhật ký canh tác. |
| Hotline19006868/Ecosystemv2.4/chuẩn chứng nhận | Không có contract/cấu hình xác nhận | Không đưa vào UI vận hành. |

## Phạm vi các module và thứ tự nhánh

Mỗi nhánh mới kế thừa commit module trước để giữ backend và frontend dependencies; không merge/push. Chuỗi dự kiến: chuẩn bị → platform → auth → danh sách/chi tiết resources → HTX Admin → duyệt Manager Admin → dashboard Farmer/Admin → IoT chỉ đọc. Danh mục/Farm/Zone/Tree và thu hoạch ở phạm vi đọc; workflows ghi Farm/Zone/Tree/Harvest sẽ là module riêng có form/mẫu và nghiệm thu riêng. Không tự mở API chọn Farmer hoặc làm toàn bộ139 operations.

Sau mỗi module kiểm lint/typecheck/build/unit phù hợp; sau chuỗi tích hợp kiểm browser desktop/mobile và luồng liên vai trò qua backend thật trong môi trường test với fake mail/SMS. Test fake delivery không chứng minh email/SMS thật hoặc hardware thật; kiểm demo local thực dùng API hiện hành và credentials của người dùng, không in/commit secrets.

## Căn cứ contract

- Auth/USERS: auth.controller/service/dto, users.service/dto/registration.controller, EmailVerificationService, users/auth tests và Postman Users/Auth.
- Catalog: materials/standards/catalog dto và service; StandardMaterialsService trả vật tư join hiện tại, không snapshot mock.
- Farm/Zone/Tree: controller/dto/types/service cùng assignment scope; Farms/Zone/Trees tests. Farmer nhận việc có thể đọc Zone/Tree mà không đọc toàn Farm.
- HTX: CooperativesService.list/get/update, MockCooperativeStore; lifecycle chỉ ở detail; Admin notifications riêng. Không có manual DELETE endpoint.
- IoT: Device/Sensor metadata types; MQTT deviceStatus và TelemetryService.latest/history/page; latest/history paginate và quyền hiện tại ở server; RAM FIFO10.000 readings toàn backend.

Các guide cũ chứa lịch sử nhánh. API source/tests mới nhất là căn cứ triển khai; không thay business logic backend để giống dữ liệu demo trong HTML.

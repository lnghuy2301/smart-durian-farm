# Thiết kế luồng duyệt Farm — đã chốt và triển khai

## Trạng thái bàn giao

Ngày 2026-10-02, nhánh `feat/farm-approval-workflow` được tạo từ `feat/standard-materials` (113da8f). Nhánh này kế thừa chuỗi Auth/Twilio/USERS/catalogs chưa có đầy đủ trên main. Người dùng đã chốt hai câu hỏi và đồng ý store yêu cầu riêng trong bộ nhớ. Luồng Farm được triển khai theo FARMS_IMPLEMENTATION.md; không thay đổi ERD hoặc tạo database.

Đọc MODULE_HANDOFF.md để tái lập backend và xem kết quả kiểm thử cuối cùng; 36 tests là số của module trước khi thêm Farm.

## Quy tắc đã xác nhận

- Admin tạo/sửa Farm phải được chủ Farmer chấp nhận. Chủ Farmer thêm/sửa Farm phải được Admin chấp nhận.
- Farm có thể chưa thuộc HTX. Gia nhập hoặc rời HTX đều cần duyệt.
- Một Manager quản lý một HTX.
- Người dùng giao quyền chọn bên giám sát đối ứng giữa Admin và Manager. Chọn **Admin** để xử lý thống nhất Farm thuộc HTX và Farm độc lập. Manager chỉ đọc Farm thuộc HTX mình, không tạo/sửa Farm; riêng gia nhập HTX cần Manager chấp thuận bổ sung. Rời chỉ thông báo Manager sau khi duyệt đối ứng hoàn tất.
- Giai đoạn hiện tại tiếp tục dùng bộ nhớ để test; không tạo bảng, migration hoặc seed. Không tự sửa ERD.

## Đối chiếu ERD

FARMS hiện có `id`, `owner_id`, `cooperative_id`, `area_size`, `address`, `certificate_number`, `join_cooperative_date`, `longitude`, `latitude`. COOPERATIVES có `manager_id`; USERS có `is_owner` và trạng thái tài khoản.

FARMS chưa có field trạng thái duyệt, phiên bản thay đổi hoặc bảng yêu cầu duyệt. Không thêm `pending` vào USERS.status để biểu diễn yêu cầu Farm: đây là trạng thái tài khoản, không phải trạng thái của từng đề xuất.

Quy tắc Farm độc lập cho phép `cooperative_id` và `join_cooperative_date` rỗng. Khi chuyển sang PostgreSQL, phải đối chiếu lại nullability với ERD được người dùng xác nhận; không suy từ store demo thành migration.

## Phương án đã chốt

### Dữ liệu chính chỉ thay đổi sau khi chấp nhận

Yêu cầu tạo Farm chưa duyệt chỉ xuất hiện trong danh sách yêu cầu của người đề xuất, chủ Farmer và Admin; chưa xuất hiện trong danh sách Farm chính thức của Manager và chưa tạo Zone/Tree bên dưới.

Yêu cầu sửa Farm lưu phần thay đổi riêng; Farm chính thức vẫn giữ dữ liệu đã được duyệt. Chấp nhận mới áp dụng thay đổi. Từ chối không thay đổi Farm chính thức. Người đề xuất không tự duyệt yêu cầu của mình.

Gia nhập/rời HTX là thao tác riêng, không cho sửa trực tiếp `cooperative_id` hoặc `join_cooperative_date` qua API cập nhật thông tin Farm để tránh bỏ qua bước duyệt. Dùng cùng cơ chế đối ứng: Farmer đề xuất thì Admin duyệt; Admin đề xuất thì chủ Farmer chấp nhận. Gia nhập cần thêm Manager HTX chấp thuận; đủ hai bên mới áp dụng membership. Rời không cần Manager duyệt, chỉ tạo thông báo cho Manager khi hoàn tất.

### Trạng thái phụ trong bộ nhớ

Lưu yêu cầu duyệt trong store bộ nhớ riêng, gồm mã yêu cầu, loại thao tác (tạo/sửa/gia nhập/rời), người đề xuất, chủ Farmer, Farm liên quan, dữ liệu đề xuất, snapshot, các bên cần duyệt, trạng thái chờ/chấp nhận/từ chối và thời điểm xử lý. Đây là metadata demo, không phải field mới của FARMS và không phải bảng đã được phê duyệt. Thông báo rời cũng chỉ lưu bộ nhớ và đọc qua API.

Restart API làm mất cả yêu cầu và dữ liệu demo, như các store hiện có. Trước khi triển khai persistence, cần người dùng chốt ERD cho nơi lưu các yêu cầu và lịch sử duyệt; không âm thầm tạo bảng mới.

Mỗi Farm chỉ có một yêu cầu thay đổi đang chờ. Khi duyệt phải kiểm tra lại tài khoản, quyền sở hữu và HTX; yêu cầu chỉ được xử lý một lần. Kiểm tra và áp dụng đồng bộ trong store demo để tránh hai request cùng duyệt hoặc ghi đè nhau. Khi chuyển sang database cần transaction và kiểm soát phiên bản tương ứng.

### Quyền sở hữu

`owner_id` phải trỏ tới tài khoản Farmer Active. Farmer tạo Farm cho chính mình; Admin tạo thay thì chỉ định chủ Farmer. Một Farmer có thể sở hữu nhiều Farm theo quan hệ FK hiện tại.

USERS.is_owner chuyển thành true khi Farmer có Farm đầu tiên được chấp nhận, không chuyển chỉ vì đã gửi yêu cầu tạo. Rời HTX không làm mất quyền sở hữu Farm. API sửa thông tin thông thường không đổi `owner_id`; chuyển chủ hoặc xóa Farm cần quy trình riêng và chưa thuộc đợt này.

## Trả lời của người dùng

1. "Khi gia nhập thì cần Manager chấp thuận, nhưng khi rời thì chỉ cần thông báo đến Manager thôi." Áp dụng Manager như bên duyệt bổ sung cho gia nhập; rời vẫn duyệt đối ứng và thông báo sau khi hoàn tất.
2. "Tôi đồng ý" với store yêu cầu bộ nhớ riêng, chỉ thay đổi Farm/is_owner sau khi chấp nhận và bàn ERD trước persistence.

## Thứ tự triển khai

1. Dùng chung MockUserStore và MockCooperativeStore với USERS; bổ sung ràng buộc một Manager một HTX và kiểm thử ở điểm tạo/gắn HTX.
2. Triển khai store Farm và yêu cầu duyệt trong bộ nhớ, DTO khớp field ERD và kiểm tra quyền ở backend.
3. Triển khai tạo/sửa Farm qua đề xuất, danh sách yêu cầu, chấp nhận/từ chối; kiểm thử tự duyệt, duyệt lặp và quyền sở hữu.
4. Triển khai gia nhập/rời HTX và phạm vi đọc của Manager; kiểm thử không đọc được Farm độc lập hoặc HTX khác.
5. Tạo collection Postman nhập URL/JSON trực tiếp, không thêm scripts hoặc biến môi trường bắt buộc; hướng dẫn sao chép JWT/UUID và thao tác hai vai trò.
6. Cập nhật tài liệu API, MODULE_HANDOFF.md, IMPLEMENTATION_NOTES.md; chạy lint/typecheck/build và kiểm thử liên quan, commit/push riêng nhánh, không tự merge.

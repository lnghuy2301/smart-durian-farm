# Tree Harvests — thiết kế nghiệp vụ đã chốt

Cập nhật 2026-10-05. Nhánh local `feat/tree-harvests-management`, base Trees `d39c5ce`. Đã triển khai module/API/test Harvests. Đây là quyết định cuối cùng, thay thế các phương án cũ về nhiều bảng, khóa cả batch hoặc quyền sửa 24 giờ. Đọc MODULE_HANDOFF.md và TREE_HARVESTS_IMPLEMENTATION.md để tái lập API/test.

## ERD và giới hạn lưu trữ

Đã đối chiếu XML và JSON hiện tại: TREE_HARVESTS gồm id UUID, tree_id UUID, created_by UUID, season_name varchar(50), harvest_date date, fruit_count int, total_weight_kg decimal(7,2), batch_code varchar(50), status enum Draft/Pending/Confirmed, updated_by UUID, updated_at timestamp, created_at timestamp. Hai file đã dùng đúng Draft, không còn Draff. Không sửa ERD trong bước chuẩn bị này.

Chỉ một bảng TREE_HARVESTS; không thêm bảng batch, bảng yêu cầu hoặc bảng cấp quyền. Chưa tạo bảng/migration/seed hoặc ghi PostgreSQL/MongoDB. Bản ghi nghiệp vụ, version và các yêu cầu/quyền ngoại lệ sẽ nằm trong RAM backend NestJS (Map/mảng), không phải browser localStorage. Restart sẽ mất tất cả; persistence cần thảo luận riêng.

## Các quyết định đã được người dùng chấp nhận

- Chủ Farm được nhập trực tiếp. Farmer khác chỉ được nhập cây trong Zone có phân công Accepted đang hiệu lực [start_date,end_date). Không buộc chủ nhận phân công cho việc nhập Harvests. Tác giả lấy từ JWT, không nhận created_by của client.
- harvest_date là ngày thực tế (date); created_at là thời điểm backend nhập hệ thống (timestamp UTC), không thay khi sửa. Cho nhập bù tối đa 7 ngày theo lịch Việt Nam; ngày tương lai bị từ chối. Quá 7 ngày cần Admin cấp quyền có người nhập, Zone, ngày thu hoạch và hạn sử dụng; quyền ngoại lệ không thay quyền ghi tại Zone.
- batch_code do người dùng nhập. Nhiều cây cùng Zone/cùng ngày dùng chung mã; không dùng lại mã đó ở Zone/ngày khác. Không UNIQUE riêng batch_code trên TREE_HARVESTS.
- Một cây có thể thuộc batch khác nhưng phải khác ngày thu hoạch: chống ghi trùng trên tree_id + harvest_date. Cùng cây/cùng batch thu hoạch thêm thì sửa tổng số trái/khối lượng trên bản ghi chưa xác nhận, không thêm dòng thứ hai. Đợt RAM phải chống ghi trùng đồng thời; chỉ đề xuất constraint DB sau này, chưa migration.
- Draft là bản nháp. Người tạo gửi lên chủ Farm thì Pending. Nếu người tạo cũng là chủ Farm, thao tác gửi chuyển thẳng Confirmed; lưu nháp không tự xác nhận. Chủ từ chối xác nhận lần đầu đưa về Draft.
- Khi xác nhận lần đầu, updated_by/updated_at giữ null. Chỉ khi thay đổi dữ liệu được duyệt mới ghi hai field này. updated_by là người thực hiện sửa, không thay created_by bằng người duyệt.
- Draft được tác giả còn phụ trách hoặc chủ Farm sửa/xóa. Pending khóa sửa/xóa trực tiếp. Bản ghi đã từng Confirmed không được xóa, kể cả status hiện Pending vì yêu cầu sửa.
- Tác giả yêu cầu chỉnh sửa bản ghi Confirmed. Manager của HTX hiện tại duyệt, Farm độc lập thì Admin duyệt; Manager/Admin không trực tiếp nhập dữ liệu thu hoạch. Nếu tác giả hết phân công, vẫn được yêu cầu đối với bản ghi của mình, chủ Farm thực hiện sửa. Không mang cơ chế immutable/hash/PENDING 15 phút của Cultivation sang Harvests.
- Đề xuất sửa nằm trong store metadata riêng, một Pending proposal mỗi bản ghi. Nội dung thu hoạch chính giữ nguyên khi chờ; từ chối không thay dữ liệu/updated_by/updated_at cũ. Store phải phân biệt Pending xác nhận lần đầu và Pending chỉnh sửa, không chỉ tin status client.
- Người dùng đã chọn luồng sửa Confirmed qua câu trả lời ngày 2026-10-05: Manager/Admin duyệt nội dung đề xuất rồi áp dụng ngay, trở về Confirmed và ghi updated_by/updated_at. Không triển khai cấp quyền sửa 24 giờ hoặc bước chủ Farm xác nhận lại sau duyệt chỉnh sửa. Luồng xác nhận lần đầu vẫn cần người tạo gửi lên và chủ Farm duyệt (người tạo là chủ thì gửi được auto duyệt); hai field update giữ null ở lần xác nhận đầu.
- Dùng cùng các instance Auth/Users/Farm/Zone/Trees/Assignments/HTX; không gọi lại dynamic module factory gây store trùng. Postman URL/JSON literal, JWT/UUID nhập thủ công, không scripts/environment.
- Giữ nguyên .env và các thay đổi ERD/MQTT/Twilio/Users Postman của người dùng. Không stage toàn workspace, reset/clean hoặc tự push/merge. Chỉ code/commit local được phép.

## Các lựa chọn cuối cùng ngày 2026-10-05

Người dùng đã trả lời cả ba câu hỏi trước khi code:

1. **Chỉnh sửa Confirmed:** duyệt nội dung đề xuất và áp dụng ngay, trở về Confirmed, ghi updated_by/updated_at; không quyền sửa 24 giờ/chủ xác nhận lại.
2. **Phạm vi khóa:** khóa từng bản ghi; vẫn thêm cây khác cùng batch đúng Zone/ngày. Batch được phép có Draft/Pending/Confirmed cùng lúc.
3. **Cây Dead/Removed:** cho nhập bù ngày cũ, kiểm tra quyền/hạn 7 ngày/quyền Admin; không nhập ngày hiện tại. Không thêm điều kiện chứng minh mốc đổi status Tree.

Phân biệt Pending Confirm và Pending Correct bằng request metadata. Một bảng ERD không có nghĩa chỉ một Map; metadata RAM riêng đã được chấp nhận. Persistence phải bàn nơi lưu đề xuất/quyền/version riêng.

## Kết quả và tiếp tục session

Source ở apps/api/src/tree-harvests, 12 tests mới, tổng 89/89 tests. Guide triển khai ghi API/giới hạn/24 request Postman và lệnh local tương đương khi npm wrapper Windows EPERM. Không đọc .env thật, gửi tin, ghi DB hoặc thêm dependency/schema. Không hỏi lại các quyết định đã chốt. Stage đúng file module/tài liệu, không ERD/MQTT/Postman riêng; không push/merge nếu chưa được phép gửi branch payload lên origin.

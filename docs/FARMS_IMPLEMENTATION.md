# FARMS — đề xuất thay đổi, duyệt đối ứng và thành viên HTX

Nhánh `feat/farm-approval-workflow`, base `feat/standard-materials` (113da8f). Kế thừa Auth/Twilio/USERS/catalogs trong bộ nhớ. Đọc MODULE_HANDOFF.md trước khi tiếp tục session khác. Không tạo bảng, migration/seed hoặc sửa ERD. Không cần npm install thêm. Twilio vẫn đúng 4 request và .env hiện có được giữ nguyên.

## Quy tắc đã chốt và đang áp dụng

Cập nhật phụ thuộc 2026-10-04: module Zones đã triển khai; xem ZONES_IMPLEMENTATION.md. Duyệt giảm diện tích Farm phải giữ tổng diện tích Zone <= Farm. Nếu không đủ diện tích, trả 409, Farm và yêu cầu duyệt giữ nguyên. Quyền phân công Zone đã chốt ở MODULE_HANDOFF.md; phần mô tả chưa triển khai bên dưới phản ánh thời điểm của nhánh Farm gốc.

| Thao tác | Farmer chủ Farm đề xuất | Admin đề xuất | Vai trò Manager |
|---|---|---|---|
| Tạo/sửa Farm | Admin duyệt | Chủ Farmer chấp nhận | Chỉ xem Farm chính thức trong HTX mình |
| Gia nhập HTX | Admin **và** Manager HTX duyệt | Chủ Farmer **và** Manager HTX duyệt | Xét gia nhập, có thể từ chối |
| Rời HTX | Admin duyệt | Chủ Farmer chấp nhận | Nhận thông báo sau khi rời, không duyệt |

Gia nhập phải đủ hai bên duyệt, thứ tự tùy ý. Sau bên đầu tiên vẫn `Pending`; đủ hai bên mới `Accepted`. Từ chối bởi một bên cần duyệt chuyển `Rejected`, giữ nguyên Farm. Người đề xuất không tự duyệt/từ chối; bên đã duyệt không quyết định lại. Chưa có API hủy yêu cầu của người đề xuất.

Farm có thể độc lập: `cooperative_id=null`, `join_cooperative_date=null`. Tạo Farm trước rồi xin gia nhập, không truyền membership trong JSON tạo/sửa. Gia nhập được chấp nhận mới đặt ngày gia nhập theo giờ server. Rời được chấp nhận xóa hai field membership, giữ quyền sở hữu. Muốn chuyển HTX phải rời rồi gia nhập nơi mới.

Farmer tạo cho chính mình; Admin phải chỉ định `owner_id` của Farmer Active. Một Farmer có thể có nhiều Farm. `USERS.is_owner` chỉ thành true khi Farm đầu tiên được chấp nhận; đăng ký hoặc yêu cầu tạo chưa duyệt không làm đổi field này. Chưa có xóa Farm hoặc chuyển chủ.

Một Manager chỉ quản lý một HTX: store HTX kiểm tra ở cả create và assign, không ghi đè Manager hiện có. Manager không tạo/sửa Farm và không đọc Farm độc lập/HTX khác. Farmer chỉ đọc các Farm do mình sở hữu; USERS_ZONES chỉ mở quyền đọc Zone được phân công đang hiệu lực, không mở toàn Farm. Xem ASSIGNMENTS_IMPLEMENTATION.md.

## API

Tất cả API sau cần JWT tài khoản Active. JWT thiếu/sai hoặc tài khoản không Active trả 401 qua AuthGuard. Body chỉ nhận field DTO; không nhận id/status/approval/date do client tự đặt.

| Method / đường dẫn | Mục đích / body |
|---|---|
| GET `/api/farms` | Danh sách đã duyệt theo quyền, `q`, `limit`, `offset` |
| GET `/api/farms/:id` | Farm đã duyệt trong phạm vi truy cập |
| POST `/api/farms/requests` | Đề xuất tạo: thông tin Farm, Admin thêm owner_id |
| POST `/api/farms/:id/update-requests` | Đề xuất sửa: ít nhất một field thông tin có thay đổi |
| POST `/api/farms/:id/join-requests` | `{"cooperative_id":"UUID HTX"}` |
| POST `/api/farms/:id/leave-requests` | `{}` |
| GET `/api/farm-requests` | Yêu cầu trong phạm vi quyền; optional `status=Pending/Accepted/Rejected` |
| GET `/api/farm-requests/:id` | Chi tiết, snapshot và các bên cần duyệt |
| PATCH `/api/farm-requests/:id/approve` | `{}`; đáp ứng một bên duyệt, có thể vẫn Pending |
| PATCH `/api/farm-requests/:id/reject` | `{}` hoặc `{"reason":"Lý do"}` tối đa 500 ký tự |
| GET `/api/cooperatives` | Farmer/Admin: danh bạ HTX để chọn nơi gia nhập; Manager: chỉ HTX mình |
| GET `/api/farm-notifications` | Chỉ Manager: các thông báo rời HTX gửi riêng cho mình |

Các danh sách trả `{items,total,limit,offset}`, limit mặc định 20 (1–100), offset 0 (0–100000). q tìm địa chỉ/chứng nhận Farm, tối đa 100 ký tự. Không lọc theo user/owner tùy ý để mở rộng phạm vi quyền. Danh sách yêu cầu mặc định gồm cả lịch sử đã xử lý; dùng status=Pending để chỉ xem chờ.

Admin xem toàn bộ Farm/yêu cầu. Farmer xem yêu cầu của các Farm thuộc mình. Manager xem yêu cầu gia nhập cần mình duyệt; `farm_snapshot` cho phép xét thông tin tại lúc đề xuất trước khi có quyền đọc Farm chính thức. Yêu cầu tạo/sửa/rời không xuất hiện trong danh sách yêu cầu của Manager. Sau khi Farm rời, Manager không còn quyền đọc Farm hiện tại; snapshot của yêu cầu gia nhập cũ vẫn là lịch sử yêu cầu đã tham gia xét.

POST đề xuất trả 201 với `id` **của yêu cầu**, `farm_id`, `status`, `required_approvals`. Khi tạo còn Pending, farm_id=null. Sau chấp nhận mới có farm_id để đọc/sửa/gia nhập. PATCH quyết định trả 200; quyết định lặp hoặc Farm đã có yêu cầu Pending trả 409. Đọc ngoài quyền trả 404; đề xuất/duyệt sai vai trò trả 403.

## JSON và giới hạn theo ERD

```json
{
  "area_size": 1.25,
  "address": "Dia chi nong trai demo",
  "certificate_number": "FARM-DEMO-001",
  "longitude": 106.1234567,
  "latitude": 10.7654321
}
```

Admin tạo thay thêm `"owner_id":"UUID Farmer"`; Farmer bỏ owner_id hoặc dùng chính id mình. UUID phải lấy từ response thật, không phải số điện thoại. `area_size`, `longitude`, `latitude` là JSON number, không đặt trong dấu nháy.

- area_size decimal(7,3): API nhận từ 0.001 đến 9999.999, tối đa 3 số lẻ.
- Longitude từ -180 đến 180, latitude từ -90 đến 90, tối đa 7 số lẻ, phù hợp decimal(10,7).
- address bắt buộc, trim, tối đa 255; certificate_number bắt buộc, trim, tối đa 18. Không tự thêm UNIQUE chứng nhận Farm vào ERD/store.
- Sửa chỉ nhận các field trên; thiếu field giữ nguyên, null/chuỗi rỗng/field lạ bị từ chối. Không sửa owner_id/cooperative_id/join_cooperative_date trong endpoint này.

## Cách test Postman bằng JSON

Chạy `npm run dev:api` từ root. AUTH_MODE=mock, NODE_ENV=development, AUTH_TEST_ADMIN_PHONE/PASSWORD đã cấu hình. DATABASE_URL/MONGODB_URI cần cho config chung nhưng Farm không truy cập DB; không cần Docker, không gửi SMS khi test Farm. Đổi mật khẩu trước đó thì login dùng mật khẩu hiện tại trong bộ nhớ.

Import **docs/postman/Farms-Local-Test.postman_collection.json**, mở **Smart Durian Farm - Farms - Nhap JSON**. Không Scripts/Environment/biến tự động. Mọi request dùng URL localhost:3000; đổi cổng bằng tay nếu cần.

1. 01 Login Farmer: thay số/mật khẩu mẫu bằng AUTH_TEST_PHONE và mật khẩu đang có; lưu JWT Farmer. 02 Login Admin: dùng cấu hình Admin, lưu JWT Admin.
2. 03 Create Farm request: Headers Authorization dùng JWT Farmer; điền JSON. Copy response.id của yêu cầu.
3. 05 Approve Farm request: thay UUID trên URL bằng id yêu cầu, dùng JWT Admin, body `{}`. Copy response.farm_id. 06 Farms/07 Farm: dùng JWT Farmer, kiểm tra Farm đã xuất hiện.
4. 08 Create Update request: thay UUID Farm trên URL, dùng JWT Farmer, sửa address/area_size. Farm chính thức chưa đổi. Dùng 05 để Admin duyệt hoặc 09 để Admin từ chối với id yêu cầu mới.
5. Muốn test HTX: dùng collection USERS để xác minh email, đăng ký Manager rồi Admin approve kèm tạo HTX; xem USERS_IMPLEMENTATION.md. **Không tạo Manager fixture mới hoặc bỏ xác minh email để test tay.** Login Manager bằng 12. Email thật cần SMTP; kiểm thử tự động dùng sender giả.
6. 10 Cooperatives: JWT Farmer/Admin; copy HTX id. 11 Create Join request: UUID Farm trên URL, HTX id trong JSON, JWT Farmer. Copy id yêu cầu. Dùng 05 với JWT Admin rồi 13 với JWT Manager của HTX đó; cả hai URL đều dùng cùng id yêu cầu. Sau 05 vẫn Pending, sau 13 Accepted.
7. 14 Create Leave request: UUID Farm, JWT Farmer, body `{}`. 15 Approve Leave request: UUID yêu cầu rời, JWT Admin. 16 Farm Notifications: JWT Manager, thấy thông báo. Manager không được dùng 15 để duyệt rời.
8. 17 Create Farm for Farmer/18 Accept Farm by owner là luồng ngược: dùng JWT Admin để đề xuất và owner_id Farmer; dùng đúng JWT chủ Farmer để chấp nhận.

Mỗi request cần tự paste `Authorization: Bearer <access_token>` thay PASTE_ACCESS_TOKEN. UUID mẫu 111… dùng cho yêu cầu, 222… cho Farm, 333… cho HTX, 444… cho chủ Farmer; luôn thay bằng response thật. Đừng paste toàn bộ response vào body. 04 Pending Farm requests giúp tìm lại id/những bên còn thiếu duyệt.

## Logic khó và tái lập session

- FarmsService giữ Map Farm, yêu cầu và thông báo riêng; UUID/version/trạng thái duyệt là metadata demo, không phải bảng mới đã được phê duyệt. Tối đa 1000 Farm, 2000 yêu cầu kể cả lịch sử; thông báo tối đa bằng số yêu cầu rời đã xử lý. Đầy trả 429. Restart xóa tất cả, như USERS/catalogs.
- Một Farm có một yêu cầu thay đổi Pending. Tạo Farm chưa có id chính thức nên mỗi yêu cầu tạo độc lập; nhiều Farm cùng một Farmer được phép.
- Mỗi lần approve kiểm tra lại chủ Farmer Active, proposer đúng role/Active, version Farm, Manager hiện tại của HTX và các người đã duyệt. Nếu người đã duyệt bị khóa/đổi role trước bước cuối, không commit Farm hoặc chữ ký bước cuối. Có thể tiếp tục sau khi điều kiện tài khoản được khôi phục; bên chưa duyệt có thể reject nếu cần đề xuất lại.
- Approve tạo bản sao yêu cầu; chỉ ghi lại sau khi áp dụng thành công. Kiểm tra và commit đều đồng bộ, không await; chống hai request commit cùng một thay đổi trong demo một process. Khi dùng DB phải thay bằng transaction/locking/version kiểm soát đồng thời.
- Store trả bản sao sâu Farm/yêu cầu/thông báo; store HTX cũng trả bản sao để không sửa manager_id từ object response và vượt ràng buộc. Test USERS cũ đã đổi sang đọc lại store sau assign.
- UsersModule export đúng MockCooperativeStore; AppModule tạo một usersModule và truyền cùng tham chiếu cho FarmsModule. Không gọi UsersModule/AuthModule factory độc lập cho Farm vì Nest 11 có thể tạo store thứ hai.
- Thông báo rời HTX được tạo đúng một lần lúc chấp nhận, cho Manager đang gắn HTX. Manager bị Locked vẫn được lưu thông báo, có thể đọc khi Active trở lại. Không có gửi email/SMS/push, đánh dấu đã đọc hoặc websocket ở đợt này.

Tiếp tục session: đọc guide này và handoff, kiểm tra branch/status/user edits, chạy bằng cấu hình hiện có; không ghi đè .env và không stage ERD/MQTT/xóa SpeedSMS của người dùng. Zone/USERS_ZONES đã có ở nhánh kế thừa. Chưa triển khai chuyển chủ/xóa Farm, quản lý HTX độc lập hoặc Tree. Trước persistence phải chốt ERD nơi lưu yêu cầu/duyệt/thông báo và transaction; không tạo schema dựa riêng vào metadata Map.

## Kiểm tra

Tests Farm bao phủ tạo/sửa hai chiều, is_owner, reject, DTO/precision/scoping, đủ hai duyệt gia nhập, rời không cần Manager duyệt, thông báo một lần, đọc bản sao, tài khoản bị khóa giữa chừng, duyệt đồng thời và cùng store với đăng ký/duyệt Manager thực tế qua sender giả. Đã đạt **44/44 tests, lint, typecheck và build**. Không gửi email/SMS thật hoặc ghi database trong các checks; live SMTP vẫn do người dùng test riêng. Postman Farm 18 request nhập trực tiếp, Twilio giữ đúng 4 request.

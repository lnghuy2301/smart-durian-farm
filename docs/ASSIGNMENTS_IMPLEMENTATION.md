# USERS_ZONES — phân công Farmer và lịch sử

Nhánh `feat/zone-assignments`, base `feat/zones-management` (e7bb204). Module Zones và tất cả phụ thuộc nằm trên nhánh này. Dữ liệu nghiệp vụ đúng ERD: `id`, `user_id`, `zone_id`, `start_date`, `end_date`. Lời mời, các lần duyệt, snapshot là metadata riêng trong bộ nhớ, không phải schema mới. Chưa tạo bảng/migration/seed. Đọc MODULE_HANDOFF.md đầu session.

## Quy trình đã chốt

| Người đề xuất | Những bên phải chấp nhận | Khi có quyền |
|---|---|---|
| Chủ Farmer | Farmer nhận phân công | Sau nhận việc và đến start_date |
| Admin | Chủ Farmer và Farmer nhận phân công | Đủ cả hai, thứ tự tùy ý, và đến start_date |
| Manager / Farmer không phải chủ | Không được đề xuất | Manager chỉ đọc phạm vi HTX |

Người nhận phải là Farmer Active, không phải Manager/Admin/Pending/Locked. Chủ phải Active. Chủ có thể tự nhận việc nhưng phải gửi một lần chấp nhận rõ ràng; sở hữu Farm tự nó không cấp quyền ghi nhật ký/điều khiển. Nếu Admin phân công chính chủ, một chấp nhận của chủ đáp ứng cả Owner và Assignee. Đủ duyệt mới tạo bản ghi USERS_ZONES, trước đó chỉ có request Pending.

Khoảng hiệu lực là **[start_date, end_date)**: gồm đầu, không gồm cuối. start_date bỏ trống: bắt đầu khi đủ duyệt. end_date null/bỏ trống: không định hạn. ISO timestamp phải có timezone (`Z` hoặc `+07:00`), backend lưu UTC. Ngày hết hạn phải sau ngày bắt đầu và sau thời điểm gửi. Chấp nhận trễ không tạo quyền lùi về quá khứ: start_date bản ghi = max(ngày dự kiến, giờ đủ chấp nhận); request giữ ngày dự kiến để đối chiếu. Đã quá end_date thì từ chối/lập lời mời mới.

Một Zone chỉ một Farmer tại cùng thời điểm. Khoảng liền kề được phép; Farmer có nhiều Zone được phép. Cả phân công đã nhận và lời mời Assign Pending giao nhau đều ngăn lời mời mới. Chủ/người đề xuất có thể rút lời mời bằng reject; người nhận có thể từ chối. Việc từ chối giữ dữ liệu chính thức và giải phóng khoảng Pending. Không tự ghi đè phân công cũ, không tự kéo dài end_date.

Chủ Farmer kết thúc phân công đang hiệu lực trực tiếp, giờ kết thúc lấy từ server. Admin phải đề xuất End để chủ chấp nhận, không cần người nhận duyệt lại việc thu hồi. Người nhận không tự kết thúc. Vẫn có thể kết thúc nếu người nhận bị Locked. End đã kết thúc hoặc chưa tới start_date trả 409. Hủy/đổi lịch một phân công đã nhận nhưng chưa bắt đầu chưa có trong đợt này; không sửa lùi ngày hoặc xóa lịch sử. Nếu cần chức năng đó, chốt quy trình trước.

## Quyền hiện tại và lịch sử

Farmer nhận việc chỉ đọc Zone hiện tại khi phân công hiệu lực; không được sửa metadata Zone hoặc đọc toàn Farm của người khác. Khi hết hạn, GET Zone hiện tại trả 404 nếu Farmer không phải chủ; GET lịch sử phân công của chính mình vẫn thành công, gồm snapshot Zone lúc nhận việc. Lịch sử không bị xóa khi đổi tên/tiêu chuẩn Zone, kết thúc rồi phân công lại, hay rời HTX. Thời hạn correction không hạn chế quyền đọc lịch sử.

Admin/chủ Farm đọc lịch sử trên các Zone mình quản lý. Manager chỉ đọc phân công và lời mời của Zone trong Farm hiện thuộc HTX mình; khi Farm rời HTX, Manager mất quyền này. Không gửi SMS/email khi phân công; thông báo/lời mời đọc bằng API.

**Correction: tối đa 15 ngày × 24 giờ từ end_date, không bao gồm đúng thời điểm hết 15 ngày.** Chỉ chính tác giả, event tạo trong phân công gốc và đúng Zone. Phân công mới không gia hạn quyền sửa event cũ. Hết phân công không được tạo nhật ký mới/điều khiển thiết bị, kể cả trong cửa sổ correction. Hằng số `CORRECTION_GRACE_DAYS=15` ở assignment-policy.ts; chưa thêm .env để client/người cấu hình không vô tình vượt giới hạn đã chốt.

Nhật ký Cultivation và điều khiển IoT **chưa triển khai**. Đợt này cung cấp/chạy kiểm thử các hàm `AssignmentsService.assertCanWork(actorId, zoneId)` và `assertCanCorrect(actorId, event)` cho module đó gọi sau. Khi correction, truyền assignment_id, zone_id, author_id, created_at **từ event gốc đã lưu ở server**, không tin các field client khai; correction chain tiếp tục dùng event gốc. Metadata ngày hết correction trong response là thông tin, không tự chứng minh quyền trên một event. Chưa có API tạo/sửa nhật ký hoặc lịch sử event ở đợt này.

## API

Tất cả cần JWT Active. Body lạ/null ngoài các nullable được chỉ định trả 400. Đọc ngoài phạm vi 404; quyết định sai vai trò 403; overlap/lặp quyết định/hết hiệu lực 409. Không dùng số điện thoại thay UUID.

| Method / endpoint | Body / kết quả |
|---|---|
| POST `/api/zones/:id/assignment-requests` | user_id, optional start_date/end_date → 201 request Pending |
| GET `/api/assignment-requests` | Theo quyền; status=Pending/Accepted/Rejected, limit/offset |
| GET `/api/assignment-requests/:id` | Snapshot, required_approvals, trạng thái |
| PATCH `/api/assignment-requests/:id/approve` | `{}` → Pending hoặc Accepted + assignment_id |
| PATCH `/api/assignment-requests/:id/reject` | `{}` hoặc reason 1–500 ký tự |
| GET `/api/zone-assignments` | Lịch sử theo quyền, optional zone_id, limit/offset |
| GET `/api/zone-assignments/mine` | Chỉ những phân công mà user hiện tại là người nhận |
| GET `/api/zone-assignments/:id` | assignment, zone_snapshot, accepted_at, active, correction_deadline |
| PATCH `/api/zone-assignments/:id/end` | Chủ Farmer: `{}` → lịch sử với end_date giờ server |
| POST `/api/zone-assignments/:id/end-requests` | Admin: `{}` → End Pending; chủ duyệt bằng endpoint approve trên |

Danh sách `{items,total,limit,offset}`, limit mặc định 20, 1–100, offset 0–100000. UUID v4 kiểm tra ở cả URL/DTO. Không endpoint sửa user_id/zone_id/start_date/end_date trực tiếp. active tính từ giờ server mỗi lần đọc, không cần worker/scheduler để hết hạn quyền. JWT không lưu quyền phân công tĩnh.

Lời mời cơ bản:

```json
{
  "user_id": "55555555-5555-4555-8555-555555555555",
  "end_date": null
}
```

Có thể thêm `"start_date":"2026-10-10T08:00:00+07:00"` và `"end_date":"2026-10-20T17:00:00+07:00"` để đặt lịch. Đây là ví dụ; thay bằng thời gian tương lai khi test. Không có start_date nghĩa là nhận việc ngay sau đủ chấp thuận.

## Test Postman bằng JSON

Giữ .env hiện có; không cần khóa mới, không cần thêm npm dependency. Chạy `npm run dev:api`, Swagger `/api/docs`. Dùng collection USERS/Farms/Standards/Zones để có Farmer chủ, Farm Accepted, standard Active và Zone chính thức.

Import `docs/postman/Assignments-Local-Test.postman_collection.json`. Không Environment/Scripts. Các URL/JSON và JWT đều nhập trực tiếp.

1. 01/02 login chủ Farmer/Admin. 03 Register Farmer tạo người nhận khác nếu chưa có; dùng số mẫu chưa trùng tài khoản, không cần SIM vì các request này không gửi SMS. Copy response.user.id. 04 Login Farmer là người nhận, copy access_token riêng. Muốn tự phân công để dùng chỉ một Farmer thì bỏ 03, dùng id chủ và JWT chủ ở bước nhận việc.
2. 05 Create Assignment request: UUID Zone trên URL, UUID người nhận trong user_id, JWT chủ. Copy response.id **lời mời**. 06 xem Pending bằng JWT người nhận.
3. 07 Accept Assignment request: URL dùng id lời mời, JWT người nhận, body `{}`. Copy response.assignment_id **phân công**. 08 My Assignments / 09 Assignment / 10 Zone kiểm tra quyền.
4. 11 End Assignment: URL dùng assignment_id, JWT chủ, body `{}`. Người nhận mất quyền GET Zone hiện tại nhưng 08/09 vẫn đọc snapshot lịch sử.
5. Luồng Admin: sau khi kết thúc phân công cũ hoặc dùng Zone khác, 12 đề xuất bằng JWT Admin. 13 chủ chấp nhận cùng id lời mời: còn Pending nếu người nhận chưa đồng ý. 07 người nhận chấp nhận: Accepted. Có thể đảo thứ tự 13/07.
6. 14 Create End request bằng JWT Admin với assignment_id đang hiệu lực. 13 chủ duyệt với **id End request**, end_date được ghi lúc đủ duyệt. 15 Reject Assignment request xử lý lời mời chưa Accepted; dùng JWT người nhận cho Assign hoặc JWT chủ. 16 Assignment Requests/17 Assignments dùng JWT chủ; 18 login Manager/19 đọc trong HTX là bước tùy chọn sau khi Farm gia nhập HTX hoàn tất.

Header Key phải là `Authorization`, Value `Bearer <access_token>`; thay các PASTE_* trong Value. Phân biệt JWT chủ, người nhận, Admin và Manager. UUID Zone/lời mời/phân công là ba loại khác nhau, copy từ response đúng loại. Khi 409 Pending overlap, tìm lời mời qua 06 và reject trước; khi overlap phân công đã nhận, kết thúc bằng 11 hoặc đổi khoảng/Zone.

## Code và bàn giao session

- `src/assignments`: DTO/controller/service/types, policy thời gian, MockZoneAssignmentStore. Store chỉ chứa phân công đã nhận và snapshot; service chứa request Pending/Accepted/Rejected.
- Store được cung cấp/export bởi ZonesModule rồi dùng cùng instance ở AssignmentsModule để ZonesService kiểm tra đọc Zone theo phân công, không tạo vòng phụ thuộc services hay store trùng. AppModule tạo zonesModule đúng một lần.
- Các bước recheck/commit đồng bộ: chủ, proposer, người nhận Active/role, snapshot Zone, các chữ ký cũ, khoảng thời gian, overlap và dung lượng; chỉ ghi chữ ký cuối sau commit thành công. Không await giữa kiểm tra và ghi. Snapshot đổi trong lúc chờ → 409, reject/lập lại.
- Tối đa 2000 lịch sử và 2000 lời mời kể cả đã xử lý, đầy trả 429. Response trả bản sao sâu; restart xóa toàn bộ, không phải persistence.
- Chưa tạo schema từ metadata. Trước DB cần chốt end_date nullable, lưu acceptance/snapshot/request, transaction/locking và exclusion constraint cho khoảng giao nhau; partial UNIQUE riêng record chưa kết thúc không đủ chống lịch hẹn.

Đọc guide + handoff, kiểm tra branch/status trước khi sửa, giữ thay đổi ERD/MQTT/Postman riêng của người dùng ngoài commit. Chạy lint/typecheck/build/test. Không dùng .env thật để test tự động. Trees đã triển khai, không chuyển Zone; dùng cùng store phân công qua ZonesService để cấp quyền đọc cây chỉ trong [start,end). Hết phân công vẫn giữ lịch sử phân công riêng; metadata history cây cần quyền Zone hiện tại. Device di chuyển và Cultivation details/hash-chain vẫn cần bàn trước khi triển khai; helper quyền không tự cấp phép module mới. Xem TREES_IMPLEMENTATION.md.

Validation: **55/55 tests**, lint/typecheck/build đạt. Bao phủ nhận việc/duyệt hai bên, đồng thời gửi lời mời và nhận việc, trạng thái tài khoản, snapshot lỗi thời, overlap/adjacency, tự nhận việc, kết thúc và quyền lịch sử, đúng deadline 15 ngày, phân công mới không gia hạn lịch sử cũ. Các checks không gửi email/SMS hay ghi DB. Xem handoff để biết trạng thái push của các branch local.

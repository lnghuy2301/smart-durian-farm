# Trees — quản lý cây và duyệt đề xuất

Ngày 2026-10-04. Nhánh `feat/trees-management`, base HTX `2752454` trên `feat/cooperatives-management`; kế thừa Auth/USERS, danh mục, Farm, Zones và USERS_ZONES. Không triển khai trùng các module này. XML và JSON ERD đều có TREES với id, zone_id, tree_code, variety, plant_date, longitude, latitude, status (Active/Removed/Dead); giữ nguyên file ERD của người dùng.

## Nghiệp vụ và phạm vi quyền

| Người dùng Active | Đọc cây/lịch sử metadata | Tạo/sửa |
|---|---|---|
| Chủ Farmer | Zone trong Farm đã Accepted của mình | Trực tiếp |
| Admin | Tất cả | Chỉ đề xuất; đúng chủ Farmer duyệt/từ chối |
| Manager | Farm hiện thuộc HTX mình quản lý | Không |
| Farmer nhận việc | Zone có phân công Accepted trong [start_date, end_date) | Không |
| Farmer khác | Không | Không |

Không có chuyển Zone hoặc hard-delete. id, zone_id, tree_code bất biến sau khi cây được tạo. Backend sinh `tree_code = DRN-<UUID v4 của cây>`, dài 40 ký tự, unique trong store; không nhận mã từ client. Nếu gặp UUID trùng, thử tối đa ba lần rồi trả 409, không ghi đè cây cũ. Không tự đặt UNIQUE cho variety hoặc số lượng cây theo diện tích vì chưa có nghiệp vụ đó.

Tạo mới mặc định Active nếu không gửi status. Cho phép tạo với trạng thái ERD khác để nhập dữ liệu hiện trạng. Dead/Removed vẫn đọc được; chủ có thể đưa lại Active để sửa nhầm, Admin phải đề xuất và được chủ duyệt. Mỗi lần ghi thành công tạo snapshot metadata trước/sau và tăng version; giữ mã và Zone gốc. PATCH bỏ status sẽ giữ nguyên trạng thái hiện tại. PATCH rỗng hoặc không có thay đổi thực sự trả 400, không tạo lịch sử thừa.

Quyền đọc gọi cùng `ZonesService.get`, sử dụng đúng store phân công và Farm/HTX hiện có. Không cấp quyền đọc toàn Farm cho Farmer nhận một Zone. Danh sách lọc quyền trước phân trang, tra tree_code cũng kiểm tra quyền; chi tiết/lịch sử ngoài phạm vi trả 404, danh sách trả rỗng. Manager mất quyền khi Farm rời HTX. Farmer chưa nhận việc, trước start hoặc từ end trở đi không đọc metadata/lịch sử metadata hiện tại. Lịch sử phân công riêng vẫn đọc qua USERS_ZONES; lịch sử Cultivation của chính tác giả và correction 15 ngày thuộc module nhật ký sau này. Không dùng lịch sử metadata cây để gia hạn quyền làm việc/correction.

## Luồng Admin đề xuất

1. Admin Active gửi Create hoặc Update. Backend kiểm tra Zone/Farm tồn tại, chủ là Farmer Active. Create Pending chưa có Tree/tree_code (`tree_id=null`); Update giữ snapshot và version của cây lúc gửi. Một Pending Update mỗi cây; Create có thể nhiều đề xuất, không giữ chỗ dung lượng.
2. Chỉ Admin và đúng chủ đọc đề xuất. Manager/Farmer khác nhận 404 khi đọc chi tiết, danh sách rỗng; không duyệt thay chủ. Admin không tự duyệt/từ chối. Đề xuất không hết hạn tự động trong đợt này.
3. Chủ Farmer Active duyệt. Kiểm tra lại Farm/chủ, người đề xuất còn Admin Active, dung lượng và version. Chủ vẫn sửa trực tiếp trong lúc chờ; nếu cây đã đổi, duyệt trả 409 và giữ Pending. Chủ từ chối đề xuất lỗi thời rồi Admin lập lại.
4. Ghi cây và snapshot trước khi ghi Accepted. Khi Create được chấp nhận mới sinh mã; response Accepted trả tree_id. Duyệt đồng thời cùng đề xuất chỉ một lần thành công, lần sau 409. Từ chối ghi Rejected/reason, không ghi cây hoặc metadata history.

Snapshot lịch sử ghi id/tree_id, action Create/Update, actor_id (chủ thực hiện ghi/duyệt), proposed_by/request_id (Admin và đề xuất, null nếu chủ ghi trực tiếp), version, changed_at UTC, before (null khi tạo), after. Lịch sử trả theo thứ tự ghi, có phân trang. Đây là audit metadata trong bộ nhớ; chưa phải Cultivation, hash-chain hoặc chứng minh chống sửa ở DB.

## API

Tất cả có prefix `/api`, bắt buộc JWT Bearer của tài khoản Active. POST thành công 201; GET/PATCH 200. Không có route DELETE hay route trace công khai.

| Method | Route | Mục đích |
|---|---|---|
| GET | /trees | Đọc danh sách trong phạm vi; q/zone_id/status/limit/offset |
| GET | /trees/:id | Chi tiết cây |
| GET | /trees/by-code/:treeCode | Tra mã DRN với cùng kiểm tra quyền |
| GET | /trees/:id/history | Snapshot metadata; limit/offset |
| POST | /trees | Chủ tạo trực tiếp |
| PATCH | /trees/:id | Chủ sửa trực tiếp |
| POST | /trees/requests | Admin đề xuất tạo |
| POST | /trees/:id/update-requests | Admin đề xuất sửa |
| GET | /tree-requests | Admin/chủ xem đề xuất; status/limit/offset |
| GET | /tree-requests/:id | Chi tiết đề xuất |
| PATCH | /tree-requests/:id/approve | Chủ duyệt; body {} |
| PATCH | /tree-requests/:id/reject | Chủ từ chối; body {} hoặc reason |

Tạo trực tiếp hoặc Admin đề xuất tạo dùng cùng JSON:

```json
{
  "zone_id": "11111111-1111-4111-8111-111111111111",
  "variety": "Ri6",
  "plant_date": "2024-05-01T08:00:00+07:00",
  "longitude": 106.1234567,
  "latitude": 10.7654321
}
```

Thay UUID bằng Zone thật. variety trim, 1–80 ký tự; plant_date bắt buộc timestamp ISO hợp lệ có T và timezone Z hoặc ±HH:mm, chuẩn hóa UTC milliseconds. Hiện chỉ kiểm tra timestamp hợp lệ, chưa áp quy tắc cấm ngày tương lai. Longitude ±180, latitude ±90, number tối đa bảy số lẻ. status tùy chọn, đúng Active/Removed/Dead. Không nhận null, chuỗi số hoặc field lạ. UUID v4 cho id/zone_id; mã tra cứu đúng dạng DRN-UUID v4 chữ thường do server sinh.

PATCH trực tiếp/đề xuất Update chỉ nhận variety, plant_date, longitude, latitude, status. Ví dụ `{ "status": "Dead" }` hoặc `{ "variety": "Monthong" }`; không nhận zone_id/id/tree_code/owner_id. Reject reason tùy chọn, trim 1–500 ký tự nếu có. Danh sách/lịch sử trả `{items,total,limit,offset}`, limit mặc định 20 (1–100), offset mặc định 0 (0–100000); q trim tối đa 100 ký tự, tìm không phân biệt hoa/thường theo variety/tree_code. status cây khác status đề xuất (Pending/Accepted/Rejected).

Lỗi: 400 DTO/không đổi dữ liệu; 401 JWT thiếu/sai; 403 tài khoản/quyền ghi/duyệt sai; 404 id hoặc dữ liệu ngoài phạm vi; 409 đề xuất đã xử lý, version lỗi thời, có Pending Update; 429 dung lượng đầy. Không trả chi tiết cấu hình/secret.

## Giới hạn và tích hợp

`TreesModule.forMock(authModule, farmsModule, zonesModule)` nhận chính các tham chiếu module dùng trong AppModule, không gọi lại factory để tạo Auth/Farm/Zones store khác. Export TreesService cho module tương lai; `getRecord` chỉ nội bộ, controller dùng get/getByCode có kiểm tra quyền. Không có provider/biến .env/dependency mới.

Giới hạn một process: 5000 cây (kể cả Dead/Removed), 2000 đề xuất (kể cả đã xử lý), 10000 snapshot (kể cả Create). Đầy trả 429; không loại bỏ lịch sử cũ. Khi lịch sử đầy, không tạo/sửa/duyệt được nhưng vẫn đọc hoặc từ chối đề xuất. Toàn bộ validate/commit đồng bộ, không await giữa kiểm tra và ghi, response deep-copy. Restart xóa cây/requests/versions/history cùng nghiệp vụ khác; không dùng nhiều process cho store này.

Chưa ghi PostgreSQL/MongoDB, bảng/migration/seed. Persistence phải bàn riêng UNIQUE tree_code, FK, transaction/locking, lưu proposal/version/history/capacity. Tree Harvests đã triển khai trên nhánh kế thừa, xem TREE_HARVESTS_IMPLEMENTATION.md; dùng cùng TreesService, không chuyển Zone. QR public, Cultivation, IoT chưa triển khai. Device movement, Cultivation details/hash-chain vẫn cần quyết định trước module tương ứng. Route JWT by-code hiện tại không thay thế `/trace/{tree_code}` công khai của giai đoạn sau.

## Postman thủ công

Giữ .env hiện có, AUTH_MODE=mock và cấu hình Farmer/Admin đã dùng; Trees không cần email/SMS hoặc biến mới. API vẫn cần DATABASE_URL/MONGODB_URI đúng cấu hình startup; không cần database đang chạy để test Trees, readiness có thể trả 503. `npm run dev:api` từ root, Swagger `http://localhost:3000/api/docs`.

Import `docs/postman/Trees-Local-Test.postman_collection.json`, mở **Smart Durian Farm - Trees - Nhap JSON**. Có 20 request literal JSON/URL, không scripts/variables/environment. Thay số/mật khẩu mẫu bằng tài khoản local; JWT không lưu vào repo. Header Key là Authorization, Value là `Bearer <access_token>`.

1. Chuẩn bị Farm Accepted bằng Farms collection, Standard Active và Zone bằng Standards/Zones. 01/02 login chủ/Admin rồi copy JWT vào header từng request.
2. 03 thay zone_id trong Body, tạo cây, copy id/tree_code. 04–06 đọc; UUID ở URL 05 là Tree id, 06 dùng toàn bộ mã DRN từ response.
3. 07 sửa giống/tọa độ; 08 Dead; 09 Active; 10 Removed; 11 xem snapshots. Thử PATCH variety khi Dead/Removed để xác nhận không tự đổi status; dùng 09 khôi phục.
4. 12 Admin đề xuất Create; 13–14 chủ xem Pending, copy request id. 15 chủ duyệt với request id, lấy tree_id mới. Cây chưa xuất hiện trong 04 trước bước duyệt.
5. 16 Admin đề xuất Update với Tree id; 15 duyệt hoặc 17 từ chối bằng request id. Để test version: chủ dùng 07 sửa trong lúc Pending, rồi 15 phải 409; 17 từ chối và 16 gửi lại theo dữ liệu mới. Không dùng request đã Accepted để thử Reject.
6. 18–19 tùy chọn: đăng ký Farmer và chấp nhận phân công bằng Users/Assignments, dùng JWT_WORKER và Zone id thật. Farmer chỉ đọc Zone đang hiệu lực. 20 Manager dùng JWT từ Users login, Farm phải gia nhập HTX hoàn tất. Không có quyền sửa cây ở hai vai trò này.

## Kiểm thử và tái lập session

8 test mới ở `apps/api/test/trees.test.ts`: HTTP validation và code bất biến/default PATCH; quyền từng vai trò; Admin Create duyệt đồng thời và audit; Pending Update/version/trạng thái người duyệt và đề xuất; phục hồi trạng thái/deep-copy; scope HTX/phân công [start,end) với lịch sử phân công riêng; search/phân trang; đầy lịch sử không ghi một phần. Dùng AppModule thật với fixture/fake providers; không đọc .env thật, gửi tin hay ghi DB. Tổng tích hợp 77 tests (69 cũ + 8 Trees).

Lệnh chuẩn từ root: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`. Nếu npm wrapper Windows gặp EPERM ở đường dẫn cài đặt, chạy công cụ local tương đương từ `apps/api`:

```powershell
node ../../node_modules/eslint/bin/eslint.js src test integration
node ../../node_modules/typescript/bin/tsc --noEmit
node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json
node ../../node_modules/typescript/bin/tsc --outDir .test-dist
node --test --test-reporter=spec .test-dist/test
```

Session tiếp theo đọc AGENTS.md nếu có, git status/branch/log, MODULE_HANDOFF, IMPLEMENTATION_NOTES/PLAN, PROJECT_BUILD_SPEC, ERD XML/JSON, guide này và guide module phụ thuộc. Không start từ main cũ làm mất module local. Giữ nguyên sửa đổi ERD/MQTT/Postman riêng của người dùng; không reset/clean/stage toàn workspace. Không push/merge khi chưa có quyền xuất bản rõ ràng; lệnh triển khai chỉ cho phép code/commit local. Không triển khai Device movement/Cultivation theo suy đoán.

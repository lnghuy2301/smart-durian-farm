# Devices — metadata trạm và duyệt Admin

Ngày 2026-10-06. Branch `feat/devices-management`, base main `c71820d` sau GitHub PR #5. Auth/USERS, danh mục, Farm, Zones/Assignments, HTX, Trees và Harvests được kế thừa. Kết quả: **98/98 tests**, lint/typecheck/build đạt. Thiết kế cuối ở DEVICES_WORKFLOW_DESIGN.md; các phương án thảo luận cũ đã được thay thế.

## Nghiệp vụ đã triển khai

- Chủ Farmer tạo/sửa Device trực tiếp. Admin chỉ đề xuất Create/Update, đúng chủ Farm duyệt hoặc từ chối. Manager chỉ đọc Farm hiện thuộc HTX mình. Farmer nhận việc chỉ đọc Zone có phân công Accepted đang hiệu lực [start,end); hết hạn không đọc Device/history hiện tại, vẫn giữ lịch sử phân công riêng.
- Device luôn thuộc một Zone; một Zone có nhiều Device. Cây chịu ảnh hưởng theo Zone chung: DEVICES.zone_id = TREES.zone_id. Không TREES.device_id, cây gắn riêng, số cây nhập tay hoặc bảng bridge. Cây mới trong Zone tự xuất hiện ở GET /devices/:id/trees. API này mô tả phạm vi metadata, gồm cả Dead/Removed; không điều khiển cây/thiết bị.
- Backend sinh UUID id nội bộ. station_id nhập theo ESP32, bắt buộc/duy nhất toàn hệ thống/bất biến. UUID khác station_id; quan hệ nội bộ sau này dùng UUID device_id. Mã ESP32 được giữ nguyên hoa/thường, không tự đổi thành chữ hoa hoặc mã UUID. Inactive vẫn giữ mã và Zone, không đăng ký lại trạm để chuyển Zone.
- Chỉ Active/Inactive, mặc định Active. Active = đã lắp/đang sử dụng; Inactive = rút điện/tháo chưa kết nối lại. Chủ đổi trạng thái trực tiếp, Admin qua đề xuất; đổi cost/ngày lắp không tự chuyển trạng thái. Active không phải bằng chứng MQTT online. Không route chuyển Zone/hard-delete.
- Không auth_token/OTP cấp trạm/MQTT authentication. station_id là mã phần cứng, không secret. MQTT hiện chưa triển khai; giữ protocol subscribe/station/{station_id}, publish/station/{station_id} cho đợt kế tiếp.

## API

Tất cả route có prefix `/api`, JWT Bearer tài khoản Active. POST thành công 201, GET/PATCH 200. Mọi route id/request id dùng UUID v4; route by-station dùng mã ESP32.

| Method | Route | Mục đích |
|---|---|---|
| GET | /devices | Danh sách trong phạm vi; q/zone_id/status/limit/offset |
| GET | /devices/:id | Chi tiết Device |
| GET | /devices/by-station/:stationId | Tra mã phần cứng với cùng JWT/scope |
| GET | /devices/:id/trees | Cây hiện tại cùng Zone, limit/offset |
| GET | /devices/:id/history | Snapshot metadata, limit/offset |
| POST | /devices | Chủ tạo trực tiếp |
| PATCH | /devices/:id | Chủ sửa installed_at/cost/status |
| POST | /devices/requests | Admin đề xuất tạo |
| POST | /devices/:id/update-requests | Admin đề xuất sửa |
| GET | /device-requests | Admin/chủ xem đề xuất; status/limit/offset |
| GET | /device-requests/:id | Chi tiết đề xuất |
| PATCH | /device-requests/:id/approve | Đúng chủ duyệt, body {} |
| PATCH | /device-requests/:id/reject | Đúng chủ từ chối, body {} hoặc reason |

Create trực tiếp hoặc Admin đề xuất Create:

```json
{
  "zone_id": "11111111-1111-4111-8111-111111111111",
  "station_id": "E08CFE41DCAC",
  "installed_at": "2026-10-06T08:00:00+07:00",
  "cost": 1500000
}
```

Thay zone_id thật; status tùy chọn Active/Inactive. Response chỉ có id, zone_id, station_id, installed_at, cost, status. installed_at chuẩn hóa `2026-10-06T01:00:00.000Z`.

PATCH/Update proposal ví dụ `{ "status": "Inactive" }`, `{ "cost": 1600000 }` hoặc `{ "installed_at": "2026-10-06T02:00:00Z" }`. Không nhận id, zone_id, station_id, auth_token, tree_ids hoặc field lạ.

station_id 1–50 ký tự ASCII chữ/số/gạch dưới/gạch ngang, không khoảng trắng, slash hoặc wildcard MQTT +/#; không trim/chuẩn hóa mã phần cứng. Không ép MAC-only, ví dụ `ESP32_01` cũng hợp lệ. Lookup by-station phân biệt hoa/thường; search q không phân biệt hoa/thường. Đây là giới hạn input backend cho một topic segment, không thay mã/topic firmware. Đăng ký đúng mã firmware ngay từ đầu vì không sửa station_id được.

installed_at phải ISO timestamp hợp lệ có T và timezone Z hoặc ±HH:mm, lưu UTC milliseconds; không có quy tắc chặn ngày tương lai ở đợt này. cost là JSON number từ 0 đến 99999999.99, tối đa hai số lẻ, tương đương decimal(10,2). Không nhận null/chuỗi số hoặc enum sai. Reject reason tùy chọn, trim 1–500 ký tự nếu có.

Danh sách trả `{items,total,limit,offset}`, lọc phạm vi trước phân trang. limit mặc định 20 (1–100), offset 0 (0–100000). q trim tối đa 100 ký tự. status Device Active/Inactive khác status proposal Pending/Accepted/Rejected. Cây theo Device dùng cùng format và đọc trực tiếp store Trees hiện tại, không snapshot riêng hoặc giới hạn số cây cố định.

Lỗi: 400 DTO/field ngoài contract/PATCH không đổi; 401 JWT thiếu/sai; 403 quyền ghi/duyệt sai hoặc actor không Active; 404 id/mã không tồn tại hoặc ngoài phạm vi đọc; 409 mã đã đăng ký/proposal xử lý/version lỗi thời/đã có Pending Update; 429 dung lượng RAM đầy. Lỗi không trả credentials hoặc cấu hình hạ tầng.

## Quy trình và chống xung đột

Create proposal chưa đăng ký Device, UUID device_id null, không giữ chỗ station_id. Có thể có nhiều Create proposal cùng mã; chỉ khi duyệt mới kiểm tra lại unique. Chủ tạo trực tiếp trong khi chờ cũng được; proposal cùng mã về sau trả 409 và vẫn Pending, dùng Reject để kết thúc. Không tự đổi sang mã khác hoặc ghi dữ liệu một phần khi duyệt thất bại.

Một Pending Update mỗi Device. Chủ vẫn sửa trực tiếp trong khi Admin chờ; version tăng làm proposal cũ lỗi thời. Khi duyệt, kiểm tra lại actor/owner Active, role, Farm/Zone và version; 409 nếu lỗi thời, chủ từ chối để Admin đề xuất lại. Chỉ đúng chủ duyệt, không dùng id Device thay request id.

Device/index station_id/version/history được ghi đồng bộ, không await giữa validate và commit. Accepted chỉ ghi sau commit thành công. Hai approve cùng request hoặc hai request cùng station chỉ có một đăng ký thành công. Response/list/history/proposal là deep-copy; client không thể sửa store qua reference.

History gồm snapshot before/after, actor_id thực hiện (chủ khi duyệt), proposed_by (Admin nếu có), request_id, version và changed_at UTC. Đây là audit metadata RAM, chưa phải history chống giả mạo/hash-chain. Inactive/Active đều giữ record và lịch sử, không thay cây hay phân công.

## Store, tích hợp và ERD

`DevicesModule.forMock(authModule, farmsModule, zonesModule, treesModule)` nhận chính các module đã tạo ở AppModule; không gọi lại factory để sinh Auth/Farm/Zone/Tree store khác. DevicesService export cho MQTT sau; getRecord/getRecordByStationId chỉ service nội bộ, không cấp quyền/authentication. Controller phải dùng get/getByStationId có JWT/scope. Lookup station đã đăng ký vẫn trả record Inactive; module điều khiển sau phải kiểm tra trạng thái và quyền làm việc riêng.

Giới hạn một process: 1000 Device kể cả Inactive, 2000 proposal kể cả đã xử lý, 10000 snapshots. Đầy trả 429, không loại lịch sử cũ. History đầy chặn create/update/approve nhưng vẫn đọc hoặc Reject. Giới hạn proposal không chặn chủ sửa trực tiếp nếu còn history. Không chạy nhiều process cho các store RAM này.

Dữ liệu nằm trong RAM backend, không localStorage trình duyệt; restart mất Device/index/requests/version/history cùng nghiệp vụ khác. Không có bảng/collection/migration/seed hoặc dependency/.env mới. Chưa có hardware test, connection/telemetry/command MQTT.

ERD XML/JSON riêng vẫn ghi status Active/Offline/Maintenance khi kiểm tra; quyết định người dùng ngày 2026-10-06 chỉ Active/Inactive được ưu tiên trong code. Không sửa file riêng; cần đồng bộ enum trước persistence. ERD không có TREES.device_id đúng quyết định cuối. Persistence phải chốt FK/UNIQUE NOT NULL station_id, audit/proposal/version và transaction/index, không suy từ Map thành schema mới.

## Postman thủ công

Giữ .env đã cấu hình, AUTH_MODE=mock và fixture Farmer/Admin đã dùng. Không ghi đè .env. API startup vẫn cần DATABASE_URL/MONGODB_URI; không cần DB hoạt động để test metadata, readiness có thể 503. `npm run dev:api` từ root; Swagger `http://localhost:3000/api/docs`.

Import `docs/postman/Devices-Local-Test.postman_collection.json`, mở **Smart Durian Farm - Devices - Nhap JSON**. 24 request literal URL/JSON, không scripts/environment/variables. Số/mật khẩu ví dụ chỉ fixture; thay tài khoản đã có ở máy. JWT dùng Header Authorization = Bearer access_token, copy thủ công từng request.

1. Dùng Farms để tạo Farm Accepted, Standards/Zones tạo Zone. Có thể tạo Trees cùng Zone trước hoặc sau Device. Login 01/02, copy JWT_OWNER/JWT_ADMIN.
2. 03 thay zone_id/mã ESP32, tạo Device, copy UUID id vào URL 05/07–11. 04–06 đọc theo UUID/mã. 07 thấy cây cùng Zone; Zone khác không xuất hiện.
3. 08 Inactive, 09 đổi chi phí và kiểm tra vẫn Inactive, 10 Active, 11 xem history. Không bước nào gửi MQTT.
4. 12 Admin đề xuất mã khác chưa đăng ký; copy request UUID cho 14/15. 13 liệt kê; 15 chủ duyệt và nhận device_id UUID mới. 16 Admin đề xuất sửa Device; copy request UUID, 15 duyệt hoặc 17 từ chối. Đừng dùng request đã Accepted/Rejected lần nữa.
5. Kiểm tra version: sau 16, chủ dùng 09 sửa cost khác hiện tại; 15 phải 409. Dùng 17 từ chối, rồi 16 tạo đề xuất mới. Request thất bại vẫn Pending và dữ liệu không bị áp dụng.
6. 18 lọc Zone/status/mã. 19/20 tùy chọn Farmer đăng ký bằng Users rồi được mời và accept qua Assignments; chỉ đọc trong khoảng hiệu lực. 21/22 Manager đã duyệt/HTX có Farm gia nhập hoàn tất. Không cho hai vai trò này sửa Device.
7. 23 kiểm tra trùng mã (409), kể cả đã Inactive; 24 thử đổi mã bất biến (400). Không gửi mật khẩu/JWT/mã riêng vào repo.

## Kiểm thử và tái lập

9 tests Devices ở `apps/api/test/devices.test.ts`: HTTP validation/immutable fields/status default; quyền từng vai trò; unique station across Zones/Inactive/proposal; approve đồng thời và audit; stale proposal/recheck actor; HTX và biên [start,end); phạm vi cây cùng store/Zone không FK; query/deep-copy; đầy Device/history không ghi một phần. AppModule thật, fixture nội bộ/fake providers; không đọc .env thật/gửi email/SMS/ghi DB/MQTT.

Từ `apps/api`, các lệnh local tương đương npm wrappers đã dùng trong môi trường Windows này:

```powershell
node ../../node_modules/eslint/bin/eslint.js src test integration
node ../../node_modules/typescript/bin/tsc --noEmit
node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json
node ../../node_modules/typescript/bin/tsc --outDir .test-dist
node --test --test-reporter=spec .test-dist/test
```

1. Đọc AGENTS.md nếu có, status/branch/log, handoff/notes/plan/spec, ERD XML/JSON và hai guide Devices. Branch hiện có feat/devices-management từ main c71820d, không tạo lại module.
2. Cài dependencies ở root nếu chưa có, Node 20.19+. Giữ file riêng/.env nguyên trạng. Tests lấy config fixture, không dùng credentials local.
3. Kiểm tra branch/source và chạy lệnh trên khi có thay đổi code. Đợt này đạt 98/98 tests, lint/typecheck/build; Postman 24 request đã parse JSON.
4. Stage file module/docs cụ thể, commit local. Branch Devices chưa push; quyền xuất bản các branch cũ trước PR #5 không tự áp dụng cho branch mới.
5. Module tiếp theo đề xuất Sensors/Actuators metadata rồi MQTT core. Chốt mapping data_stream_id/capability_id theo firmware, status/threshold/định danh, và correlation/timeouts trước code. Control phải gọi assertCanWork theo phân công và kiểm tra Device/actuator đủ điều kiện; quyền chủ quản lý Device không tự cấp quyền điều khiển. Cultivation và persistence vẫn bàn riêng.

# Tree Harvests — nhập, xác nhận và duyệt chỉnh sửa

Xác nhận lại 2026-10-07 khi rà soát toàn dự án: người dùng chốt **chỉ cho xóa Draft chưa từng Confirmed**. Giữ nguyên code hiện tại; không xóa Pending/Confirmed hoặc bản ghi từng Confirmed. Quyết định này thay thế câu trao đổi cũ cấm xóa mọi bản ghi.

Cập nhật 2026-10-05. Nhánh local `feat/tree-harvests-management`, base Trees `d39c5ce`. Kế thừa Auth/Users/HTX/Farm/Zones/Trees/Assignments đã hoàn tất. Đọc MODULE_HANDOFF.md và TREE_HARVESTS_WORKFLOW_DESIGN.md cho quyết định cuối cùng, không áp các đề xuất đã bị thay thế trong trao đổi trước.

## ERD và phạm vi lưu trữ

Một bảng nghiệp vụ TREE_HARVESTS: id, tree_id, created_by, season_name, harvest_date, fruit_count, total_weight_kg, batch_code, status (Draft/Pending/Confirmed), updated_by, updated_at, created_at. XML/JSON người dùng đã dùng Draft; không sửa hai file. updated_by/updated_at nullable. Không thêm bảng batch/approval/grant hoặc field nghiệp vụ vào ERD.

Toàn bộ hiện lưu RAM của tiến trình NestJS, dùng Map, không phải browser localStorage hay file. Không ghi PostgreSQL/MongoDB, không migration/seed. Version, dấu đã từng Confirmed, snapshot đề xuất và quyền nhập bù là metadata RAM riêng. Restart mất cả bản ghi và metadata; refresh trình duyệt/đóng Postman không làm mất nếu backend còn chạy. Không chạy nhiều process dùng store này như hệ thống persistence.

## Quyền và chống ghi trùng

| Vai trò Active | Quyền |
|---|---|
| Chủ Farmer | Nhập trực tiếp không cần phân công; sửa/xóa nháp; duyệt xác nhận lần đầu; chuẩn bị/yêu cầu sửa |
| Farmer đang phụ trách | Nhập trong Zone có phân công Accepted đang hiệu lực [start,end); sửa/xóa Draft của mình; gửi lên và đề xuất sửa bản ghi mình |
| Farmer hết phân công | Đọc bản ghi do mình tạo và yêu cầu liên quan; gửi lý do sửa bản ghi Confirmed, không tự chuẩn bị nội dung sửa hoặc ghi mới |
| Manager | Đọc Harvests trong Farm hiện thuộc HTX mình; duyệt/từ chối chỉnh sửa Confirmed trong HTX |
| Admin | Đọc toàn bộ; duyệt chỉnh sửa cho Farm độc lập; cấp/thu hồi quyền nhập bù |

Manager/Admin không trực tiếp tạo/PATCH/xóa Harvests và không xác nhận lần đầu thay chủ. Farm đã thuộc HTX cần đúng Manager duyệt chỉnh sửa, Admin không thay. Farmer phụ trách không được sửa bản ghi do Farmer khác tạo. Chủ Farm được sửa Draft của Farmer, nhưng người tạo vẫn là người phải gửi lên.

Đọc thông thường qua quyền ZonesService cùng store phân công/HTX; Farmer hết phân công có ngoại lệ chỉ cho bản ghi của chính mình (không cấp đọc metadata Tree hiện tại hoặc toàn Farm). List lọc quyền trước pagination; chi tiết ngoài phạm vi 404. Manager mất quyền khi Farm rời HTX.

Backend chống trùng tree_id + harvest_date trên tất cả Draft/Pending/Confirmed. Hai người gửi đồng thời cùng cây/ngày chỉ một tạo thành công, còn lại 409, kể cả batch khác. Cùng cây/cùng batch thu hoạch thêm thì PATCH **tổng mới** fruit_count/weight trên Draft, không cộng ngầm hoặc tạo dòng thứ hai. tree_id/created_by/created_at/id bất biến.

batch_code không UNIQUE trên TREE_HARVESTS: nhiều cây trong cùng Zone/ngày dùng chung. Một mã không dùng ở Zone/ngày khác trong các bản ghi hiện có. Mã trim, phân biệt hoa/thường; không tự chuyển chữ hoa. Xác nhận/khóa **từng bản ghi**, không khóa batch: vẫn thêm cây khác đúng Zone/ngày sau khi dòng khác đã Confirmed. Một batch có thể gồm các status khác nhau. Xóa Draft giải phóng cặp cây/ngày; nếu không còn dòng nào của mã batch, không giữ một batch/tombstone riêng.

## Draft → Pending → Confirmed

1. POST tạo Draft, backend lấy created_by từ JWT và created_at UTC. Không nhận status hoặc hai field update từ client.
2. Tác giả đang có quyền ghi PATCH sửa Draft. updated_by/updated_at vẫn null. Draft chưa từng Confirmed được xóa bởi tác giả đang phụ trách hoặc chủ Farm.
3. Tác giả bấm submit. Nếu tác giả cũng là chủ Farm thì Confirmed ngay; tạo/lưu Draft không auto-confirm. Nếu khác chủ thì Pending, tạo request action Confirm; chủ đọc và approve/reject. Tác giả không tự approve, chủ không submit thay tác giả.
4. Approve lần đầu chỉ đúng chủ; kiểm tra lại Active và quyền ghi của người tạo, owner/version/Pending. Confirmed nhưng **updated_by/updated_at vẫn null**, created_by/created_at giữ nguyên. Reject/withdraw về Draft, giữ dữ liệu.

Nếu tác giả đã hết phân công trước duyệt lần đầu, approve không cấp quyền hồi tố và trả 403; chủ/người yêu cầu có thể reject để giải phóng Pending. Không sửa trực tiếp Pending. Xác nhận lần hai trả 409; approve đồng thời chỉ một thành công.

## Chỉnh sửa bản ghi đã Confirmed

1. Tác giả hoặc chủ Farm gửi correction-requests với reason và changes tùy chọn. Tác giả hết phân công chỉ gửi reason, không gửi changes. Bản ghi chuyển Pending; **các field dữ liệu chính và updated fields cũ giữ nguyên**.
2. Một Pending request mỗi bản ghi. Request có action Correct, snapshot/version/owner/HTX, requested_by, editor_id và proposed_changes, hoàn toàn do backend quản lý. Nếu chưa có changes, người yêu cầu còn quyền ghi hoặc chủ Farm PATCH request/changes để chuẩn bị. Chủ có thể chuẩn bị thay tác giả đã hết phân công; editor_id ghi đúng chủ. Không sử dụng correction 15 ngày của Cultivation cho Harvests.
3. Manager hiện tại duyệt nếu Farm trong HTX, Admin duyệt nếu Farm độc lập. Khi approve kiểm tra người yêu cầu còn Active, editor còn quyền ghi, chủ Active, owner/HTX/version còn khớp, nội dung tồn tại, ngày/batch/uniqueness và quyền nhập bù nếu đổi ngày cũ. Farm đổi HTX/rời HTX trong lúc chờ trả 409; rút và gửi lại, không chuyển reviewer ngầm.
4. Commit đồng bộ nội dung đề xuất, trở về Confirmed, ghi updated_by=editor_id và updated_at=UTC thời điểm áp dụng. Người duyệt nằm trong resolved_by của request RAM; không thêm confirmed_by/confirmed_at vào ERD. created_by/created_at giữ nguyên.
5. Reject/withdraw về Confirmed, giữ dữ liệu và updated fields trước đó. Không xóa một bản ghi đã từng Confirmed, kể cả hiện status Pending. Chủ/người yêu cầu có thể rút đề xuất lỗi thời; reviewer được từ chối trong phạm vi hiện tại.

Đây là luồng **duyệt nội dung và áp dụng ngay** được chọn ngày 2026-10-05. Không cấp quyền sửa 24 giờ, không thêm bước chủ xác nhận lại sau Manager/Admin, không hash-chain/PENDING 15 phút/immutable Cultivation. Request lưu lịch sử snapshot/nội dung/lý do/duyệt trong RAM, không phải bảng audit lâu dài.

## Ngày thu hoạch và quyền nhập bù

harvest_date là date YYYY-MM-DD có thật, tính theo ngày lịch Việt Nam UTC+7; created_at/updated_at là thời điểm UTC ISO. Không dùng timezone của máy chạy API hoặc 168 giờ trôi qua để xác định hạn 7 ngày. Ngày hiện tại đến 7 ngày trước (kể cả ngày thứ 7) được nhập; ngày tương lai trả 400. Quá 7 ngày cần quyền Admin đúng user_id/zone_id/harvest_date, expires_at ở tương lai.

Quyền được kiểm tra khi tạo bản ghi hoặc khi một thay đổi đưa harvest_date sang ngày khác quá hạn. Sửa số trái/khối lượng của ngày đã lưu không bắt xin quyền nhập bù lại chỉ vì thời gian trôi qua; submit/duyệt xác nhận ban đầu cũng không coi bản ghi đã nhập hợp lệ là lần nhập mới. Khi approve đề xuất đổi ngày, recheck quyền nhập bù của editor tại lúc áp dụng.

Admin chỉ cấp cho Farmer hiện có quyền ghi Zone (chủ hoặc phân công hiệu lực). Hạn expires_at do Admin nhập rõ timestamp có timezone, backend chuẩn hóa UTC; không có mặc định 24 giờ. Một quyền dùng cho nhiều cây đúng phạm vi trước hết hạn, không single-use. Hết hạn đúng mốc, bị thu hồi, Admin cấp quyền bị Locked/đổi role thì không dùng được cho lần nhập sau. Không xóa bản ghi đã nhập khi thu hồi. Quyền không tự cấp phân công hay quyền sửa Confirmed. Grant có created_at/granted_by/reason và revoked_at để đọc lịch sử RAM.

Cây Dead/Removed chỉ được **tạo/sửa nháp với ngày cũ**, không ngày hiện tại; vẫn áp quyền Zone/hạn nhập bù. Quyết định được chọn dựa trên ngày cũ, chưa yêu cầu chứng minh thời điểm thu hoạch trước mốc đổi status Tree. Chỉnh sửa sai của bản ghi Confirmed có thể giữ nguyên ngày đã lưu dù cây hiện không Active; đây là sửa dữ liệu cũ, không tạo thu hoạch mới. Không suy lịch sử trạng thái cây ngoài dữ liệu đã lưu.

## API và JSON

Prefix /api, tất cả JWT Bearer Active. POST 201; GET/PATCH/DELETE 200. Các action PATCH dùng body {} trừ prepare/reject.

| Method | Route | Chức năng |
|---|---|---|
| GET | /tree-harvests | List: tree_id/zone_id/status/q/limit/offset |
| GET | /tree-harvests/:id | Chi tiết, bao gồm lịch sử bản ghi riêng của tác giả |
| POST | /tree-harvests | Tạo Draft |
| PATCH | /tree-harvests/:id | Sửa Draft |
| DELETE | /tree-harvests/:id | Xóa Draft chưa từng Confirmed |
| PATCH | /tree-harvests/:id/submit | Người tạo gửi lên; trả Harvest với status mới |
| POST | /tree-harvests/:id/correction-requests | Yêu cầu sửa Confirmed, trả request |
| GET | /harvest-requests | List: harvest_id/status/limit/offset |
| GET | /harvest-requests/:id | Đọc request/snapshot/nội dung |
| PATCH | /harvest-requests/:id/changes | Chuẩn bị/đổi nội dung đề xuất Correct |
| PATCH | /harvest-requests/:id/approve | Chủ duyệt Confirm; Manager/Admin duyệt Correct |
| PATCH | /harvest-requests/:id/reject | Từ chối/rút; reason tùy chọn |
| GET | /harvest-backdate-permissions | Admin/recipient/chủ đọc quyền; limit/offset |
| POST | /harvest-backdate-permissions | Admin cấp quyền nhập bù |
| PATCH | /harvest-backdate-permissions/:id/revoke | Admin thu hồi |

POST Harvest ví dụ (thay tree_id/ngày theo lần thử):

```json
{
  "tree_id": "11111111-1111-4111-8111-111111111111",
  "season_name": "Vụ thu hoạch 2026",
  "harvest_date": "2026-10-05",
  "fruit_count": 10,
  "total_weight_kg": 30.5,
  "batch_code": "ZONE-A-20261005"
}
```

season_name/batch_code trim 1–50 ký tự; fruit_count số nguyên 1–2147483647; total_weight_kg number 0.01–99999.99, tối đa hai số lẻ theo decimal(7,2). Đây là bản ghi thu hoạch thực tế, không dùng bản ghi 0 trái/0 kg làm placeholder. Null/chuỗi số/field lạ bị từ chối; không nhận id/tree_id (PATCH), status/created_by/created_at/updated_by/updated_at. PATCH nhận một phần năm field dữ liệu, nhưng phải có thay đổi thực sự. DTO không gán status mặc định khi PATCH.

Correction: `{ "reason": "Cân lại", "changes": { "total_weight_kg": 31 } }`; reason trim 1–500. Tác giả hết phân công dùng `{ "reason": "Nhờ chủ sửa khối lượng" }`, chủ PATCH request/changes bằng `{ "total_weight_kg": 31 }`. Dữ liệu đề xuất cũng validate nested DTO; array/null/field backend bị từ chối. Reject body {} hoặc `{ "reason": "..." }`, reason nếu có trim 1–500.

Grant body gồm user_id/zone_id UUID v4, harvest_date YYYY-MM-DD, expires_at timestamp ISO có timezone và reason trim 1–500. Lấy grant id từ POST để revoke; lấy request id từ GET /harvest-requests (có harvest_id) sau submit, không dùng Harvest id làm request id. List trả `{items,total,limit,offset}`, limit 20 mặc định (1–100), offset 0 (0–100000), q trim tối đa 100 theo batch/season. Request status Pending/Accepted/Rejected khác Harvest Draft/Pending/Confirmed.

Lỗi 400 validation/không có thay đổi; 401 JWT; 403 sai quyền/thiếu grant; 404 ngoài phạm vi/id thiếu; 409 cây/ngày trùng, batch khác Zone/ngày, status sai, request thiếu nội dung/đã xử lý/owner-HTX-version thay đổi; 429 store đầy. Không trả secret/provider/config.

## Tích hợp, giới hạn và kiểm thử

AppModule tạo treesModule một lần và truyền cùng tham chiếu Auth/Users/Farms/Zones/Trees vào TreeHarvestsModule. MockZoneAssignmentStore do ZonesModule export; không tạo bản sao thứ hai. Có 5000 bản ghi hiện có, 2000 request kể cả đã xử lý, 1000 grant kể cả hết hạn/thu hồi; đầy trả 429 trước khi ghi Pending. Không eviction lịch sử request/grant. Responses deep-copy, validate/commit đồng bộ không await; không transaction DB trong batch RAM.

12 tests mới ở apps/api/test/tree-harvests.test.ts, tổng **89/89 tests** (77 hồi quy): HTTP/DTO/field backend/nested proposal; đồng thời cây-ngày/batch-scope/khóa từng dòng; chủ auto-confirm và null update; Worker gửi/chủ duyệt đồng thời/reject; correction giữ dữ liệu và actual editor; tác giả hết phân công; Manager/current HTX và Locked/stale membership; lịch Việt Nam/leap/day boundary; grant binding/expiry/revoke/role/HTTP; Dead/Removed/deep-copy; approval conflict recheck; store đầy không phantom Pending. Fake fixtures/providers, không .env thật/email/SMS/DB writes. Lint/typecheck/build đạt bằng công cụ local.

## Postman và tái lập session

Giữ .env hiện có; không biến/dependency mới. AUTH_MODE=mock, NODE_ENV=development, Farmer/Admin fixture như trước. Startup cần DATABASE_URL/MONGODB_URI hợp lệ nhưng module không truy cập DB; readiness có thể 503 khi DB tắt. `npm run dev:api` từ root, Swagger /api/docs, JSON /api/docs-json.

Import **docs/postman/Tree-Harvests-Local-Test.postman_collection.json** (24 request). Không scripts/variables/environment. Số/mật khẩu mẫu không phải tài khoản sản xuất; Worker/Manager phải đăng ký qua Users, không tự có fixture ngoài test. JWT đặt ở header Key Authorization, Value Bearer access_token; UUID và ngày đổi thủ công.

1. Chuẩn bị Farm Accepted, standard Active, Zone và ít nhất hai cây bằng collections hiện có. 01/02 login chủ/Admin, thay JSON 03 bằng Tree id và ngày hợp lệ theo lịch Việt Nam. 04–06 đọc/sửa Draft; 07 chủ submit tự Confirmed.
2. Đăng ký Farmer khác bằng Users, chủ mời và Farmer accept qua Assignments. 08 login, 09 tạo Draft cho **cây khác** trong cùng Zone/ngày/batch, 10 submit. 11/12 chủ lấy **request id**, 13 approve hoặc 14 reject. Không tự tạo dòng thứ hai cho cùng cây/ngày.
3. 15 gửi sửa Confirmed bằng đúng tác giả/hoặc chủ. 16 chuẩn bị nội dung nếu chỉ có reason. Dữ liệu GET 05 chưa đổi khi Pending. Nếu Farm độc lập dùng 18 Admin approve. Nếu Farm đã join HTX hoàn tất, login Manager 23 và dùng 17; 24 Manager đọc theo HTX. Đổi JWT và request id đúng vai trò, không chạy cả hai approve cho cùng request.
4. Để thử tác giả hết phân công: chủ end qua Assignments; tác giả vẫn GET bản ghi của mình, 15 bỏ changes rồi gửi reason; chủ dùng 16, Manager/Admin dùng 17/18. Farmer không tự PATCH sau end.
5. Ngày quá 7 ngày: nhập thử 03/09 sẽ 403, Admin 19 cấp đúng người/Zone/ngày với expires_at tương lai, rồi gửi lại với ngày được cấp và batch phù hợp. 20 xem quyền, 21 revoke chặn lần nhập sau. Luôn sửa ngày/hạn mẫu theo thời điểm test; không test bằng .env secrets thật hoặc thực hiện OTP để chạy tests tự động.
6. 22 chỉ xóa Draft riêng chưa Confirmed; tạo bản ghi khác bằng 03 trước, không dùng id từ 07/13. Kiểm tra Confirmed/Pending đều không DELETE được. Cây Dead/Removed nhập ngày cũ, không ngày hiện tại.

Session tiếp theo kiểm tra AGENTS.md nếu có, git status/branch/log, đọc handoff/notes/plan/spec/ERD XML+JSON, guide này và workflow design, Trees/Assignments/Farms/HTX. Branch base phải giữ chuỗi module local. Không reset/clean/stage workspace hoặc ghi đè .env. Commands chuẩn từ root: npm run lint/typecheck/build, npm test. Nếu npm wrapper Windows EPERM, từ apps/api:

```powershell
node ../../node_modules/eslint/bin/eslint.js src test integration
node ../../node_modules/typescript/bin/tsc --noEmit
node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json
node ../../node_modules/typescript/bin/tsc --outDir .test-dist
node --test --test-reporter=spec .test-dist/test
```

Persistence cần bàn UNIQUE(tree_id,harvest_date), FK, batch-scope và transaction/locking, nullability update fields và nơi lưu đề xuất/quyền/everConfirmed/version. Không tự chuyển metadata RAM thành bảng mới trái yêu cầu một bảng nghiệp vụ. QR public/Cultivation/IoT chưa triển khai. Nhánh chỉ commit local; push từng payload lên origin cần quyền rõ, không suy từ lệnh triển khai thành cho phép xuất bản hoặc merge.

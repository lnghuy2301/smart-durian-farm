# Actuators — API, kiểm thử và hướng dẫn tái lập

Ngày 2026-10-06. Branch `feat/actuators-management`, base Sensors `c9d0940`. Module metadata NestJS dùng RAM của tiến trình backend, không localStorage trình duyệt. Restart mất actuator, index, proposal và audit. Đọc [thiết kế cuối](ACTUATORS_WORKFLOW_DESIGN.md).

## Phần cứng và ERD

Người dùng xác nhận một bơm chung + hai van; bơm có taskingCapabilityId riêng, cần lệnh riêng. Enum purpose **Watering / Spraying / Shared** đã được chấp thuận. Đầu session ERD XML/JSON còn Watering/Spraying; trong lúc triển khai người dùng đã cập nhật cả hai thành Watering/Spraying/Shared, đã đối chiếu lần cuối và khớp code. Agent không sửa/stage ERD hoặc tạo bảng/migration/seed.

| Thiết bị vật lý | purpose | capability_id |
|---|---|---|
| Bơm dùng chung | Shared | Mã bơm thực tế trong firmware |
| Van tưới | Watering | Mã van tưới thực tế |
| Van phun | Spraying | Mã van phun thực tế |

Mỗi thiết bị có một Actuator UUID riêng. Không đăng ký bơm hai lần dưới hai purpose. Ví dụ 6/7/8 trong Postman chỉ là mã minh họa, không khẳng định firmware của người dùng dùng mã đó cho bơm.

Tương lai có bơm tưới riêng thì bơm và van tưới cùng Watering, capability khác nhau; tương tự Spraying. Không unique purpose và không tự giới hạn số actuator/purpose/Device. Shared biểu thị thiết bị dùng chung cho hai chức năng, không relay state hay lệnh điều khiển.

## Quyền và dùng chung store

| Tài khoản Active | Đọc | Ghi |
|---|---|---|
| Admin | Toàn bộ | Create/Update proposal, không ghi trực tiếp/duyệt |
| Chủ Farmer | Actuator thuộc Farm mình | Tạo/sửa trực tiếp, duyệt/từ chối proposal Admin |
| Manager | Farm hiện thuộc HTX mình | Không |
| Farmer nhận việc | Zone có Accepted assignment hiệu lực [start,end) | Không |

ActuatorsModule nhận chính Auth/Farms/Zones/**devicesModule** từ AppModule; không gọi lại factory tạo store Device khác. Scope Actuator → Device → Zone → Farm dùng shared stores hiện tại. Đọc list/get/by-capability/history xét lại quyền mỗi lần; Farm rời HTX hoặc assignment hết hạn mất quyền đọc metadata/history Actuator. Lịch sử assignment và correction Cultivation áp dụng policy riêng.

Cho cấu hình dưới Device Inactive như Sensors; đổi Device.status không cascade Actuator.status. Đổi status Actuator không phát lệnh bật/tắt bơm/van. Active/Inactive là khả dụng metadata, không On/Off và không MQTT online.

## Contract

| Field | Validation |
|---|---|
| id | UUID v4 do backend sinh, bất biến |
| device_id | UUID v4 của DEVICES.id đã tồn tại, bất biến; không station_id |
| name | Chuỗi trim 1..80 ký tự, được sửa |
| purpose | Enum Watering / Spraying / Shared; bắt buộc khi tạo, bất biến |
| capability_id | JSON number nguyên dương 1..9007199254740991, bắt buộc và bất biến |
| status | Active / Inactive, tạo mặc định Active, PATCH bỏ qua giữ nguyên |

Unique **(device_id, capability_id)** gồm cả actuator Inactive. ESP32 khác có thể cùng capability 6. Capability nhập đúng mã taskingCapabilityId firmware, không backend tự sinh và không Actuator UUID. API dùng miền số nguyên an toàn của JavaScript vì protocol JSON number; từ chối số không chính xác, decimal, chuỗi số trong body, null, 0 và số âm. Không nhận toàn miền bigint PostgreSQL vào JSON number rồi làm tròn. Nếu sau này cần mã lớn hơn Number.MAX_SAFE_INTEGER phải bàn contract/serialization với hardware trước.

Path capabilityId chuyển từ chuỗi URL sang số; các biểu diễn số có cùng giá trị resolve cùng capability. Body capability_id vẫn phải là number, không tự chuyển string sang number. Không đổi id/Device/capability/purpose, kể cả gửi giá trị cũ hoặc qua Admin proposal. Không có DELETE/chuyển Device. Không actuator_type/state/relay_state/auth_token trong contract. Null/field lạ/PATCH rỗng/no-op trả 400.

## API

Base URL http://localhost:3000/api, Bearer JWT. POST 201, GET/PATCH 200. Actuator id/Device id/Request id dùng UUID v4.

| Method | Route | Hành vi |
|---|---|---|
| GET | /actuators | List theo scope, q/device_id/purpose/status/limit/offset |
| GET | /actuators/by-capability/:deviceId/:capabilityId | Lookup Device UUID + numeric capability, vẫn kiểm tra scope |
| GET | /actuators/:id | Một actuator |
| GET | /actuators/:id/history | Metadata audit, limit/offset |
| POST | /actuators | Chủ tạo |
| PATCH | /actuators/:id | Chủ sửa name/status |
| POST | /actuators/requests | Admin đề xuất tạo, body giống create |
| POST | /actuators/:id/update-requests | Admin đề xuất sửa, body giống PATCH |
| GET | /actuator-requests | Chủ/Admin đọc, status/limit/offset |
| GET | /actuator-requests/:id | Chủ của request hoặc Admin |
| PATCH | /actuator-requests/:id/approve | Chủ duyệt, body {} |
| PATCH | /actuator-requests/:id/reject | Chủ từ chối, body {} hoặc reason |

List trả {items,total,limit,offset}; limit mặc định 20, miền 1..100; offset mặc định 0, miền 0..100000. q tối đa 100 ký tự, tìm tên/mã capability không phân biệt hoa thường; scope/filter trước phân trang. Request status Pending/Accepted/Rejected. Reason optional, trim 1..500 ký tự nếu gửi.

Ví dụ bơm chung (thay Device UUID và capability theo firmware):
```json
{
  "device_id": "11111111-1111-4111-8111-111111111111",
  "name": "Bơm chung tưới và phun",
  "purpose": "Shared",
  "capability_id": 8
}
```

PATCH metadata:
```json
{ "name": "Bơm chung khu A", "status": "Inactive" }
```

## Approval và chống xung đột

Create proposal có actuator_id=null và chưa đăng ký/giữ chỗ capability. Chủ duyệt recheck reviewer đúng chủ Farmer Active, Admin proposer vẫn Active/role Admin, Device/Zone/Farm/chủ, unique và capacity. Chủ đã tạo cùng cặp hoặc proposal cạnh tranh thì approve lỗi 409, giữ Pending, chưa gán actuator_id. Device khác cùng capability được phép.

Update proposal lưu actuator_snapshot/version/nội dung riêng; một Pending Update/Actuator. Chủ vẫn sửa trực tiếp được; version đổi khiến proposal cũ 409/Pending, cần reject và lập lại. Không ghi đè âm thầm hoặc sửa purpose.

Commit không await giữa kiểm tra và ghi RAM Actuator/index/version/history; Accepted chỉ ghi sau thành công. Reject không sửa Actuator/history. History có id, actuator_id, action Create/Update, actor_id (chủ ghi/duyệt), proposed_by/request_id nếu có, version tăng dần, changed_at UTC và before/after. Response là deep copy. Đây là metadata audit RAM, không Cultivation/hash-chain.

getRecord/getRecordByCapability là lookup service nội bộ, không cấp quyền HTTP/điều khiển. Controller dùng get/getByCapability có scope. Module MQTT sau này phải thêm assertCanWork/eligibility và kiểm tra đầy đủ, không dùng lookup như authorization.

## Lỗi và giới hạn

- 400: DTO/enum/identity/precision/null/unknown field/no-op sai.
- 401: thiếu/sai JWT.
- 403: role không được ghi/duyệt, hoặc tài khoản không Active.
- 404: tài nguyên không có hoặc ngoài scope đọc.
- 409: trùng cặp, một Pending Update, stale version, proposal đã xử lý hoặc role/context thay đổi.
- 429: RAM đạt giới hạn, chặn trước khi ghi dữ liệu/audit.

Giới hạn RAM: 5000 Actuators, 2000 proposals gồm đã xử lý, 10000 history entries toàn store. Không purge âm thầm; vẫn đọc/reject khi đầy history. Chỉ local một tiến trình, chưa transaction/lock đa replica/DB persistence.

Không kết nối MQTT, không ACTUATOR_TASKS mới, không state On/Off, automation/presence/bundle recipe hoặc lệnh bơm/van. Không bắt buộc tạo đủ bộ ba trước CRUD metadata; việc kiểm tra một chức năng đủ thiết bị để chạy thuộc module control sau.

## Postman JSON trực tiếp

Import [Actuators-Local-Test.postman_collection.json](postman/Actuators-Local-Test.postman_collection.json), 24 request, không scripts/environment/variables. Các login dùng fixture mẫu; thay bằng cấu hình local của mình khi gửi, không export token/password thật.

1. Tạo Farm và được Admin approve; Standard Active, Zone owner, Device owner theo các guide trước. Copy DEVICES.id UUID. Muốn test Manager thì Farm phải join HTX đúng Manager; Farmer phải nhận assignment đang hiệu lực.
2. Login chủ/Admin, copy JWT vào Authorization từng request bằng tay. Thay 1111... bằng Device UUID, 2222... bằng Actuator UUID và 3333... bằng Request UUID. 4444... là Device khác khi test composite.
3. Tạo bơm Shared, van Watering, van Spraying với capability thật khác nhau. API không tự sinh capability và không phát lệnh phần cứng.
4. Đọc list/get/by-capability/history, thử sửa name/status. Purpose/capability/Device/id immutable trả 400. Inactive vẫn trùng cặp khi tạo lại (409); Device khác/cùng capability được phép (201).
5. Admin tạo/update proposal; chủ đọc proposed_changes/snapshot rồi approve {} hoặc reject. Copy id riêng của từng request; không reject request đã Accepted.
6. Test stale: gửi Update proposal, chủ PATCH khác, approve cũ → 409, reject rồi tạo mới. Test worker/Manager đọc đúng scope, worker PATCH → 403.
7. Restart xóa nghiệp vụ, tạo lại dependencies; JWT hết hạn login lại. Device/Actuator Active chưa chứng minh hardware đang bật/online.

## Tái lập session và kiểm thử

Đọc AGENTS.md nếu có; git status/branch/log, MODULE_HANDOFF, IMPLEMENTATION_NOTES/PLAN, PROJECT_BUILD_SPEC, hai ERD và Devices/Sensors/Actuators guide. Nhánh hiện tại kế thừa Sensors c9d0940 và Devices 09cb1da. Không bắt đầu từ main c71820d còn thiếu các module mới; không triển khai lại Actuators. Không có AGENTS.md ở các đường dẫn repo/cha đã kiểm tra trong đợt này.

Node 20.19+, npm ci từ root nếu thiếu dependencies; giữ .env hiện có. Module không thêm biến/dependency. AUTH_MODE=mock, NODE_ENV=development, config DB như trước nhưng CRUD Actuator không gọi DB. npm run dev:api từ root; Swagger /api/docs, JSON /api/docs-json.

Checks từ root:
```powershell
npm run lint
npm run typecheck
npm run build
npm test
```

Nếu npm wrapper Windows bị EPERM, từ apps/api:
```powershell
node ../../node_modules/eslint/bin/eslint.js src test integration
node ../../node_modules/typescript/bin/tsc --noEmit
node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json
node ../../node_modules/typescript/bin/tsc --outDir .test-dist
node --test --test-reporter=spec .test-dist/test
```

Kết quả: **116/116 tests** (9 Actuators mới + 107 hồi quy), lint/typecheck/build đạt. Bộ test không cần DB thật; kết quả metadata này chưa xác minh hoạt động phần cứng.

9 Actuator tests: HTTP numeric precision/enum/immutable/Swagger; Shared bơm và hai van, cùng purpose cho bơm riêng; composite unique/Inactive/recheck; owner/Admin/scoped reads; concurrent approvals; stale version/roles/snapshot; HTX/assignment [start,end); filter/lookup/deep copies; capacity atomic/rejection. Tests dùng fake config/providers, không đọc .env thật/tin thật/DB/hardware. Database integration và live MQTT là kiểm thử riêng.

Giữ .env/ERD/MQTT/Twilio/Users Postman riêng ngoài commit; không reset/clean/stage-all. Chỉ commit file module local, không push/merge nhánh mới theo quyền publication các branch cũ.

## Module tiếp theo và điểm còn bàn

MQTT core tiếp theo cần chốt station identity cho sensor payload/topic, taskId/correlation, ACK ngắn/đầy đủ/muộn/trùng, timeout/retry, physical-button/echo, bơm chung khi bật/tắt/đồng thời tưới và phun, trình tự thao tác và lỗi từng target. Publish tới broker không phải hardware confirmation. Shared + purpose chỉ là dữ liệu đủ để thiết kế chọn target, chưa tự động recipe điều khiển. Giữ topic/protocol hiện chạy; không auth_token cho station. Persistence/schema full bigint, approval/history và Cultivation/hash-chain bàn riêng.

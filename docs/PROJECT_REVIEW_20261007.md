# Rà soát toàn dự án — 2026-10-07

Tài liệu này là mốc hiện tại cho session tiếp theo. Các kết quả theo nhánh cũ trong handoff/notes là lịch sử; không coi module đã hoàn tất là việc cần viết lại.

## Phạm vi và bằng chứng

- Đối chiếu ERD_DIAGRAM.xml, IOT_CORE_TABLES_SPEC.md, MQTT_HARDWARE_PROTOCOL_VERIFIED.md với module/controller/DTO/store/policy, tài liệu và test hiện tại.
- Đọc lại README, handoff, implementation notes/plan/build spec và hướng dẫn của các module; kiểm tra guards, phạm vi quyền, duyệt đề xuất, uniqueness, assignment và ngày thu hoạch.
- Không tìm thấy AGENTS.md trong repo hoặc các thư mục cha khi rà soát.
- Fetch origin thành công: main và origin/main cùng c71820d, đã tích hợp các module đến Harvests. Devices/Sensors/Actuators/IoT metadata/MQTT vẫn chỉ có commit local tại thời điểm kiểm tra.
- Nhánh rà soát/sửa kỹ thuật: fix/registration-proof-atomicity, từ MQTT d10ebd2; không merge/push.
- Kết quả sau sửa: 136/136 tests; lint, typecheck, build đều đạt. Users riêng 8/8. MQTT có fake adapter và TCP loopback với MQTT.js, chưa phải kiểm thử ESP32 thật.
- Audit runtime (--omit=dev): 0 cảnh báo. Audit toàn dependency: 2 critical entries cùng liên quan shell-quote qua concurrently trong dev tooling; xem mục phát hiện.

Rà soát và test không chứng minh không còn lỗi. Chưa kiểm thử toàn hệ thống với database persistence, nhiều process hoặc phần cứng thật.

## Kiểm kê: 18 cấu trúc trong ERD

| Nhóm | Cấu trúc | Trạng thái thực tế |
| --- | --- | --- |
| Người dùng/HTX | USERS, COOPERATIVES | API, Auth/OTP/email, duyệt Manager/HTX và store RAM đã có |
| Đất/phân công | FARMS, ZONES, USERS_ZONES | API, phạm vi quyền, duyệt đối ứng, tổng diện tích, khoảng hiệu lực và quyền lịch sử đã có |
| Cây/thu hoạch | TREES, TREE_HARVESTS | API, mã cây backend, thu hoạch/duyệt/chỉnh sửa đã có; chỉ xóa Draft chưa từng Confirmed |
| Danh mục | AGRICULTURAL_MATERIALS, FARMING_STANDARDS, STANDARD_MATERIALS | API và quy tắc danh mục/liên kết đã có |
| Metadata IoT | DEVICES, SENSORS, ACTUATORS | API, quyền như Device, Admin proposal/owner approval, identity/unique, shared RAM stores đã có |
| MongoDB — chưa có module | IOT_TELEMETRIES | Chưa có lưu lịch sử, latest/history API; FIFO diagnostics MQTT không thay thế collection |
| MongoDB — chưa có module | ACTUATOR_TASKS | Chưa có task workflow, HTTP control, confirmation/timeout hay phối hợp bơm/van |
| MongoDB — chưa có module | CULTIVATION_EVENTS | Chưa có nhật ký, details, locking/correction/hash chain |
| MongoDB — chưa có module | AI_DISEASE_DIAGNOSTICS | Chưa có upload/AI inference/feedback |
| MongoDB — chưa có module | CHATBOT_CONVERSATIONS | Chưa có conversation/RAG |

**13/13 bảng PostgreSQL đã có logic nghiệp vụ trong RAM; 5/5 collection MongoDB chưa có module.** Chưa tạo business tables, migrations hay seed cho 13 bảng; cũng chưa ghi dữ liệu nghiệp vụ vào MongoDB. Có kết nối database và readiness không đồng nghĩa đã có persistence.

QR traceability là tính năng/API/trang công khai, **không có bảng riêng**. Tính theo backend ERD và QR, còn **5 module collection + 1 tính năng QR**. Đây không phải số phần việc còn lại của toàn đồ án: persistence, hardening Auth, realtime, tích hợp phần cứng, web/mobile, lưu ảnh, AI/RAG và triển khai vẫn còn. apps/web, apps/mobile và ai hiện chỉ có .gitkeep.

MQTT communication là hạ tầng đã triển khai thêm ngoài 18 cấu trúc: connect/reconnect/SUBACK/shutdown, parser/routing, ánh xạ station sang Device UUID, presence, diagnostics chỉ đọc và publisher nội bộ.

## Phát hiện và cách xử lý

### 1. Lỗi kỹ thuật đã sửa: đăng ký trả lỗi nhưng đã tạo tài khoản

Trước sửa, registration kiểm tra proof sau await hash password, ghi account rồi consume proof bằng một lần kiểm tra deadline nữa. Nếu đồng hồ vượt deadline giữa hai bước đồng bộ, API trả 400 nhưng account đã tồn tại; đăng ký lại gặp trùng phone/email.

Đã tái lập với fake email sender và clock tại deadline, không dùng .env, tin nhắn, DB hoặc network thật: register_status=400 và account_created_despite_error=true.

Sửa: EmailVerificationService.consumeForRegistration kiểm tra proof lần cuối, gọi createAccount đồng bộ rồi chuyển proof sang consumed. Không kiểm tra deadline lần nữa sau khi đã ghi account. Store vẫn recheck uniqueness/capacity; callback thất bại giữ proof chưa consume. Không thay đổi quy tắc Farmer Active, Manager Pending hay hợp đồng HTTP.

Hai regression tests:
- Proof còn hạn tại bước chốt, đồng hồ vượt deadline khi ghi: account và consumed proof cùng thành công, không replay.
- Proof hết hạn trước bước chốt: không tạo account; account creation bị từ chối: không consume proof.

Tính đồng bộ chỉ có ý nghĩa với store RAM trong một process hiện tại. Khi làm persistence cần transaction/constraints tương ứng, không gọi đây là database transaction.

### 2. Điểm nghiệp vụ đã xác nhận lại: xóa Draft harvest

Một yêu cầu trước đây nói không xóa TREE_HARVESTS; code và hướng dẫn cuối hiện cho tác giả/chủ farm xóa Draft chưa từng Confirmed, cấm xóa Pending/Confirmed và Draft từng Confirmed. Đã hỏi lại; người dùng xác nhận ngày 2026-10-07: **chỉ cho xóa Draft chưa từng Confirmed**. Code và workflow hiện phù hợp.

Không cần sửa DELETE endpoint. Không mang cơ chế immutable/hash của Cultivation sang Harvest. Ghi chú trước đây cấm xóa mọi bản ghi được thay thế bởi quyết định xác nhận lại này.

### 3. Mô tả IoT cũ mâu thuẫn với triển khai hiện tại

Đã sửa mục 11/12 và checklist IoT của PROJECT_BUILD_SPEC.md:
- Device Active/Inactive/Maintenance; installed_at/cost bắt buộc theo quyết định trực tiếp, không đăng ký trước lắp.
- Sensor lowercase types, unit varchar(16); Actuator lowercase purposes watering/spraying/shared.
- Topic nhận duy nhất publish/station/{stationId} cho sensorRecords/short ACK; không dùng observation/sensor.
- Publisher hiện QoS0, non-retained, không offline replay; TransportAccepted không phải thực thi.
- Short ACK không có taskId, không xác nhận task ngay cả khi chỉ một task đang chờ. Full feedback/task correlation và physical-button state chưa được kiểm chứng theo protocol mới.

Các phần thiết kế tương lai về telemetry/tasks/control vẫn cần chốt lại trước code. Ba tài liệu nguồn IoT/ERD riêng của người dùng không bị sửa hoặc stage.

### 4. Dependency dev tooling cần một nhánh sửa riêng

Audit toàn dependency báo 2 critical entries do concurrently và shell-quote; đó là một đường dependency bị ảnh hưởng, không phải hai lỗi nghiệp vụ độc lập. Lockfile hiện shell-quote 1.9.0. [Advisory GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) liệt kê bản vá 1.11.0.

Không chạy npm audit fix --force hoặc nâng toàn bộ package trong nhánh Auth này. Đề xuất fix/dev-dependency-audit: cập nhật riêng dependency/override phù hợp, kiểm tra npm ci/start:dev và các checks. Runtime audit hiện không có cảnh báo; môi trường development vẫn cần khắc phục.

### 5. Hạn chế chưa triển khai, không phải lỗi đã được sửa

- Restart mất RAM nghiệp vụ, OTP/proof, proposals, grant và MQTT diagnostics; không có backup/migration/seed.
- MQTT diagnostics chỉ FIFO 200, không phải lịch sử telemetry.
- Chưa điều khiển bơm/van từ HTTP, chưa xác nhận thực thi, chưa có task/cultivation/realtime.
- MQTT station_id chỉ định danh; không phải auth token. Không sửa firmware/topic hoặc thêm token khi phần cứng hiện chưa hỗ trợ.
- Test DB readiness và loopback không thay thế integration test database thực/hardware thực.
- User ERD/spec/protocol và các sửa/xóa Postman/MQTT riêng còn ngoài commit; cần người dùng quản lý/publish riêng khi muốn, không stage toàn workspace.

## Thứ tự đề xuất

1. Xóa Draft harvest đã chốt đúng code; tiếp theo sửa dependency dev trên nhánh riêng, đối chiếu tài liệu còn lại trước khi dùng làm căn cứ triển khai.
2. **IOT_TELEMETRIES**: nối receiver hiện có sang domain, latest/history API, phân trang và quyền đọc; giai đoạn RAM nếu persistence chưa được chốt. Đây là bước đơn giản hơn, tạo dữ liệu để kiểm thử core hardware.
3. **ACTUATOR_TASKS và control**: sau khi chốt ACK/confirmation, timeout, rights, liên động và mapping bơm/van. Kiểm thử adapter lỗi và hardware thật có kiểm soát trước mở control.
4. **CULTIVATION_EVENTS**: chốt details, liên kết task/event, original assignment, lock/correction/hash chain. Không suy diễn task thành công từ publish hoặc short ACK.
5. **QR traceability**: truy xuất từ cây/thu hoạch và nhật ký đã được phép công khai; không tạo bảng QR riêng.
6. **AI_DISEASE_DIAGNOSTICS**, sau đó **CHATBOT_CONVERSATIONS/RAG**, khi có model/storage và tài liệu nguồn đủ rõ.

Persistence phải có buổi chốt riêng về schema/transactions/migrations/seed/retention trước khi chuyển store. Đề xuất chốt kế hoạch trước khi mở rộng web/mobile hoặc vận hành dài ngày với phần cứng; không tiếp tục coi RAM là giải pháp lưu dữ liệu thật. Web/mobile có thể bắt đầu phần Auth và danh mục khi API ổn định, nhưng hiện chưa triển khai.

## Những quyết định cần chốt trước từng module

### Telemetry — module nên thảo luận ngay

- Firmware đã kiểm chứng không cung cấp thời gian đo đáng tin cậy: measured_at dùng received_at khi thiếu timestamp, hay cần nullable/nguồn thời gian? Không sửa firmware ngầm.
- ERD telemetry.unit varchar(8), Sensor.unit/parser hiện nhận tối đa 16 ký tự: thống nhất giới hạn, không cắt chuỗi hoặc đổi unit lịch sử.
- Đề xuất quyền latest/history: chủ Farm, Admin, Manager đúng HTX và Farmer đúng scope assignment. Cần chốt riêng Farmer hết phân công được xem telemetry nào; không đánh đồng telemetry chung với nhật ký do chính Farmer tạo.
- Chốt lưu gói trùng, gói đến trễ, retention/giới hạn RAM, latest và threshold khi unit mismatch. Đề xuất không tự convert unit và không đánh giá threshold sai đơn vị.
- Chốt RAM trước hay mở phase MongoDB persistence riêng. Nhận message từ broker không tạo REST endpoint nhập telemetry công khai.

### Task/control

- ACK ngắn không xác định task/relay: chốt nghĩa Confirmed và timeout/unknown; không dựa vào serialize để khẳng định correlation.
- Cấu hình capability bơm Shared và hai van; không đoán IDs/hướng tưới–phun từ số phần cứng.
- Quyền owner/Farmer assignment assertCanWork, Manager/Admin; điều kiện Device Maintenance/offline/Actuator Inactive, chống gửi lặp.
- Trình tự bơm/van, có cho đồng thời tưới/phun không, fail-safe khi publish một phần/lỗi/reconnect/restart, duration và thao tác dừng. Phản hồi thực tế nào chứng minh thực thi?

### Cultivation

- ERD hiện chưa có assignment_id nhưng assertCanCorrect cần originalAssignmentId tin cậy. Cần chốt nơi lưu reference gốc trước code; phân công mới không kéo dài quyền sửa lịch sử cũ.
- Details theo từng action, nguồn manual/IoT, lock deadline/correction/hash chain và transaction/persistence.
- Không gắn hash/Pending 15 phút của Cultivation vào Harvest.

## Quy trình tái lập và tiếp tục

1. Đọc AGENTS.md nếu xuất hiện; git status/branch/log, tài liệu mốc này và handoff/notes/plan/build spec; đọc ERD và protocol hiện tại. Không in .env hoặc secret.
2. Fetch/check origin. Hiện origin/main chỉ đến c71820d; bắt đầu module từ nhánh fix đã review, kế thừa d10ebd2. Không branch từ main cũ rồi viết lại IoT; không merge/push khi chưa có yêu cầu rõ.
3. Chốt các câu hỏi của module; khi còn nghiệp vụ chưa rõ thì hỏi và chờ. Không gọi đề xuất trong tài liệu là quyết định đã được duyệt.
4. Tạo một branch/module; dùng cùng Nest dynamic module/store, business policy rõ, comment invariant khó. Persistence không tự triển khai.
5. Viết API, tests có ý nghĩa, guide API/quy trình/giới hạn, Postman JSON literal copy JWT/UUID/OTP bằng tay; cập nhật README/handoff/notes/plan.
6. Kiểm tra lint/typecheck/build/full tests; kiểm tra diff và stage đúng từng file của mình, giữ mọi thay đổi riêng .env/ERD/MQTT/Postman.
7. Commit local, báo kết quả và giới hạn. Push/PR/merge chỉ theo yêu cầu được phép ở session hiện hành.

Chạy từ root sau npm ci trên máy mới; không copy đè .env:

~~~powershell
npm run lint
npm run typecheck
npm run build
npm test
~~~

Regression Users có thể chạy sau compile tests (từ apps/api):

~~~powershell
node ../../node_modules/typescript/bin/tsc --outDir .test-dist
node --test --test-reporter=spec .test-dist/test/users.test.js
~~~

Full tests dùng fake providers, không cần SMS/email thật. DB integration riêng cần Docker và cấu hình local theo README; hardware thật cần bước thử riêng theo MQTT_COMMUNICATION_IMPLEMENTATION.md. Nhánh fix không thêm endpoint/env key/Postman request.

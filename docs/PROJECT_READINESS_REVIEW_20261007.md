# Rà soát nền tảng và lựa chọn công việc tiếp theo — 2026-10-07

Mốc code: **f20f6c1**, kế thừa toàn bộ module đến Telemetry. Nhánh rà soát: **docs/project-readiness-20261007**. Nhánh **feat/actuator-tasks** mới tạo cũng trỏ vào f20f6c1, chưa có module điều khiển. Báo cáo này bổ sung và thay thế phần đề xuất tiếp tục trong [lượt rà soát trước](PROJECT_REVIEW_20261007.md).

**Đề xuất: bắt đầu frontend web cho những luồng đã có API, đồng thời chuẩn bị thiết kế persistence.** ACTUATOR_TASKS đang tạm dừng trao đổi; không cần đợi luồng ACK để làm đăng nhập, quản lý Farm/Zone/Tree, duyệt yêu cầu, thu hoạch và màn hình giám sát cảm biến. Migration cần chốt thêm thiết kế lưu workflow; tạo bảng đơn thuần chưa giúp API lưu bền vững.

## 1. Phạm vi kiểm tra và bằng chứng

- Không tìm thấy AGENTS.md trong repo hoặc các thư mục cha D:/ và D:/PROJECT.
- Kiểm tra status, toàn bộ branch và log; đối chiếu AppModule, controllers/DTO, stores, các service/policy quan trọng, tests, README, handoff, notes, plan, build spec và hướng dẫn module.
- Parse ERD_DIAGRAM.xml hiện tại; đọc IOT_CORE_TABLES_SPEC và protocol MQTT đã kiểm chứng. Không sửa hoặc stage các tài liệu nguồn riêng này.
- Kiểm tra trực tiếp remote bằng `git ls-remote --heads origin main feat/devices-management feat/iot-telemetries feat/mqtt-communication`: main vẫn **c71820d74543cd7c67e447bc939b936fc8283f53**; ba nhánh feature được hỏi không có ref remote. Các remote-tracking refs khác chưa được refresh trong lượt này.
- Sinh OpenAPI từ AppModule với cấu hình giả, không đọc .env, không mở broker hoặc gửi email/SMS: **139 HTTP operations, 39 schemas, 0 operation có response schema**. Đếm operations gồm cả health, Auth, requests, notifications và endpoints hỗ trợ test; không phải 139 module.
- Chạy lại lint, typecheck, build và toàn bộ suite: **147/147 passed, 0 failed/cancelled/skipped**, thời gian suite khoảng 41 giây. Có MQTT.js TCP loopback; không phải ESP32/broker triển khai thực tế.
- Audit mới: runtime `--omit=dev` không có cảnh báo; toàn dependency còn **2 critical entries** trên đường dev `concurrently → shell-quote`.
- Parse thành công cả **18 collection Postman** hiện có. Hai collection legacy còn scripts; phần còn lại không có scripts ở collection/folder/request.
- Không chạy integration test đọc .env và kết nối database thật; không tạo migration/seed, không thử restart dữ liệu bền vững hoặc điều khiển phần cứng thật.

Tests xác nhận những trường hợp đã kiểm thử trong môi trường một process/RAM. Chưa có bằng chứng để kết luận hệ thống không còn lỗi hoặc sẵn sàng production.

## 2. Kiểm kê từ đầu đến hiện tại

| Phần | Đã có thực tế | Còn thiếu / giới hạn |
| --- | --- | --- |
| Foundation | NestJS, TypeScript, workspace API, validation, CORS, Swagger, health, Compose | Web/mobile/AI chưa có app; chưa CI/deployment hoàn chỉnh |
| Database | Shared pg Pool và MongoClient; readiness, shutdown; Mongo replica set trong Compose | Chưa business migrations, repositories, seed hoặc persistence |
| Auth / USERS | Password hash, JWT 15 phút, đăng ký Farmer/Manager, SMTP verification, Admin duyệt, SMS reset, revoke JWT theo user | Chỉ AUTH_MODE=mock development/test; chưa Auth production, refresh/logout server, hồ sơ/danh bạ Farmer; account/OTP/version RAM |
| COOPERATIVES | Admin tạo chưa Manager; duyệt Manager tạo/gắn HTX; Manager sửa phần cho phép qua email rồi SMS; cảnh báo 7 ngày, xét xóa 30 ngày | Lifecycle/request/notification RAM; xóa bị chặn khi còn tham chiếu; chưa schema bền vững cho metadata này |
| Danh mục | AGRICULTURAL_MATERIALS, FARMING_STANDARDS, STANDARD_MATERIALS; Admin ghi, người dùng Active đọc; unique cặp liên kết | Chưa lưu DB; không có quản lý tồn kho theo phạm vi đồ án |
| FARMS | Tạo/sửa duyệt đối ứng Admin–chủ; gia nhập thêm Manager duyệt; rời thông báo Manager | Request, approval, version và notification chưa có persistence |
| ZONES | Chủ ghi trực tiếp; Admin đề xuất/chủ duyệt; Manager đọc trong HTX; tiêu chuẩn mới Active; ngân sách diện tích kể cả Farm giảm | RAM; transaction/khóa diện tích khi có DB chưa triển khai |
| USERS_ZONES | Farmer nhận lời trước khi có quyền; khoảng [start,end), chặn giao nhau kể cả lời mời Pending; nhiều Zone/Farmer; giữ lịch sử | Chưa DB exclusion/transaction; quyền correction 15 ngày là helper cho module tương lai |
| TREES | Chủ ghi, Admin đề xuất/chủ duyệt; backend sinh DRN-UUID; Farmer đọc; snapshot lịch sử | Chưa chuyển Zone, public QR hoặc DB |
| TREE_HARVESTS | Draft/Pending/Confirmed; người tạo gửi/chủ xác nhận; chủ là tác giả auto-confirm; sửa đã Confirmed cần duyệt nội dung; nhập bù 7 ngày/grant Admin | Chỉ xóa Draft chưa từng Confirmed; proposal/grant/version/everConfirmed RAM, chưa thiết kế persistence đầy đủ |
| DEVICES | UUID khác station_id; station unique, immutable; Zone cố định; installed_at/cost bắt buộc; Active/Inactive/Maintenance | Metadata status không phải relay hay MQTT Online; chưa auth phần cứng, không tự thêm token |
| SENSORS | Unique (device_id,data_stream_id); immutable type/stream; unit string 1..16; cặp thresholds hợp lệ; quyền/proposals | Unit/threshold metadata không convert reading; chưa cảnh báo/tự động hóa |
| ACTUATORS | Unique (device_id,capability_id); immutable purpose watering/spraying/shared; bơm có capability riêng; quyền/proposals | Chỉ metadata, chưa bật/tắt từ HTTP hoặc trạng thái relay thực |
| MQTT | MQTT.js connect/reconnect/SUBACK/shutdown; parser station topic; mapping shared store; presence; diagnostics FIFO200; publisher nội bộ | Short ACK thiếu taskId/capability/final state; không chứng minh thực thi; chưa orchestration/safety |
| IOT_TELEMETRIES | Receiver → shared RAM FIFO10.000; latest/history, filter/pagination/quyền hiện tại; measured_at=packet arrival, received_at=store write | Chưa MongoDB; chưa SSE/WebSocket; Farmer hết assignment không xem lịch sử IoT |
| ACTUATOR_TASKS | Đã thảo luận mapping, liên động, trình tự, lỗi và timeout mỗi bước 10 giây | Chưa code/API/store/test; còn xử lý trạng thái sau restart và giới hạn ACK |
| CULTIVATION_EVENTS | Có helper quyền làm việc/correction theo assignment gốc; một số thiết kế dự kiến | Chưa module; details, reference assignment, lock/correction/hash-chain cần chốt |
| AI_DISEASE_DIAGNOSTICS | ERD và phạm vi dự kiến | Chưa model/inference, upload/storage, API hoặc module |
| CHATBOT_CONVERSATIONS | ERD và hướng RAG dự kiến | Chưa nguồn PDF được tích hợp, RAG, API hoặc module |
| QR traceability | tree_code và dữ liệu cây/thu hoạch đã có để xây tính năng | Chưa API public whitelist/trang QR; **không có bảng QR**; nhật ký Cultivation chưa có |
| Web / Mobile | apps/web và apps/mobile có .gitkeep | Chưa giao diện, API client, routing hoặc kiểm thử client |

ERD có **13 bảng PostgreSQL + 5 collections MongoDB**. Đủ 13 bảng đã có logic RAM; 1 collection Telemetry có logic RAM. Còn **4 module collection + tính năng QR**, ngoài các phần việc chung về persistence, clients, Auth production và deployment. Không dùng số 14/18 để suy ra phần trăm hoàn thành toàn đồ án.

## 3. Phát hiện cần xử lý

### P1 — persistence là khoảng trống lớn nhất đối với demo nhiều buổi

Restart mất account, HTX/Farm/Zone/Tree, phân công, thu hoạch, proposals, quyền nhập bù, token version và Telemetry. Migrations chỉ tạo schema; các service hiện vẫn dùng Map/Set nên sẽ không tự chuyển sang SQL/MongoDB.

Các check/commit đồng bộ đang an toàn trong một process không tương đương database transaction. Khi chuyển sang repository async phải giữ transaction, unique và khóa cạnh tranh tại bước chốt. Không chạy nhiều API instances dùng RAM rồi giả định chúng chia sẻ quyền/dữ liệu.

### P1 — cảnh báo dev dependency vẫn chưa được xử lý

Audit mới tiếp tục báo concurrently và shell-quote là hai entries của một đường dependency. Lockfile hiện có shell-quote 1.9.0; advisory công bố bản vá từ 1.11.0. Xử lý ở nhánh riêng, kiểm tra install/start:dev và checks sau khi chọn bản tương thích; không chạy blanket `npm audit fix --force`. Đây là finding tooling, chưa chứng minh một exploit trong API hiện tại. [Advisory chính thức](https://github.com/advisories/GHSA-pqg4-j6r4-53mv).

### P2 — tài liệu hiện trạng và thiết kế tương lai còn lẫn nhau

- README đoạn MQTT còn nói Telemetry history chờ thảo luận, mặc dù phần đầu đã ghi hoàn tất. Đã chỉnh đoạn này trong lượt rà soát.
- Swagger description trong application.ts chưa nhắc API Telemetry latest/history đang có. Đã ghi finding; chưa đổi source trong nhánh tài liệu này.
- PROJECT_BUILD_SPEC mục MQTT và các guide gốc còn mô tả phạm vi commit MQTT trước Telemetry. Đọc phần cập nhật mới nhất trước; không đem các đoạn cũ làm sơ đồ hiện trạng.
- ERD Telemetry.unit vẫn varchar(8), code/thiết kế đã chốt dùng raw unit tối đa16. Cần người dùng đồng bộ ERD trước Mongo validator/persistence; không tự cắt unit hoặc sửa file riêng.
- Coops createdAt/version, proposals/snapshots/notifications, harvest everConfirmed/grant và token versions hiện nằm ngoài 13 cấu trúc nghiệp vụ. Chưa có quyết định lưu bền vững chúng; không được bỏ qua khi lập migration.

### P2 — Swagger có request schemas nhưng thiếu response schemas

Kết quả sinh spec hiện có 139 operations/39 schemas và không operation nào khai báo schema response. API và guide có dữ liệu trả về; Swagger chưa đủ để tự sinh client có type đầy đủ. Trước frontend, xác định response types cho các endpoint của đợt đầu, ghi ví dụ HTTP và error semantics; không cần refactor tất cả 139 endpoints ngay.

### P2 — UI chọn Farmer chưa được API hỗ trợ đầy đủ

USERS hiện có pending-managers/cooperatives/approve/reject, không có danh bạ Farmer hoặc API tìm assignee cho dropdown. Không thể tuyên bố frontend phân công đã bỏ nhập UUID thủ công nếu backend chưa cung cấp người dùng được phép chọn. Farm/Zone/Tree/Device UUID có thể lấy từ các list API hiện có và giữ nội bộ UI.

API chọn Farmer cần chốt quyền đọc, dữ liệu trả về và tiêu chí tìm kiếm trước triển khai. Không mở toàn bộ phone/email của người dùng để giải quyết nhanh dropdown. Việc này không chặn frontend đăng nhập, danh mục, các danh sách hiện có và màn hình đọc Telemetry.

### P2 — hai collection Postman legacy còn scripts

Auth-Local-Test có 11 request events; Smart-Durian-Farm có 4. Các collection module mới, Users/Twilio đang có đều parse được và không scripts. Đánh dấu hai collection legacy; khi dùng chỉ dẫn mới ưu tiên JSON literal/copy JWT/UUID/OTP bằng tay. Chưa sửa các file Postman trong lượt rà soát, đặc biệt giữ các file người dùng đã sửa.

### Giới hạn cần giải thích đúng khi trình bày

- DB readiness chỉ chứng minh DB đáp ứng probe, chưa chứng minh business persistence.
- ACK short không có correlation: tuần tự hóa giúp giảm mơ hồ nhưng không biến nó thành phản hồi physical state đáng tin cậy; ACK trễ/trùng vẫn có thể bị nhầm. Quyết định timeout **10 giây mỗi bước** đã chốt, nhưng **chưa có timer điều khiển hoặc ACTUATOR_ACK_TIMEOUT_MS trong .env/.env.example** ở thời điểm rà soát. Lượt trước bị ngắt sau tạo branch, chưa ghi cấu hình.
- Trạng thái startup của bơm/van còn phải chốt khi quay lại module điều khiển. Tạm dừng module này theo yêu cầu mới; không mặc định hardware đã tắt sau restart.
- Farmer hết phân công vẫn có lịch sử phân công/thu hoạch của mình theo policy riêng, nhưng **không có quyền lịch sử IoT**.
- Unit raw cần hiển thị kèm timestamp; giá trị latest không chứng minh hardware còn Online. MQTT stale mặc định 30 phút là ngưỡng presence, không phải timeout ACK.
- FIFO10.000 là toàn backend, không mỗi Device. Ví dụ 1 Device × 3 streams × packet15 giây giữ khoảng 13,9 giờ; 10 Devices tương đương khoảng 1,39 giờ nếu cùng cadence. Đây là ước tính, không bảo đảm thời gian retention.
- Không phát hiện regression làm fail suite hiện tại trong lượt này. Chưa đo coverage toàn phần, tải lớn, DB contention, hardware/live MQTT, hoặc production security.

## 4. So sánh hướng đi tiếp

| Hướng | Bắt đầu được? | Giá trị | Điều kiện / giới hạn |
| --- | --- | --- | --- |
| Frontend web cho API ổn định | **Có; ưu tiên tạo kết quả demo sớm** | Thao tác bằng giao diện, khám phá lỗi luồng liên vai trò, trình bày trực quan | Data vẫn mất khi restart; chưa mở nút bơm/van; bổ sung hợp đồng response của các API dùng trước |
| Migration / persistence | **Có thể chuẩn bị ngay; code sau buổi chốt riêng** | Dữ liệu còn sau restart, demo nhiều buổi, nền cho triển khai | Chốt nơi lưu workflows/metadata, transaction/constraint, seed/reset và Auth mode; không chỉ tạo 13 bảng |
| Tài liệu / sơ đồ hiện trạng | **Có; đã tạo trong lượt này** | Nền cho luận văn và bàn giao session mới | Gắn mỗi sơ đồ với source/tests; dùng từ “đã kiểm thử” đúng phạm vi, không tuyên bố chắc chắn mọi tình huống |
| Cultivation | Còn quyết định nghiệp vụ | Nhật ký canh tác và đầu vào QR | Details, assignment gốc, locking/correction/hash-chain; dễ tăng phạm vi khi đang gấp |
| QR giới hạn cây/thu hoạch | Có thể thảo luận riêng | Trang công khai dễ trình bày | Chốt whitelist/quyền công khai; chưa có truy xuất nhật ký canh tác đầy đủ |
| AI/RAG hoặc mobile riêng | Để sau core/demo web và persistence | Mở rộng phạm vi đồ án | Model/dữ liệu, upload/storage và thêm client sẽ tăng công việc hiện tại |

Ưu tiên trên là đánh giá dựa trên code và mục tiêu giữ tiến độ, không phải một thay đổi nghiệp vụ đã được duyệt. React + TypeScript + Vite phù hợp hướng React SPA đã ghi trong spec; cần chọn routing/data fetching khi triển khai. [React hướng dẫn dựng app](https://react.dev/learn/build-a-react-app-from-scratch), [Vite hướng dẫn chính thức](https://vite.dev/guide/).

## 5. Quy trình đề xuất và tài liệu đi kèm

Đọc [kế hoạch từng đợt](NEXT_DELIVERY_PLAN.md) và [sơ đồ hiện trạng](CURRENT_SYSTEM_DIAGRAMS.md). Một đợt frontend ban đầu nên chốt ở đăng nhập/phiên, layout theo role, danh mục và danh sách Farm/Zone/Tree đang có; sau đó thêm Telemetry chỉ đọc và duyệt/thu hoạch. Không tạo màn hình chức năng tương lai rồi xem như module đã xong.

Chuẩn bị persistence song song về tài liệu: lập ma trận field/null/unique/relationship theo ERD và quyết định cuối, liệt kê toàn bộ RAM metadata cần giữ; duyệt thiết kế rồi chuyển từng nhóm service sang repository. Đợt đầu USERS/HTX/danh mục có thể độc lập điều khiển MQTT, nhưng phải giữ transaction duyệt Manager và vòng đời HTX.

Không hứa ngày hoàn tất trước khi biết deadline và phạm vi hội đồng yêu cầu. Nghiệm thu theo luồng demo có kết quả quan sát được, không theo số file được tạo.

## 6. Tái lập kiểm tra

Trên máy phát triển bình thường, sau `npm ci` từ root và giữ .env hiện có:

```powershell
git status --short
git branch -avv
git log -12 --oneline
npm run lint
npm run typecheck
npm run build
npm test
npm audit --omit=dev
npm audit
```

Trong sandbox Windows của lượt này, npm shim gặp EPERM khi resolve C:/Users/ADMIN. Đã chạy trực tiếp các entrypoints tương đương từ apps/api, tất cả exit0:

```powershell
node ../../node_modules/eslint/bin/eslint.js src test integration
node ../../node_modules/typescript/bin/tsc --noEmit
node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json
node ../../node_modules/typescript/bin/tsc --outDir .test-dist
node --test --test-concurrency=2 --test-reporter=spec .test-dist/test
```

Audit/remote lookup chỉ đọc chạy với network permission. Không push/merge, không chỉnh .env hoặc business source, không phục hồi file người dùng đã xóa. Kết quả 147 tests áp dụng code f20f6c1; nhánh này chỉ bổ sung tài liệu.

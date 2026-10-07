# SMART FARM DURIAN --- PROJECT BUILD SPECIFICATION

Telemetry hoàn tất 2026-10-07 trên **feat/iot-telemetries** từ a656773 (kế thừa e1ad1a0/MQTT d10ebd2). Shared RAM store FIFO10.000 readings, nhận mọi packet hợp lệ theo chu kỳ hardware15 giây; GET latest/history có filter stream/received_at [from,to) và pagination. Farmer phải có assignment Accepted đang hiệu lực, hết phân công mất cả latest/history; chỉ xem readings trong khoảng assignment hiện tại. measured_at lúc backend nhận/đọc MQTT, received_at lúc ghi RAM, raw unit tối đa16; không sửa firmware/protocol/.env hoặc persistence. **147/147 tests + lint/typecheck/build đạt**, gồm10 domain/HTTP/fake tests và1 MQTT.js TCP -> App -> Telemetry -> HTTP mới; npm test giới hạn2 files đồng thời. Postman20 requests literal, đọc [IOT_TELEMETRIES_IMPLEMENTATION.md](IOT_TELEMETRIES_IMPLEMENTATION.md) và [thiết kế cuối](IOT_TELEMETRIES_WORKFLOW_DESIGN.md). Còn4 collections chưa có module + QR không có bảng; tiếp theo thảo luận ACTUATOR_TASKS/safety, persistence riêng. Các ghi chú chờ Telemetry/136 tests phía dưới là lịch sử. Nhánh chỉ local, không push/merge; giữ file riêng.

Rà soát 2026-10-07: 13 bảng đã có nghiệp vụ RAM, 5 collections chưa triển khai; QR là tính năng không có bảng. 136/136 tests + lint/typecheck/build sau sửa registration proof boundary. Thứ tự và câu hỏi cần chốt theo [PROJECT_REVIEW_20261007.md](PROJECT_REVIEW_20261007.md); telemetry/task/control dưới đây chưa phải quyết định đã duyệt.

MQTT communication hoàn tất 2026-10-07 trên **feat/mqtt-communication**, base metadata **939c350** (feat/iot-core-metadata-update, 119 tests). Kết nối MQTT.js/reconnect/SUBACK/shutdown, parser station-topic, shared Device/Sensor mapping, presence và diagnostics API chỉ đọc đã có. **134/134 tests**, gồm 14 fake/unit/HTTP +1 MQTT.js broker TCP localhost; lint/typecheck/build đạt. ACK ngắn không xác nhận task/relay; publisher/builder chỉ adapter nội bộ, không HTTP control/automation. Diagnostic FIFO200 RAM, chưa IOT_TELEMETRIES/ACTUATOR_TASKS/persistence. .env.example thêm MQTT keys mặc định disabled; .env thật và file riêng giữ nguyên. Đọc [MQTT_COMMUNICATION_IMPLEMENTATION.md](MQTT_COMMUNICATION_IMPLEMENTATION.md), Postman MQTT 12 request không scripts/env. Hai nhánh mới chỉ local, chưa push/merge. Các ghi chú module cũ phía dưới là lịch sử, enum/next-step hiện tại theo hai guide IoT mới.

Các phần IoT/control/collections thiết kế dự kiến bên dưới chưa được chốt lại theo hardware mới; contract communication hiện hành là topic publish/station/{stationId}, không observation/sensor, ACK không taskId, không suy ra Executed. Không triển khai các domain dự kiến đó chỉ từ mô tả cũ.

Cập nhật ưu tiên 2026-10-07: ba tài liệu ERD_DIAGRAM.xml, IOT_CORE_TABLES_SPEC.md, MQTT_HARDWARE_PROTOCOL_VERIFIED.md thay thế các mô tả IoT cũ bên dưới. Device Maintenance/last_seen_at; installed_at/cost vẫn NOT NULL theo câu trả lời trực tiếp. Sensor lowercase type, unit varchar(16); Actuator lowercase purpose. Topic telemetry theo station, numeric streams, short ACK không taskId; không xác nhận tasks/relay từ ACK. Xem IOT_METADATA_UPDATE_IMPLEMENTATION.md. Persistence và hai collections IoT chưa được chốt.

> Tài liệu này được dùng làm **context/instruction chính cho Codex** để
> bắt đầu xây dựng dự án. Khi chạy Codex, đặt file này cùng với file
> **`Sơ đồ ERD.xml`** (diagrams.net/draw.io).
>
> **Nguyên tắc:** ERD là nguồn sự thật về schema hiện tại. Tài liệu này
> bổ sung business rules, kiến trúc, IoT protocol và thứ tự triển khai.
> Nếu tài liệu và ERD có khác biệt nhỏ về tên field, ưu tiên **ERD mới
> nhất**, ngoại trừ các quyết định được ghi rõ là bắt buộc trong tài
> liệu này.

------------------------------------------------------------------------

## 1. Project overview

Tên đề tài:

**Hệ thống quản lý, giám sát và truy xuất nguồn gốc sầu riêng thông
minh, tích hợp IoT và AI**

Đây là đồ án cá nhân. Hệ thống cần hỗ trợ:

-   Quản lý HTX, nông trại, khu vực và cây sầu riêng.
-   Quản lý Farmer/Manager/Admin và quyền truy cập.
-   Theo dõi dữ liệu cảm biến IoT theo thời gian.
-   Điều khiển tưới nước và phun thuốc qua MQTT.
-   Nhật ký canh tác có cơ chế khóa sau 15 phút và lịch sử chỉnh sai bất
    biến.
-   Quản lý tiêu chuẩn canh tác và vật tư.
-   Quản lý các vụ thu hoạch theo từng cây.
-   Truy xuất nguồn gốc bằng QR của cây.
-   AI nhận diện bệnh lá sầu riêng.
-   Chatbot/RAG về kiến thức chăm sóc sầu riêng ở giai đoạn sau.

Mục tiêu là một hệ thống **đủ tốt cho graduation thesis nhưng vẫn thực
tế để một developer hoàn thành**. Không over-engineer.

------------------------------------------------------------------------

## 2. Expected applications

Repository nên tổ chức theo monorepo đơn giản:

``` text
smart-farm-durian/
├── apps/
│   ├── api/              # Backend REST API + MQTT
│   ├── web/              # React web
│   └── mobile/           # React Native Android-first
├── ai/                   # AI training/inference/RAG later
├── docs/
│   ├── PROJECT_BUILD_SPEC.md
│   └── Sơ đồ ERD.xml
├── docker-compose.yml
├── .env.example
└── README.md
```

Không cần microservices. Bắt đầu bằng **modular monolith**.

------------------------------------------------------------------------

## 3. Technology direction

Ưu tiên stack TypeScript để giảm context switching:

### Backend

-   Node.js + TypeScript.
-   NestJS phù hợp cho modular backend.
-   REST API.
-   PostgreSQL cho relational/core management data.
-   MongoDB cho dữ liệu event/IoT/task có tính linh hoạt hoặc volume
    cao.
-   MQTT client cho giao tiếp hardware.
-   JWT authentication.
-   Password phải hash, không lưu plaintext.
-   Swagger/OpenAPI cho API documentation.

### Web

-   React.
-   **Không dùng Next.js.**
-   Vite + TypeScript.
-   Web chủ yếu dành cho Admin/Manager và dashboard.

### Mobile

-   React Native.
-   Android là ưu tiên đầu tiên.
-   Mobile tập trung vào Farmer: khu vực được giao, realtime IoT, điều
    khiển actuator, nhật ký canh tác, AI leaf diagnosis.

### AI

-   Training trên Google Colab.
-   Model inference có thể tích hợp sau khi core system ổn định.
-   Dataset dự kiến: *Durian Leaf Image Dataset of Common Diseases in
    Vietnam*, 2,595 ảnh, 6 classes.
-   RAG/FAISS làm ở phase sau khi có bộ tài liệu PDF.

------------------------------------------------------------------------

## 4. Database authority

Codex phải **đọc trực tiếp `Sơ đồ ERD.xml` trước khi tạo database
entities/models/migrations**.

Không tự ý: - thêm table/collection; - xóa field; - đổi tên field; - đổi
relationship; - normalize lại schema; - thêm abstraction chỉ vì "best
practice".

Nếu thấy điểm bất thường trong ERD, ghi lại trong
`docs/IMPLEMENTATION_NOTES.md` trước khi thay đổi.

### Databases

**PostgreSQL** chứa các bảng core relational, bao gồm các entity trong
ERD như:

-   USERS
-   COOPERATIVES
-   FARMS
-   USERS_ZONES
-   ZONES
-   TREES
-   DEVICES
-   SENSORS
-   ACTUATORS
-   FARMING_STANDARDS
-   STANDARD_MATERIALS
-   AGRICULTURAL_MATERIALS
-   TREE_HARVESTS

**MongoDB** chứa các collection:

-   CULTIVATION_EVENTS
-   IOT_TELEMETRIES
-   ACTUATOR_TASKS
-   AI_LEAF_DIAGNOSIS (phase sau)
-   CHATBOT_CONVERSATIONS (phase sau)


------------------------------------------------------------------------

## 5. Authentication and roles

Login bằng **phone number + password**, không dùng username làm login
identifier.

Roles:

``` text
Farmer
Manager
Admin
```

`is_owner` là thuộc tính riêng, không phải role.

Business scope:

-   **Admin**: quản trị toàn hệ thống.
-   **Manager**: quản lý trong phạm vi HTX/farm được phép.
-   **Farmer**: làm việc với các Zone được phân công.
-   **Owner**: quyền sở hữu được thể hiện qua dữ liệu Farm và
    `is_owner`; owner không mặc định có quyền tạo nhật ký.
-   Một user có thể là Farmer đồng thời là owner.

Chỉ Farmer được tạo cultivation event và chỉ khi Farmer được phân công
vào Zone liên quan.

Manager/Admin chỉ đọc cultivation logs.

### Quyết định Farm/HTX cập nhật ngày 2026-10-02

- Admin tạo/sửa Farm phải được chủ Farmer chấp nhận; chủ Farmer tạo/sửa phải được Admin duyệt. is_owner chỉ thành true khi Farm được chấp nhận, không nhận từ frontend.
- Farm có thể chưa thuộc HTX. Gia nhập cần duyệt đối ứng như trên **và** Manager HTX chấp thuận; rời giữ duyệt đối ứng, chỉ thông báo Manager sau khi hoàn tất, không cần Manager duyệt.
- Một Manager quản lý một HTX. Manager đọc Farm thuộc HTX mình và xét gia nhập; không tạo/sửa Farm.
- Yêu cầu duyệt và thông báo hiện lưu riêng trong bộ nhớ, chỉ áp dụng Farm sau khi đủ duyệt. Thiết kế nơi lưu lâu dài phải chốt ERD trước khi tạo bảng. Xem FARMS_IMPLEMENTATION.md và MODULE_HANDOFF.md.
- Cập nhật 2026-10-04: chủ Farmer tạo/sửa Zone trực tiếp; Admin đề xuất cần chủ duyệt. Manager đọc trong HTX. Chủ phân công Farmer; Admin đề xuất phân công cần chủ duyệt; Farmer nhận phân công phải chấp nhận. Giữ lịch sử riêng và correction của chính tác giả trong 15 ngày từ end_date, không tạo nhật ký/điều khiển sau hết hạn. Xem ZONES_IMPLEMENTATION.md và MODULE_HANDOFF.md.
- HTX độc lập: Admin tạo được HTX chưa có Manager/sửa trực tiếp. Gắn Manager giữ luồng USERS approve. Manager sửa tên HTX/director/địa chỉ/số liên hệ HTX mình sau email tài khoản rồi SMS điện thoại tài khoản; chứng nhận chỉ Admin sửa. Cảnh báo Admin ngày 7, xóa ngày 30 nếu vẫn chưa có Manager và không tham chiếu nghiệp vụ; có liên kết thì giữ và cảnh báo. Metadata hiện trong bộ nhớ, không bổ sung schema. Xem COOPERATIVES_IMPLEMENTATION.md.

------------------------------------------------------------------------

## 6. Zone assignment

Một Farmer có thể phụ trách nhiều Zone.

`USERS_ZONES` giữ lịch sử phân công bằng:

``` text
start_date
end_date
```

Tại một thời điểm, một Zone chỉ có **một Farmer active**.

Khi kết thúc phân công, không xóa record cũ; cập nhật `end_date`.

Interval dùng [start_date, end_date), end_date null nghĩa là chưa định hạn.

Cập nhật 2026-10-04: module USERS_ZONES trong bộ nhớ đã có lời mời/chấp thuận,
kết thúc và lịch sử snapshot. Chủ kết thúc trực tiếp; Admin đề xuất End cần chủ duyệt.
Farmer chỉ đọc lịch sử của mình sau hết hạn, correction tối đa 15 ngày từ end_date,
không tạo nhật ký mới/điều khiển sau hết phân công. Correction policy/assertions đã có;
endpoint Cultivation/IoT chưa triển khai. Xem ASSIGNMENTS_IMPLEMENTATION.md.
Persistence cần exclusion constraint/transaction chống giao nhau của khoảng thời gian;
partial unique index chỉ cho record chưa kết thúc không đủ bảo vệ lịch đã hẹn.
Chưa tạo constraint/bảng ở giai đoạn bộ nhớ hiện tại.

------------------------------------------------------------------------

## 7. Tree and traceability

Trees đã triển khai in-memory ngày 2026-10-04: chủ Farmer tạo/sửa metadata cây trực tiếp; Admin đề xuất tạo/sửa cần đúng chủ duyệt. Manager chỉ đọc trong HTX mình, Farmer nhận phân công chỉ đọc Zone Accepted đang hiệu lực. Backend sinh tree_code DRN-UUID bất biến cùng id/zone_id; không chuyển Zone/hard-delete. Dead/Removed được khôi phục Active để sửa nhầm, giữ snapshot metadata trước/sau và version; chủ sửa trong khi chờ làm đề xuất Admin lỗi thời. Xem TREES_IMPLEMENTATION.md. Lịch sử metadata cây không thay thế Cultivation/assignment history; QR public chưa triển khai, Harvests hiện có trên nhánh kế thừa. Không thêm bảng/migration/seed trong batch này.

Mỗi Tree có `tree_code` unique.

QR không cần table riêng.

QR encode public route dạng:

``` text
/trace/{tree_code}
```

Trang public traceability có thể hiển thị:

-   thông tin cây;
-   farm/zone liên quan;
-   tiêu chuẩn canh tác;
-   cultivation history đã LOCKED;
-   lịch sử thu hoạch;
-   dữ liệu IoT được chọn/tổng hợp nếu cần.

Không public:

-   MQTT credentials;
-   auth token;
-   internal secrets;
-   raw infrastructure configuration.

Không hard-delete Tree khi cây chết/bị loại bỏ. Dùng `status` theo ERD
để giữ lịch sử.

------------------------------------------------------------------------

## 8. Harvest model

Cập nhật RAM 2026-10-05: một TREE_HARVESTS theo ERD mới, created_by và status Draft/Pending/Confirmed, updated_by/updated_at nullable. Chủ nhập trực tiếp; Farmer khác cần phân công hiệu lực. Người tạo gửi/chủ xác nhận, chủ là tác giả thì gửi auto-confirm; lần đầu update fields null. Khóa từng bản ghi, không khóa batch; batch dùng chung nhiều cây cùng Zone/ngày, không UNIQUE batch_code; chống trùng tree_id + harvest_date. Sửa Confirmed qua proposal RAM: Manager HTX hoặc Admin cho Farm độc lập duyệt/áp dụng ngay, ghi actual editor/time; từ chối giữ dữ liệu. Tác giả hết phân công đọc riêng/gửi reason, chủ chuẩn bị sửa. Không xóa bản ghi đã từng Confirmed, không quyền 24 giờ/hash/PENDING 15 phút. Nhập bù 7 ngày lịch Việt Nam hoặc grant Admin đúng người/Zone/ngày/hạn; Dead/Removed chỉ nhập ngày cũ. Xem TREE_HARVESTS_IMPLEMENTATION.md và workflow design; metadata RAM, chưa tạo bảng/migration/seed.

`TREE_HARVESTS` là lịch sử thu hoạch của từng Tree.

Một Tree có nhiều harvest records.

Giữ các field trong ERD, đặc biệt:

``` text
season_name
harvest_date
fruit_count
total_weight_kg
batch_code
created_at
```

Ý nghĩa:

-   `season_name`: tên vụ, ví dụ "Đông-Xuân", "Hè-Thu".
-   `harvest_date`: ngày thực tế thu hoạch.
-   `created_at`: thời điểm record được tạo trong hệ thống.

Không chuyển các field harvest vào TREES.

------------------------------------------------------------------------

## 9. Farming standards and materials

`FARMING_STANDARDS` gắn với **Zone**, không gắn trực tiếp Farm.

Một Farm có nhiều Zone và các Zone có thể áp dụng tiêu chuẩn khác nhau.

`STANDARD_MATERIALS` là bảng bridge N:N giữa:

``` text
FARMING_STANDARDS
AGRICULTURAL_MATERIALS
```

`AGRICULTURAL_MATERIALS` chỉ là master data phục vụ tiêu chuẩn/chăm sóc.

**Không xây inventory/warehouse/stock management.**

------------------------------------------------------------------------

## 10. Cultivation events --- critical business rules

Đây là phần quan trọng của thesis.

Collection:

``` text
CULTIVATION_EVENTS
```

Dùng MongoDB `_id: ObjectId` làm identifier chính.

**Không tạo thêm `event_id` riêng.**

Correction links dùng ObjectId:

``` text
reference_event_id
root_event_id
```

### Target

Một event có thể áp dụng cho:

``` text
target_type = Zone | Tree
target_id
```

Ví dụ:

-   tưới toàn Zone → target Zone;
-   phun thuốc cho một cây bệnh → target Tree.

### Lifecycle

Khi Farmer tạo event:

``` text
status = PENDING
created_at = now
lock_at = created_at + 15 minutes
locked_at = null
```

Trong 15 phút PENDING:

``` text
EDIT   = allowed
DELETE = allowed
```

Sau deadline:

``` text
status = LOCKED
```

LOCKED event:

``` text
EDIT   = forbidden
DELETE = forbidden
```

Backend **không được chỉ tin vào status**.

Mọi edit/delete phải kiểm tra đồng thời:

``` text
status == PENDING
AND
now < lock_at
```

Như vậy nếu background job cập nhật status chậm, event quá hạn vẫn không
thể bị sửa.

### Correction

Nếu Farmer phát hiện sai sau khi event đã LOCKED:

-   Không sửa event cũ.
-   Không xóa event cũ.
-   Tạo một event mới.
-   Event mới có `is_correction = true`.
-   `reference_event_id` trỏ tới event được sửa trực tiếp.
-   `root_event_id` trỏ tới event gốc đầu tiên.
-   lưu `correction_reason`.
-   correction event cũng trải qua PENDING → LOCKED như event bình
    thường.

Không giới hạn số lần correction trong cửa sổ còn quyền. Chỉ tác giả được correction;
sau hết phân công, hạn tối đa 15 ngày từ end_date của phân công gốc, không gia hạn bằng
phân công mới. Quyền correction không cho phép tạo nhật ký mới/điều khiển sau hết hạn.

### Hash chain

Chỉ event đã LOCKED mới tham gia hash chain.

PENDING:

``` text
previous_hash = null
hash = null
```

Khi LOCKED:

``` text
hash = SHA-256(canonical_event_data + previous_hash)
```

Không hash trực tiếp raw Mongo document hoặc JSON.stringify không ổn
định.

Cần tạo canonical serialization với thứ tự field xác định.

Hash chain là **tamper-evident mechanism**, không gọi đây là blockchain.

Mục đích:

1.  Business rule ngăn chỉnh sửa event LOCKED.
2.  Hash giúp phát hiện dữ liệu lịch sử bị can thiệp trái phép ở DB.

------------------------------------------------------------------------

## 11. IoT relational metadata

Trạng thái triển khai hiện hành 2026-10-07 theo [IOT_METADATA_UPDATE_IMPLEMENTATION.md](IOT_METADATA_UPDATE_IMPLEMENTATION.md). Các guide Devices/Sensors/Actuators cũ đã được người dùng xóa; không phục hồi. Store dùng RAM, chưa tạo business schema/migrations/seed.

### DEVICES

- DEVICES.id là UUID nội bộ; station_id là mã ESP32 UNIQUE NOT NULL, bất biến, không phải secret/auth token.
- Device thuộc một Zone, một Zone có thể có nhiều Device; không chuyển Zone. Cây chịu ảnh hưởng qua Zone, không có TREES.device_id/hạn mức cố định.
- Chỉ đăng ký khi đã lắp: installed_at và cost bắt buộc NOT NULL theo quyết định trực tiếp; không đăng ký trước lắp.
- Status metadata Active/Inactive/Maintenance, khác connectivity MQTT. last_seen_at nullable chỉ receiver cập nhật, không tăng version/audit metadata mỗi message.
- Chủ Farm tạo/sửa trực tiếp; Admin đề xuất cần chủ duyệt; Manager HTX/Farmer assignment Accepted hiệu lực chỉ đọc đúng scope. Dùng chung module/store Farm/Zone/Assignment.

### SENSORS

- sensor_type air_temperature/air_humidity/soil_moisture bất biến.
- Composite unique (device_id UUID, data_stream_id), kể cả Inactive; id/Device/stream không đổi. Numeric hardware stream chuyển thành chuỗi metadata, không dùng sensor_id làm telemetry FK.
- Unit cấu hình varchar(16), được sửa, thay enum %/oC cũ; không tự convert ngưỡng/đơn vị dữ liệu đo. Threshold cùng null hoặc đủ hai min < max.
- Quyền, proposals, snapshot/version và shared stores như Devices. Không suy ra nghĩa stream302/303.
- Telemetry unit trong ERD hiện varchar(8): cần chốt thống nhất trước collection, không cắt chuỗi ngầm.

### ACTUATORS

- ACTUATORS.id UUID, device_id UUID tham chiếu DEVICES.id; capability_id là numeric taskingCapabilityId riêng của phần cứng.
- Unique (device_id, capability_id), kể cả Inactive. id/Device/capability/purpose bất biến, không chuyển Device/hard delete.
- Purpose lowercase watering/spraying/shared. Bơm chung có capability riêng, mỗi van có capability riêng và cần lệnh riêng; không đoán mapping IDs. Khi dùng bơm riêng, bơm và van có thể cùng purpose; purpose không unique.
- Chỉ sửa name/status; status Active/Inactive là metadata khả dụng, không phải On/Off/online.
- Chủ tạo/sửa trực tiếp, Admin proposal cần chủ duyệt, Manager/Farmer đọc đúng scope. Approval recheck uniqueness/context/version/capacity.
- Metadata không tự điều khiển bơm/van hoặc chốt recipe/fail-safe/đồng thời tưới–phun.

------------------------------------------------------------------------

## 12. MQTT protocol

Contract hiện hành theo tài liệu người dùng MQTT_HARDWARE_PROTOCOL_VERIFIED.md và [MQTT_COMMUNICATION_IMPLEMENTATION.md](MQTT_COMMUNICATION_IMPLEMENTATION.md). Không tự thay firmware, topics hoặc thêm auth_token.

### Nhận và ánh xạ

Backend subscribe publish/station/+; firmware trả sensorRecords hoặc short ACK trên publish/station/{stationId}. Topic quyết định station, rồi lookup DEVICES.station_id để lấy Device UUID; tham chiếu domain dùng device_id, không dùng station_id làm FK. Không subscribe observation/sensor hoặc đoán ý nghĩa stream302/303.

Parser kiểm tra topic/payload/identity và metadata đăng ký, từ chối retained packet, unknown station và dữ liệu sai định dạng. Telemetry giữ nguyên raw unit; mismatch là diagnostics, không đổi unit lịch sử. Device/Sensor phải Active để nhận reading; không suy status metadata từ presence.

Receiver cập nhật last_seen_at theo thời gian server; connectivity Unknown/Online/Offline tính theo tuổi message hợp lệ, mặc định stale30 phút, khác trạng thái kết nối broker. Diagnostics FIFO200 RAM và API chỉ đọc đã có; chưa có telemetry history/MongoDB collection.

### Gửi

Adapter nội bộ gửi subscribe/station/{stationId}; builder giữ cấu trúc targets[].taskId/taskingCapabilityId và taskingParameters theo protocol. Lệnh numeric 0=OFF, 1=ON; bơm và van có capability/lệnh riêng. Publisher hiện QoS0, non-retained, không xếp offline queue để replay điều khiển cũ.

TransportAccepted chỉ là kết quả chấp nhận gửi của adapter, không phải broker/hardware execution confirmation. Chưa có HTTP control, task workflow, automation hoặc phối hợp an toàn bơm–van.

### ACK và feedback

Short ACK không có taskId; không correlate/xác nhận task hoặc relay, ngay cả khi chỉ một task pending hoặc gửi tuần tự. Full ACK có taskId và phản hồi physical-button/state chưa được tài liệu protocol mới kiểm chứng, không coi là capability hiện có.

ACTUATOR_TASKS status/timeout/confirmation và fail-safe cần thảo luận trước triển khai. Phần thiết kế collection/control phía dưới là dự kiến, không được dùng để vượt hạn chế feedback phần cứng hiện tại.

------------------------------------------------------------------------

## 13. IoT telemetry storage

Triển khai 2026-10-07 trên feat/iot-telemetries: RAM FIFO10.000 readings, GET /api/telemetry/devices/:id/latest và /history; filter stream/received_at [from,to), max100/trang. measured_at là lúc backend nhận/đọc packet, received_at là lúc ghi store; không đổi firmware hoặc coi RAM là database. Farmer phải Accepted/đang hiệu lực và chỉ đọc khoảng assignment hiện tại, hết phân công không xem history. Chủ/Admin/Manager đúng scope; unit raw16 thay8 cũ. 147 tests + lint/typecheck/build; Postman20 requests. Quyết định hiện hành theo IOT_TELEMETRIES_IMPLEMENTATION.md/IOT_TELEMETRIES_WORKFLOW_DESIGN.md, thay các đề xuất mở quyền Farmer cũ. Chưa thresholds/realtime/control hoặc persistence.

Logical collection (shape dùng trong RAM hiện tại; MongoDB persistence chưa triển khai):

``` text
IOT_TELEMETRIES
```

Mỗi sensor reading là **một document**, không gom tất cả loại cảm biến
thành một document cố định.

Logical shape:

``` text
_id
device_id
data_stream_id
value
unit
measured_at
received_at
```

Không thêm:

``` text
sensor_id
zone_id
air_temperature
air_humidity
soil_temperature
soil_humidity
```

vào telemetry document nếu ERD không yêu cầu.

`zone_id` suy ra:

``` text
IOT_TELEMETRIES.device_id
→ DEVICES.id
→ DEVICES.zone_id
```

`data_stream_id` xác định stream cảm biến phía hardware.

Thiết kế này phải cho phép thêm pH/EC sau này mà không thay đổi document
schema.

Recommended index:

``` javascript
{ device_id: 1, data_stream_id: 1, measured_at: -1 }
```

------------------------------------------------------------------------

## 14. Actuator task storage

MongoDB collection:

``` text
ACTUATOR_TASKS
```

Một document đại diện cho **một command/batch**, không phải một actuator
riêng lẻ.

Logical structure phải theo ERD và MQTT protocol, trong đó `targets` là
array.

Ví dụ concept:

``` json
{
  "_id": "...",
  "device_id": "...",
  "targets": [
    {
      "task_id": "...",
      "tasking_capability_id": "..."
    }
  ],
  "tasking_parameters": {},
  "status": "pending",
  "created_at": "...",
  "sent_at": "...",
  "confirmed_at": "...",
  "error_message": null,
  "response_payload": {}
}
```

Không tạo một top-level MQTT `task_id` duy nhất nếu một command có nhiều
targets.

`response_payload` nên giữ raw/full response hữu ích cho debugging.

Trạng thái implementation phải phản ánh tối thiểu sự khác nhau giữa:

-   task/command đang chờ;
-   publish tới broker;
-   hardware đã xác nhận;
-   lỗi nếu có.

Không coi MQTT publish success là hardware execution success.

------------------------------------------------------------------------

## 15. IoT command flow

Flow điều khiển cơ bản:

``` text
Mobile/Web
   ↓
REST API
   ↓
Validate user + Zone + Device
   ↓
Resolve ACTUATORS by purpose
   ↓
Create ACTUATOR_TASKS document
   ↓
Build MQTT payload
   ↓
Publish subscribe/station/{stationId}
   ↓
Hardware executes
   ↓
publish/station/{stationId}
   ↓
MQTT router
   ↓
Correlate ACK/full response
   ↓
Update ACTUATOR_TASKS
   ↓
Push/return latest state to client
```

Không cho client publish MQTT trực tiếp.

MQTT credentials và hardware mapping chỉ nằm backend.

------------------------------------------------------------------------

## 16. API architecture

Backend chia module theo domain, ví dụ:

``` text
auth
users
cooperatives
farms
zones
trees
devices
sensors
actuators
iot
cultivation-events
farming-standards
agricultural-materials
harvests
traceability
ai
chatbot
```

Không bắt buộc tạo tất cả module ngay từ đầu.

Ưu tiên core trước.

Controller chỉ xử lý HTTP concern.

Business logic đặt ở service/use-case layer.

Database access không đặt trực tiếp trong controller.

IoT MQTT handler phải tách khỏi REST controller.

------------------------------------------------------------------------

## 17. Validation and security

Bắt buộc:

-   validate DTO/request body;
-   hash password;
-   JWT auth;
-   role/scope authorization;
-   `.env` cho secrets;
-   không commit credentials;
-   không log password/token;
-   validate ObjectId/UUID;
-   validate Farmer assignment trước khi tạo cultivation event;
-   validate ownership/scope cho protected resources;
-   public traceability endpoint chỉ trả field được whitelist.

Không expose:

``` text
auth_token
MQTT secrets
password hash
internal raw credentials
```

------------------------------------------------------------------------

## 18. Date/time policy

Backend/database lưu timestamp theo UTC.

API trả ISO-8601.

UI có thể format theo local timezone.

Đặc biệt cultivation event phải tính:

``` text
lock_at = created_at + 15 minutes
```

ở backend, không tin timestamp do client gửi.

------------------------------------------------------------------------

## 19. AI scope

AI không được làm trước core backend.

### Leaf disease diagnosis

Dataset hiện dự kiến có 2,595 ảnh và 6 classes gồm Healthy + 5 disease
classes.

Training thực hiện trên Google Colab.

Khi tích hợp:

``` text
Mobile uploads leaf image
→ Backend/AI inference
→ prediction + confidence
→ optional AI_LEAF_DIAGNOSIS persistence
```

Không block core project vì AI.

### RAG

RAG làm sau khi user cung cấp bộ PDF.

Dự kiến:

``` text
PDF
→ extract/chunk
→ embedding
→ FAISS
→ retrieve context
→ LLM response
```

Không tự tạo knowledge base giả khi chưa có tài liệu nguồn.

------------------------------------------------------------------------

## 20. Development priorities

Không cố build toàn bộ project trong một lần.

### Phase 1 --- Foundation

1.  Initialize monorepo.
2.  Backend NestJS.
3.  PostgreSQL + MongoDB connections.
4.  Environment/config system.
5.  Read ERD XML.
6.  Implement PostgreSQL entities/schema/migrations.
7.  Implement Mongo models/schemas.
8.  Seed minimum development data.
9.  Swagger.
10. Basic error handling/logging.

### Phase 2 --- Auth and farm management

Implement:

``` text
Auth
Users
Cooperatives
Farms
Zones
Users-Zones
Trees
```

Sau phase này phải login và truy cập đúng dữ liệu theo role/scope.

### Phase 3 --- IoT

Implement:

``` text
Devices
Sensors
Actuators
MQTT connection
topic router
sensor telemetry ingestion
ACTUATOR_TASKS
control command
hardware confirmation
```

Ưu tiên tái sử dụng behavior đã chứng minh từ prototype nếu source code
prototype được cung cấp.

### Phase 4 --- Cultivation

Implement đầy đủ:

``` text
create PENDING
edit/delete within 15 min
auto lock
correction chain
hash chain
authorization
```

Phải có automated tests cho business rules này.

### Phase 5 --- Standards, materials, harvest, traceability

Implement:

``` text
Farming Standards
Agricultural Materials
Standard Materials
Tree Harvests
QR traceability endpoint
public trace page/API
```

### Phase 6 --- Web

React web cho:

-   Admin/Manager dashboard;
-   farm/zone/tree management;
-   user assignment;
-   IoT monitoring;
-   cultivation history;
-   standards/materials;
-   harvest;
-   traceability support.

### Phase 7 --- Mobile

React Native Android-first cho Farmer:

-   login;
-   assigned zones;
-   tree lookup;
-   realtime/latest IoT;
-   watering/spraying control;
-   cultivation log;
-   correction;
-   harvest where applicable;
-   AI diagnosis later.

### Phase 8 --- AI/RAG

Chỉ bắt đầu sau khi core system ổn định.

------------------------------------------------------------------------

## 21. Testing priorities

Không cần chase 100% coverage.

Bắt buộc test các rule dễ gây lỗi:

### Cultivation event

``` text
PENDING before lock_at → edit allowed
PENDING before lock_at → delete allowed
PENDING after lock_at → edit denied
PENDING after lock_at → delete denied
LOCKED → edit/delete denied
correction creates new event
original LOCKED event unchanged
root/reference correction chain correct
hash generated only when LOCKED
```

### Authorization

``` text
Farmer cannot write outside assigned Zone
Manager cannot create cultivation event
Admin cannot mutate locked cultivation history
public trace endpoint does not expose secrets
```

### IoT

``` text
sensorRecords routed correctly
measurement timestamp policy must be agreed before telemetry storage
publish/station sensor payload routed as telemetry
short ACK never confirms task or relay without correlation
retained/unknown station/identity mismatch packets rejected
broker publish != hardware confirmed
future full feedback/physical-button behavior requires verified protocol and separate tests
```

------------------------------------------------------------------------

## 22. Realtime strategy

Không over-engineer realtime at the start.

MQTT remains backend ↔ hardware.

For client realtime:

-   start with REST polling/latest-data endpoint if sufficient;
-   WebSocket/SSE can be added after core MQTT ingestion works.

Do not block the project on realtime UI infrastructure.

------------------------------------------------------------------------

## 23. Coding conventions

-   TypeScript strict mode.
-   Clear English naming in source code.
-   DB field names use `snake_case` where matching ERD/database.
-   TypeScript properties may follow project ORM convention, but mapping
    must be explicit.
-   Avoid `any` unless interacting with intentionally flexible
    MQTT/Mongo payloads; validate before use.
-   Small services/functions.
-   No premature generic repository/framework abstraction.
-   No microservices.
-   No CQRS/Event Sourcing framework just because cultivation history is
    immutable.
-   No Kubernetes.
-   No unnecessary Redis unless a concrete requirement appears.

Favor code that one developer can understand, debug and defend during
thesis presentation.

------------------------------------------------------------------------

## 24. Important invariants

Codex must preserve these invariants throughout implementation:

1.  **ERD is the schema authority.**
2.  **One Device belongs to one Zone; one Zone may have many Devices.**
3.  **Farmer can work on multiple Zones; one Zone has one active Farmer
    at a time.**
4.  **Only Farmer creates cultivation events.**
5.  **Cultivation event becomes immutable after its 15-minute window.**
6.  **Correction creates a new event; never mutates locked history.**
7.  **No separate `event_id` is required for CULTIVATION_EVENTS; Mongo
    `_id` is sufficient.**
8.  **Only LOCKED cultivation events participate in the hash chain.**
9.  **QR traceability is based on `tree_code`; no QR table.**
10. **TREE_HARVESTS keeps `season_name` and `created_at`.**
11. **IoT telemetry is one reading/document and uses
    `device_id + data_stream_id`.**
12. **Actuator command may contain multiple targets.**
13. **Each MQTT target has its own taskId.**
14. **MQTT broker publish success is not hardware execution
    confirmation.**
15. **`publish/station/{stationId}` may contain either telemetry or
    actuator confirmation.**
16. **Do not expose IoT credentials in public APIs.**
17. **Web uses React, not Next.js.**
18. **Mobile uses React Native, Android first.**
19. **Do not add inventory management.**
20. **AI/RAG must not delay the core application.**

------------------------------------------------------------------------

## 25. Instructions for Codex before writing code

Before generating implementation code:

1.  Read this entire document.
2.  Read and parse **`Sơ đồ ERD.xml`**.
3.  Produce a short `docs/IMPLEMENTATION_PLAN.md`.
4.  In that plan, list:
    -   detected PostgreSQL tables;
    -   detected MongoDB collections;
    -   relationships;
    -   proposed repository structure;
    -   environment variables required;
    -   implementation phases;
    -   any ERD ambiguity that would materially affect implementation.
5.  **Do not redesign the ERD without explicit approval.**
6.  Do not implement AI/RAG in the first pass.
7.  Start with Phase 1 only.
8.  After Phase 1 compiles and database connections/migrations work,
    continue incrementally.
9.  Run lint/typecheck/tests after each meaningful implementation batch.
10. Keep README updated with commands needed to run the project.

If a decision is missing but does not materially affect architecture,
choose the **simplest maintainable implementation** and record it in
`IMPLEMENTATION_NOTES.md`.

If a decision would change database schema, security model, IoT
protocol, or a critical business rule, **do not silently invent it**.
Mark it clearly for confirmation.

------------------------------------------------------------------------

## 26. Definition of first successful milestone

The first milestone is complete when:

``` text
✓ repository initializes successfully
✓ API starts locally
✓ PostgreSQL connection works
✓ MongoDB connection works
✓ migrations/schema based on ERD are created
✓ Swagger is available
✓ basic seed can run
✓ auth skeleton is ready
✓ lint passes
✓ typecheck passes
✓ tests can run
✓ .env.example exists
✓ README contains exact local setup commands
```

Do **not** consider the project successful merely because files were
generated. The generated project must compile and run.

------------------------------------------------------------------------

## 27. Final instruction

Build this project **incrementally and pragmatically**.

The objective is not to demonstrate the maximum number of technologies.
The objective is to deliver a coherent Smart Durian system whose
architecture, database design, IoT communication, traceability and AI
integration can be clearly explained and demonstrated in a graduation
thesis.

When uncertain, preserve the agreed business rules and choose the
simplest solution that can be implemented, tested and demonstrated
reliably.

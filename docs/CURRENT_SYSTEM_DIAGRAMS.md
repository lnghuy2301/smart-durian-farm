# Sơ đồ nền tảng đã triển khai — 2026-10-07

Mốc code **f20f6c1**, **147/147 tests** cùng lint/typecheck/build đạt trong lượt rà soát. Mermaid source nằm trực tiếp trong Markdown để session sau chỉnh/tái sử dụng. Đây là sơ đồ hiện trạng theo code và test, không khẳng định đã kiểm thử mọi tình huống hoặc ESP32 thật. Xem [bằng chứng/giới hạn](PROJECT_READINESS_REVIEW_20261007.md).

Các sơ đồ không thay ERD_DIAGRAM.xml của người dùng. PostgreSQL/MongoDB bên dưới chưa có business persistence; React web/mobile, ACTUATOR_TASKS và Cultivation chưa triển khai.

## 1. Kiến trúc runtime hiện tại

```mermaid
flowchart LR
    Operator[Người test qua Postman / Swagger] -->|REST + JWT| API[NestJS API]
    API --> Guard[AuthGuard + role/scope policy + DTO validation]
    Guard --> Domains[Auth / USERS / HTX / danh mục / Farm / Zone / assignments / Trees / Harvests / IoT metadata]
    Domains --> Memory[Shared RAM stores trong một process]
    API --> Health[Health / readiness]
    Health -->|SELECT 1| PG[(PostgreSQL17: probe)]
    Health -->|ping| Mongo[(MongoDB8 rs0: probe)]
    ESP[ESP32 theo protocol được cung cấp] -->|publish/station/stationId| Broker[MQTT broker]
    Broker --> MQTT[MQTT.js transport + parser/router]
    MQTT -->|station_id lookup / recordSeen| Domains
    MQTT --> Diag[RAM diagnostics FIFO200]
    MQTT -->|accepted sensor readings| Telemetry[Telemetry service]
    Telemetry --> FIFO[Shared RAM FIFO10.000 readings]
    Guard -->|GET latest/history + quyền hiện tại| Telemetry
```

Không có đường Domain→PostgreSQL/MongoDB ghi nghiệp vụ hiện tại. Publisher nội bộ MQTT đã có nhưng chưa được nối với HTTP control/task orchestration. Sơ đồ không tự chứng minh ESP32 thực đã hoạt động với bản backend này.

Căn cứ: `apps/api/src/app.module.ts`, `application.ts`, `database/database.service.ts`, `mqtt/mqtt.module.ts`, `mqtt/mqtt.service.ts`, `telemetry/telemetry.module.ts`; `mqtt-loopback.test.ts`, `readiness.test.ts`, `telemetry.test.ts`.

## 2. Quan hệ logic của phần đã có

```mermaid
erDiagram
    USERS ||--o{ FARMS : owner_id
    USERS o|--o| COOPERATIVES : manager_id
    COOPERATIVES o|--o{ FARMS : cooperative_id
    FARMS ||--o{ ZONES : farm_id
    FARMING_STANDARDS ||--o{ ZONES : standard_id
    USERS ||--o{ USERS_ZONES : user_id
    ZONES ||--o{ USERS_ZONES : zone_id
    ZONES ||--o{ TREES : zone_id
    TREES ||--o{ TREE_HARVESTS : tree_id
    USERS ||--o{ TREE_HARVESTS : created_by
    ZONES ||--o{ DEVICES : zone_id
    DEVICES ||--o{ SENSORS : device_id
    DEVICES ||--o{ ACTUATORS : device_id
    DEVICES ||..o{ IOT_TELEMETRIES : logical_device_id
    FARMING_STANDARDS ||--o{ STANDARD_MATERIALS : standard_id
    AGRICULTURAL_MATERIALS ||--o{ STANDARD_MATERIALS : material_id
    DEVICES {
        UUID id PK
        UUID zone_id
        string station_id UK
    }
    SENSORS {
        UUID id PK
        UUID device_id
        string data_stream_id
    }
    ACTUATORS {
        UUID id PK
        UUID device_id
        bigint capability_id
    }
    IOT_TELEMETRIES {
        ObjectId _id PK
        UUID device_id
        string data_stream_id
    }
```

Quan hệ được kiểm tra ở backend/RAM, **chưa có DB foreign keys**. USERS→COOPERATIVES chỉ áp dụng user role Manager; manager_id nullable, một Manager tối đa một HTX. Một Farm có thể độc lập; mỗi Zone có một tiêu chuẩn, tiêu chuẩn mới gắn phải Active.

SENSORS unique **(device_id,data_stream_id)**, ACTUATORS unique **(device_id,capability_id)**; UK không đặt riêng lên stream/capability toàn hệ thống. Telemetry xác định stream bằng Device UUID + data_stream_id, không dùng station_id làm FK. Mọi Tree/Device cùng Zone có quan hệ qua Zone; không có TREES.device_id. Sơ đồ rút gọn field, không dùng trực tiếp làm migration.

Căn cứ: ERD_DIAGRAM.xml, các service/types hiện tại; `catalog.test.ts`, `zones.test.ts`, `assignments.test.ts`, `devices.test.ts`, `sensors.test.ts`, `actuators.test.ts`, `iot-metadata-update.test.ts`.

## 3. Đăng ký và duyệt Manager

```mermaid
sequenceDiagram
    actor M as Manager đăng ký
    participant API as Backend
    participant Email as SMTP sender
    participant RAM as Shared USERS / HTX RAM
    actor A as Admin
    M->>API: Request verification với phone + email
    API->>Email: Gửi OTP email
    M->>API: Verify OTP, nhận proof có hạn
    M->>API: Register Manager + proof cùng phone/email
    API->>RAM: Chốt unique + proof, tạo Pending
    API-->>M: Manager Pending, chưa được login
    A->>API: JWT Admin + approve Manager UUID + tạo/gắn HTX
    API->>RAM: Recheck email/Manager/HTX/unique
    alt Có thể tạo/gắn HTX
        API->>RAM: Tạo/gắn HTX rồi Active Manager, revoke version
        API-->>A: Manager Active + HTX
    else HTX/unique/context không hợp lệ
        API-->>A: Từ chối, Manager vẫn Pending
    end
```

Commit đồng bộ RAM là nguyên tử trong một process, không phải transaction SQL. Farmer đăng ký Active ngay, email tùy chọn; Admin không đăng ký công khai. UUID xuất hiện trong URL không thay thế JWT/quyền Admin.

Căn cứ: `users/users.service.ts`, `users/email/email-verification.service.ts`, `users/mock-cooperative.store.ts`; `users.test.ts` gồm proof deadline/partial-create regressions.

## 4. Admin đề xuất thay đổi metadata, chủ Farm duyệt

```mermaid
flowchart TD
    Admin[Admin gửi Create/Update proposal] --> Validate[Kiểm tra actor / Farm / Zone / immutable fields]
    Validate --> Pending[Giữ Pending + snapshot/version trong RAM]
    Pending --> Owner[Chủ Farm xem và duyệt hoặc từ chối]
    Owner -->|Từ chối| Rejected[Rejected, dữ liệu chính giữ nguyên]
    Owner -->|Duyệt| Recheck[Recheck actor / owner / context / version / unique / capacity]
    Recheck -->|Hợp lệ| Commit[Commit metadata + history nếu module có history]
    Commit --> Accepted[Proposal Accepted]
    Recheck -->|Sai hoặc stale| Error[Trả lỗi; chưa áp dụng thay đổi]
    Direct[Chủ Farm ghi trực tiếp] --> DirectCheck[Kiểm tra invariant tại bước commit]
    DirectCheck --> Commit
```

Áp dụng Zone/Tree/Device/Sensor/Actuator theo service tương ứng; Zone dùng kiểm tra diện tích/tiêu chuẩn, IoT dùng uniqueness/immutable IDs. Farmer nhận phân công chỉ đọc metadata. **Farm là luồng riêng:** cả chủ tạo/sửa cũng phải qua duyệt đối ứng Admin; gia nhập còn cần Manager, rời chỉ thông báo Manager. Không áp sơ đồ direct-write metadata sang FARMS.

Căn cứ: các `zones`, `trees`, `devices`, `sensors`, `actuators` service; tests approvals/stale/unique/capacity. Farm khác biệt theo `farms.service.ts` và `farms.test.ts`.

## 5. Thu hoạch và duyệt nội dung sửa

```mermaid
flowchart TD
    Draft[Draft: tác giả/chủ sửa được theo quyền hiện tại] --> Submit[Người tạo submit]
    Submit --> IsOwner{Tác giả là chủ Farm?}
    IsOwner -->|Có| Confirmed[Confirmed: khóa sửa trực tiếp]
    IsOwner -->|Không| PendingConfirm[Pending + request Confirm]
    PendingConfirm -->|Chủ duyệt; recheck quyền/context| Confirmed
    PendingConfirm -->|Reject/rút yêu cầu| Draft
    Confirmed --> Correction[Tác giả/chủ gửi correction request]
    Correction --> PendingCorrect[Pending; dữ liệu chính giữ nguyên]
    PendingCorrect --> Content[Nội dung sửa từ người đủ quyền hiện tại]
    Content --> Reviewer{Farm có HTX?}
    Reviewer -->|Có| Manager[Manager của HTX duyệt]
    Reviewer -->|Không| Admin[Admin duyệt]
    Manager --> Validate[Recheck context/version/unique/date/grant/quyền editor]
    Admin --> Validate
    Validate --> Applied[Áp dụng nội dung, Confirmed, ghi updated_by/updated_at]
    PendingCorrect -->|Reject/rút yêu cầu| Confirmed
```

Xác nhận đầu tiên giữ updated_by/updated_at null. Tác giả hết phân công được gửi lý do, chủ chuẩn bị nội dung; editor phải có quyền hiện tại khi duyệt. Harvest dùng policy riêng, không áp hash/immutable Cultivation15 phút hoặc quyền correction theo assignment gốc của Cultivation. Chỉ xóa Draft chưa từng Confirmed; cùng tree/ngày không trùng, batch nhiều cây cùng Zone/ngày; nhập bù quá7 ngày lịch Việt Nam cần grant Admin.

Căn cứ: `tree-harvests/tree-harvests.service.ts`, `harvest-date-policy.ts`; `tree-harvests.test.ts`.

## 6. MQTT nhận Telemetry và quyền đọc

```mermaid
sequenceDiagram
    participant Wire as MQTT.js transport
    participant Router as MQTT parser/router
    participant Meta as Shared Device / Sensor stores
    participant T as Telemetry service / RAM FIFO
    actor User as Người dùng JWT
    Wire->>Router: topic + payload + retained flag
    Router->>Meta: station_id từ topic → Device UUID
    Router->>Router: Reject retained/identity mismatch/malformed/unknown station
    alt Telemetry hợp lệ
        Router->>Meta: recordSeen; map Device UUID + stream
        Router->>Router: Chỉ Device/Sensor Active; giữ raw unit
        Router->>T: Accepted readings + backend arrival time
        T->>T: Validate batch; capture received_at; append FIFO10.000
    else Short ACK hợp lệ
        Router->>Meta: recordSeen
        Router->>Router: Ghi diagnostics; chưa confirm task/relay
    end
    User->>T: GET Device latest/history
    T->>Meta: Kiểm tra scope hiện tại
    T->>T: Farmer: assignment hiện tại; lọc readings theo khoảng assignment
    T-->>User: Page + total + RAM storage metadata, hoặc lỗi quyền
```

measured_at là backend arrival/đọc packet, chưa phải đồng hồ đo thực ở hardware; received_at là lúc ghi RAM. latest lấy sau lọc quyền; assignment mới không mở readings từ phân công cũ. Hết phân công mất cả latest/history IoT. Không có HTTP giả lập reading cho người dùng, Mongo persistence hoặc frontend realtime trong luồng hiện tại.

Căn cứ: `mqtt/mqtt.protocol.ts`, `mqtt/mqtt.service.ts`, `telemetry/telemetry.service.ts`, `telemetry/telemetry.store.ts`; `mqtt.test.ts`, `mqtt-loopback.test.ts`, `telemetry.test.ts`.

## 7. Dùng trong luận văn và session sau

Mỗi sơ đồ phải đi cùng mốc commit, mô tả dữ liệu RAM, test evidence và giới hạn hardware/DB. Có thể dùng Mermaid trong trình xem hỗ trợ để render/xuất SVG, hoặc vẽ lại UML theo các bước này. Lượt này đã rà cấu trúc/source; chưa xuất ảnh hoặc kiểm tra bằng Mermaid renderer.

Khi triển khai frontend/persistence/control, cập nhật sơ đồ tương ứng sau nghiệm thu. Các hành vi future hash-chain, ACK-confirmation, auto-reset/shutdown, AI và chatbot cần sơ đồ thiết kế riêng ghi rõ trạng thái dự kiến.

# ACTUATOR_TASKS — điều khiển, API và tái lập

Ngày triển khai: 2026-10-09. Nhánh **feat/actuator-tasks-v1**, kế thừa **feat/mqtt-contract-v1 @ f20ea20**, từ frontend/backend hiện có ab478fc. Nguồn giao tiếp: **MQTT_Configuration_Smart_Farm_Durian_v1.0.docx** và câu trả lời trực tiếp của người dùng. Đọc cùng [contract](MQTT_CONTRACT_V1_IMPLEMENTATION.md), [workflow](ACTUATOR_TASKS_WORKFLOW_DESIGN.md), [metadata](IOT_METADATA_UPDATE_IMPLEMENTATION.md), [Telemetry](IOT_TELEMETRIES_IMPLEMENTATION.md).

## Ý nghĩa xác nhận

Hardware ACK ngay khi **nhận command**; không báo trạng thái relay thực tế. Task `Confirmed` nghĩa tất cả bước nhận ACK đúng **Device + taskId + action** và adapter gửi thành công. `confirmed_at` là thời điểm backend nhận ACK cuối, không cho client nhập. State API luôn trả `physical_state: "Unknown"` và `confirmation_kind: "CommandReceipt"`. Không hiển thị Confirmed thành bằng chứng bơm/van vật lý đã bật/tắt.

`acknowledged_mode` là chế độ đã có đủ ACK nhận lệnh (Unknown/Off/Watering/Spraying). Sau restart hoặc mất kết nối, mode Unknown. Không dùng Device.status Active/Inactive/Maintenance hoặc Actuator.status Active/Inactive làm trạng thái relay.

## Module và phạm vi

- `ActuatorTasksService` quản lý journal RAM, một workflow/Device, timeout, ACK và chuỗi Reset/Start/Stop/RecoveryStop.
- `MqttTransportModule` tách adapter/config để receiver và tasks dùng **cùng** transport, không vòng phụ thuộc. AppModule tái dùng đúng các instance Auth/Device/Actuator/Assignments/Farm/Zone; HTTP và MQTT cùng metadata.
- `MqttService` parse rồi chuyển ACK cho domain; diagnostic `reason:null` khi nhận ACK đang chờ. ACK sai/trùng/trễ được ghi mã lỗi; retained/malformed bị từ chối trước domain. ACK không tạo Telemetry reading.
- API không nhận taskId/capability/action/ACK/time/actor do client tự chọn; chỉ nhận operation. Không thêm scheduler/automation/Cultivation/UI control hoặc thay firmware.
- **Chưa MongoDB persistence, collection/index/migration/seed.** `_id` ObjectId hex và shape MongoDB là mô hình logic trong RAM. Backend restart mất tasks/modes/metadata; phải tái tạo tài nguyên qua API trước test. Không phải localStorage.

## Metadata cần chuẩn bị

Chủ Farm tạo Device đã lắp đặt: zone_id UUID, station_id đúng ESP32, installed_at ISO timezone và cost bắt buộc. Backend sinh Device.id UUID; station_id immutable/unique là định danh giao tiếp, không là token. Device thuộc Zone cố định, không chuyển Zone.

Đăng ký đủ ba Actuators qua `POST /api/actuators` với JWT **chủ Farm**:

| capability_id | purpose bất biến | Chức năng |
|---|---|---|
| 2 | shared | Bơm chung |
| 3 | watering | Van tưới |
| 4 | spraying | Van phun |

Đây là recipe điều khiển **bộ demo đã được chốt**. Metadata generic vẫn cho capability khác, nhưng API control hiện đòi đủ 2/3/4 và purpose đúng; không tự suy capability từ thứ tự đăng ký. Start cần Device và bơm/van được chọn Active. Stop/reset/recovery cho OFF dù metadata Inactive/Maintenance để không chặn thao tác Dừng, nhưng vẫn phải có ba định danh đúng.

Sensors không bắt buộc cho API control. Nếu test giám sát cùng lúc, khai báo qua `POST /api/sensors`: stream string301 air_temperature/C;302 air_humidity/%;303 soil_moisture/%. Router không auto-register/hardcode mapping sensor.

## Cấu hình đầy đủ

Giữ `.env` hiện có. Nếu thiếu thì thêm từ `.env.example`, không copy đè. Đợt này **đã append** `ACTUATOR_ACK_TIMEOUT_MS=10000` vào `.env` local, giữ nguyên toàn bộ bytes cấu hình trước đó; file này không được commit.

```dotenv
MQTT_ENABLED=true
MQTT_BROKER_HOST=<broker-domain-hoac-ip>
MQTT_BROKER_PORT=1883
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_USE_TLS=false
MQTT_CONNECT_TIMEOUT_MS=10000
MQTT_RECONNECT_MS=3000
MQTT_OFFLINE_AFTER_MS=1800000
ACTUATOR_ACK_TIMEOUT_MS=10000
DEMO_DEVICE_STATION_ID=<station-id-dung-trong-firmware>
```

Điền broker host cùng cấu hình firmware; host không gồm mqtt://, path hoặc credentials. `.env.example` vẫn MQTT_ENABLED=false để người dùng chủ động bật kết nối. User/pass/TLS hiện firmware không dùng; backend không tạo device auth_token. DEMO_DEVICE_STATION_ID là ghi chú để copy vào POST Device; không tự đăng ký trạm hoặc giới hạn wildcard. Thông số broker chung không đặt trong bảng Device.

ACK timeout mặc định **10.000ms cho mỗi bước**, cấu hình integer100..60000; sai thì fail startup. MQTT_CONNECT_TIMEOUT_MS là timeout transport/subscribe, MQTT_OFFLINE_AFTER_MS chỉ suy connectivity. Hardware gửi readings mỗi15s không liên quan timeout điều khiển. Không thay các giá trị broker/secrets đã điền của người dùng.

## API dùng cho frontend/Postman

Base `http://localhost:3000/api`; Bearer JWT bắt buộc. Swagger `GET /api/docs-json` có response schema cho cả bốn endpoints mới.

| Endpoint | Kết quả / quyền |
|---|---|
| POST /actuator-tasks/devices/:deviceId/commands | 202 với task Pending + status_url/state_url; chủ Farmer hoặc Farmer Accepted còn hiệu lực |
| GET /actuator-tasks/:id | Task snapshot theo quyền đọc hiện tại |
| GET /actuator-tasks/devices/:deviceId | items/total/limit/offset/storage; status optional Pending/Confirmed/Failed; limit1..100 mặc định20, offset0..100000 |
| GET /actuator-tasks/devices/:deviceId/state | acknowledged_mode/physical_state/busy/active_task_id/reset_required/broker_ready/ack_timeout_ms |

Body POST đúng một field: `{"operation":"Watering"}`, `{"operation":"Spraying"}` hoặc `{"operation":"Stop"}`. Client không gửi Reset/RecoveryStop; backend tự tạo. Extra field/null/enum sai bị400. Device ID phải UUID4; task ID API ObjectId hex24; taskId trên MQTT là **positive safe integer number khác hai ID đó**.

POST trả ngay snapshot trước gửi MQTT, không giữ request20–50s:

```json
{
  "task": {
    "_id": "507f1f77bcf86cd799439011",
    "device_id": "11111111-1111-4111-8111-111111111111",
    "command_id": 1006,
    "targets": [{"task_id":1001,"tasking_capability_id":3},{"task_id":1002,"tasking_capability_id":2}],
    "tasking_parameters": {"actionType":"control","action":1},
    "status": "Pending",
    "created_at": "2026-10-09T03:00:00.000Z",
    "sent_at": null,
    "confirmed_at": null,
    "error_message": null,
    "response_payload": {
      "operation":"Watering","confirmation_kind":"CommandReceipt",
      "parent_task_id":null,"reset_task_id":"507f1f77bcf86cd799439012","recovery_task_id":null,
      "steps":[
        {"task_id":1001,"tasking_capability_id":3,"action":1,"status":"Queued","sent_at":null,"ack_received_at":null,"ack":null},
        {"task_id":1002,"tasking_capability_id":2,"action":1,"status":"Queued","sent_at":null,"ack_received_at":null,"ack":null}
      ]
    }
  },
  "status_url":"/api/actuator-tasks/507f1f77bcf86cd799439011",
  "state_url":"/api/actuator-tasks/devices/11111111-1111-4111-8111-111111111111/state"
}
```

Ví dụ minh họa, ID/time thực do backend sinh. Frontend poll status_url khoảng1s khi Pending; terminal thì đọc state_url. State busy có thể còn true sau Failed Start vì RecoveryStop đang chạy; theo recovery_task_id và GET state, không tự gạt OFF thành công. Một Stop đang chạy thì không bấm gửi Stop trùng. State không đủ ACK = Unknown, không tự chuyển UI sang “đã tắt”. Form điều khiển web hiện **chưa triển khai**; các API read-only IoT cũ vẫn giữ.

## Dữ liệu và thời gian

Một task logical là một thao tác nhiều targets. Start/Stop hai targets; Reset/RecoveryStop ba targets. `command_id` numeric là ID nội bộ của thao tác, **không gửi trên wire**. Mỗi target có task_id khác nhau; backend publish riêng từng target/bước để giữ thứ tự van/bơm. Không publish cả targets logical cùng lúc.

Top-level đúng fields `_id,device_id,command_id,targets,tasking_parameters,status,created_at,sent_at,confirmed_at,error_message,response_payload`. Không created_by/confirmed_by. Actor chỉ giữ trong run RAM cho kiểm tra quyền trước mỗi ON; lịch sử task không khẳng định biết tác giả sau restart/migration.

- created_at: backend nhận/tạo thao tác từ POST; Reset/RecoveryStop là lúc backend tạo thao tác tự động.
- sent_at: lúc gọi adapter gửi bước đầu; đây là thời điểm bắt đầu gửi, không phải cam kết broker đã nhận.
- confirmed_at: ACK cuối được nhận hợp lệ và đủ bước; null khi Pending/Failed.
- response_payload: operation, kind, links, từng bước/ACK tối thiểu đã chuẩn hóa. Không lưu payload tùy ý hoặc credential.
- Step Queued → WaitingAck → Acknowledged; lỗi bước đang đợi thành Failed, bước chưa gửi Cancelled. ACK đã nhận trước lỗi giữ để xem phần tiến trình.

Numeric IDs không tái sử dụng trong process dù journal eviction, boot namespace ngẫu nhiên giảm va chạm sau restart. Chưa có uniqueness bền vững across processes; cần allocator/index khi làm persistence. Không dùng UUID string thay numeric trên wire.

## Quyền và mã lỗi

Owner Farmer được điều khiển không cần phân công riêng. Farmer khác phải Accept và ở [start,end); kiểm tra lại **trước từng ON**. Pending invitation, Admin, Manager không được điều khiển. Manager đọc trong HTX mình; Admin đọc; chủ đọc Farm mình. Farmer hết hiệu lực mất cả task/state/history; nhận phân công mới chỉ đọc tasks có created_at trong khoảng phân công hiện tại. Filter quyền trước total/pagination, task ngoài scope404. Internal recovery OFF không phụ thuộc actor còn quyền, để mất phân công giữa thao tác vẫn Dừng.

400 DTO/query/ID sai;401 thiếu JWT;403 vai trò không điều khiển;404 ngoài scope/metadata hoặc task đã evict;409 busy/phải Dừng/metadata recipe không phù hợp;503 broker chưa connected+subscribed (không queue offline).429 nếu journal không còn chỗ mà không có terminal record để evict. Các mã task `ACK_TIMEOUT,RESET_FAILED,MQTT_DISCONNECTED,MQTT_PUBLISH_FAILED,MQTT_UNAVAILABLE,CONTEXT_UNAVAILABLE,CANCELLED_BY_STOP,BACKEND_SHUTDOWN` chỉ mô tả lỗi backend, không lộ exception provider.

## Tái lập bằng Postman, không scripts/environment

Import [Actuator-Tasks-Local-Test.postman_collection.json](postman/Actuator-Tasks-Local-Test.postman_collection.json) bằng JSON trực tiếp. Base URL literal localhost3000. Sửa các chuỗi `PASTE_OWNER_JWT`, `PASTE_ADMIN_JWT`, `PASTE_MANAGER_JWT`, `PASTE_FARMER_JWT`, `PASTE_ZONE_UUID`, `PASTE_DEVICE_UUID`, `PASTE_TASK_OBJECT_ID`, `PASTE_RESET_OBJECT_ID`, `PASTE_RECOVERY_OBJECT_ID`, `PASTE_STATION_ID` bằng tay trong request liên quan.

1. Khởi động API từ root `npm run dev:api`; nếu process vừa restart, tái tạo Farm được Admin duyệt và Zone bằng các collection hiện có. Login lấy JWT, không chia sẻ JWT/log OTP.
2. Đăng ký Device với station đúng firmware, installed_at/cost hợp lệ. Copy UUID response vào cả ba POST Actuator, state/list/commands; tạo bơm2/van3/van4 theo bảng.
3. Xem broker status bằng AdminJWT, phải connected/subscribed=true. Đảm bảo trạm đã subscribe đúng topic, hardware phản hồi ACK v1 đúng taskId/action. State ban đầu Unknown.
4. POST Watering, nhận202/Pending; copy _id/status_url và reset_task_id, GET tiến trình. Lần đầu gửi OFF2→OFF3→OFF4 trước ON3→ON2, mỗi bước chờ ACK10s. Hardware không online thì ResetFailed, không gửi ON.
5. POST Stop, theo GET đến terminal. Khi đã Confirmed Watering chỉ OFF2→OFF3; Unknown/partial dùng OFF2→OFF3→OFF4. Chỉ sau Dừng đủ ACK mới Bật Spraying.
6. Test no hardware ACK **chỉ trên broker/trạm demo cô lập**: xem Failed và links RecoveryStop; bơm OFF thiếu ACK thì không gửi đóng van tiếp và mode Unknown. Không giả lập ACK thật bằng REST: không có endpoint này.
7. Test vai trò: Admin/Manager GET đúng scope; POST409/403/404 theo trạng thái/quyền; Farmer Accepted đang hiệu lực mới control, mất phân công mất GET. Các negative requests cố ý trả400/401/403/404/409, không là regression.

## Kiểm thử và giới hạn

Kết quả cuối: **168/168 backend tests**, lint/typecheck/API build đạt; hồi quy web **8/8 unit tests +22/22 browser scenarios**, web typecheck/build đạt. Postman24 requests/JSON bodies parse hợp lệ, không scripts/variables. Không dùng hardware/broker thật, gửi SMS/email thật hoặc DB nghiệp vụ trong checks. So sánh hash xác nhận các file riêng ERD/DOCX/spec/Postman/UI giữ nguyên; `.env` chỉ append key mới, không stage.

Unit/domain/HTTP/fake adapter kiểm tra Reset/Start/Stop order, ACK mismatch/retained/legacy/duplicate/late, timeout từng bước, partial recovery, pump-OFF timeout, Stop preempt callback race, reconnect no ON replay, quyền/metadata đổi giữa bước, fast ACK trước publish callback, publishfailure, shutdown, capacity/defensive snapshots. TCP localhost test đi thật HTTP202→MQTT.js→broker fixture→ACK→GET Confirmed; không dùng broker/hardware/SMTP/SMS thật hoặc đọc `.env`.

Từ root: `npm ci`; `npm run lint`; `npm run typecheck`; `npm run build`; `npm test`. Windows nếu npm wrapper gặp EPERM: từ apps/api chạy `node ../../node_modules/eslint/bin/eslint.js src test integration`, `node ../../node_modules/typescript/bin/tsc --noEmit`, `node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json`, `node ../../node_modules/typescript/bin/tsc --outDir .test-dist`, `node --test --test-concurrency=2 .test-dist/test`. Focus: hai files actuator-tasks.test.js và mqtt-loopback.test.js trong .test-dist/test. Không in `.env` hoặc kết nối hardware để thay unit test.

Journal tối đa **5000 tasks toàn process**, loại terminal cũ nhất khi cần chỗ, giữ Pending/lock; GET task đã evict404, links cũ có thể không còn đọc được. Devices capped1000, tối đa2 Pending/Device (Start+Reset), nên journal có room cho recovery. Không có audit lâu dài và không dùng RAM làm bằng chứng truy xuất sản xuất.

Kết nối mất thì không thể cam kết Dừng vật lý; backend đánh dấu Unknown, không replay ON. Startup không biết các metadata RAM cũ để tự gửi OFF ngay; sau tái đăng ký, lần Bật tiếp theo bắt buộc Reset đủ ACK. ACK không chứng minh hành động vật lý kể cả Reset/Stop Confirmed. Chưa có feedback relay/pressure/flow, hardware watchdog hoặc phân tán nhiều backend worker; chỉ một backend instance giữ lock. Kiểm thử ESP32 v1 thực và cách báo UI receipt cần thực hiện ở đợt liên kết frontend/hardware. Không tự sửa firmware để giả định capability chưa có.

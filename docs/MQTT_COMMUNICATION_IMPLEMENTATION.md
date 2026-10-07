# MQTT communication — triển khai và tái lập

Nhánh **feat/mqtt-communication**, base metadata **939c350** trên feat/iot-core-metadata-update, kế thừa Actuators95c15fc/Sensorsc9d0940/Devices09cb1da/mainc71820d. Chỉ commit local, chưa push/merge. Đọc cùng [metadata](IOT_METADATA_UPDATE_IMPLEMENTATION.md) và [handoff](MODULE_HANDOFF.md).

Đã đọc đầy đủ ERD_DIAGRAM.xml, IOT_CORE_TABLES_SPEC.md, MQTT_HARDWARE_PROTOCOL_VERIFIED.md. Ba file nguồn mới và các sửa/xóa riêng của người dùng được giữ ngoài commit. Quy tắc cần tái lập được ghi dưới đây; không phụ thuộc các guide IoT cũ đã bị người dùng xóa. File source mới nếu còn untracked ở session khác phải được bảo vệ trước checkout.

## Phạm vi và quyết định đã chốt

Device chỉ đăng ký khi đã lắp: installed_at/cost bắt buộc, không null, không đăng ký trước lắp. Device status Active/Inactive/Maintenance là quản trị, last_seen_at tạo null và chỉ receiver cập nhật. Sensor type air_temperature/air_humidity/soil_moisture, unit metadata string1..16 thay enum %/oC cũ. Actuator purpose watering/spraying/shared bất biến. UUID nội bộ khác station_id/stream/capability; composite unique theo Device giữ nguyên.

Module này đã làm kết nối MQTT.js, reconnect/subscription/shutdown, parser/receiver, mapping shared Device/Sensor và API chẩn đoán chỉ đọc. Có builder và publisher **nội bộ** cho đúng wire format, chưa có REST bật/tắt, automation, orchestration bơm/van, task state hay lịch sử telemetry MongoDB. Dữ liệu nghiệp vụ vẫn RAM; không bảng/migration/seed/collection, không schema IOT_TELEMETRIES/ACTUATOR_TASKS. Không tự mở kết nối broker thật hoặc gửi lệnh thật khi kiểm thử.

## Contract đang dùng, ưu tiên hơn ghi chú MQTT cũ

| Chiều | Topic / wire |
|---|---|
| ESP32 → server | publish/station/{stationId}, subscription backend publish/station/+ |
| Server → ESP32 | subscribe/station/{stationId} |
| Telemetry | sensorRecords:[{dataStreamId:number,result:"26.54 C"}] |
| ACK | status:"ACK", stationId nếu có phải khớp topic; **không có taskId đáng tin cậy** |
| Control | targets:[{taskId:number,taskingCapabilityId:number}], taskingParameters:{actionType:"control",action:0 hoặc 1}, errorMessage:null |

StationId từ topic tra DEVICES.station_id → UUID DEVICES.id. Payload có stationId thì bắt buộc bằng topic, exact case. Không dùng env station toàn cục, không observation/sensor topic, không device auth_token. Station là mã phần cứng, không phải bằng chứng xác thực phần cứng; không thay firmware/topic/broker ACL trong đợt này.

301/302/303 và capability2/3/4 là quan sát một bộ hardware, không constants backend. Chủ Farm phải khai báo Sensor/Actuator đúng bộ lắp thật. Không tự đoán air_humidity/soil_moisture hay van watering/spraying từ mã. MQTT numeric stream được đổi sang string để lookup composite (device_id,data_stream_id); metadata "0301" khác "301". Stream dạng chữ trong metadata chưa có packet numeric tương ứng ở firmware hiện tại.

Action **1=ON, 0=OFF**, JSON number. Mỗi target taskId/capability là số nguyên dương ≤Number.MAX_SAFE_INTEGER, không string/rounding bigint; builder chặn target trùng task/capability trong một packet và copy đúng các field verified. Mapping/UUID→capability và cấp taskId sẽ do domain service tiếp theo cung cấp, không tự sinh bằng timestamp ở gateway.

## Receiver và trạng thái

- Giờ nhận lấy từ server, không lấy resultTime/giờ client. Packet hợp lệ Telemetry/ACK, station đã đăng ký, không retained mới cập nhật last_seen_at. Unknown/mismatch/malformed/retained/unregistered không cập nhật. Presence không tăng version/audit metadata, nên không làm proposal Admin stale hoặc ghi đè timestamp mới khi duyệt.
- Parser UTF-8 strict, JSON object; station 1..50 [A-Za-z0-9_-], một topic segment. Payload1..65536 bytes; sensorRecords1..100; numeric positive safe stream IDs; stream không trùng trong một packet. Result string≤128, số thập phân hữu hạn + khoảng trắng + unit một token1..16. C, %, %rH giữ đúng spelling; rawResult được giữ. Packet sai một record bị reject cả packet, không cập nhật presence một phần.
- Ưu tiên sensorRecords: nếu có nhưng sai cấu trúc thì reject, không rơi xuống ACK. ACK được ghi chẩn đoán, **không xác nhận task/relay**, kể cả khi chỉ một command đang chờ. Packet có thêm taskId vẫn không được dùng cho correlation vì chưa phải firmware contract.
- Reading chỉ accepted khi Device Active, Sensor Active và có mapping đúng Device/stream. Inactive/Maintenance không nhận xử lý bình thường, vẫn cập nhật presence cho packet hợp lệ và giữ chẩn đoán trước. Lý do từng reading DEVICE_UNAVAILABLE/SENSOR_UNAVAILABLE/UNMAPPED_STREAM.
- Unit khác Sensor.unit: reading vẫn accepted nếu đúng trạng thái/mapping, unit_mismatch=true, giữ số/unit thật, không chuyển đổi hoặc ghi đè. Snapshot của packet cũ không đổi khi sửa metadata.
- Connectivity **Unknown** nếu chưa last_seen, **Online** nếu tuổi message <MQTT_OFFLINE_AFTER_MS, **Offline** khi tuổi ≥ ngưỡng. Đây là trạng thái suy ra khi đọc, không sửa Device.status. Broker_connected/receiver_ready trả riêng; broker lỗi không chứng minh từng station mất điện. last_seen của packet hợp lệ cũng không phải tín hiệu relay vật lý.
- Chẩn đoán tối đa **200 packet toàn gateway** trong RAM, FIFO đẩy packet cũ; mỗi packet tối đa100 readings. Không phải lịch sử sản xuất, không bảo đảm đọc lại sau eviction/restart. Tổng counters tính từ lần start, không giảm khi eviction; rejected_readings khác rejected packet. Rejected station đã biết có device_id để đọc đúng scope; station lạ chỉ vào counters Admin, không lộ tên/raw payload. Log chỉ mã lỗi cố định ở debug, không credentials hoặc exception provider.

## Transport và publish nội bộ

MQTT.js **5.16.0** dùng TCP mqtt hoặc mqtts TLS có kiểm tra certificate, protocol3.1.1 (version4), clean session, clientId backend UUID mới, reconnect cấu hình. Đợi CONNACK rồi subscribe publish/station/+ QoS1; chỉ receiver_ready sau SUBACK thành công. Callback cũ bị vô hiệu theo connection generation. SUBACK bị từ chối/hết hạn đóng socket để reconnect; không resubscribe kép. Module stop force-close client, xóa subscription timer, thời gian đóng có giới hạn.

MqttTransport.publish và buildControlPublication là adapter cho module điều khiển tương lai, **không route người dùng**. Publish chỉ khi connected + subscribed. Gửi QoS0, retain=false, queueQoSZero=false: không lưu hàng đợi hoặc tự gửi lại lệnh cũ sau mất kết nối. Callback/timeout/reconnect race đều trả lỗi mã cố định, không raw credentials. Response TransportAccepted chỉ là library transport write, **không bảo đảm broker/hardware nhận hoặc thực thi**. Chưa có retry/dedup domain hoặc ACK correlation.

Trước khi domain service gọi publisher phải có quyền công việc hiện tại, mapping UUID/Actuator Active, Device Active, quản lý task/inflight, interlock/trình tự và xử lý lỗi bơm chung. Những nghiệp vụ đó chưa được chốt trong tài liệu communication; không gọi adapter để triển khai tưới/phun tự động trước khi trao đổi.

Tham khảo API thư viện chính thức: [MQTT.js](https://github.com/mqttjs/MQTT.js). mqtt-packet9.0.2 chỉ là dev dependency cho broker test localhost.

## Cấu hình local, không ghi đè .env

.env.example đã thêm khóa. Theo yêu cầu bổ sung 2026-10-07, .env local đã được append các khóa MQTT còn thiếu, giữ nguyên nội dung/giá trị cũ, mặc định disabled. DEMO_DEVICE_STATION_ID chỉ ghi nhớ mã ESP32 để copy vào POST /api/devices; không auto-register hoặc dùng làm global station/filter/auth token. Operator điền broker và mã demo thật; xem [cấu hình trình diễn và UUID/phân quyền](MQTT_DEMO_AND_API_IDENTIFIERS.md). Không commit .env.

| Khóa | Giá trị / điều kiện |
|---|---|
| MQTT_ENABLED | false mặc định; true mới mở kết nối |
| MQTT_BROKER_HOST | hostname/IP, không scheme/path/credentials, bắt buộc khi bật |
| MQTT_BROKER_PORT | 1..65535, bắt buộc khi bật; ví dụ1883/8883 theo broker |
| MQTT_USERNAME / MQTT_PASSWORD | cùng trống hoặc đủ hai; không tạo device auth_token |
| MQTT_USE_TLS | false/true, dùng mqtt/mqtts; không tắt certificate verification |
| MQTT_OFFLINE_AFTER_MS | mặc định1800000, 1000..86400000; threshold UI cấu hình, không task timeout |
| MQTT_RECONNECT_MS | mặc định3000, 1000..60000 |
| MQTT_CONNECT_TIMEOUT_MS | mặc định10000, 1000..60000; connect/SUBACK/publish/shutdown transport timeout |
| DEMO_DEVICE_STATION_ID | tham chiếu demo để operator copy vào body tạo Device; không đọc bởi MQTT router/config |

Vì module nghiệp vụ hiện chỉ chạy trong mock mode, bật MQTT cần AUTH_MODE=mock và NODE_ENV development/test; production auth/persistence chưa có. Disabled không cần broker/credentials, không tạo network client. Env không hợp lệ fail startup bằng tên khóa, không in giá trị nhạy cảm. Không copy .env.example đè lên .env đã có.

## API và Postman JSON trực tiếp

JWT Bearer bắt buộc; **không POST inject/publish/control**.

| Method / route | Quyền / kết quả |
|---|---|
| GET /api/mqtt/status | Admin Active; enabled, connected, subscribed, last_error, counters, diagnostic_limit; không host/user/password |
| GET /api/mqtt/devices/:id/status | Quyền đọc Device hiện tại; device_id, status, last_seen_at, connectivity, broker_connected, receiver_ready, offline_after_ms |
| GET /api/mqtt/devices/:id/messages?limit=20&offset=0 | Quyền đọc Device; packet mới nhất trước, total còn trong RAM, limit1..100/offset0..100000 |
| Tất cả GET | 200; 400 UUID/query sai, 401 JWT, 403 role/state, 404 thiếu/outside Device scope |

Chủ đọc Farm mình; Manager Farm hiện trong HTX mình; Farmer Accepted assignment đang hiệu lực. Hết phân công không có quyền diagnostics hiện tại, lịch sử assignment riêng vẫn giữ như trước. Không mở thêm quyền lịch sử IoT khi chưa có domain model.

Import **docs/postman/MQTT-Communication-Local-Test.postman_collection.json**: literal URL/JSON, không scripts/variables/environment. Copy JWT và UUID bằng tay; giá trị PLACEHOLDER không hoạt động trước khi thay.

1. Khởi động API bình thường khi MQTT_ENABLED=false. Import collection, login Admin/owner bằng tài khoản test phù hợp .env local, dán token. GET global thấy disabled; Device đã tạo có Unknown, messages rỗng.
2. Dùng collections Farm/Zone/Devices/Sensors/Actuators tạo metadata; Device đã lắp có installed_at/cost, station đúng phần cứng, Sensor numeric stream khai báo **string** theo mapping thực tế; unit đúng kỳ vọng.
3. Tự cấu hình broker local và bật MQTT, restart API. **Restart mất RAM**, cần tạo lại Farm/Zone/Device/Sensor; JWT cũ không còn hợp lệ. Không mở control hardware từ collection này.
4. GET global đến connected/subscribed=true. Để hardware tự publish telemetry hoặc dùng MQTT client bên ngoài gửi packet giả lập dưới đây vào broker test riêng. Không có endpoint inject trong backend.
5. GET Device status: last_seen_at/Online; messages Telemetry có UUID Sensor, value/receivedUnit/rawResult, reason và unit_mismatch. ACK xuất hiện Ack/ACK_WITHOUT_TASK_CORRELATION.
6. Test mismatch, unknown stream, Inactive/Maintenance, retained, unit mismatch; đối chiếu reason/counters. Không thay stationId thật vào tài liệu/export Postman. Tắt broker xem receiver_ready=false; chờ ngưỡng xem Offline; không tự đổi Active.
7. Kiểm thử rights: Farmer chưa Accepted và Manager ngoài HTX404; global với owner403; UUID/query sai400; thiếu JWT401. Khi broker bật lại chỉ subscribe lại, không replay control cũ.

Ví dụ broker test synthetic, không định danh deployment:

~~~json
{"stationId":"DEMO_STATION","sensorRecords":[{"dataStreamId":301,"result":"26.54 C"},{"dataStreamId":302,"result":"77.80 %"},{"dataStreamId":303,"result":"0.00 %"}]}
~~~

Topic publish/station/DEMO_STATION, retain=false. Cần Device DEMO_STATION và Sensor mapping tương ứng; ví dụ numeric không tự gán loại302/303. ACK test: {"stationId":"DEMO_STATION","status":"ACK"}. Muốn xem MQTT bật cần broker/config do operator cung cấp; checks ở session này chỉ fake/localhost, chưa xác nhận phần cứng thật.

Mã reject packet: INVALID_TOPIC, UNREGISTERED_STATION, RETAINED_MESSAGE, INVALID_PAYLOAD_SIZE, INVALID_JSON_UTF8, INVALID_MESSAGE_OBJECT, STATION_MISMATCH, INVALID_SENSOR_RECORDS, INVALID_SENSOR_RECORD, DUPLICATE_STREAM, INVALID_RESULT, RECEIVER_ERROR. Unknown: UNSUPPORTED_MESSAGE. Transport last_error: CONNECTION_FAILED/SUBSCRIPTION_FAILED/PUBLISH_FAILED. Dùng breakpoint ở mqtt.protocol.ts → mqtt.service.ts → mqtt.transport.ts và messages API để tìm lỗi; không bật log raw secret/payload. Debug mã lỗi đã có trong service.

## Kiểm thử và session tiếp theo

**134/134 tests**: 119 hồi quy +14 MQTT unit/HTTP/fake adapter +1 MQTT.js loopback TCP. Lint/typecheck/build đạt. Kiểm tra fake adapter denial/timeout/late SUBACK/reconnect/stop, đúng OFF0/ON1, no queue/retain, malformed/retained/identity/units/scopes/shared stores và bounded snapshots/counters. Loopback broker chạy port ngẫu nhiên127.0.0.1, đóng cuối test; không đọc .env thật/SMS/SMTP/DB writes/live MQTT.

Ở root npm ci; sau đó:

~~~powershell
npm run lint --workspace @smart-durian/api
npm run typecheck --workspace @smart-durian/api
npm run test --workspace @smart-durian/api
npm run build --workspace @smart-durian/api
~~~

Nếu npm wrapper Windows EPERM, từ apps/api dùng công cụ đã cài:

~~~powershell
node ../../node_modules/eslint/bin/eslint.js src test integration
node ../../node_modules/typescript/bin/tsc --noEmit
node ../../node_modules/typescript/bin/tsc --outDir .test-dist
node --test --test-reporter=spec .test-dist/test
node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json
~~~

Đã chạy npm audit: runtime (--omit=dev)0; full2 critical từ **dev dependency đã có trước module** concurrently9.2.4 → shell-quote1.9.0, không từ mqtt. Không tự audit-fix toàn repo; xử lý dependency dev riêng có kiểm thử. Đây là kết quả tại session2026-10-07, có thể thay đổi theo advisories.

Session mới: đọc AGENTS nếu có, status/branch/log, handoff/notes/plan/spec, hai guide mới và ba tài liệu nguồn nếu có. Checkout nhánh MQTT để có cả cập nhật metadata; nhánh metadata độc lập dừng ở939c350/119 tests. Main c71820d hiện chưa gồm IoT modules mới; đừng triển khai trùng. Không stage-all/reset/clean/ghi đè .env hoặc phục hồi deleted guides/file riêng. Branch MQTT chưa push/merge.

Tiếp theo cần thảo luận riêng IOT_TELEMETRIES (timestamps/history/storage) và ACTUATOR_TASKS (taskId, short ACK, inflight, timeout, bơm/van interlock/retry/lỗi). Không coi TransportAccepted/Ack là Executed. Persistence PostgreSQL/MongoDB cũng phải được chốt riêng.

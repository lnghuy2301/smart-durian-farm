# MQTT contract v1.0 — cập nhật 2026-10-09

Nhánh kế thừa **feat/actuator-tasks-v1** đã nối ACK domain handler và control API: xem [ACTUATOR_TASKS](ACTUATOR_TASKS_IMPLEMENTATION.md). Diagnostic ACK đúng đang chờ reason:null; không có wait `ACK_NOT_WAITING`, sai Device/action có mã mismatch.168/168 tests gồm TCP control/ACK đạt. Các đoạn “chưa handler/không HTTP control” dưới đây mô tả riêng commit contract **f20ea20**, không là hiện trạng nhánh tasks.

Nhánh `feat/mqtt-contract-v1` kế thừa `ab478fc`, gồm frontend hiện có và backend Telemetry f20f6c1. Nguồn mới: **MQTT_Configuration_Smart_Farm_Durian_v1.0.docx** của người dùng, thay các mô tả ACK cũ trong MQTT_HARDWARE_PROTOCOL_VERIFIED/IOT_CORE_TABLES_SPEC/build spec. Không chỉnh các file nguồn riêng hoặc firmware.

## Contract hiện hành

- Server nhận `publish/station/{stationId}`, gửi `subscribe/station/{stationId}`; không đổi topic.
- Telemetry giữ `stationId + sensorRecords[{dataStreamId,result}]`. Mapping bộ demo được người dùng xác nhận:301 air_temperature/C,302 air_humidity/%,303 soil_moisture/%. Khai báo qua Sensor metadata, router không hardcode các ID.
- Command chỉ có `targets:[{taskId,taskingCapabilityId}]` và `taskingParameters:{actionType:"control",action:0|1}`. Bỏ `errorMessage:null` khỏi wire; `error_message` trong logical ACTUATOR_TASKS vẫn dùng cho lỗi backend sau này.
- ACK có `{taskId:number,status:"ACK",action:0|1}`; station được suy từ topic. Payload có stationId thì phải khớp topic. taskId/capability là positive safe integer JSON number, không UUID/string/bigint làm tròn.
- ACK thiếu taskId/action, action ngoài0/1 hoặc ID không hợp lệ bị reject `INVALID_ACK`; không fallback ACK cũ. Telemetry vẫn có ưu tiên khi packet có sensorRecords, packet lỗi không rơi xuống ACK.
- **ACK phát ngay khi hardware nhận command**, không chứng minh relay thực hiện hoặc lưu lượng/áp lực. `Confirmed` trong module task sẽ có nghĩa nhận đủ ACK đúng ID/action/Device, không phải physical execution.

## Thay đổi trong nhánh này

`mqtt.protocol.ts` giữ taskId/action trong IncomingMessage, kiểm tra ACK mới và bỏ field wire cũ. Receiver ghi diagnostic ack `{task_id,action}`, reason `ACK_WITHOUT_TASK_HANDLER` trong giai đoạn chưa có domain handler. ACK hợp lệ vẫn cập nhật last_seen_at; retained/invalid/station mismatch không được ghi nhận presence. Không tạo HTTP control, không tự gửi lệnh hoặc auto-register metadata trong nhánh này.

Updated MQTT unit fixtures và TCP loopback dùng ACK v1; thêm test từ chối legacy/unsafe/coerced IDs/actions. Broker nhận command OFF qua socket phải đúng shape mới. Các tests không dùng .env, SMTP/SMS/hardware thật. Không phải bằng chứng firmware thực đã phản hồi ACK mới.

## Tái lập

Từ root, sau `npm ci`, giữ .env local: `npm run lint`, `npm run typecheck`, `npm run build` và `npm test --workspace @smart-durian/api`. Tập trung MQTT: compile API tests rồi chạy `node --test --test-concurrency=2 .test-dist/test/mqtt.test.js .test-dist/test/mqtt-loopback.test.js` từ apps/api. Test tương quan malformed/legacy/mismatch/retained và wire shape được kiểm tra cùng TCP broker riêng.

Kết quả: **17/17 MQTT/parser/transport/loopback tests**; full API suite và lint/typecheck/build ghi ở handoff khi hoàn tất. Không thay runtime broker settings, không kết nối broker thật hoặc publish tới station thật để test.

## Kế tiếp đã được người dùng chốt

ACTUATOR_TASKS/API202: bơm2 shared, van3 watering, van4 spraying; một workflow/Device, không tưới/phun đồng thời. ValveON→ACK→pumpON→ACK; Stop pumpOFF→ACK→valveOFF→ACK; mỗi ACK step10s. Sau restart hoặc disconnect, lần Bật tiếp theo tự chạy Stop bơm và cả hai van trước. Failed Start giữ nguyên, recovery Stop là record riêng; ACK sai/trùng/trễ không resurrect task. Persistence vẫn tách đợt, RAM không lưu bền vững.

Broker host/port/credentials/TLS ở .env local, không thêm vào mỗi Device, không hardcode station ID. Không gửi cấu hình thay broker cho firmware qua API chưa có trong contract. Đọc guide ACTUATOR_TASKS kế thừa để biết trạng thái triển khai tiếp theo.

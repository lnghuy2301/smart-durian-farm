# Actuators — thiết kế cuối và quy trình

Ngày 2026-10-06. Nhánh `feat/actuators-management`, base Sensors `c9d0940`. Xem [API và tái lập](ACTUATORS_IMPLEMENTATION.md). Người dùng đã chốt nghiệp vụ trước code; không có câu hỏi Actuators metadata còn chờ.

## Quyết định đã chốt

1. Quyền như Devices/Sensors: chủ Farmer tạo/sửa trực tiếp; Admin đề xuất Create/Update cần đúng chủ Farm duyệt; Admin đọc tất cả, Manager đọc HTX mình, Farmer phụ trách chỉ đọc Zone có assignment Accepted đang hiệu lực [start,end). Tài khoản phải Active.
2. Unique theo **(device_id, capability_id)**; không unique capability toàn hệ thống. Device UUID là DEVICES.id, capability số là taskingCapabilityId phần cứng, Actuator.id là UUID backend sinh. Không gộp các identifier.
3. id/device_id/capability_id/**purpose** bất biến; chỉ sửa name/status. Inactive giữ cặp mã; không hard-delete/chuyển Device. Active/Inactive mô tả khả dụng metadata, không relay bật/tắt hoặc online MQTT.
4. Phần cứng hiện có **một bơm chung + hai van**. Bơm có capability riêng, phải gửi lệnh riêng, không tự chạy theo van. Người dùng chấp nhận enum purpose mở rộng **Watering / Spraying / Shared**: van tưới Watering, van phun Spraying, bơm chung Shared. Bơm phải có một bản ghi riêng, không tạo bản ghi trùng capability theo hai purpose.
5. Khi có bơm riêng sau này, bơm và van của chức năng cùng Watering hoặc Spraying, capability khác nhau. Purpose không unique và không giới hạn một actuator/purpose/Device. Không tự thêm actuator_type hoặc bảng quan hệ.
6. Đợt này chỉ metadata RAM và snapshot/version/approval. Điều khiển MQTT/ACTUATOR_TASKS/ACK/timeout/trình tự bơm–van tách đợt sau. Giữ subscribe/station/{station_id}, publish/station/{station_id}; MQTT chưa có auth_token.
7. Đầu session hai ERD còn Watering/Spraying; người dùng đã cập nhật cả XML/JSON thêm Shared trong lúc triển khai và đã được đối chiếu lần cuối. Code/tài liệu khớp enum mới; agent không sửa/stage ERD riêng, không migration/seed/constraint DB.

## Luồng và tính nhất quán

- Chủ tạo hoặc PATCH name/status: áp dụng ngay và lưu before/after, tăng version. PATCH bỏ status giữ nguyên; không tự Active khi đổi tên.
- Admin Create proposal lưu riêng, actuator_id=null, không reserve cặp. Chủ duyệt kiểm tra lại Device → Zone → Farm, reviewer/proposer Active và role, unique/capacity trước commit. Hai proposal trùng chỉ một commit; lỗi vẫn Pending.
- Admin Update proposal giữ snapshot/version. Một Pending Update/Actuator; chủ sửa trong lúc chờ làm proposal stale, approve 409, chủ reject rồi Admin tạo mới. Purpose không sửa được kể cả qua proposal.
- Commit RAM đồng bộ, không await giữa unique/capacity và ghi Actuator/index/history. Chỉ Accepted sau thành công. Từ chối không thay đổi Actuator/history.
- Index hai tầng Device → numeric capability; response deep copy. Lookup HTTP và history đều xét quyền hiện tại; hết assignment không xem metadata, giữ lịch sử assignment riêng.
- Capability API là JSON number nguyên dương 1..Number.MAX_SAFE_INTEGER, theo protocol numeric và tránh mất chính xác bigint trong JavaScript. Không tự sinh hoặc hardcode ID bơm/van. PostgreSQL bigint toàn miền chỉ bàn khi persistence/protocol được review.

## Hướng dẫn tiếp tục

Module đã có API/tests/Postman, không triển khai lại. Nhánh mới kế thừa Actuators nếu main chưa chứa Devices/Sensors/Actuators; không checkout main cũ làm mất module. Đọc handoff/notes/plan/spec, hai ERD và guide trước mỗi session; giữ file riêng/.env ngoài commit. Dừng hỏi khi chưa rõ nghiệp vụ; không push/merge nhánh mới theo quyền publish đợt cũ.

MQTT là bước kế tiếp. Phải chốt cách lấy station_id cho telemetry, taskId/correlation, timeout/ACK muộn/trùng, bật/tắt/đồng thời hai chức năng dùng bơm chung và xử lý lỗi từng target. Không suy từ danh sách Shared + purpose thành recipe điều khiển đã được duyệt; cũng không suy từ Active thành trạng thái relay On. Persistence và Cultivation/hash-chain còn bàn riêng.

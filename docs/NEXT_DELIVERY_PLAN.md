# Kế hoạch giữ tiến độ từ nền tảng đã kiểm thử

**Cập nhật 2026-10-08:** đợt web nền tảng và IoT chỉ đọc bên dưới đã hoàn thành theo mẫu được cung cấp, gồm dashboard Farmer/Admin và mẫu Manager riêng được chốt sau. Branch `feat/web-manager-dashboard` chứa toàn bộ frontend, **22 browser scenarios + 8 unit tests**, lint/typecheck/build/format đạt. Hướng dẫn chạy, API mapping, scope và nghiệm thu ở [WEB_FOUNDATION_IMPLEMENTATION](frontend/WEB_FOUNDATION_IMPLEMENTATION.md). Backend147 regression tests đã chạy lại ở module IoT; business/telemetry vẫn RAM. Nội dung đề xuất ngày 2026-10-07 bên dưới là lịch sử, không phải trạng thái chưa code hiện tại.

Đợt tiếp theo có thể chọn một workflow ghi tài nguyên theo form/mẫu được xác nhận, thiết kế persistence, hoặc React Native; sửa HTX Manager email→SMS chưa có form trong mẫu dashboard. ACTUATOR_TASKS/control vẫn cần specification riêng. Chưa bắt đầu các đợt đó, chưa push/merge/deploy.

Đề xuất ngày 2026-10-07, dựa trên code f20f6c1 và [báo cáo rà soát](PROJECT_READINESS_REVIEW_20261007.md). **Chưa bắt đầu frontend hoặc migration.** Người dùng yêu cầu tư vấn/chọn công việc khác trong khi ACTUATOR_TASKS còn rối; nhánh điều khiển giữ nguyên chưa triển khai.

## 1. Đợt nên làm tiếp: frontend foundation

Nhánh dự kiến `feat/web-foundation`, kế thừa code mới nhất f20f6c1 hoặc nhánh tài liệu này. Không tạo từ main c71820d nếu IoT chưa được tích hợp, tránh mất các API đã hoàn tất.

React + TypeScript + Vite theo spec, responsive để demo trên máy tính và trình duyệt điện thoại. Đây là đề xuất web trước; React Native Android vẫn là đợt riêng trong kế hoạch đồ án. Không cài package/tạo app trong lượt tư vấn này.

Phạm vi đợt đầu:

1. API client tập trung, API base URL cấu hình; hợp đồng response cho các endpoint đang dùng. Chỉ giá trị public cần đưa vào cấu hình frontend; JWT_SECRET, SMTP/Twilio/MQTT credentials thuộc backend.
2. Đăng nhập phone/password → `/api/auth/me`; session theo JWT15 phút. Xử lý 401 bằng đăng nhập lại, 403/404 đúng phạm vi, 409 đề xuất lỗi thời, 429 cooldown. Logout client không phải revoke toàn bộ session server.
3. Layout/navigation cho Admin, Manager, Farmer; ẩn thao tác không phù hợp nhưng backend vẫn kiểm tra quyền. Chủ Farm là Farmer sở hữu từng Farm, không phải một role mới; không dựa riêng `is_owner` để cho sửa mọi Farm.
4. Danh sách/chi tiết danh mục, Farm, Zone và Tree qua API hiện có; loading/empty/error, pagination/search khi endpoint hỗ trợ. Giữ UUID nội bộ, hiển thị tên/mã đã có; không tự sáng tạo farm_name khi DTO Farm không có field đó.
5. Ghi guide chạy, cấu hình cần điền, các tài khoản giả/live SMS được phân biệt; không dùng Postman scripts hoặc auto-send OTP. Có hướng dẫn dựng dữ liệu bằng các luồng backend hiện hành trong khi chưa có seed.

Nghiệm thu: ba vai trò đăng nhập đúng, Pending Manager không vào protected pages, Manager không xem Farm ngoài HTX, Farmer không sửa Tree của chủ khác; UI hiển thị đúng dữ liệu thật qua API và lỗi không làm mất nội dung form. Lint/typecheck/build frontend và kiểm tra trình duyệt; chỉ thêm tests cho luồng đáng kiểm chứng. Ghi rõ dữ liệu RAM mất sau restart.

## 2. Đợt frontend kế tiếp: giám sát IoT chỉ đọc

Nhánh dự kiến `feat/web-iot-monitoring`. Chọn Device từ danh sách đúng scope; lấy latest/history và presence qua REST. Poll có kiểm soát khi màn hình đang mở, đề xuất khoảng 15 giây theo cadence sensor hiện tại, dừng polling khi rời trang và tránh request chồng; chưa cần WebSocket/SSE.

Hiển thị timestamp đo nhận/ghi, raw unit, dữ liệu rỗng/cũ và connectivity tách khỏi Device.status. Không hiển thị Active như “bơm đang bật”; không tạo control toggle gọi publisher nội bộ. Không convert reading theo Sensor.unit hiện tại; ghi cảnh báo mismatch nếu dùng diagnostics/API có dữ liệu đó.

Nghiệm thu: MQTT loopback → giá trị trên UI; sensor/Device Inactive không sinh reading mới; hết phân công Farmer bị chặn cả latest/history ở lần gọi tiếp theo; đổi Device hoặc logout không làm lộ cache của tài khoản/Device trước. Chủ/Admin/Manager đọc đúng scope.

## 3. Đợt frontend nghiệp vụ

Tách nhánh theo luồng, triển khai trên API đã có:

- Duyệt Manager/HTX; tạo HTX chưa Manager; Manager sửa bốn field cho phép bằng email → SMS tuần tự, mỗi bước có cooldown/deadline từ backend.
- Farm requests và gia nhập/rời HTX; Zone/Tree/Device/Sensor/Actuator direct writes/proposals đúng role; phân biệt dữ liệu đã áp dụng với đề xuất Pending.
- Harvest Draft → submit → owner approve; correction giữ bản chính trong Pending; xóa chỉ Draft chưa từng Confirmed; nhập bù quá7 ngày qua Admin grant.
- Phân công/nhận việc sau khi chốt API chọn Farmer. Không mở danh bạ/số điện thoại/email cho mọi người dùng để thay UUID bằng dropdown.

Không làm tất cả màn hình trong một branch. Mỗi luồng có kịch bản demo liên vai trò và lỗi/stale/permission expiry.

## 4. Persistence: thiết kế trước, triển khai từng nhóm

Không cần chờ ACTUATOR_TASKS để thiết kế PostgreSQL cho nghiệp vụ đã ổn. Tuy nhiên **chưa có quyền tự tạo migration trong lượt tư vấn này**; persistence vốn được yêu cầu thảo luận riêng.

### Những quyết định cần chốt trong một buổi

| Nội dung | Đã biết | Phần phải chốt |
| --- | --- | --- |
| Bảng nghiệp vụ | 13 bảng theo ERD; UUID/FKs/enums và các rule đã có | Nullability/constraints còn thiếu trong sơ đồ; casing tên SQL; timestamp UTC và mapping decimal |
| Workflow metadata | Proposals, approvals, notifications, snapshots, grants, version/everConfirmed đang RAM | Nơi lưu bền vững, thời gian giữ, schema kỹ thuật được cho phép; giữ một business table TREE_HARVESTS |
| Auth | Hash password, token version/revocation, OTP/proof deadlines | Mode DB riêng, bootstrap Admin; token version/OTP/rate-limits khi restart/nhiều process; không tự đưa mode mock vào production |
| Repository/migrations | Đã có pg/MongoClient | Lựa chọn tối giản: SQL migrations + pg hay ORM; migration tracking/rollback, không giữ song song hai store nghiệp vụ khác nhau |
| Seed/demo | Chưa seed; account từ env/register và business qua API | Seed local idempotent, cách cung cấp mật khẩu, reset có chủ đích; không gọi SMTP/Twilio thật từ seed |
| Telemetry | 10.000 readings toàn backend, raw unit16, timestamp server | Retention DB thực sự; FIFO theo số lượng khác TTL theo thời gian; UUID serialization/index; đồng bộ ERD unit8→16 |

PostgreSQL hỗ trợ unique, FK, check và exclusion; CHECK đơn thuần không bảo vệ tổng diện tích giữa các hàng/bảng. [Tài liệu PostgreSQL17](https://www.postgresql.org/docs/17/ddl-constraints.html). Đây là cơ sở kỹ thuật; chiến lược locking/transactions cụ thể vẫn phải thiết kế theo workflow đã chốt.

### Thứ tự chuyển persistence đề xuất

1. USERS + COOPERATIVES + ba bảng danh mục; Admin bootstrap, constraints phone/email/certificate/manager, transaction approve Manager. HTX createdAt/version/notification có thiết kế lưu tương ứng.
2. FARMS + ZONES + USERS_ZONES; lưu requests/approvals/notifications; lock Farm để bảo vệ tổng diện tích; bảo vệ accepted intervals và Pending reservations. Khóa ở DB thay cho giả định đoạn code không await.
3. TREES + TREE_HARVESTS; tree_code unique, tree/day unique, batch nhiều cây cùng Zone/ngày, confirmed workflow và grant/version; test duyệt đồng thời và restart Pending.
4. DEVICES + SENSORS + ACTUATORS; station unique kể cả Inactive, composite uniques, immutable IDs/purpose/type, telemetry references giữ Device UUID.
5. IOT_TELEMETRIES MongoDB; indexes/retention đã được chọn và tests qua restart. Không đưa short ACK thành physical relay state trong thiết kế storage.

Mỗi đợt phải có schema/migration + repository wiring + seed phù hợp + integration tests restart/constraint/transaction. Tạo bảng mà service vẫn ghi Map không được nghiệm thu là persistence. Tái chạy các policy/HTTP tests liên quan trên adapter DB. Không giả định PostgreSQL transaction bao phủ cả MongoDB; tránh workflow cần atomic commit hai DB nếu chưa có thiết kế rõ.

## 5. Tài liệu và sơ đồ có thể dùng ngay

[CURRENT_SYSTEM_DIAGRAMS.md](CURRENT_SYSTEM_DIAGRAMS.md) gồm kiến trúc runtime, quan hệ logic, đăng ký/duyệt Manager, đề xuất Admin/chủ duyệt, xác nhận/sửa thu hoạch và MQTT→Telemetry. Mỗi sơ đồ có source/test làm căn cứ, không có màn hình/app hoặc command flow chưa code.

Tiếp theo có thể hoàn thiện ma trận role–resource–action, API response contracts cho frontend đầu tiên, use-case và test evidence cho luận văn. Sơ đồ UI design và DB persistence phải được ghi “dự kiến” cho đến khi triển khai/kiểm thử; không vẽ hash chain hoặc auto-shutdown như chức năng đang chạy.

## 6. Khi quay lại các module còn thiếu

- ACTUATOR_TASKS: giữ timeout10 giây mỗi bước; mapping bơm2/van3 tưới/van4 phun đã đồng ý; không đồng thời tưới/phun; valveON→pumpON, pumpOFF→valveOFF; fail-start và recoveryStop riêng. Còn startup reset và correlation không được firmware cung cấp. Không thay firmware/topic để tự giải quyết.
- CULTIVATION_EVENTS: chốt details theo hành động, reference assignment gốc, correction 15 ngày, lock15 phút/hash-chain và cách task/manual event liên kết. Không mang immutable/hash sang Harvest.
- QR: whitelist dữ liệu công khai, tree_code là khóa lookup, không tạo bảng QR; chưa nhật ký thì phạm vi traceability phải ghi rõ giới hạn.
- AI/RAG/mobile: theo yêu cầu nghiệm thu/deadline; không làm trước phần dữ liệu/demo core nếu chưa có nguồn/model và hợp đồng API.

Ưu tiên cuối cùng phụ thuộc yêu cầu hội đồng: nếu cần thao tác trực quan ngay, làm frontend foundation; nếu cần dữ liệu qua restart ngay, chốt persistence và làm đợt1 trước. Có thể chuẩn bị tài liệu của hướng còn lại trong cùng thời gian, nhưng một người nên code từng đợt để giảm đổi ngữ cảnh.

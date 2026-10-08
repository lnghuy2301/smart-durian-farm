# Giám sát IoT chỉ đọc

Branch `feat/web-iot-monitoring` kế thừa `feat/web-dashboards` acc8efa, foundation đã đạt 13 browser scenarios và 5 unit tests trước khi bắt đầu. Không có control/publisher, nút bật bơm/van hoặc endpoint ingestion mới.

## API và bố cục

GET devices q (station_id), zone_id, limit20/offset để chọn trạm đúng scope, giữ khác biệt UUID id và station_id. Dashboard Farmer có widget thu gọn với station selector; trang /iot có tìm kiếm, lọc zone qua link, presence, metadata cảm biến và lịch sử. Chọn trang thiết bị mới tự bỏ lựa chọn cũ, chọn thiết bị đầu trang hiện tại. Không bịa trạm khi list rỗng.

Mỗi cycle snapshot đọc song song GET mqtt/devices/:id/status, telemetry/devices/:id/latest (limit20/offset), sensors (device_id, limit100/offset). Presence connectivity Unknown/Online/Offline do backend tính từ last_seen_at/offline_after_ms. Device.status Active/Inactive/Maintenance là trạng thái quản lý, không phải relay state. Hiển thị broker_connected/receiver_ready cảnh báo kênh nhận chưa sẵn sàng; không suy online từ reading mới.

Latest cards dùng metadata hiện tại để đặt tên/type/icon theo exact data_stream_id, không hardcode 301/302/303 hay loại đất nhiệt độ không tồn tại. Latest phân trang độc lập, metadata cũng có pagination; stream metadata ngoài trang hiện tại dùng nhãn trung tính Stream X, giải thích metadata chưa có trong trang. Không mất readings vì sensor metadata thiếu/Inactive. value/unit hiển thị đúng raw payload; không quy đổi theo Sensor.unit. Mismatch hiện cảnh báo và không so sánh ngưỡng; chỉ so sánh min/max khi cùng đơn vị và có đủ ngưỡng. Ngưỡng là cấu hình tham khảo, không tạo task hay tự điều khiển.

measured_at = backend nhận packet, không phải thời điểm firmware đo. received_at = bước ghi RAM. UI ghi đúng hai nhãn; lịch sử filter theo received_at, [from,to), chuyển datetime-local theo múi giờ máy thành ISO UTC; URLSearchParams encode timezone/stream. Giá trị timestamp hiển thị Asia/Ho_Chi_Minh. Khoảng từ>=đến hoặc ngày không hợp lệ bị chặn trước request. GET history có stream/from/to/limit20/offset; không polling history tự động, có reload thủ công.

## Poll, quyền và dữ liệu cũ

usePollingResource có một cycle đang chạy; hẹn 15 giây **sau khi cycle hoàn tất**, không setInterval chồng requests. Không hẹn poll khi tab ẩn; tab hiện lại chạy ngay nếu đang rảnh. Logout/rời trang/đổi key abort cycle và chặn response cũ. Trong lúc refresh giữ snapshot đã nhận, hiển thị trạng thái đang cập nhật và mốc kiểm tra thành công; gặp lỗi xóa snapshot thay bằng error/retry. Đổi Device/key xóa snapshot ngay, không đưa card Device trước vào trạm sau.

Snapshot lỗi (đặc biệt 403/404) không render cached latest/history. History gặp403/404 cũng làm parent ẩn toàn snapshot và history, cần reload thủ công. Backend kiểm tra quyền mỗi request và lọc readings theo assignment hiện tại trước latest/total/page. Không khẳng định toàn history là dữ liệu của phân công hiện tại nếu backend trả404. Không dùng token user cũ hoặc cache cross account.

RAM FIFO10.000 readings toàn hệ thống, eviction OldestInserted. UI ghi rõ capacity trả từ API, mất khi restart; không claim Mongo persistence. Reading cũ có thể xuất hiện dù trạm online; hiển thị timestamps/cảnh báo cần kiểm tra, không giả realtime hay mặc định 0 cho missing. Poll UI15s không sửa MQTT/firmware cadence hoặc offline threshold30 phút của server.

## Xác minh

Đã đạt lint/typecheck/build, 6 unit tests, 21 browser scenarios và 147 backend regression tests. Browser test mở Nest cô lập, tạo Device/Sensor bằng HTTP, dùng MQTT.js thật kết nối broker TCP loopback và nhận sensor packet fixture; UI đọc shared Telemetry store qua HTTP thật. Có test poll tự cập nhật, Inactive metadata không ghi mới, đổi trạm không lẫn stream cùng mã, history phân trang/lọc, history403 xóa cả latest cache và retry latest cũng không mở dữ liệu hết quyền. Test UI không chứng minh firmware/provider production. Artifacts tại apps/web/test-results, report không có token/OTP.

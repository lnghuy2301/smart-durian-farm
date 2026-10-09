# Admin duyệt Manager

Branch `feat/web-manager-approval`, kế thừa module HTX. UI lấy pending table và approval drawer trong interface_admin. Không dùng HTML approve manager_admin (trùng HTML quản lý HTX, đã xóa bản sao).

GET `/users/pending-managers` trả `{users: User[]}` toàn bộ danh sách. Endpoint không có search/pagination: tìm tên/điện thoại/email và phân trang 20 ở client, ghi rõ phạm vi toàn danh sách đã tải. Không lấy số item trên trang làm tổng. GET `/users/cooperatives` trả toàn bộ HTX; chỉ đưa manager_id=null vào lựa chọn. Không giả định endpoint có `q` hay `offset`.

Admin mở dialog có danh tính, điện thoại/email, xác minh email và ngày đăng ký. Duyệt phải chọn đúng một phương án:

1. PATCH `/users/:id/approve` `{cooperative_id}` để gắn HTX hiện có.
2. PATCH `/users/:id/approve` `{cooperative: {cooperative_name,director,certificate_number,address,contact_number}}` để tạo HTX và duyệt trong cùng thao tác backend.

Không gửi cả hai field. Các field HTX dùng chung với editor, đúng giới hạn DTO. Trước mutation có bước kiểm tra và xác nhận tài khoản/HTX cụ thể. Thành công reload danh sách, hiện thông báo. User UUID đã có lúc register; approve giữ UUID, đổi Pending→Active, gắn HTX. Admin reject PATCH `/users/:id/reject` body `{}`: Pending→Reject; không tự thêm reason, không tuyên bố gửi thông báo.

409, lỗi mạng hoặc 5xx có thể do trạng thái đã thay đổi hoặc kết quả mutation chưa rõ. UI giữ form, khóa gửi tiếp và yêu cầu bấm kiểm tra trạng thái mới nhất (GET lại pending + HTX). Tài khoản không còn Pending thì khóa thao tác, đóng để reload list; HTX đã gắn thì bỏ lựa chọn và yêu cầu chọn lại. Không tự gửi mutation lần hai. 400 giữ form để sửa. Đang xử lý khóa submit và đóng dialog; rời toàn trang/logout vẫn abort client và không ghi response vào phiên mới.

AdminGuard bảo vệ route. Không cung cấp danh sách tất cả Active users hoặc số tài khoản toàn hệ thống vì backend chưa có API. Đây là module Admin độc lập; [dashboard Manager](MANAGER_DASHBOARD.md) theo mẫu riêng được triển khai sau trên branch riêng.

Kiểm tra tái lập: lint/typecheck/build và browser test register Pending→approve→login Manager; cả nhánh chọn HTX và tạo mới; reject/409 reconciliation được ghi trong tài liệu tổng.
